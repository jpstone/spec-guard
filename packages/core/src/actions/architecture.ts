import { z } from "zod";
import { sha256HexCanonical } from "../canonical/hashes.ts";
import { CommandSpecSchema, type Diagnostic, type HumanDecision, type JsonValue } from "../schemas/embedded.ts";
import { ArchitectureCharterSchema, ArchitectureOrdinanceEnforcementPlanSchema, ArchitectureOrdinanceSchema, type ArchitectureCharter, type ArchitectureOrdinance } from "../schemas/artifacts.ts";
import { AggregateWorkPacketSchema } from "../schemas/work-packet.ts";
import { establishesNewTarget } from "../work/runtime-baseline-ref.ts";
import { buildHumanDecision, isDiscussDecision } from "../decisions/human-decision.ts";
import { DecisionLog } from "../decisions/decision-log.ts";
import { runCommandDeterministically } from "../commands/runner.ts";
import { aggregateStoreForContext, diagnostic, failureResult, isoNow, storeForContext } from "./config.ts";
import type { ActionExecutionContext } from "./context.ts";
import type { ActionResult, NextAction } from "./result.ts";

const CHARTER_ID = null;
const CHARTER_ARTIFACT_TYPE = "architecture_charter";

function nextAction(action_id: string, reason: string, suggested_input: Record<string, unknown> | null = null): NextAction {
  return { action_id, cli: null, mcp: `spec_guard_${action_id.replaceAll(".", "_")}`, reason, suggested_input };
}

function defaultCharter(): ArchitectureCharter {
  const now = isoNow();
  return ArchitectureCharterSchema.parse({
    artifact_type: CHARTER_ARTIFACT_TYPE,
    schema_version: 1,
    revision: 1,
    created_at: now,
    updated_at: now,
    status: "empty",
    title: "Architecture Charter",
    ordinances: [],
    lifecycle: { approval: null, authorization: null, activation: null, history: [] },
    diagnostics: []
  });
}

async function readCharter(context: ActionExecutionContext): Promise<ArchitectureCharter | null> {
  try {
    return ArchitectureCharterSchema.parse((await storeForContext(context).readCurrent<ArchitectureCharter>(CHARTER_ARTIFACT_TYPE, CHARTER_ID)).artifact);
  } catch {
    return null;
  }
}

async function readOrCreateCharter(context: ActionExecutionContext): Promise<ArchitectureCharter> {
  const existing = await readCharter(context);
  if (existing !== null) return existing;
  return (await storeForContext(context).create(defaultCharter())).artifact;
}

async function writeCharter(context: ActionExecutionContext, charter: ArchitectureCharter): Promise<ArchitectureCharter> {
  const store = storeForContext(context);
  const candidate = ArchitectureCharterSchema.parse({ ...charter, updated_at: isoNow() });
  try {
    await store.readCurrent(CHARTER_ARTIFACT_TYPE, CHARTER_ID);
    return (await store.update(candidate)).artifact;
  } catch {
    return (await store.create(candidate)).artifact;
  }
}

async function auditDecision(root: string, decision: HumanDecision): Promise<void> {
  try { await new DecisionLog(root).append(decision); } catch { /* audit is best-effort */ }
}

function activeOrdinances(charter: ArchitectureCharter | null): ArchitectureOrdinance[] {
  return (charter?.ordinances ?? []).filter((ordinance) => ordinance.state === "active" && ordinance.enforcement_plan !== null);
}

function charterStatus(ordinances: ArchitectureOrdinance[]): ArchitectureCharter["status"] {
  if (ordinances.length === 0) return "empty";
  if (ordinances.some((ordinance) => ordinance.state === "active")) return "active";
  if (ordinances.some((ordinance) => ordinance.state === "validated")) return "validated";
  if (ordinances.some((ordinance) => ordinance.state === "implementation_authorized")) return "implementation_authorized";
  if (ordinances.some((ordinance) => ordinance.state === "approved")) return "approved";
  if (ordinances.some((ordinance) => ordinance.state === "planned")) return "planned";
  if (ordinances.some((ordinance) => ordinance.state === "changes_requested")) return "blocked";
  if (ordinances.every((ordinance) => ordinance.state === "retired")) return "retired";
  return "draft";
}

function summarizeCharter(charter: ArchitectureCharter | null) {
  if (charter === null) return { exists: false, status: "missing", revision: null, ordinance_count: 0, active_ordinance_ids: [] };
  return {
    exists: true,
    status: charter.status,
    revision: charter.revision,
    ordinance_count: charter.ordinances.length,
    active_ordinance_ids: activeOrdinances(charter).map((ordinance) => ordinance.id),
    retired_ordinance_count: charter.ordinances.filter((ordinance) => ordinance.state === "retired").length,
    ordinances: charter.ordinances.map((ordinance) => ({
      id: ordinance.id,
      title: ordinance.title,
      state: ordinance.state,
      severity: ordinance.severity,
      supersedes: ordinance.supersedes,
      superseded_by: ordinance.superseded_by,
      has_enforcement_plan: ordinance.enforcement_plan !== null,
      latest_validation_status: ordinance.latest_validation?.command_result.status ?? null
    }))
  };
}

function nextOrdinanceId(existing: ArchitectureOrdinance[], index: number): string {
  const used = new Set(existing.map((ordinance) => ordinance.id));
  let n = existing.length + index + 1;
  while (used.has(`ORD-${String(n).padStart(3, "0")}`)) n += 1;
  return `ORD-${String(n).padStart(3, "0")}`;
}

function nextRevisionOrdinanceId(existing: ArchitectureOrdinance[], sourceId: string): string {
  const used = new Set(existing.map((ordinance) => ordinance.id));
  let n = 2;
  while (used.has(`${sourceId}-R${n}`)) n += 1;
  return `${sourceId}-R${n}`;
}

function planHash(plan: Omit<z.infer<typeof ArchitectureOrdinanceEnforcementPlanSchema>, "plan_hash">): string {
  return sha256HexCanonical(plan);
}

function approvalPayload(charter: ArchitectureCharter): Record<string, JsonValue> {
  return {
    charter_id: "architecture_charter",
    ordinances: charter.ordinances
      .filter((ordinance) => ordinance.state === "planned" || ordinance.state === "approved" || ordinance.state === "implementation_authorized" || ordinance.state === "validated" || ordinance.state === "active")
      .map((ordinance) => ({
        id: ordinance.id,
        title: ordinance.title,
        rule: ordinance.rule,
        rationale: ordinance.rationale,
        applies_to: ordinance.applies_to,
        exceptions: ordinance.exceptions,
        severity: ordinance.severity,
        examples: ordinance.examples,
        enforcement_plan: ordinance.enforcement_plan
      }))
  } as unknown as Record<string, JsonValue>;
}

export const ArchitectureQuickstartInputSchema = z.object({}).strict();
export const ArchitectureGetInputSchema = z.object({
  view: z.enum(["summary", "ordinance", "all"]).default("summary"),
  ordinance_id: z.string().min(1).optional()
}).strict();

const DraftOrdinanceInputSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  rule: z.string().min(1),
  rationale: z.string().min(1),
  applies_to: z.array(z.string().min(1)).default(["**/*"]),
  exceptions: z.array(z.string().min(1)).default([]),
  severity: z.enum(["blocking", "warning"]).default("blocking"),
  examples: z.object({
    allowed: z.array(z.string().min(1)).default([]),
    disallowed: z.array(z.string().min(1)).default([])
  }).strict().default({ allowed: [], disallowed: [] })
}).strict();

export const ArchitectureDraftInputSchema = z.object({
  ordinances: z.array(DraftOrdinanceInputSchema).min(1)
}).strict();

const EnforcementPlanInputSchema = z.object({
  ordinance_id: z.string().min(1),
  summary: z.string().min(1),
  enforcement_kind: z.enum(["static_check", "test", "lint", "build", "custom_command"]),
  command: CommandSpecSchema,
  expected_files: z.array(z.object({
    path: z.string().min(1),
    purpose: z.string().min(1),
    change_type: z.enum(["create", "modify", "delete"])
  }).strict()).default([]),
  validation_strategy: z.string().min(1)
}).strict();

export const ArchitecturePlanInputSchema = z.object({
  ordinance_plans: z.array(EnforcementPlanInputSchema).min(1)
}).strict();

const GateBaseSchema = z.object({
  selected_number: z.number().int().positive(),
  raw_response: z.string().min(1),
  decision_prompt: z.string().min(1),
  human_confirmed: z.boolean(),
  prompt_id: z.string().optional()
}).strict();

