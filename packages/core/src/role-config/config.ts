import { z } from "zod";
import type { Diagnostic } from "../schemas/embedded.ts";

/** Role config: the in-code structure (which roles exist, the inline coordinator, the deterministic validator,
 * identities, the model-alias table) PLUS each spawnable role's editable model + read-only, which live in the
 * host-native named subagent files (.claude/agents/*.md, .codex/agents/*.toml — see agent-files.ts / load.ts).
 * Distinct from governed `.spec-guard/` state. buildDefaultRoleConfig is the structural default + generator source. */

// Retained for backward compatibility / migration messaging; Spec Guard no longer reads or writes this file.
export const ROLE_CONFIG_FILENAME = "spec-guard.config.json";
export const ROLE_CONFIG_SCHEMA_VERSION = 1;

export const ROLE_NAMES = [
  "coordinator",
  "implementation_planner",
  "implementer",
  "fixer",
  "reviewer",
  "rereviewer",
  "validator",
  "evidence_recorder",
  "clarification_handler"
] as const;
export const RoleNameSchema = z.enum(ROLE_NAMES);
export type RoleName = z.infer<typeof RoleNameSchema>;

/** Backend execution adapter kind. `deterministic` = NOT an LLM provider — it runs the declared commands on
 * this machine and reads exit codes (the validator; no model, no setup, always available). `claude_code`/`pi`
 * spawn model subagents. `local` is the deprecated former name for `deterministic` (still accepted). */
export const SubagentAdapterKindSchema = z.enum(["claude_code", "pi", "deterministic", "local"]);
export type SubagentAdapterKind = z.infer<typeof SubagentAdapterKindSchema>;

/** True for the deterministic command-runner adapter (no model). Accepts the deprecated `local` alias. */
export function isDeterministicAdapter(provider: SubagentAdapterKind): boolean {
  return provider === "deterministic" || provider === "local";
}

export const SelfReviewIdentityModeSchema = z.enum([
  "strict_provider_identity_required",
  "logical_role_identity_allowed_with_visible_trust_boundary",
  "self_review_or_unknown_identity_override_required"
]);
export type SelfReviewIdentityMode = z.infer<typeof SelfReviewIdentityModeSchema>;

/** Context LIFETIME / firewall axis, made explicit instead of smuggled into `provider`. `inline` = runs in
 * the coordinator's persistent context (only the coordinator); `subagent` = runs in a DISPOSABLE subagent
 * whose churn (and verbose output) is discarded, keeping the coordinator lean. Mechanical/judgment work
 * (implement/fix/review/validate) is `subagent` so it is delegated, not run inline. */
export const RoleExecutionSchema = z.enum(["inline", "subagent"]);
export type RoleExecution = z.infer<typeof RoleExecutionSchema>;

/** A model reference for the validator's summarization (distinct from the role's own provider/model).
 * `model` may be a tier alias or a concrete id; resolves against `provider` via `model_aliases`. */
export const SummaryModelSchema = z.object({
  provider: SubagentAdapterKindSchema,
  model: z.string().min(1).nullable()
}).strict();
export type SummaryModel = z.infer<typeof SummaryModelSchema>;

export const RoleConfigEntrySchema = z.object({
  provider: SubagentAdapterKindSchema,
  // A tier alias (resolved per provider via model_aliases) OR a concrete model id OR null (provider default).
  model: z.string().min(1).nullable(),
  // Only meaningful for the validator: the model that summarizes validation output (never decides pass/fail).
  summary_model: SummaryModelSchema.nullable().default(null),
  permissions: z.array(z.string()),
  may_edit_code: z.boolean(),
  // Context lifetime / firewall axis. Defaulted to the firewall-safe `subagent` so existing configs stay valid
  // (only the coordinator is `inline`); the role loop bars `inline` roles from recording mechanical lineage.
  execution: RoleExecutionSchema.default("subagent"),
  agent_instance_id: z.string().min(1)
}).strict();
export type RoleConfigEntry = z.infer<typeof RoleConfigEntrySchema>;

