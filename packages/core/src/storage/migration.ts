import { z } from "zod";
import { ConfigSchema, RuntimeBaselineSchema, SourceArtifactSchema, WorkPacketSchema } from "../schemas/artifacts.ts";
import { CommandResultSchema, DiagnosticSchema, HumanDecisionSchema, type Diagnostic } from "../schemas/embedded.ts";
import { architectureRequirementDefaultsForUnknownClassification } from "../work/architecture-requirement.ts";
import { DEFAULT_TARGET_ID } from "../schemas/enums.ts";

const knownArtifactSchemas = {
  config: ConfigSchema,
  runtime_baseline: RuntimeBaselineSchema,
  work_packet: WorkPacketSchema,
  source_artifact: SourceArtifactSchema
} as const;

type MutableRecord = Record<string, unknown>;

export interface ArtifactMigrationResult<T = unknown> {
  artifact: T;
  diagnostics: Diagnostic[];
  changed: boolean;
  invalidated_decision_ids: string[];
}

function isRecord(value: unknown): value is MutableRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneRecord(value: unknown): MutableRecord {
  if (!isRecord(value)) return {};
  return globalThis.structuredClone ? globalThis.structuredClone(value) as MutableRecord : JSON.parse(JSON.stringify(value)) as MutableRecord;
}

function pushDiagnostic(diagnostics: Diagnostic[], code: string, message: string, severity: Diagnostic["severity"] = "warning", fieldPath: string | null = null, fix: string | null = null): void {
  diagnostics.push({ code, severity, message, field_path: fieldPath, gate: null, fix });
}

function asStringArray(value: unknown): string[] | null {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) return value;
  return null;
}

function firstPresent(record: MutableRecord, names: string[]): { key: string; value: unknown } | null {
  for (const key of names) {
    if (Object.prototype.hasOwnProperty.call(record, key)) return { key, value: record[key] };
  }
  return null;
}

function getNestedRecord(root: MutableRecord, key: string): MutableRecord {
  const existing = root[key];
  if (isRecord(existing)) return { ...existing };
  return {};
}

function setIfMissing(root: MutableRecord, key: string, value: unknown): boolean {
  if (root[key] !== undefined) return false;
  root[key] = value;
  return true;
}

function mapSynonym(root: MutableRecord, from: string[], toPath: string[], diagnostics: Diagnostic[], code: string): boolean {
  const found = firstPresent(root, from);
  if (found === null) return false;
  let cursor: MutableRecord = root;
  for (const segment of toPath.slice(0, -1)) {
    const next = getNestedRecord(cursor, segment);
    cursor[segment] = next;
    cursor = next;
  }
  const toKey = toPath[toPath.length - 1] as string;
  if (cursor[toKey] !== undefined) return false;
  cursor[toKey] = found.value;
  pushDiagnostic(diagnostics, code, `Migrated legacy field ${found.key} to canonical ${toPath.join(".")}; raw legacy value was preserved in this diagnostic.`, "warning", `/${found.key}`, `Use /${toPath.join("/")} on future writes.`);
  return true;
}

function migrateAcceptanceCriteria(raw: unknown, diagnostics: Diagnostic[]): { criteria: unknown[]; changed: boolean } {
  if (!Array.isArray(raw)) return { criteria: [], changed: raw !== undefined };
  let changed = false;
  const criteria = raw.map((entry, index) => {
    if (isRecord(entry)) return entry;
    if (typeof entry === "string") {
      changed = true;
      pushDiagnostic(diagnostics, "MIGRATION_LEGACY_AC_STRING", `Migrated string acceptance criterion ${JSON.stringify(entry)} to canonical AC object.`, "warning", `/acceptance_criteria/${index}`, "Use canonical AcceptanceCriterion objects on future writes.");
      return { id: `ac-${index + 1}`, text: entry, source: "human", source_evidence: null };
    }
    changed = true;
    pushDiagnostic(diagnostics, "MIGRATION_INVALID_LEGACY_AC", "Dropped invalid legacy AC entry from canonical acceptance_criteria projection; raw value remains in historical revision storage.", "warning", `/acceptance_criteria/${index}`, "Rewrite as a canonical AcceptanceCriterion object.");
    return null;
  }).filter((entry) => entry !== null);
  return { criteria, changed };
}

function validHumanDecision(value: unknown): boolean {
  return HumanDecisionSchema.safeParse(value).success;
}