export const ArchitectureApproveInputSchema = GateBaseSchema.extend({
  decision: z.enum(["approve", "approve_and_authorize", "request_changes", "discuss"]).optional(),
  change_request: z.string().min(1).optional()
}).strict();

export const ArchitectureReviseInputSchema = GateBaseSchema.extend({
  ordinance_id: z.string().min(1),
  replacement_id: z.string().min(1).optional(),
  reason: z.string().min(1),
  revision: DraftOrdinanceInputSchema.partial().default({}),
  decision: z.enum(["revise", "discuss"]).optional()
}).strict();

export const ArchitectureAuthorizeInputSchema = GateBaseSchema;

export const ArchitectureRecordInputSchema = z.object({
  ordinance_id: z.string().min(1).optional(),
  summary: z.string().min(1),
  changed_files: z.array(z.string().min(1)).default([])
}).strict();

export const ArchitectureValidateInputSchema = z.object({
  ordinance_ids: z.array(z.string().min(1)).optional()
}).strict();

export const ArchitectureActivateInputSchema = GateBaseSchema.extend({
  decision: z.enum(["activate", "request_changes", "discuss"]).optional(),
  ordinance_ids: z.array(z.string().min(1)).optional(),
  change_request: z.string().min(1).optional()
}).strict();

export const ArchitectureRetireInputSchema = GateBaseSchema.extend({
  ordinance_ids: z.array(z.string().min(1)).min(1),
  reason: z.string().min(1),
  decision: z.enum(["retire", "discuss"]).optional()
}).strict();

export const ArchitectureTemplateProviderImportsInputSchema = z.object({
  ordinance_id: z.string().min(1).default("ORD-PROVIDER-IMPORTS"),
  provider_imports: z.array(z.string().min(1)).min(1),
  applies_to: z.array(z.string().min(1)).default(["src/**"]),
  adapter_globs: z.array(z.string().min(1)).default(["src/adapters/**", "src/**/adapters/**"]),
  checker_path: z.string().min(1).default("scripts/check-provider-imports.mjs"),
  severity: z.enum(["blocking", "warning"]).default("blocking")
}).strict();

export const WorkArchitectureCheckInputSchema = z.object({ id: z.string().min(1) }).strict();
export const WorkArchitectureWaiveInputSchema = GateBaseSchema.extend({
  id: z.string().min(1),
  reason: z.string().min(1)
}).strict();

export async function architectureQuickstart(_input: z.infer<typeof ArchitectureQuickstartInputSchema> = {}, _context: ActionExecutionContext = {}): Promise<ActionResult> {
  ArchitectureQuickstartInputSchema.parse(_input);
  return {
    ok: true,
    action_id: "architecture.quickstart",
    data: {
      flow: [
        "Explain that Architecture Charter ordinances are project-level rules with deterministic enforcement, reviewed in one bulk gate and then run during Work Packet completion.",
        "Ask the human for one or more architecture ordinances in plain language; after each batch, ask whether they want to add more before drafting.",
        "For provider-specific import boundaries, architecture.template.provider_imports can draft and plan a standard adapter-only ordinance from provider package names and adapter globs.",
        "Call architecture.draft only after the human says the initial ordinance list is complete.",
        "Call architecture.plan with deterministic enforcement commands and expected enforcement files for each drafted ordinance.",
        "Ask the human for bulk approve / approve+authorize / request changes / discuss, then call architecture.approve.",
        "After authorization, implement the enforcement checks, record changed files, run architecture.validate, then ask the human to activate with architecture.activate.",
        "To change an active ordinance, call architecture.revise to create a draft replacement; the old ordinance remains active until the replacement is validated and activated. To remove an active rule without replacement, use the human-gated architecture.retire action.",
        "Active blocking ordinances run during Work Packet completion; greenfield Work Packets bind active ordinances with work.architecture.check."
      ],
      charter_artifact: "architecture_charter/__singleton__"
    },
    diagnostics: [],
    mutations: [],
    next_actions: [nextAction("architecture.get", "Inspect the current Architecture Charter summary.", {})],
    summary: "Architecture ordinance flow loaded."
  };
}

export async function architectureGet(input: z.input<typeof ArchitectureGetInputSchema> = {}, context: ActionExecutionContext = {}): Promise<ActionResult> {
  try {
    const parsed = ArchitectureGetInputSchema.parse(input);
    const charter = await readCharter(context);
    if (parsed.view === "summary") {
      return { ok: true, action_id: "architecture.get", data: { architecture_charter_summary: summarizeCharter(charter) }, diagnostics: [], mutations: [], next_actions: [], summary: charter === null ? "No Architecture Charter exists yet." : `Architecture Charter is ${charter.status}.` };
    }
    if (parsed.view === "ordinance") {
      if (parsed.ordinance_id === undefined) return failureResult("architecture.get", "ordinance view requires ordinance_id.", [diagnostic("ARCHITECTURE_GET_ORDINANCE_ID_REQUIRED", "Pass ordinance_id for view:'ordinance'.", "error", "/ordinance_id")]);
      const ordinance = charter?.ordinances.find((candidate) => candidate.id === parsed.ordinance_id) ?? null;
      if (ordinance === null) return failureResult("architecture.get", `No ordinance ${parsed.ordinance_id}.`, [diagnostic("ARCHITECTURE_ORDINANCE_NOT_FOUND", `No ordinance ${parsed.ordinance_id} exists in the charter.`, "error", "/ordinance_id")]);
      return { ok: true, action_id: "architecture.get", data: { ordinance }, diagnostics: [], mutations: [], next_actions: [], summary: `Loaded ordinance ${ordinance.id}.` };
    }
    return { ok: true, action_id: "architecture.get", data: { architecture_charter: charter }, diagnostics: [], mutations: [], next_actions: [], summary: charter === null ? "No Architecture Charter exists yet." : "Loaded Architecture Charter." };
  } catch (error) {
    return failureResult("architecture.get", "Architecture Charter could not be loaded.", [diagnostic("ARCHITECTURE_GET_REJECTED", error instanceof Error ? error.message : String(error), "error", "/architecture")]);
  }
}

export async function architectureTemplateProviderImports(input: z.input<typeof ArchitectureTemplateProviderImportsInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  try {
    const parsed = ArchitectureTemplateProviderImportsInputSchema.parse(input);
    const charter = await readOrCreateCharter(context);
    const existingIndex = charter.ordinances.findIndex((ordinance) => ordinance.id === parsed.ordinance_id);
    const existing = existingIndex >= 0 ? charter.ordinances[existingIndex]! : null;
    if (existing !== null && (existing.state === "active" || existing.state === "retired")) {
      return failureResult("architecture.template.provider_imports", `Ordinance id ${parsed.ordinance_id} is ${existing.state}; choose a new id or use architecture.revise.`, [diagnostic("ARCHITECTURE_TEMPLATE_ORDINANCE_ID_LOCKED", "Active and retired ordinance ids are immutable history.", "error", "/ordinance_id")]);
    }
    const providers = parsed.provider_imports.join(", ");
    const adapterList = parsed.adapter_globs.join(", ");
    const command = CommandSpecSchema.parse({
      mode: "argv" as const,
      argv: ["node", parsed.checker_path, "--providers", parsed.provider_imports.join(","), "--adapters", parsed.adapter_globs.join(","), "--scope", parsed.applies_to.join(",")],
      working_directory: "."
    });
    const hashable = {
      schema_version: 1 as const,
      summary: "Run a static provider-import boundary check.",
      enforcement_kind: "static_check" as const,
      command,
      expected_files: [{ path: parsed.checker_path, purpose: "Architecture ordinance checker for provider import boundaries", change_type: "create" as const }],
      validation_strategy: "The checker scans scoped source files for static imports and require() calls whose specifier matches a provider import, then fails unless the importing file matches an adapter glob."
    };
    const enforcement = ArchitectureOrdinanceEnforcementPlanSchema.parse({ ...hashable, plan_hash: planHash(hashable) });
    const ordinance = ArchitectureOrdinanceSchema.parse({
      id: parsed.ordinance_id,
      title: "Provider imports stay behind adapters",
      rule: `Provider-specific imports (${providers}) may only appear in adapter modules matching ${adapterList}.`,
      rationale: "Provider SDK coupling should be isolated behind adapters so application and domain code stay portable.",
      applies_to: parsed.applies_to,
      exceptions: parsed.adapter_globs,
      severity: parsed.severity,
      examples: {
        allowed: [`${parsed.adapter_globs[0] ?? "src/adapters/**"} imports ${parsed.provider_imports[0]}`],
        disallowed: [`src/features/example.ts imports ${parsed.provider_imports[0]}`]
      },
      state: "planned",
      enforcement_plan: enforcement,
      implementation_records: [],
      latest_validation: null
    });
    const ordinances = existingIndex >= 0
      ? charter.ordinances.map((candidate, index) => index === existingIndex ? ordinance : candidate)
      : [...charter.ordinances, ordinance];
    const updated = await writeCharter(context, ArchitectureCharterSchema.parse({ ...charter, ordinances, status: charterStatus(ordinances), lifecycle: { ...charter.lifecycle, approval: null, authorization: null } }));
    return {
      ok: true,
      action_id: "architecture.template.provider_imports",
      data: {
        architecture_charter_summary: summarizeCharter(updated),
        ordinance_id: ordinance.id,
        checker_contract: {
          provider_imports: parsed.provider_imports,
          adapter_globs: parsed.adapter_globs,
          applies_to: parsed.applies_to,
          checker_path: parsed.checker_path,
          command: enforcement.command
        }
      },
      diagnostics: [],
      mutations: [{ artifact: CHARTER_ARTIFACT_TYPE, operation: "update", paths: ["/ordinances"], summary: `Drafted and planned provider import boundary ordinance ${ordinance.id}.` }],
      next_actions: [nextAction("architecture.approve", "Ask the human for bulk review of the provider-import ordinance and enforcement plan.", { selected_number: 2, raw_response: "<human response>", decision_prompt: "Approve and authorize provider import boundary enforcement?", human_confirmed: true, decision: "approve_and_authorize" })],
      summary: `Provider import boundary ordinance ${ordinance.id} drafted and planned.`
    };
  } catch (error) {
    return failureResult("architecture.template.provider_imports", "Provider import ordinance template failed.", [diagnostic("ARCHITECTURE_TEMPLATE_PROVIDER_IMPORTS_REJECTED", error instanceof Error ? error.message : String(error), "error", "/architecture")]);
  }
}