export const RolesSchema = z.object({
  coordinator: RoleConfigEntrySchema,
  implementation_planner: RoleConfigEntrySchema,
  implementer: RoleConfigEntrySchema,
  fixer: RoleConfigEntrySchema,
  reviewer: RoleConfigEntrySchema,
  rereviewer: RoleConfigEntrySchema,
  validator: RoleConfigEntrySchema,
  evidence_recorder: RoleConfigEntrySchema,
  clarification_handler: RoleConfigEntrySchema
}).strict();
export type Roles = z.infer<typeof RolesSchema>;

export const WorkflowConfigSchema = z.object({
  require_implementation_plan: z.boolean(),
  implementation_plan_approved_with_packet: z.boolean(),
  require_focused_review_after_implementation: z.boolean(),
  require_focused_rereview_after_blocker_fixes: z.boolean(),
  // DEPRECATED + optional: self_review_identity_mode is the single source of truth for self-review policy.
  // Kept optional so existing configs that still carry it remain valid; new configs omit it.
  prevent_self_review_by_default: z.boolean().optional(),
  compact_review_records: z.boolean()
}).strict();
export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;

/** Tier aliases (e.g. `high_judgment`, `low_cost`) → concrete model id per provider. Lets roles
 * reference a portable tier; `config.check` resolves to a concrete model and warns if unavailable. */
// alias name -> (provider -> model id). String-keyed so a tier need not list every provider.
export const ModelAliasMapSchema = z.record(z.string(), z.record(z.string(), z.string()));
export type ModelAliasMap = z.infer<typeof ModelAliasMapSchema>;

export const SpecGuardRoleConfigSchema = z.object({
  schema_version: z.literal(ROLE_CONFIG_SCHEMA_VERSION),
  self_review_identity_mode: SelfReviewIdentityModeSchema,
  model_aliases: ModelAliasMapSchema.default({}),
  roles: RolesSchema,
  workflow: WorkflowConfigSchema
}).strict();
export type SpecGuardRoleConfig = z.infer<typeof SpecGuardRoleConfigSchema>;

/** Roles that must never edit product code (design "Suggested execution context"). */
export const READ_ONLY_ROLES = [
  "coordinator",
  "implementation_planner",
  "reviewer",
  "rereviewer",
  "validator",
  "evidence_recorder",
  "clarification_handler"
] as const satisfies readonly RoleName[];
export const EDIT_CAPABLE_ROLES = ["implementer", "fixer"] as const satisfies readonly RoleName[];

/** Stable, deterministic logical instance id per role so implementer/reviewer are distinct by
 * default (the basis for default self-review viability). */
export function defaultAgentInstanceId(role: RoleName): string {
  return `sg-role-${role}`;
}