function existingDiagnostics(root: MutableRecord): Diagnostic[] {
  return Array.isArray(root.diagnostics) ? root.diagnostics.filter((entry) => DiagnosticSchema.safeParse(entry).success) as Diagnostic[] : [];
}

function hasDiagnostic(root: MutableRecord, code: string): boolean {
  return existingDiagnostics(root).some((entry) => entry.code === code);
}

function appendDiagnostics(root: MutableRecord, diagnostics: Diagnostic[]): void {
  if (diagnostics.length === 0) return;
  const existing = existingDiagnostics(root);
  root.diagnostics = [...existing, ...diagnostics];
}

function pushInvalidatedDecisionId(invalidated: string[], decision: unknown): void {
  if (!validHumanDecision(decision)) return;
  const id = (decision as { id: string }).id;
  if (!invalidated.includes(id)) invalidated.push(id);
}

function maybeInvalidateWorkApprovals(root: MutableRecord, changes: { acApprovedSemanticsChanged: boolean; packetApprovedSemanticsChanged: boolean }, diagnostics: Diagnostic[], invalidated: string[]): void {
  if (!changes.acApprovedSemanticsChanged && !changes.packetApprovedSemanticsChanged) return;
  const lifecycle = isRecord(root.lifecycle) ? { ...root.lifecycle } : {};
  const acApproval = lifecycle.ac_approval;
  const packet = lifecycle.packet_approval;
  const auth = lifecycle.authorization;
  const invalidatedIdsBefore = invalidated.length;

  if (changes.acApprovedSemanticsChanged) {
    pushInvalidatedDecisionId(invalidated, acApproval);
    if (acApproval !== null && acApproval !== undefined) lifecycle.ac_approval = null;
  }
  if (changes.acApprovedSemanticsChanged || changes.packetApprovedSemanticsChanged) {
    pushInvalidatedDecisionId(invalidated, packet);
    pushInvalidatedDecisionId(invalidated, auth);
    if (packet !== null && packet !== undefined) lifecycle.packet_approval = null;
    if (auth !== null && auth !== undefined) lifecycle.authorization = null;
    if (auth !== null && auth !== undefined && root.change_baseline !== null && root.change_baseline !== undefined) root.change_baseline = null;
  }

  root.lifecycle = lifecycle;
  // Invalidated approvals return an active packet to the draft lifecycle position (the fine pre-approval
  // stage is derived from lifecycle decisions; M9.7 retired the flat status field).
  if (root.disposition === "active") root.workflow_state = "packet_draft";

  const invalidatedIds = invalidated.slice(invalidatedIdsBefore);
  const idText = invalidatedIds.length > 0 ? ` Invalidated decision ids: ${invalidatedIds.join(", ")}.` : "";
  if (changes.acApprovedSemanticsChanged) pushDiagnostic(diagnostics, "MIGRATION_AC_APPROVAL_INVALIDATED", `Migration changed WorkPacket AC-approved semantics; active AC approval and downstream packet approval/authorization were invalidated instead of being trusted across legacy shape changes.${idText}`, "warning", "/acceptance_criteria", "Re-anchor the ACs (work.ac.establish), then re-run packet approval and authorization using canonical fields.");
  else pushDiagnostic(diagnostics, "MIGRATION_APPROVALS_INVALIDATED", `Migration changed fields that participate in Work Packet approval/authorization semantics; affected active approvals and change baseline were invalidated instead of being trusted across legacy shape changes.${idText}`, "warning", "/lifecycle", "Re-run packet approval and authorization using canonical fields.");
}

// Map the legacy flat WorkStatus onto the authoritative workflow_state + orthogonal disposition (M9.7).
function mapLegacyWorkStatus(root: MutableRecord): void {
  const legacy = typeof root.status === "string" ? root.status : null;
  if (root.disposition === undefined) {
    root.disposition = legacy === "blocked" || legacy === "deferred" || legacy === "archived" ? legacy : "active";
  }
  if (root.workflow_state === undefined || root.workflow_state === null) {
    root.workflow_state =
      legacy === "approved" ? "packet_approved"
      : legacy === "authorized" || legacy === "preimplementation_validated" || legacy === "implementation_active" || legacy === "implemented" ? "implementation_authorized"
      : legacy === "review_complete" ? "complete"
      : "packet_draft";
  }
  delete root.status;
}