export async function architectureDraft(input: z.input<typeof ArchitectureDraftInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  try {
    const parsed = ArchitectureDraftInputSchema.parse(input);
    const charter = await readOrCreateCharter(context);
    const ordinances = [...charter.ordinances];
    const errors: Diagnostic[] = [];
    for (const [index, draft] of parsed.ordinances.entries()) {
      const id = draft.id ?? nextOrdinanceId(ordinances, index);
      const existingIndex = ordinances.findIndex((ordinance) => ordinance.id === id);
      if (existingIndex >= 0 && (ordinances[existingIndex]!.state === "active" || ordinances[existingIndex]!.state === "retired")) {
        errors.push(diagnostic("ARCHITECTURE_ORDINANCE_IMMUTABLE_REDEFINE", `Ordinance ${id} is ${ordinances[existingIndex]!.state}; use architecture.revise for active ordinances or choose a new id.`, "error", `/ordinances/${id}`));
        continue;
      }
      const ordinance = ArchitectureOrdinanceSchema.parse({ ...draft, id, state: "draft", enforcement_plan: null, implementation_records: [], latest_validation: null });
      if (existingIndex >= 0) ordinances[existingIndex] = ordinance;
      else ordinances.push(ordinance);
    }
    if (errors.length > 0) return failureResult("architecture.draft", "Architecture ordinance drafts were rejected.", errors);
    const updated = await writeCharter(context, ArchitectureCharterSchema.parse({ ...charter, ordinances, status: charterStatus(ordinances), lifecycle: { ...charter.lifecycle, approval: null, authorization: null, activation: null } }));
    return {
      ok: true,
      action_id: "architecture.draft",
      data: { architecture_charter_summary: summarizeCharter(updated), drafted_ordinance_ids: ordinances.map((ordinance) => ordinance.id) },
      diagnostics: [],
      mutations: [{ artifact: CHARTER_ARTIFACT_TYPE, operation: "update", paths: ["/ordinances"], summary: `Drafted ${parsed.ordinances.length} architecture ordinance(s).` }],
      next_actions: [nextAction("architecture.plan", "Attach deterministic enforcement plans for the drafted ordinances.", { ordinance_plans: ordinances.filter((ordinance) => ordinance.state === "draft").map((ordinance) => ({ ordinance_id: ordinance.id, summary: "<how this rule will be enforced>", enforcement_kind: "static_check", command: { mode: "argv", argv: ["npm", "run", "architecture:check"], working_directory: "." }, expected_files: [], validation_strategy: "<how the checker is proven and kept green>" })) })],
      summary: `Architecture Charter drafted with ${updated.ordinances.length} ordinance(s).`
    };
  } catch (error) {
    return failureResult("architecture.draft", "Architecture ordinance draft failed.", [diagnostic("ARCHITECTURE_DRAFT_REJECTED", error instanceof Error ? error.message : String(error), "error", "/architecture")]);
  }
}

export async function architecturePlan(input: z.input<typeof ArchitecturePlanInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  try {
    const parsed = ArchitecturePlanInputSchema.parse(input);
    const charter = await readOrCreateCharter(context);
    const errors: Diagnostic[] = [];
    const plannedIds = new Set(parsed.ordinance_plans.map((plan) => plan.ordinance_id));
    if (plannedIds.size !== parsed.ordinance_plans.length) errors.push(diagnostic("ARCHITECTURE_PLAN_DUPLICATE", "Each ordinance may appear at most once in architecture.plan.", "error", "/ordinance_plans"));
    const ordinances = charter.ordinances.map((ordinance) => {
      const inputPlan = parsed.ordinance_plans.find((candidate) => candidate.ordinance_id === ordinance.id);
      if (inputPlan === undefined) return ordinance;
      if (ordinance.state === "active" || ordinance.state === "retired") {
        errors.push(diagnostic("ARCHITECTURE_PLAN_IMMUTABLE", `Ordinance ${ordinance.id} is ${ordinance.state}; do not replace enforcement in-place.`, "error", `/ordinances/${ordinance.id}`));
        return ordinance;
      }
      const { ordinance_id: _ordinanceId, ...rawPlan } = inputPlan;
      const hashable = { schema_version: 1 as const, ...rawPlan };
      const enforcement = ArchitectureOrdinanceEnforcementPlanSchema.parse({ ...hashable, plan_hash: planHash(hashable) });
      return { ...ordinance, state: "planned" as const, enforcement_plan: enforcement, latest_validation: null };
    });
    for (const ordinanceId of plannedIds) {
      if (!charter.ordinances.some((ordinance) => ordinance.id === ordinanceId)) errors.push(diagnostic("ARCHITECTURE_PLAN_UNKNOWN_ORDINANCE", `No ordinance ${ordinanceId} exists in the Architecture Charter.`, "error", "/ordinance_plans"));
    }
    if (errors.length > 0) return failureResult("architecture.plan", "Architecture enforcement plan rejected.", errors);
    const updated = await writeCharter(context, ArchitectureCharterSchema.parse({ ...charter, ordinances, status: charterStatus(ordinances), lifecycle: { ...charter.lifecycle, approval: null, authorization: null, activation: null } }));
    return {
      ok: true,
      action_id: "architecture.plan",
      data: { architecture_charter_summary: summarizeCharter(updated), planned_ordinance_ids: [...plannedIds] },
      diagnostics: [],
      mutations: [{ artifact: CHARTER_ARTIFACT_TYPE, operation: "update", paths: ["/ordinances"], summary: `Planned enforcement for ${plannedIds.size} architecture ordinance(s).` }],
      next_actions: [nextAction("architecture.approve", "Ask the human for bulk review: approve, approve+authorize, request changes, or discuss.", { selected_number: 2, raw_response: "<human response>", decision_prompt: "Approve and authorize Architecture Charter enforcement?", human_confirmed: true, decision: "approve_and_authorize" })],
      summary: `Architecture Charter enforcement planned for ${plannedIds.size} ordinance(s).`
    };
  } catch (error) {
    return failureResult("architecture.plan", "Architecture enforcement planning failed.", [diagnostic("ARCHITECTURE_PLAN_REJECTED", error instanceof Error ? error.message : String(error), "error", "/architecture")]);
  }
}

function approvalDecisionFromInput(input: z.infer<typeof ArchitectureApproveInputSchema>): "approve" | "approve_and_authorize" | "request_changes" | "discuss" {
  if (input.decision !== undefined) return input.decision;
  if (input.selected_number === 1) return "approve";
  if (input.selected_number === 2) return "approve_and_authorize";
  if (input.selected_number === 3) return "request_changes";
  return "discuss";
}