export function buildDefaultRoleConfig(): SpecGuardRoleConfig {
  const entry = (role: RoleName, provider: SubagentAdapterKind, mayEdit: boolean, permissions: string[], model: string | null, summaryModel: SummaryModel | null = null): RoleConfigEntry => ({
    provider,
    model,
    summary_model: summaryModel,
    permissions,
    may_edit_code: mayEdit,
    // Only the coordinator runs inline (the persistent lead); everything else runs in a disposable subagent.
    execution: role === "coordinator" ? "inline" : "subagent",
    agent_instance_id: defaultAgentInstanceId(role)
  });
  return SpecGuardRoleConfigSchema.parse({
    schema_version: ROLE_CONFIG_SCHEMA_VERSION,
    // Default to the strict identity mode: self-review is NOT viable by matching logical labels — a genuinely
    // separate reviewer identity is required. (Self-review is the degraded mode, never the default.)
    self_review_identity_mode: "strict_provider_identity_required",
    // Editable placeholders; config.check resolves these per provider and warns if unavailable. Tiers:
    // high_judgment = coordinator/governance; standard = spec-pinned execution (implement/review); low_cost =
    // mechanical/summarization. Mechanical, well-specified work runs on the cheapest capable tier.
    model_aliases: {
      // Codex (pi) model slugs are the real ones per developers.openai.com/codex/models: gpt-5.5 (full/default),
      // gpt-5.4 (fallback full), gpt-5.4-mini (lighter/subagents). gpt-5.5-mini does NOT exist.
      high_judgment: { claude_code: "claude-opus-4-8", pi: "gpt-5.5" },
      standard: { claude_code: "claude-sonnet-4-6", pi: "gpt-5.4" },
      low_cost: { claude_code: "claude-haiku-4-5-20251001", pi: "gpt-5.4-mini" }
    },
    roles: {
      coordinator: entry("coordinator", "claude_code", false, ["draft_planning_artifacts", "route_tasks"], "high_judgment"),
      implementation_planner: entry("implementation_planner", "claude_code", false, ["draft_implementation_plan"], "high_judgment"),
      // Implementer/fixer WRITE product code and reviewer/rereviewer render SEMANTIC JUDGMENT — all at the premium
      // "high_judgment" tier. Both code quality and review quality degrade sharply on a cheaper model, so the
      // edit + review roles are deliberately NOT cost-optimized; only the mechanical roles below stay low_cost.
      implementer: entry("implementer", "claude_code", true, ["edit_code", "write_implementation_summary", "request_clarification"], "high_judgment"),
      fixer: entry("fixer", "claude_code", true, ["edit_code", "fix_review_blockers", "request_clarification"], "high_judgment"),
      reviewer: entry("reviewer", "claude_code", false, ["focused_review"], "high_judgment"),
      rereviewer: entry("rereviewer", "claude_code", false, ["focused_rereview"], "high_judgment"),
      validator: entry("validator", "deterministic", false, ["run_commands", "record_command_results"], null, { provider: "claude_code", model: "low_cost" }),
      evidence_recorder: entry("evidence_recorder", "claude_code", false, ["format_evidence", "link_evidence_refs"], "low_cost"),
      clarification_handler: entry("clarification_handler", "claude_code", false, ["triage_clarification", "route_to_human"], "low_cost")
    },
    workflow: {
      require_implementation_plan: true,
      implementation_plan_approved_with_packet: true,
      require_focused_review_after_implementation: true,
      require_focused_rereview_after_blocker_fixes: true,
      // (prevent_self_review_by_default dropped — self_review_identity_mode is the single source of truth.)
      compact_review_records: true
    }
  });
}

export interface SelfReviewDiagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
}

export interface SelfReviewViability {
  mode: SelfReviewIdentityMode;
  edit_instance_ids: string[];
  review_instance_ids: string[];
  collisions: string[];
  viable: boolean;
  trust_boundary_recorded: boolean;
  diagnostics: SelfReviewDiagnostic[];
}

/** Pure: can review-gated work proceed under the config's identity mode? Compares implementer/fixer
 * vs reviewer/rereviewer `agent_instance_id`. M2 reports only; enforcement is M3/M7. */