function defaultWorkScaffold(root: MutableRecord): void {
  setIfMissing(root, "schema_version", 1);
  setIfMissing(root, "revision", 1);
  mapLegacyWorkStatus(root);
  setIfMissing(root, "title", typeof root.id === "string" ? root.id : "Untitled work packet");
  setIfMissing(root, "classification", "direct_behavior");
  // Default to new_entirely (all-establish) so migrated packets keep today's behavior; never fabricates.
  setIfMissing(root, "origination", "new_entirely");
  setIfMissing(root, "parent_plan_id", null);
  setIfMissing(root, "plan_slice_id", null);
  setIfMissing(root, "runtime_baseline_ref", null);
  setIfMissing(root, "work_breakdown_ref", null);
  setIfMissing(root, "decomposed", false);
  // Milestone 1A approval-projection placeholders. Migration adds explicit nulls only; it never
  // fabricates implementation plans, work-kind resolutions, evidence policies, or their hashes.
  setIfMissing(root, "work_kind_resolution", null);
  setIfMissing(root, "work_kind_resolution_hash", null);
  setIfMissing(root, "implementation_plan", null);
  setIfMissing(root, "implementation_plan_hash", null);
  setIfMissing(root, "evidence_policy_resolution", null);
  setIfMissing(root, "evidence_policy_resolution_hash", null);
  setIfMissing(root, "change_baseline", null);
  setIfMissing(root, "decision_history", []);
  setIfMissing(root, "diagnostics", []);
  setIfMissing(root, "docs", { policy: "none_required", none_required_reason: "legacy_migration_default", not_applicable_reason: null, requirements: [] });
  setIfMissing(root, "scope", { allowed_globs: [], deviations: [] });
  setIfMissing(root, "platform", { required: false, choice: null, decision_id: null, not_required_reason: "legacy_migration_unspecified" });
  setIfMissing(root, "architecture", { ...architectureRequirementDefaultsForUnknownClassification(root.classification), decision_ids: [] });
  setIfMissing(root, "lifecycle", { ac_approval: null, packet_approval: null, authorization: null, history: [] });
  // Drop the superseded verification/execution data fields from legacy WorkPackets (M9.7); the role
  // loop replaces them with lineage records. Removed (not just stopped-defaulting) so strict parse
  // does not reject legacy keys.
  delete root.evidence;
  delete root.claims;
  delete root.backend_verifications;
  delete root.review;
  if (root.docs !== null && typeof root.docs === "object") delete (root.docs as MutableRecord).records;
  // Role-loop lifecycle + lineage storage (M9.7).
  setIfMissing(root, "workflow_state", null);
  setIfMissing(root, "implementation_attempts", []);
  setIfMissing(root, "review_cycles", []);
  setIfMissing(root, "focused_fix_instructions", []);
  setIfMissing(root, "clarification_requests", []);
}