function revisionDecisionFromInput(input: z.infer<typeof ArchitectureReviseInputSchema>): "revise" | "discuss" {
  if (input.decision !== undefined) return input.decision;
  return input.selected_number === 1 ? "revise" : "discuss";
}

export async function architectureApprove(input: z.input<typeof ArchitectureApproveInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  try {
    const parsed = ArchitectureApproveInputSchema.parse(input);
    const decisionKind = approvalDecisionFromInput(parsed);
    const charter = await readOrCreateCharter(context);
    if (isDiscussDecision(decisionKind)) {
      return { ok: true, action_id: "architecture.approve", data: { architecture_charter_summary: summarizeCharter(charter) }, diagnostics: [diagnostic("ARCHITECTURE_APPROVE_DISCUSS", "Architecture Charter approval deferred for discussion; no changes recorded.", "info", "/lifecycle/approval")], mutations: [], next_actions: [], summary: "Architecture Charter approval deferred for discussion." };
    }
    if (parsed.human_confirmed !== true) return failureResult("architecture.approve", "Architecture Charter approval requires human_confirmed: true.", [diagnostic("ARCHITECTURE_APPROVE_UNCONFIRMED", "Approval is a human gate; human_confirmed must be true.", "error", "/human_confirmed")]);
    if (decisionKind === "request_changes") {
      const decision = buildHumanDecision({ action_id: "architecture.approve", decision_type: "architecture_charter_approval", selected_number: parsed.selected_number, raw_response: parsed.raw_response, decision_prompt: parsed.decision_prompt, human_confirmed: true, prompt_id: parsed.prompt_id, normalized_decision: "no", final_decision: false, reviewed_payload: approvalPayload(charter), source_interface: "core", target_artifact_revision: charter.revision + 1 });
      const ordinances = charter.ordinances.map((ordinance) => ordinance.state === "planned" ? { ...ordinance, state: "changes_requested" as const } : ordinance);
      const updated = await writeCharter(context, ArchitectureCharterSchema.parse({ ...charter, ordinances, status: charterStatus(ordinances), lifecycle: { ...charter.lifecycle, history: [...charter.lifecycle.history, decision] } }));
      await auditDecision(storeForContext(context).root, decision);
      return { ok: true, action_id: "architecture.approve", data: { architecture_charter_summary: summarizeCharter(updated), decision }, diagnostics: [diagnostic("ARCHITECTURE_APPROVE_CHANGES_REQUESTED", parsed.change_request ?? "Changes requested on Architecture Charter.", "warning", "/ordinances")], mutations: [{ artifact: CHARTER_ARTIFACT_TYPE, operation: "update", paths: ["/ordinances", "/lifecycle/history"], summary: "Architecture Charter changes requested." }], next_actions: [nextAction("architecture.draft", "Revise ordinance drafts based on the human's requested changes.", { ordinances: [] })], summary: "Architecture Charter changes requested." };
    }
    const unplanned = charter.ordinances.filter((ordinance) => ordinance.state === "draft" || ordinance.enforcement_plan === null).map((ordinance) => ordinance.id);
    if (unplanned.length > 0) return failureResult("architecture.approve", "Every ordinance needs an enforcement plan before bulk approval.", [diagnostic("ARCHITECTURE_APPROVE_PLAN_REQUIRED", `Ordinances without enforcement plans: ${unplanned.join(", ")}.`, "error", "/ordinances")]);
    const approvalDecision = buildHumanDecision({ action_id: "architecture.approve", decision_type: "architecture_charter_approval", selected_number: parsed.selected_number, raw_response: parsed.raw_response, decision_prompt: parsed.decision_prompt, human_confirmed: true, prompt_id: parsed.prompt_id, normalized_decision: decisionKind, final_decision: true, approved_payload: approvalPayload(charter), source_interface: "core", target_artifact_revision: charter.revision + 1 });
    let ordinances = charter.ordinances.map((ordinance) => ordinance.state === "planned" || ordinance.state === "changes_requested" ? { ...ordinance, state: "approved" as const } : ordinance);
    const lifecycle = { ...charter.lifecycle, approval: approvalDecision, history: [...charter.lifecycle.history, approvalDecision] };
    let authorizationDecision: HumanDecision | null = null;
    if (decisionKind === "approve_and_authorize") {
      authorizationDecision = buildHumanDecision({ action_id: "architecture.approve", decision_type: "architecture_charter_authorization", selected_number: parsed.selected_number, raw_response: parsed.raw_response, decision_prompt: parsed.decision_prompt, human_confirmed: true, prompt_id: parsed.prompt_id, normalized_decision: "yes", final_decision: true, approved_payload: { charter_id: "architecture_charter", approved_ordinance_ids: ordinances.filter((ordinance) => ordinance.state === "approved").map((ordinance) => ordinance.id) } as unknown as Record<string, JsonValue>, source_interface: "core", target_artifact_revision: charter.revision + 1 });
      ordinances = ordinances.map((ordinance) => ordinance.state === "approved" ? { ...ordinance, state: "implementation_authorized" as const } : ordinance);
      lifecycle.authorization = authorizationDecision;
      lifecycle.history = [...lifecycle.history, authorizationDecision];
    }
    const updated = await writeCharter(context, ArchitectureCharterSchema.parse({ ...charter, ordinances, status: charterStatus(ordinances), lifecycle }));
    await auditDecision(storeForContext(context).root, approvalDecision);
    if (authorizationDecision !== null) await auditDecision(storeForContext(context).root, authorizationDecision);
    return { ok: true, action_id: "architecture.approve", data: { architecture_charter_summary: summarizeCharter(updated), decision: approvalDecision, authorization_decision: authorizationDecision }, diagnostics: [], mutations: [{ artifact: CHARTER_ARTIFACT_TYPE, operation: "update", paths: ["/ordinances", "/lifecycle"], summary: authorizationDecision === null ? "Approved Architecture Charter." : "Approved and authorized Architecture Charter enforcement." }], next_actions: [nextAction("architecture.record", "After implementing enforcement files, record what changed.", { summary: "<what enforcement changed>", changed_files: [] }), nextAction("architecture.validate", "Run the ordinance enforcement commands and store the validation results.", {})], summary: authorizationDecision === null ? "Architecture Charter approved." : "Architecture Charter approved and enforcement authorized." };
  } catch (error) {
    return failureResult("architecture.approve", "Architecture Charter approval failed.", [diagnostic("ARCHITECTURE_APPROVE_REJECTED", error instanceof Error ? error.message : String(error), "error", "/architecture")]);
  }
}