export function evaluateSelfReviewViability(config: SpecGuardRoleConfig): SelfReviewViability {
  const editIds = [config.roles.implementer.agent_instance_id, config.roles.fixer.agent_instance_id];
  const reviewIds = [config.roles.reviewer.agent_instance_id, config.roles.rereviewer.agent_instance_id];
  const reviewSet = new Set(reviewIds);
  const collisions = [...new Set(editIds.filter((id) => reviewSet.has(id)))];
  const mode = config.self_review_identity_mode;
  const diagnostics: SelfReviewDiagnostic[] = [];
  let viable: boolean;
  let trustBoundaryRecorded = false;

  if (collisions.length > 0) {
    viable = false;
    diagnostics.push({
      code: "SELF_REVIEW_IDENTITY_COLLISION",
      severity: "error",
      message: `Reviewer and implementer/fixer share agent_instance_id(s): ${collisions.join(", ")}. A distinct reviewer identity is required before review-gated work.`
    });
  } else if (mode === "strict_provider_identity_required") {
    viable = false;
    diagnostics.push({
      code: "SELF_REVIEW_STRICT_IDENTITY_UNPROVEN",
      // Warning, not error: the config is valid, but self-review is not viable by logical labels — a
      // separately-spawned reviewer is required before review-gated work. (Enforcement uses `viable`; the
      // severity here is just the advisory tone, since Spec Guard reports rather than blocks today.)
      severity: "warning",
      message: "self_review_identity_mode is strict_provider_identity_required: self-review is not viable by logical labels. Spawn a genuinely separate reviewer agent (distinct provider identity) before review-gated work; do not let one agent review its own implementation."
    });
  } else if (mode === "logical_role_identity_allowed_with_visible_trust_boundary") {
    viable = true;
    trustBoundaryRecorded = true;
    diagnostics.push({
      code: "SELF_REVIEW_LOGICAL_TRUST_BOUNDARY",
      severity: "info",
      message: "Reviewer identity is a Spec Guard logical role instance distinct from implementer/fixer; a logical-role trust boundary (not provider-proven) is recorded."
    });
  } else {
    viable = true;
    diagnostics.push({
      code: "SELF_REVIEW_DISTINCT_LOGICAL_IDS",
      severity: "info",
      message: "Distinct logical reviewer identity present; no self-review/unknown-identity override required."
    });
  }

  return { mode, edit_instance_ids: editIds, review_instance_ids: reviewIds, collisions, viable, trust_boundary_recorded: trustBoundaryRecorded, diagnostics };
}

// --- Model alias resolution (M8) --------------------------------------------------------------

export interface ModelResolution {
  /** Concrete model id, or null for "use the provider's default". */
  model: string | null;
  diagnostics: Diagnostic[];
}

/** Resolve a model reference (tier alias or concrete id or null) against a provider. A reference that
 * isn't a known alias is treated as a concrete model id. An alias with no entry for the provider is a
 * warning (no silent fallback to another model). */
function resolveModelReference(ref: string | null, provider: SubagentAdapterKind, aliases: ModelAliasMap, role: RoleName, field: string): ModelResolution {
  if (ref === null) return { model: null, diagnostics: [] };
  const aliasEntry = aliases[ref];
  if (aliasEntry === undefined) return { model: ref, diagnostics: [] };
  const resolved = aliasEntry[provider];
  if (resolved === undefined) {
    return {
      model: null,
      diagnostics: [{ code: "ROLE_MODEL_UNAVAILABLE", severity: "warning", message: `Role '${role}' ${field} alias '${ref}' has no model for provider '${provider}'. Spec Guard will not silently fall back.`, field_path: `/roles/${role}/${field}`, gate: null, fix: `Add model_aliases.${ref}.${provider}, or set a concrete model.` }]
    };
  }
  return { model: resolved, diagnostics: [] };
}

/** Resolve a role's execution model to a concrete id (or null = provider default). */
export function resolveRoleModel(config: SpecGuardRoleConfig, role: RoleName): ModelResolution {
  const entry = config.roles[role];
  return resolveModelReference(entry.model, entry.provider, config.model_aliases, role, "model");
}

/** Resolve a role's validation-summary model (the validator's `summary_model`), if any. */
export function resolveRoleSummaryModel(config: SpecGuardRoleConfig, role: RoleName): ModelResolution {
  const entry = config.roles[role];
  if (entry.summary_model === null) return { model: null, diagnostics: [] };
  return resolveModelReference(entry.summary_model.model, entry.summary_model.provider, config.model_aliases, role, "summary_model");
}