function migrateWorkPacket(raw: MutableRecord): ArtifactMigrationResult {
  const root = cloneRecord(raw);
  const diagnostics: Diagnostic[] = [];
  const invalidated: string[] = [];
  let changed = false;
  let acApprovedSemanticsChanged = false;
  let packetApprovedSemanticsChanged = false;

  defaultWorkScaffold(root);
  const intent = getNestedRecord(root, "intent");
  if (intent.goal === undefined && typeof root.goal === "string") {
    intent.goal = root.goal;
    changed = true;
    packetApprovedSemanticsChanged = true;
    pushDiagnostic(diagnostics, "MIGRATION_WORK_GOAL", "Migrated legacy WorkPacket goal to intent.goal.", "warning", "/goal", "Use /intent/goal on future writes.");
  }
  setIfMissing(intent, "goal", "");
  for (const key of ["desired_outcomes", "in_scope", "out_of_scope", "users_actors", "edge_cases", "open_questions"]) setIfMissing(intent, key, []);
  root.intent = intent;

  const ac = firstPresent(root, ["acceptance_criteria", "acceptanceCriteria", "acs", "ac"]);
  if (root.acceptance_criteria === undefined && ac !== null) {
    root.acceptance_criteria = migrateAcceptanceCriteria(ac.value, diagnostics).criteria;
    changed = true;
    acApprovedSemanticsChanged = true;
    packetApprovedSemanticsChanged = true;
    pushDiagnostic(diagnostics, "MIGRATION_WORK_AC", `Migrated legacy field ${ac.key} to acceptance_criteria.`, "warning", `/${ac.key}`, "Use /acceptance_criteria on future writes.");
  }
  if (root.acceptance_criteria !== undefined) {
    const acMigration = migrateAcceptanceCriteria(root.acceptance_criteria, diagnostics);
    root.acceptance_criteria = acMigration.criteria;
    if (acMigration.changed) {
      changed = true;
      acApprovedSemanticsChanged = true;
      packetApprovedSemanticsChanged = true;
    }
  } else root.acceptance_criteria = [];

  const allowed = firstPresent(root, ["allowedFiles", "allowed_paths"]);
  if (allowed !== null) {
    const normalized = asStringArray(allowed.value);
    if (isRecord(root.scope) && normalized !== null && (!Array.isArray((root.scope as MutableRecord).allowed_globs) || ((root.scope as MutableRecord).allowed_globs as unknown[]).length === 0)) {
      root.scope = { ...(root.scope as MutableRecord), allowed_globs: normalized };
      changed = true;
      packetApprovedSemanticsChanged = true;
      pushDiagnostic(diagnostics, "MIGRATION_WORK_ALLOWED_GLOBS", `Migrated ${allowed.key} to scope.allowed_globs.`, "warning", `/${allowed.key}`, "Use /scope/allowed_globs on future writes.");
    }
  }
  const scope = getNestedRecord(root, "scope");
  setIfMissing(scope, "allowed_globs", []);
  setIfMissing(scope, "deviations", []);
  root.scope = scope;
  const allowedGlobs = Array.isArray(scope.allowed_globs) ? scope.allowed_globs : [];
  if (allowedGlobs.some((glob) => glob === "**/*" || glob === "*" || glob === "./**/*") && !hasDiagnostic(root, "MIGRATION_BOILERPLATE_SCOPE")) {
    pushDiagnostic(diagnostics, "MIGRATION_BOILERPLATE_SCOPE", "Generated boilerplate catch-all scope was preserved; review and narrow scope.allowed_globs before authorization.", "warning", "/scope/allowed_globs", "Replace boilerplate globs with product-specific allowed paths.");
  }

  const docs = getNestedRecord(root, "docs");
  if ((docs.policy === undefined || docs.policy === null || docs.policy === "none_required") && typeof root.docsPolicy === "string") {
    docs.policy = root.docsPolicy;
    changed = true;
    packetApprovedSemanticsChanged = true;
    pushDiagnostic(diagnostics, "MIGRATION_WORK_DOCS_POLICY", "Migrated docsPolicy to docs.policy.", "warning", "/docsPolicy", "Use /docs/policy on future writes.");
  }
  setIfMissing(docs, "policy", "none_required");
  setIfMissing(docs, "none_required_reason", docs.policy === "none_required" ? "legacy_migration_default" : null);
  setIfMissing(docs, "not_applicable_reason", null);
  setIfMissing(docs, "requirements", []);
  delete docs.records; // superseded evidence model (M9.7)
  root.docs = docs;

  if (root.baselineRef !== undefined && root.runtime_baseline_ref === null) {
    root.runtime_baseline_ref = root.baselineRef;
    changed = true;
    packetApprovedSemanticsChanged = true;
    pushDiagnostic(diagnostics, "MIGRATION_WORK_BASELINE_REF", "Migrated baselineRef to runtime_baseline_ref.", "warning", "/baselineRef", "Use /runtime_baseline_ref on future writes.");
  }
  if (root.changeBaseline !== undefined && root.change_baseline === null) {
    root.change_baseline = root.changeBaseline;
    changed = true;
    packetApprovedSemanticsChanged = true;
    pushDiagnostic(diagnostics, "MIGRATION_WORK_CHANGE_BASELINE", "Migrated changeBaseline to change_baseline.", "warning", "/changeBaseline", "Use /change_baseline on future writes.");
  }
  const platform = getNestedRecord(root, "platform");
  if ((platform.decision_id === undefined || platform.decision_id === null) && typeof root.platformDecisionId === "string") {
    platform.decision_id = root.platformDecisionId;
    changed = true;
    packetApprovedSemanticsChanged = true;
    pushDiagnostic(diagnostics, "MIGRATION_WORK_PLATFORM_DECISION", "Migrated platformDecisionId to platform.decision_id.", "warning", "/platformDecisionId", "Use /platform/decision_id on future writes.");
  }
  setIfMissing(platform, "required", false);
  setIfMissing(platform, "choice", null);
  setIfMissing(platform, "decision_id", null);
  setIfMissing(platform, "not_required_reason", "legacy_migration_unspecified");
  root.platform = platform;

  const architecture = getNestedRecord(root, "architecture");
  const archIds = firstPresent(root, ["architectureDecisionIds"]);
  if ((!Array.isArray(architecture.decision_ids) || architecture.decision_ids.length === 0) && archIds !== null) {
    architecture.decision_ids = asStringArray(archIds.value) ?? [];
    changed = true;
    packetApprovedSemanticsChanged = true;
    pushDiagnostic(diagnostics, "MIGRATION_WORK_ARCH_DECISIONS", "Migrated architectureDecisionIds to architecture.decision_ids.", "warning", "/architectureDecisionIds", "Use /architecture/decision_ids on future writes.");
  }
  const architectureDefaults = architectureRequirementDefaultsForUnknownClassification(root.classification);
  setIfMissing(architecture, "required", architectureDefaults.required);
  setIfMissing(architecture, "required_reason", architectureDefaults.required_reason);
  setIfMissing(architecture, "not_required_reason", architectureDefaults.not_required_reason ?? "legacy_migration_unspecified");
  setIfMissing(architecture, "decision_ids", []);
  root.architecture = architecture;

  maybeInvalidateWorkApprovals(root, { acApprovedSemanticsChanged, packetApprovedSemanticsChanged }, diagnostics, invalidated);
  for (const legacyKey of ["goal", "ac", "acs", "acceptanceCriteria", "allowedFiles", "allowed_paths", "docsPolicy", "platformDecisionId", "architectureDecisionIds", "baselineRef", "changeBaseline", "verifierResults"]) delete root[legacyKey];
  appendDiagnostics(root, diagnostics);
  return { artifact: WorkPacketSchema.parse(root), diagnostics, changed: changed || diagnostics.length > 0 || invalidated.length > 0, invalidated_decision_ids: invalidated };
}