export async function architectureRevise(input: z.input<typeof ArchitectureReviseInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  try {
    const parsed = ArchitectureReviseInputSchema.parse(input);
    const decisionKind = revisionDecisionFromInput(parsed);
    const charter = await readOrCreateCharter(context);
    if (isDiscussDecision(decisionKind)) return { ok: true, action_id: "architecture.revise", data: { architecture_charter_summary: summarizeCharter(charter) }, diagnostics: [diagnostic("ARCHITECTURE_REVISE_DISCUSS", "Architecture ordinance revision deferred for discussion; no changes recorded.", "info", "/ordinances")], mutations: [], next_actions: [], summary: "Architecture ordinance revision deferred for discussion." };
    if (parsed.human_confirmed !== true) return failureResult("architecture.revise", "Architecture ordinance revision requires human_confirmed: true.", [diagnostic("ARCHITECTURE_REVISE_UNCONFIRMED", "Revision is a human gate; human_confirmed must be true.", "error", "/human_confirmed")]);
    const source = charter.ordinances.find((ordinance) => ordinance.id === parsed.ordinance_id) ?? null;
    if (source === null) return failureResult("architecture.revise", `No ordinance ${parsed.ordinance_id}.`, [diagnostic("ARCHITECTURE_REVISE_UNKNOWN_ORDINANCE", `No ordinance ${parsed.ordinance_id} exists in the charter.`, "error", "/ordinance_id")]);
    if (source.state !== "active") return failureResult("architecture.revise", "Only active ordinances can be revised through architecture.revise.", [diagnostic("ARCHITECTURE_REVISE_NOT_ACTIVE", `Ordinance ${source.id} is ${source.state}; revise only active ordinances or edit draft/planned ordinances with architecture.draft.`, "error", "/ordinance_id")]);
    const pendingReplacement = charter.ordinances.find((ordinance) => ordinance.supersedes === source.id && ordinance.state !== "retired") ?? null;
    if (pendingReplacement !== null) return failureResult("architecture.revise", `Ordinance ${source.id} already has pending replacement ${pendingReplacement.id}.`, [diagnostic("ARCHITECTURE_REVISE_PENDING_REPLACEMENT", "Finish or retire the pending replacement before starting another revision.", "error", `/ordinances/${pendingReplacement.id}`)]);
    const replacementId = parsed.replacement_id ?? nextRevisionOrdinanceId(charter.ordinances, source.id);
    if (charter.ordinances.some((ordinance) => ordinance.id === replacementId)) return failureResult("architecture.revise", `Replacement ordinance id ${replacementId} already exists.`, [diagnostic("ARCHITECTURE_REVISE_REPLACEMENT_ID_EXISTS", "Choose a new replacement_id.", "error", "/replacement_id")]);
    const { id: _ignoredRevisionId, ...revision } = parsed.revision;
    const replacement = ArchitectureOrdinanceSchema.parse({
      id: replacementId,
      title: revision.title ?? source.title,
      rule: revision.rule ?? source.rule,
      rationale: revision.rationale ?? source.rationale,
      applies_to: revision.applies_to ?? source.applies_to,
      exceptions: revision.exceptions ?? source.exceptions,
      severity: revision.severity ?? source.severity,
      examples: revision.examples ?? source.examples,
      supersedes: source.id,
      state: "draft",
      enforcement_plan: null,
      implementation_records: [],
      latest_validation: null
    });
    const decision = buildHumanDecision({
      action_id: "architecture.revise",
      decision_type: "architecture_charter_revision",
      selected_number: parsed.selected_number,
      raw_response: parsed.raw_response,
      decision_prompt: parsed.decision_prompt,
      human_confirmed: true,
      prompt_id: parsed.prompt_id,
      normalized_decision: "yes",
      final_decision: true,
      approved_payload: { charter_id: "architecture_charter", source_ordinance_id: source.id, replacement_ordinance_id: replacement.id, reason: parsed.reason, replacement } as unknown as Record<string, JsonValue>,
      source_interface: "core",
      target_artifact_revision: charter.revision + 1
    });
    const ordinances = [...charter.ordinances, replacement];
    const updated = await writeCharter(context, ArchitectureCharterSchema.parse({ ...charter, ordinances, status: charterStatus(ordinances), lifecycle: { ...charter.lifecycle, history: [...charter.lifecycle.history, decision] } }));
    await auditDecision(storeForContext(context).root, decision);
    return {
      ok: true,
      action_id: "architecture.revise",
      data: { architecture_charter_summary: summarizeCharter(updated), source_ordinance_id: source.id, replacement_ordinance_id: replacement.id, decision },
      diagnostics: [],
      mutations: [{ artifact: CHARTER_ARTIFACT_TYPE, operation: "update", paths: ["/ordinances", "/lifecycle/history"], summary: `Created draft replacement ${replacement.id} for active ordinance ${source.id}.` }],
      next_actions: [nextAction("architecture.plan", "Attach a deterministic enforcement plan to the replacement ordinance.", { ordinance_plans: [{ ordinance_id: replacement.id, summary: "<how the revised rule will be enforced>", enforcement_kind: "static_check", command: { mode: "argv", argv: ["npm", "run", "architecture:check"], working_directory: "." }, expected_files: [], validation_strategy: "<how the revised checker is proven and kept green>" }] })],
      summary: `Created draft replacement ${replacement.id} for ordinance ${source.id}.`
    };
  } catch (error) {
    return failureResult("architecture.revise", "Architecture ordinance revision failed.", [diagnostic("ARCHITECTURE_REVISE_REJECTED", error instanceof Error ? error.message : String(error), "error", "/architecture")]);
  }
}

export async function architectureAuthorize(input: z.input<typeof ArchitectureAuthorizeInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  try {
    const parsed = ArchitectureAuthorizeInputSchema.parse(input);
    if (parsed.human_confirmed !== true) return failureResult("architecture.authorize", "Architecture Charter authorization requires human_confirmed: true.", [diagnostic("ARCHITECTURE_AUTHORIZE_UNCONFIRMED", "Authorization is a human gate; human_confirmed must be true.", "error", "/human_confirmed")]);
    const charter = await readOrCreateCharter(context);
    if (charter.lifecycle.approval === null) return failureResult("architecture.authorize", "Architecture Charter is not approved.", [diagnostic("ARCHITECTURE_AUTHORIZE_NOT_APPROVED", "Approve the charter before authorizing enforcement implementation.", "error", "/lifecycle/approval")]);
    const approved = charter.ordinances.filter((ordinance) => ordinance.state === "approved");
    if (approved.length === 0) return failureResult("architecture.authorize", "No approved ordinances are waiting for authorization.", [diagnostic("ARCHITECTURE_AUTHORIZE_NOTHING_TO_DO", "There are no ordinances in approved state.", "error", "/ordinances")]);
    const decision = buildHumanDecision({ action_id: "architecture.authorize", decision_type: "architecture_charter_authorization", selected_number: parsed.selected_number, raw_response: parsed.raw_response, decision_prompt: parsed.decision_prompt, human_confirmed: true, prompt_id: parsed.prompt_id, normalized_decision: "yes", final_decision: true, approved_payload: { charter_id: "architecture_charter", approved_ordinance_ids: approved.map((ordinance) => ordinance.id) } as unknown as Record<string, JsonValue>, source_interface: "core", target_artifact_revision: charter.revision + 1 });
    const ordinances = charter.ordinances.map((ordinance) => ordinance.state === "approved" ? { ...ordinance, state: "implementation_authorized" as const } : ordinance);
    const updated = await writeCharter(context, ArchitectureCharterSchema.parse({ ...charter, ordinances, status: charterStatus(ordinances), lifecycle: { ...charter.lifecycle, authorization: decision, history: [...charter.lifecycle.history, decision] } }));
    await auditDecision(storeForContext(context).root, decision);
    return { ok: true, action_id: "architecture.authorize", data: { architecture_charter_summary: summarizeCharter(updated), decision }, diagnostics: [], mutations: [{ artifact: CHARTER_ARTIFACT_TYPE, operation: "update", paths: ["/ordinances", "/lifecycle/authorization"], summary: "Authorized Architecture Charter enforcement implementation." }], next_actions: [nextAction("architecture.record", "After implementing enforcement files, record what changed.", { summary: "<what enforcement changed>", changed_files: [] })], summary: "Architecture Charter enforcement authorized." };
  } catch (error) {
    return failureResult("architecture.authorize", "Architecture Charter authorization failed.", [diagnostic("ARCHITECTURE_AUTHORIZE_REJECTED", error instanceof Error ? error.message : String(error), "error", "/architecture")]);
  }
}

export async function architectureRecord(input: z.input<typeof ArchitectureRecordInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  try {
    const parsed = ArchitectureRecordInputSchema.parse(input);
    const charter = await readOrCreateCharter(context);
    const now = isoNow();
    const targets = parsed.ordinance_id === undefined ? charter.ordinances.filter((ordinance) => ordinance.state === "implementation_authorized").map((ordinance) => ordinance.id) : [parsed.ordinance_id];
    if (targets.length === 0) return failureResult("architecture.record", "No authorized ordinance enforcement work is available to record.", [diagnostic("ARCHITECTURE_RECORD_NOT_AUTHORIZED", "Authorize the Architecture Charter enforcement before recording implementation.", "error", "/ordinances")]);
    const unknown = targets.filter((id) => !charter.ordinances.some((ordinance) => ordinance.id === id));
    if (unknown.length > 0) return failureResult("architecture.record", "Unknown ordinance id.", [diagnostic("ARCHITECTURE_RECORD_UNKNOWN_ORDINANCE", `No ordinance(s): ${unknown.join(", ")}.`, "error", "/ordinance_id")]);
    const unauthorized = targets.filter((id) => charter.ordinances.find((ordinance) => ordinance.id === id)?.state !== "implementation_authorized");
    if (unauthorized.length > 0) return failureResult("architecture.record", "Ordinance enforcement work is not authorized.", [diagnostic("ARCHITECTURE_RECORD_NOT_AUTHORIZED", `Ordinance(s) not in implementation_authorized state: ${unauthorized.join(", ")}.`, "error", "/ordinance_id")]);
    const ordinances = charter.ordinances.map((ordinance) => targets.includes(ordinance.id) ? { ...ordinance, implementation_records: [...ordinance.implementation_records, { summary: parsed.summary, changed_files: parsed.changed_files, recorded_at: now }] } : ordinance);
    const updated = await writeCharter(context, ArchitectureCharterSchema.parse({ ...charter, ordinances, status: charterStatus(ordinances) }));
    return { ok: true, action_id: "architecture.record", data: { architecture_charter_summary: summarizeCharter(updated), recorded_ordinance_ids: targets }, diagnostics: [], mutations: [{ artifact: CHARTER_ARTIFACT_TYPE, operation: "update", paths: ["/ordinances/*/implementation_records"], summary: `Recorded enforcement implementation for ${targets.length} ordinance(s).` }], next_actions: [nextAction("architecture.validate", "Run the ordinance enforcement commands and store validation.", {})], summary: `Recorded architecture enforcement implementation for ${targets.length} ordinance(s).` };
  } catch (error) {
    return failureResult("architecture.record", "Architecture enforcement record failed.", [diagnostic("ARCHITECTURE_RECORD_REJECTED", error instanceof Error ? error.message : String(error), "error", "/architecture")]);
  }
}

export async function architectureValidate(input: z.input<typeof ArchitectureValidateInputSchema> = {}, context: ActionExecutionContext = {}): Promise<ActionResult> {
  try {
    const parsed = ArchitectureValidateInputSchema.parse(input);
    const charter = await readOrCreateCharter(context);
    const selected = parsed.ordinance_ids === undefined ? charter.ordinances.filter((ordinance) => ordinance.state === "implementation_authorized" || ordinance.state === "validated" || ordinance.state === "active") : charter.ordinances.filter((ordinance) => parsed.ordinance_ids!.includes(ordinance.id));
    const unknown = (parsed.ordinance_ids ?? []).filter((id) => !charter.ordinances.some((ordinance) => ordinance.id === id));
    if (unknown.length > 0) return failureResult("architecture.validate", "Unknown ordinance id.", [diagnostic("ARCHITECTURE_VALIDATE_UNKNOWN_ORDINANCE", `No ordinance(s): ${unknown.join(", ")}.`, "error", "/ordinance_ids")]);
    if (selected.length === 0) return failureResult("architecture.validate", "No ordinances are ready for validation.", [diagnostic("ARCHITECTURE_VALIDATE_NOTHING_TO_DO", "Authorize enforcement implementation before validation.", "error", "/ordinances")]);
    const projectRoot = context.projectRoot ?? process.cwd();
    const artifactRoot = storeForContext(context).root;
    const results: Array<{ ordinance_id: string; status: string }> = [];
    const diagnostics: Diagnostic[] = [];
    let ordinances = charter.ordinances;
    for (const ordinance of selected) {
      if (ordinance.enforcement_plan === null) {
        diagnostics.push(diagnostic("ARCHITECTURE_VALIDATE_PLAN_REQUIRED", `Ordinance ${ordinance.id} has no enforcement plan.`, "error", `/ordinances/${ordinance.id}/enforcement_plan`));
        continue;
      }
      const commandResult = await runCommandDeterministically({ commandSpec: ordinance.enforcement_plan.command, purpose: "test", projectRoot, artifactRoot, relatedWorkId: null, resourceCategories: ["architecture_ordinance"] });
      results.push({ ordinance_id: ordinance.id, status: commandResult.status });
      if (commandResult.status !== "passed") diagnostics.push(diagnostic("ARCHITECTURE_ORDINANCE_VALIDATION_FAILED", `Ordinance ${ordinance.id} enforcement command failed with status ${commandResult.status}.`, ordinance.severity === "blocking" ? "error" : "warning", `/ordinances/${ordinance.id}/latest_validation`));
      ordinances = ordinances.map((candidate) => candidate.id === ordinance.id ? {
        ...candidate,
        state: commandResult.status === "passed" ? "validated" as const : candidate.state,
        latest_validation: { command_result: commandResult, enforcement_plan_hash: ordinance.enforcement_plan!.plan_hash, validated_at: isoNow() }
      } : candidate);
    }
    const updated = await writeCharter(context, ArchitectureCharterSchema.parse({ ...charter, ordinances, status: diagnostics.some((diag) => diag.severity === "error") ? "blocked" : charterStatus(ordinances), diagnostics }));
    return { ok: !diagnostics.some((diag) => diag.severity === "error"), action_id: "architecture.validate", data: { architecture_charter_summary: summarizeCharter(updated), validation_results: results }, diagnostics, mutations: [{ artifact: CHARTER_ARTIFACT_TYPE, operation: "update", paths: ["/ordinances/*/latest_validation"], summary: `Validated ${selected.length} architecture ordinance(s).` }], next_actions: diagnostics.some((diag) => diag.severity === "error") ? [nextAction("architecture.record", "Fix the enforcement implementation and record the changes.", { summary: "<fix summary>", changed_files: [] })] : [nextAction("architecture.activate", "Ask the human to activate validated ordinances as blocking governance.", { selected_number: 1, raw_response: "<human response>", decision_prompt: "Activate validated Architecture Charter ordinances?", human_confirmed: true })], summary: diagnostics.some((diag) => diag.severity === "error") ? "Architecture ordinance validation failed." : "Architecture ordinance validation passed." };
  } catch (error) {
    return failureResult("architecture.validate", "Architecture validation failed.", [diagnostic("ARCHITECTURE_VALIDATE_REJECTED", error instanceof Error ? error.message : String(error), "error", "/architecture")]);
  }
}

function activationDecisionFromInput(input: z.infer<typeof ArchitectureActivateInputSchema>): "activate" | "request_changes" | "discuss" {
  if (input.decision !== undefined) return input.decision;
  if (input.selected_number === 1) return "activate";
  if (input.selected_number === 2) return "request_changes";
  return "discuss";
}

function retirementDecisionFromInput(input: z.infer<typeof ArchitectureRetireInputSchema>): "retire" | "discuss" {
  if (input.decision !== undefined) return input.decision;
  return input.selected_number === 1 ? "retire" : "discuss";
}