function migrateRuntimeBaseline(raw: MutableRecord): ArtifactMigrationResult {
  const root = cloneRecord(raw);
  const diagnostics: Diagnostic[] = [];
  const invalidated: string[] = [];
  let changed = false;
  let validationApprovedSemanticsChanged = false;
  setIfMissing(root, "schema_version", 1);
  setIfMissing(root, "revision", 1);
  // Pre-target-scope baselines were the repo-wide singleton; they migrate to the DEFAULT target id (the
  // file relocation __singleton__→default is handled lazily on read, baseline/target-store.ts §8).
  setIfMissing(root, "id", DEFAULT_TARGET_ID);
  setIfMissing(root, "stack", { product_platform: null, runtime: null, language: null, package_manager: null, framework: null, build_tool: null, architecture: null });
  setIfMissing(root, "commands", { test: null, test_not_applicable_reason: null, build: null, build_not_applicable_reason: null, runtime_production: null, runtime_production_not_applicable_reason: null, runtime_development: null, runtime_development_not_applicable_reason: null });
  setIfMissing(root, "configuration", { environment_strategy: null, required_env_vars: [], greenfield_scaffold: false });
  setIfMissing(root, "dependency_modes", { install_mode: null, external_services: null });
  setIfMissing(root, "diff_policy", { dependency_changes_require_approval: true, include_untracked: true });
  setIfMissing(root, "acceptance", null);
  setIfMissing(root, "decision_history", []);
  setIfMissing(root, "blocker", null);
  setIfMissing(root, "diagnostics", []);
  const acceptedLegacy = root.accepted;
  if (root.status === undefined) {
    if ((acceptedLegacy === true || acceptedLegacy === "accepted") && validHumanDecision(root.acceptance)) root.status = "accepted";
    else if (acceptedLegacy === false || acceptedLegacy === "blocked" || acceptedLegacy === "rejected") root.status = acceptedLegacy === "blocked" ? "blocked" : "draft";
    else root.status = "draft";
    changed = true;
    pushDiagnostic(diagnostics, "MIGRATION_BASELINE_STATUS", "Mapped legacy RuntimeBaseline accepted/status variant to canonical status without fabricating acceptance.", "warning", "/status", "Use canonical /status and HumanDecision acceptance fields on future writes.");
  }
  if ((acceptedLegacy === true || acceptedLegacy === "accepted" || root.status === "accepted") && !validHumanDecision(root.acceptance)) {
    root.status = "draft";
    root.acceptance = null;
    changed = true;
    pushDiagnostic(diagnostics, "MIGRATION_BASELINE_ACCEPTANCE_NOT_FABRICATED", "Legacy accepted marker was not backed by a valid HumanDecision; baseline remains draft and no HumanDecision was fabricated.", "warning", "/acceptance", "Accept the baseline through baseline.accept after deterministic validation.");
  }
  const validation = getNestedRecord(root, "validation");
  if (validation.command_results === undefined && Array.isArray(root.validationResults)) {
    const validResults = root.validationResults.filter((entry) => CommandResultSchema.safeParse(entry).success);
    validation.command_results = validResults;
    changed = true;
    validationApprovedSemanticsChanged = true;
    if (validResults.length !== root.validationResults.length) pushDiagnostic(diagnostics, "MIGRATION_BASELINE_VALIDATION_RESULTS_PARTIAL", "Only valid kernel CommandResult records from validationResults were migrated; invalid legacy records were preserved only by diagnostic/history, not trusted.", "warning", "/validationResults", "Create validation results through command.run.");
    else pushDiagnostic(diagnostics, "MIGRATION_BASELINE_VALIDATION_RESULTS", "Migrated valid validationResults to validation.command_results.", "warning", "/validationResults", "Create validation results through command.run.");
  }
  setIfMissing(validation, "command_results", []);
  setIfMissing(validation, "diagnostics", []);
  root.validation = validation;
  if (validationApprovedSemanticsChanged && root.status === "accepted" && validHumanDecision(root.acceptance)) {
    pushInvalidatedDecisionId(invalidated, root.acceptance);
    const idText = invalidated.length > 0 ? ` Invalidated decision ids: ${invalidated.join(", ")}.` : "";
    root.status = "draft";
    root.acceptance = null;
    changed = true;
    pushDiagnostic(diagnostics, "MIGRATION_BASELINE_ACCEPTANCE_INVALIDATED", `Migration changed RuntimeBaseline accepted /validation semantics; active acceptance was cleared instead of being trusted across legacy shape changes.${idText}`, "warning", "/validation", "Re-run baseline review and acceptance after canonical validation results are established.");
  }
  for (const legacyKey of ["accepted", "validationResults"]) delete root[legacyKey];
  appendDiagnostics(root, diagnostics);
  return { artifact: RuntimeBaselineSchema.parse(root), diagnostics, changed: changed || diagnostics.length > 0 || invalidated.length > 0, invalidated_decision_ids: invalidated };
}