export async function architectureActivate(input: z.input<typeof ArchitectureActivateInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  try {
    const parsed = ArchitectureActivateInputSchema.parse(input);
    const decisionKind = activationDecisionFromInput(parsed);
    const charter = await readOrCreateCharter(context);
    if (isDiscussDecision(decisionKind)) return { ok: true, action_id: "architecture.activate", data: { architecture_charter_summary: summarizeCharter(charter) }, diagnostics: [diagnostic("ARCHITECTURE_ACTIVATE_DISCUSS", "Architecture Charter activation deferred for discussion; no changes recorded.", "info", "/lifecycle/activation")], mutations: [], next_actions: [], summary: "Architecture Charter activation deferred for discussion." };
    if (parsed.human_confirmed !== true) return failureResult("architecture.activate", "Architecture Charter activation requires human_confirmed: true.", [diagnostic("ARCHITECTURE_ACTIVATE_UNCONFIRMED", "Activation is a human gate; human_confirmed must be true.", "error", "/human_confirmed")]);
    const selectedIds = parsed.ordinance_ids ?? charter.ordinances.filter((ordinance) => ordinance.state === "validated").map((ordinance) => ordinance.id);
    if (selectedIds.length === 0) return failureResult("architecture.activate", "No validated ordinances are ready to activate.", [diagnostic("ARCHITECTURE_ACTIVATE_NOTHING_TO_DO", "Run architecture.validate successfully before activation.", "error", "/ordinances")]);
    if (decisionKind === "request_changes") {
      const decision = buildHumanDecision({ action_id: "architecture.activate", decision_type: "architecture_charter_activation", selected_number: parsed.selected_number, raw_response: parsed.raw_response, decision_prompt: parsed.decision_prompt, human_confirmed: true, prompt_id: parsed.prompt_id, normalized_decision: "no", final_decision: false, reviewed_payload: { charter_id: "architecture_charter", active_ordinance_ids: selectedIds, retired_ordinance_ids: [], validation_results: [] } as unknown as Record<string, JsonValue>, source_interface: "core", target_artifact_revision: charter.revision + 1 });
      const ordinances = charter.ordinances.map((ordinance) => selectedIds.includes(ordinance.id) ? { ...ordinance, state: "changes_requested" as const } : ordinance);
      const updated = await writeCharter(context, ArchitectureCharterSchema.parse({ ...charter, ordinances, status: charterStatus(ordinances), lifecycle: { ...charter.lifecycle, history: [...charter.lifecycle.history, decision] } }));
      await auditDecision(storeForContext(context).root, decision);
      return { ok: true, action_id: "architecture.activate", data: { architecture_charter_summary: summarizeCharter(updated), decision }, diagnostics: [diagnostic("ARCHITECTURE_ACTIVATE_CHANGES_REQUESTED", parsed.change_request ?? "Changes requested before activation.", "warning", "/ordinances")], mutations: [{ artifact: CHARTER_ARTIFACT_TYPE, operation: "update", paths: ["/ordinances", "/lifecycle/history"], summary: "Architecture Charter activation changes requested." }], next_actions: [nextAction("architecture.record", "Fix enforcement implementation and record the changes.", { summary: "<fix summary>", changed_files: [] })], summary: "Architecture Charter activation changes requested." };
    }
    const errors = selectedIds.flatMap((id) => {
      const ordinance = charter.ordinances.find((candidate) => candidate.id === id);
      if (ordinance === undefined) return [diagnostic("ARCHITECTURE_ACTIVATE_UNKNOWN_ORDINANCE", `No ordinance ${id}.`, "error", "/ordinance_ids")];
      if (ordinance.enforcement_plan === null || ordinance.latest_validation === null || ordinance.latest_validation.command_result.status !== "passed" || ordinance.latest_validation.enforcement_plan_hash !== ordinance.enforcement_plan.plan_hash) {
        return [diagnostic("ARCHITECTURE_ACTIVATE_VALIDATION_REQUIRED", `Ordinance ${id} needs a current passed architecture.validate result before activation.`, "error", `/ordinances/${id}/latest_validation`)];
      }
      return [];
    });
    if (errors.length > 0) return failureResult("architecture.activate", "Architecture Charter activation rejected.", errors);
    const validation_results = selectedIds.map((id) => {
      const ordinance = charter.ordinances.find((candidate) => candidate.id === id)!;
      return { ordinance_id: id, command_result_id: ordinance.latest_validation!.command_result.id, status: ordinance.latest_validation!.command_result.status };
    });
    const supersededBy = new Map<string, string>();
    for (const id of selectedIds) {
      const supersededId = charter.ordinances.find((candidate) => candidate.id === id)?.supersedes ?? null;
      if (supersededId !== null) supersededBy.set(supersededId, id);
    }
    const retired_ordinance_ids = [...supersededBy.keys()];
    const decision = buildHumanDecision({ action_id: "architecture.activate", decision_type: "architecture_charter_activation", selected_number: parsed.selected_number, raw_response: parsed.raw_response, decision_prompt: parsed.decision_prompt, human_confirmed: true, prompt_id: parsed.prompt_id, normalized_decision: "yes", final_decision: true, approved_payload: { charter_id: "architecture_charter", active_ordinance_ids: selectedIds, retired_ordinance_ids, validation_results } as unknown as Record<string, JsonValue>, source_interface: "core", target_artifact_revision: charter.revision + 1 });
    const retiredAt = isoNow();
    const ordinances = charter.ordinances.map((ordinance) => {
      if (selectedIds.includes(ordinance.id)) return { ...ordinance, state: "active" as const };
      const replacementId = supersededBy.get(ordinance.id);
      if (replacementId !== undefined) return { ...ordinance, state: "retired" as const, superseded_by: replacementId, retired_at: retiredAt, retired_reason: `Superseded by ${replacementId}` };
      return ordinance;
    });
    const updated = await writeCharter(context, ArchitectureCharterSchema.parse({ ...charter, ordinances, status: charterStatus(ordinances), lifecycle: { ...charter.lifecycle, activation: decision, history: [...charter.lifecycle.history, decision] }, diagnostics: [] }));
    await auditDecision(storeForContext(context).root, decision);
    return { ok: true, action_id: "architecture.activate", data: { architecture_charter_summary: summarizeCharter(updated), decision }, diagnostics: [], mutations: [{ artifact: CHARTER_ARTIFACT_TYPE, operation: "update", paths: ["/ordinances", "/lifecycle/activation"], summary: `Activated ${selectedIds.length} architecture ordinance(s).` }], next_actions: [], summary: `Activated ${selectedIds.length} architecture ordinance(s).` };
  } catch (error) {
    return failureResult("architecture.activate", "Architecture Charter activation failed.", [diagnostic("ARCHITECTURE_ACTIVATE_REJECTED", error instanceof Error ? error.message : String(error), "error", "/architecture")]);
  }
}

export async function architectureRetire(input: z.input<typeof ArchitectureRetireInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  try {
    const parsed = ArchitectureRetireInputSchema.parse(input);
    const decisionKind = retirementDecisionFromInput(parsed);
    const charter = await readOrCreateCharter(context);
    if (isDiscussDecision(decisionKind)) return { ok: true, action_id: "architecture.retire", data: { architecture_charter_summary: summarizeCharter(charter) }, diagnostics: [diagnostic("ARCHITECTURE_RETIRE_DISCUSS", "Architecture ordinance retirement deferred for discussion; no changes recorded.", "info", "/ordinances")], mutations: [], next_actions: [], summary: "Architecture ordinance retirement deferred for discussion." };
    if (parsed.human_confirmed !== true) return failureResult("architecture.retire", "Architecture ordinance retirement requires human_confirmed: true.", [diagnostic("ARCHITECTURE_RETIRE_UNCONFIRMED", "Retirement is a human gate; human_confirmed must be true.", "error", "/human_confirmed")]);
    const unknown = parsed.ordinance_ids.filter((id) => !charter.ordinances.some((ordinance) => ordinance.id === id));
    if (unknown.length > 0) return failureResult("architecture.retire", "Unknown ordinance id.", [diagnostic("ARCHITECTURE_RETIRE_UNKNOWN_ORDINANCE", `No ordinance(s): ${unknown.join(", ")}.`, "error", "/ordinance_ids")]);
    const alreadyRetired = parsed.ordinance_ids.filter((id) => charter.ordinances.find((ordinance) => ordinance.id === id)?.state === "retired");
    if (alreadyRetired.length > 0) return failureResult("architecture.retire", "One or more ordinances are already retired.", [diagnostic("ARCHITECTURE_RETIRE_ALREADY_RETIRED", `Already retired: ${alreadyRetired.join(", ")}.`, "error", "/ordinance_ids")]);
    const decision = buildHumanDecision({
      action_id: "architecture.retire",
      decision_type: "architecture_charter_retirement",
      selected_number: parsed.selected_number,
      raw_response: parsed.raw_response,
      decision_prompt: parsed.decision_prompt,
      human_confirmed: true,
      prompt_id: parsed.prompt_id,
      normalized_decision: "yes",
      final_decision: true,
      approved_payload: { charter_id: "architecture_charter", retired_ordinance_ids: parsed.ordinance_ids, reason: parsed.reason } as unknown as Record<string, JsonValue>,
      source_interface: "core",
      target_artifact_revision: charter.revision + 1
    });
    const retiredAt = isoNow();
    const ordinances = charter.ordinances.map((ordinance) => parsed.ordinance_ids.includes(ordinance.id) ? { ...ordinance, state: "retired" as const, retired_at: retiredAt, retired_reason: parsed.reason } : ordinance);
    const updated = await writeCharter(context, ArchitectureCharterSchema.parse({ ...charter, ordinances, status: charterStatus(ordinances), lifecycle: { ...charter.lifecycle, history: [...charter.lifecycle.history, decision] } }));
    await auditDecision(storeForContext(context).root, decision);
    return {
      ok: true,
      action_id: "architecture.retire",
      data: { architecture_charter_summary: summarizeCharter(updated), retired_ordinance_ids: parsed.ordinance_ids, decision },
      diagnostics: [],
      mutations: [{ artifact: CHARTER_ARTIFACT_TYPE, operation: "update", paths: ["/ordinances", "/lifecycle/history"], summary: `Retired ${parsed.ordinance_ids.length} architecture ordinance(s).` }],
      next_actions: [],
      summary: `Retired ${parsed.ordinance_ids.length} architecture ordinance(s).`
    };
  } catch (error) {
    return failureResult("architecture.retire", "Architecture ordinance retirement failed.", [diagnostic("ARCHITECTURE_RETIRE_REJECTED", error instanceof Error ? error.message : String(error), "error", "/architecture")]);
  }
}

export async function activeArchitectureCharterSnapshot(context: ActionExecutionContext = {}): Promise<{ charter_revision: number | null; active_ordinance_ids: string[]; charter_status: string | null }> {
  const charter = await readCharter(context);
  const active = activeOrdinances(charter);
  return { charter_revision: active.length > 0 ? charter!.revision : null, active_ordinance_ids: active.map((ordinance) => ordinance.id), charter_status: charter?.status ?? null };
}

export async function architectureGovernanceDiagnosticsForWork(aggregate: { id: string; origination: string; architecture?: { required: boolean }; stack?: { required: boolean }; architecture_governance?: { mode: string; charter_revision: number | null; active_ordinance_ids: string[] } }, context: ActionExecutionContext = {}): Promise<Diagnostic[]> {
  if (!establishesNewTarget(aggregate as never)) return [];
  if (aggregate.architecture?.required !== true && aggregate.stack?.required !== true) return [];
  const snapshot = await activeArchitectureCharterSnapshot(context);
  const binding = aggregate.architecture_governance ?? { mode: "pending", charter_revision: null, active_ordinance_ids: [] };
  if (snapshot.active_ordinance_ids.length === 0) {
    return binding.mode === "waived" ? [] : [diagnostic("ARCHITECTURE_CHARTER_REQUIRED", "This greenfield Work Packet has no active Architecture Charter ordinances. Ask the human whether to create ordinances now or explicitly waive architecture governance for this packet.", "error", "/architecture_governance")];
  }
  if (binding.mode !== "charter_active") {
    return [diagnostic("ARCHITECTURE_CHARTER_BINDING_REQUIRED", "Active Architecture Charter ordinances exist; bind this Work Packet to the current charter before review/approval.", "error", "/architecture_governance")];
  }
  const idsMatch = binding.active_ordinance_ids.length === snapshot.active_ordinance_ids.length && snapshot.active_ordinance_ids.every((id) => binding.active_ordinance_ids.includes(id));
  if (binding.charter_revision !== snapshot.charter_revision || !idsMatch) {
    return [diagnostic("ARCHITECTURE_CHARTER_BINDING_STALE", "The Work Packet's Architecture Charter binding is stale; re-run work.architecture.check before review/approval.", "error", "/architecture_governance")];
  }
  return [];
}

export async function activeArchitectureOrdinanceDiagnostics(context: ActionExecutionContext = {}): Promise<Diagnostic[]> {
  const charter = await readCharter(context);
  const active = activeOrdinances(charter);
  if (active.length === 0) return [];
  const projectRoot = context.projectRoot ?? process.cwd();
  const artifactRoot = storeForContext(context).root;
  const diagnostics: Diagnostic[] = [];
  for (const ordinance of active) {
    if (ordinance.enforcement_plan === null) continue;
    const result = await runCommandDeterministically({ commandSpec: ordinance.enforcement_plan.command, purpose: "test", projectRoot, artifactRoot, relatedWorkId: null, resourceCategories: ["architecture_ordinance"] });
    if (result.status !== "passed") {
      diagnostics.push(diagnostic("ARCHITECTURE_ORDINANCE_FAILED", `Active ordinance ${ordinance.id} (${ordinance.title}) failed: ${result.status}. Fix the architectural violation or the enforcement command before completing work.`, ordinance.severity === "blocking" ? "error" : "warning", `/architecture_charter/ordinances/${ordinance.id}`));
    }
  }
  return diagnostics;
}

export async function workArchitectureCheck(input: z.input<typeof WorkArchitectureCheckInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  try {
    const parsed = WorkArchitectureCheckInputSchema.parse(input);
    const snapshot = await activeArchitectureCharterSnapshot(context);
    if (snapshot.active_ordinance_ids.length === 0) {
      return {
        ok: false,
        action_id: "work.architecture.check",
        data: { architecture_charter: snapshot },
        diagnostics: [diagnostic("ARCHITECTURE_CHARTER_REQUIRED", "No active Architecture Charter ordinances exist. Ask the human to start the ordinance flow or explicitly waive architecture governance for this Work Packet.", "error", "/architecture_governance")],
        mutations: [],
        next_actions: [
          nextAction("architecture.quickstart", "Start the Architecture Charter ordinance flow.", {}),
          nextAction("work.architecture.waive", "Only if the human declines ordinances, record a human waiver for this Work Packet.", { id: parsed.id, reason: "<human reason>", selected_number: 1, raw_response: "<human response>", decision_prompt: "Waive architecture ordinances for this Work Packet?", human_confirmed: true })
        ],
        summary: "No active Architecture Charter ordinances are available to bind."
      };
    }
    const store = aggregateStoreForContext(context);
    const aggregate = await store.read(parsed.id);
    const updated = await store.update(AggregateWorkPacketSchema.parse({ ...aggregate, architecture_governance: { mode: "charter_active", charter_revision: snapshot.charter_revision, active_ordinance_ids: snapshot.active_ordinance_ids, waiver_decision: null, waiver_reason: null } }));
    return { ok: true, action_id: "work.architecture.check", data: { work_packet: updated, architecture_charter: snapshot }, diagnostics: [], mutations: [{ artifact: "work_packet", operation: "update", paths: ["/architecture_governance"], summary: `Bound Work Packet to Architecture Charter revision ${snapshot.charter_revision}.` }], next_actions: [nextAction("work.next", "Continue the Work Packet workflow.", { id: parsed.id })], summary: `Work Packet ${parsed.id} bound to ${snapshot.active_ordinance_ids.length} active architecture ordinance(s).` };
  } catch (error) {
    return failureResult("work.architecture.check", "Architecture governance check failed.", [diagnostic("WORK_ARCHITECTURE_CHECK_REJECTED", error instanceof Error ? error.message : String(error), "error", "/architecture_governance")]);
  }
}

export async function workArchitectureWaive(input: z.input<typeof WorkArchitectureWaiveInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  try {
    const parsed = WorkArchitectureWaiveInputSchema.parse(input);
    if (parsed.human_confirmed !== true) return failureResult("work.architecture.waive", "Architecture governance waiver requires human_confirmed: true.", [diagnostic("WORK_ARCHITECTURE_WAIVE_UNCONFIRMED", "This waiver is a human gate; human_confirmed must be true.", "error", "/human_confirmed")]);
    const snapshot = await activeArchitectureCharterSnapshot(context);
    if (snapshot.active_ordinance_ids.length > 0) return failureResult("work.architecture.waive", "Active Architecture Charter ordinances exist and cannot be bypassed by the no-charter waiver.", [diagnostic("WORK_ARCHITECTURE_WAIVE_ACTIVE_CHARTER", "Use the active charter or revise/retire ordinances through the Architecture Charter flow.", "error", "/architecture_governance")]);
    const store = aggregateStoreForContext(context);
    const aggregate = await store.read(parsed.id);
    if (!establishesNewTarget(aggregate as never)) return failureResult("work.architecture.waive", "Architecture governance waiver is only needed for greenfield/new-target Work Packets.", [diagnostic("WORK_ARCHITECTURE_WAIVE_NOT_GREENFIELD", "modify_existing packets inherit existing architecture governance.", "error", "/origination")]);
    const decision = buildHumanDecision({ action_id: "work.architecture.waive", decision_type: "architecture_governance_waiver", selected_number: parsed.selected_number, raw_response: parsed.raw_response, decision_prompt: parsed.decision_prompt, human_confirmed: true, prompt_id: parsed.prompt_id, normalized_decision: "yes", final_decision: true, approved_payload: { work_id: aggregate.id, reason: parsed.reason, charter_status: snapshot.charter_status ?? "missing" } as unknown as Record<string, JsonValue>, source_interface: "core", target_artifact_revision: aggregate.revision + 1 });
    const updated = await store.update(AggregateWorkPacketSchema.parse({ ...aggregate, decision_history: [...aggregate.decision_history, decision], architecture_governance: { mode: "waived", charter_revision: null, active_ordinance_ids: [], waiver_decision: decision, waiver_reason: parsed.reason } }));
    await auditDecision(storeForContext(context).root, decision);
    return { ok: true, action_id: "work.architecture.waive", data: { work_packet: updated, decision }, diagnostics: [diagnostic("ARCHITECTURE_GOVERNANCE_WAIVED", "The human waived Architecture Charter governance for this Work Packet because no active ordinances exist.", "warning", "/architecture_governance")], mutations: [{ artifact: "work_packet", operation: "update", paths: ["/architecture_governance", "/decision_history"], summary: "Recorded human architecture-governance waiver." }], next_actions: [nextAction("work.next", "Continue the Work Packet workflow.", { id: parsed.id })], summary: `Architecture governance waived for Work Packet ${parsed.id}.` };
  } catch (error) {
    return failureResult("work.architecture.waive", "Architecture governance waiver failed.", [diagnostic("WORK_ARCHITECTURE_WAIVE_REJECTED", error instanceof Error ? error.message : String(error), "error", "/architecture_governance")]);
  }
}