function migrateSourceArtifact(raw: MutableRecord): ArtifactMigrationResult {
  const root = cloneRecord(raw);
  const diagnostics: Diagnostic[] = [];
  let changed = false;
  setIfMissing(root, "schema_version", 1);
  setIfMissing(root, "revision", 1);
  setIfMissing(root, "diagnostics", []);
  if (root.content_hash === undefined && typeof root.hash === "string") {
    root.content_hash = root.hash;
    changed = true;
    pushDiagnostic(diagnostics, "MIGRATION_SOURCE_CONTENT_HASH", "Migrated hash to content_hash.", "warning", "/hash", "Use /content_hash on future writes.");
  }
  if (root.locator === undefined) {
    const locator = firstPresent(root, ["uri", "path"]);
    if (locator !== null) {
      root.locator = locator.value;
      changed = true;
      pushDiagnostic(diagnostics, "MIGRATION_SOURCE_LOCATOR", `Migrated ${locator.key} to locator.`, "warning", `/${locator.key}`, "Use /locator on future writes.");
    }
  }
  for (const legacyKey of ["hash", "uri", "path"]) delete root[legacyKey];
  appendDiagnostics(root, diagnostics);
  return { artifact: SourceArtifactSchema.parse(root), diagnostics, changed: changed || diagnostics.length > 0, invalidated_decision_ids: [] };
}

export function migrateLoadedArtifact<T = unknown>(rawArtifact: unknown): ArtifactMigrationResult<T> {
  if (!isRecord(rawArtifact)) return { artifact: rawArtifact as T, diagnostics: [], changed: false, invalidated_decision_ids: [] };
  switch (rawArtifact.artifact_type) {
    case "work_packet": return migrateWorkPacket(rawArtifact) as ArtifactMigrationResult<T>;
    case "runtime_baseline": return migrateRuntimeBaseline(rawArtifact) as ArtifactMigrationResult<T>;
    case "source_artifact": return migrateSourceArtifact(rawArtifact) as ArtifactMigrationResult<T>;
    default: return { artifact: rawArtifact as T, diagnostics: [], changed: false, invalidated_decision_ids: [] };
  }
}

export function validateCanonicalArtifactForWrite(artifact: unknown): void {
  if (!isRecord(artifact) || typeof artifact.artifact_type !== "string") throw new Error("artifact writes require canonical artifact_type");
  const schema = knownArtifactSchemas[artifact.artifact_type as keyof typeof knownArtifactSchemas] as z.ZodType | undefined;
  if (schema === undefined) return;
  schema.parse(artifact);
}
