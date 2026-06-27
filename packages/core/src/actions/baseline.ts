import { z } from "zod";
import { RuntimeBaselineSchema, type RuntimeBaseline } from "../schemas/artifacts.ts";
import { CommandResultSchema, DevRuntimeRunResultSchema, RuntimeBaselineRefSchema, type Diagnostic, type DevRuntimeRunResult, type HumanDecision, type RuntimeBaselineRef } from "../schemas/embedded.ts";
import { runDevRuntime } from "../commands/dev-runtime-runner.ts";
import { buildHumanDecision } from "../decisions/human-decision.ts";
import { DecisionLog } from "../decisions/decision-log.ts";
import { applyJsonPatch, JsonPatchSchema } from "./json-patch.ts";
import { diagnostic, failureResult, isoNow, storeForContext } from "./config.ts";
import type { ActionExecutionContext } from "./context.ts";
import type { ActionResult } from "./result.ts";
import { affectsApprovedRuntimeBaselinePath, validateRuntimeBaselineWithStoredCommandResults } from "../baseline/validation.ts";
import { createBaselineReviewSnapshot, sourceRefsEqual, type BaselineReviewSnapshot } from "../baseline/snapshots.ts";
import { readRuntimeBaselineCurrent, relocateLegacyDefaultBaseline } from "../baseline/target-store.ts";
import { DEFAULT_TARGET_ID } from "../schemas/enums.ts";

const BaselineDraftFieldsSchema = RuntimeBaselineSchema.pick({
  stack: true,
  commands: true,
  configuration: true,
  dependency_modes: true,
  diff_policy: true
}).partial().strict();
// Every baseline action targets ONE runtime baseline, keyed by target_id (default = the single-app
// DEFAULT_TARGET_ID). (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §9.)
const TargetIdInputSchema = z.string().min(1).optional();
export const BaselineInitInputSchema = BaselineDraftFieldsSchema.extend({ target_id: TargetIdInputSchema });
export const BaselineUpdateInputSchema = z.object({ patch: JsonPatchSchema, target_id: TargetIdInputSchema }).strict();
export const BaselineReviewInputSchema = z.object({ include_full: z.boolean().optional(), target_id: TargetIdInputSchema }).strict();
export const BaselineCheckInputSchema = z.object({ include_full: z.boolean().optional(), target_id: TargetIdInputSchema }).strict();
export const BaselineBlockInputSchema = z.object({ reason: z.string().min(1), owner: z.string().min(1).optional(), next_action: z.string().min(1).optional(), target_id: TargetIdInputSchema }).strict();
export const BaselineAcceptInputSchema = z.object({
  selected_number: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  raw_response: z.string(),
  decision_prompt: z.string(),
  human_confirmed: z.boolean(),
  review_snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/),
  review_snapshot_revision: z.string().min(1),
  source_artifact_refs: z.array(z.unknown()),
  prompt_id: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  source_interface: z.string().min(1).optional(),
  target_id: TargetIdInputSchema
}).strict();

function defaultRuntimeBaseline(now = isoNow()): RuntimeBaseline {
  return RuntimeBaselineSchema.parse({
    artifact_type: "runtime_baseline",
    schema_version: 1,
    revision: 1,
    created_at: now,
    updated_at: now,
    status: "draft",
    stack: { product_platform: null, runtime: null, language: null, package_manager: null, framework: null, build_tool: null, architecture: null },
    commands: {
      test: null,
      test_not_applicable_reason: null,
      build: null,
      build_not_applicable_reason: null,
      runtime_production: null,
      runtime_production_not_applicable_reason: null,
      runtime_development: null,
      runtime_development_not_applicable_reason: null
    },
    configuration: { environment_strategy: null, required_env_vars: [], greenfield_scaffold: false },
    dependency_modes: { install_mode: null, external_services: null },
    diff_policy: { dependency_changes_require_approval: true, include_untracked: true },
    validation: { command_results: [], diagnostics: [] },
    acceptance: null,
    decision_history: [],
    blocker: null,
    diagnostics: []
  });
}

async function readBaseline(context: ActionExecutionContext, targetId: string = DEFAULT_TARGET_ID): Promise<RuntimeBaseline> {
  const current = await readRuntimeBaselineCurrent<RuntimeBaseline>(storeForContext(context), targetId);
  return RuntimeBaselineSchema.parse(current.artifact);
}

export async function baselineInit(input: z.infer<typeof BaselineInitInputSchema> = {}, context: ActionExecutionContext = {}): Promise<ActionResult<{ baseline: RuntimeBaseline; revision: number }>> {
  const store = storeForContext(context);
  let parsed: z.infer<typeof BaselineInitInputSchema>;
  try {
    parsed = BaselineInitInputSchema.parse(input);
  } catch (error) {
    return failureResult("baseline.init", "Runtime baseline init rejected.", [diagnostic("BASELINE_INIT_REJECTED", error instanceof Error ? error.message : String(error), "error", "/runtime_baseline")]) as ActionResult<{ baseline: RuntimeBaseline; revision: number }>;
  }
  const { target_id, ...draftFields } = parsed;
  const targetId = target_id ?? DEFAULT_TARGET_ID;

  try {
    const existing = await readRuntimeBaselineCurrent<RuntimeBaseline>(store, targetId);
    const baseline = RuntimeBaselineSchema.parse(existing.artifact);
    return { ok: true, action_id: "baseline.init", data: { baseline, revision: baseline.revision }, diagnostics: [diagnostic("BASELINE_ALREADY_EXISTS", "RuntimeBaseline already exists; init was idempotent.", "info", "/runtime_baseline")], mutations: [{ artifact: "runtime_baseline", operation: "none", paths: [], summary: "RuntimeBaseline already existed; no mutation." }], next_actions: [], summary: "Runtime baseline already initialized." };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return failureResult("baseline.init", "Runtime baseline init failed.", [diagnostic("BASELINE_INIT_FAILED", error instanceof Error ? error.message : String(error))]) as ActionResult<{ baseline: RuntimeBaseline; revision: number }>;
  }

  try {
    const baseline = RuntimeBaselineSchema.parse({ ...defaultRuntimeBaseline(), ...draftFields, id: targetId, validation: { command_results: [], diagnostics: [] }, revision: 1, status: "draft", acceptance: null, decision_history: [], blocker: null });
    const created = await store.create(baseline);
    return { ok: true, action_id: "baseline.init", data: { baseline: created.artifact, revision: created.revision }, diagnostics: [], mutations: [{ artifact: "runtime_baseline", operation: "create", paths: ["/runtime_baseline"], summary: `Created draft RuntimeBaseline for target ${created.artifact.id} revision 1.` }], next_actions: [], summary: "Runtime baseline initialized." };
  } catch (error) {
    return failureResult("baseline.init", "Runtime baseline init rejected.", [diagnostic("BASELINE_INIT_REJECTED", error instanceof Error ? error.message : String(error), "error", "/runtime_baseline")]) as ActionResult<{ baseline: RuntimeBaseline; revision: number }>;
  }
}

export async function baselineUpdate(input: z.infer<typeof BaselineUpdateInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult<{ baseline: RuntimeBaseline; revision: number; affected_paths: string[] }>> {
  const store = storeForContext(context);
  try {
    const parsed = BaselineUpdateInputSchema.parse(input);
    if (parsed.patch.some((op) => op.path === "/validation" || op.path.startsWith("/validation/"))) {
      throw new Error("baseline.update cannot patch validation; validation.command_results are updated only by command.run");
    }
    const baseline = await readBaseline(context, parsed.target_id ?? DEFAULT_TARGET_ID);
    const patched = applyJsonPatch(baseline, parsed.patch, { protectedPrefixes: ["/artifact_type", "/schema_version", "/id", "/revision", "/created_at", "/updated_at", "/status", "/acceptance", "/decision_history", "/blocker", "/validation"] });
    const affectedApprovedPath = patched.affectedPaths.some(affectsApprovedRuntimeBaselinePath);
    const diagnostics: Diagnostic[] = [];
    const candidate: RuntimeBaseline = RuntimeBaselineSchema.parse({ ...patched.value, updated_at: isoNow() });
    if (baseline.status === "accepted" && affectedApprovedPath) {
      diagnostics.push(diagnostic("BASELINE_ACCEPTANCE_INVALIDATED", "Accepted RuntimeBaseline approved fields changed; acceptance was cleared and status returned to draft.", "warning", "/acceptance"));
      candidate.status = "draft";
      candidate.acceptance = null;
      candidate.diagnostics = [...candidate.diagnostics, ...diagnostics];
    }
    if (baseline.status === "blocked") {
      diagnostics.push(diagnostic("BASELINE_BLOCK_REOPENED", "Blocked RuntimeBaseline was updated and returned to draft for renewed validation.", "info", "/status"));
      candidate.status = "draft";
      candidate.blocker = null;
      candidate.diagnostics = [...candidate.diagnostics, ...diagnostics];
    }
    const validated = RuntimeBaselineSchema.parse(candidate);
    const updated = await store.update(validated);
    return { ok: true, action_id: "baseline.update", data: { baseline: updated.artifact, revision: updated.revision, affected_paths: patched.affectedPaths }, diagnostics, mutations: [{ artifact: "runtime_baseline", operation: "update", paths: patched.affectedPaths, summary: `Updated RuntimeBaseline to revision ${updated.revision}.` }], next_actions: [], summary: "Runtime baseline updated." };
  } catch (error) {
    return failureResult("baseline.update", "Runtime baseline update rejected.", [diagnostic("BASELINE_UPDATE_REJECTED", error instanceof Error ? error.message : String(error), "error", "/patch")]) as ActionResult<{ baseline: RuntimeBaseline; revision: number; affected_paths: string[] }>;
  }
}

async function createStoredValidationReviewSnapshot(baseline: RuntimeBaseline, context: ActionExecutionContext): Promise<BaselineReviewSnapshot> {
  const validation = await validateRuntimeBaselineWithStoredCommandResults(baseline, storeForContext(context).root);
  return createBaselineReviewSnapshot(baseline, validation);
}

export async function baselineCheck(input: z.infer<typeof BaselineCheckInputSchema> = {}, context: ActionExecutionContext = {}): Promise<ActionResult> {
  const parsed = BaselineCheckInputSchema.parse(input);
  try {
    const baseline = await readBaseline(context, parsed.target_id ?? DEFAULT_TARGET_ID);
    const validation = await validateRuntimeBaselineWithStoredCommandResults(baseline, storeForContext(context).root);
    return { ok: true, action_id: "baseline.check", data: { baseline: parsed.include_full === false ? null : baseline, validation, acceptance_ready: validation.acceptance_ready }, diagnostics: validation.diagnostics, mutations: [{ artifact: "runtime_baseline", operation: "none", paths: [], summary: "Read RuntimeBaseline and computed deterministic validation diagnostics." }], next_actions: [], summary: validation.acceptance_ready ? "Runtime baseline is acceptance-ready." : "Runtime baseline is not acceptance-ready." };
  } catch (error) {
    return failureResult("baseline.check", "Runtime baseline could not be checked.", [diagnostic("BASELINE_NOT_FOUND", error instanceof Error ? error.message : String(error), "error", "/runtime_baseline")]);
  }
}

export async function baselineReview(input: z.infer<typeof BaselineReviewInputSchema> = {}, context: ActionExecutionContext = {}): Promise<ActionResult> {
  const parsed = BaselineReviewInputSchema.parse(input);
  try {
    const baseline = await readBaseline(context, parsed.target_id ?? DEFAULT_TARGET_ID);
    const snapshot = await createStoredValidationReviewSnapshot(baseline, context);
    return { ok: true, action_id: "baseline.review", data: { ...snapshot, validation_diagnostics: snapshot.validation.diagnostics }, diagnostics: snapshot.validation.diagnostics, mutations: [{ artifact: "runtime_baseline", operation: "none", paths: [], summary: "Produced ephemeral RuntimeBaseline review snapshot without mutation." }], next_actions: [], summary: "Runtime baseline review snapshot produced." };
  } catch (error) {
    return failureResult("baseline.review", "Runtime baseline review could not be produced.", [diagnostic("BASELINE_NOT_FOUND", error instanceof Error ? error.message : String(error), "error", "/runtime_baseline")]);
  }
}

export async function baselineBlock(input: z.infer<typeof BaselineBlockInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult<{ baseline: RuntimeBaseline; revision: number }>> {
  const store = storeForContext(context);
  try {
    const parsed = BaselineBlockInputSchema.parse(input);
    const baseline = await readBaseline(context, parsed.target_id ?? DEFAULT_TARGET_ID);
    const candidate = RuntimeBaselineSchema.parse({ ...baseline, status: "blocked", blocker: { reason: parsed.reason, owner: parsed.owner ?? null, next_action: parsed.next_action ?? null, at: isoNow() }, updated_at: isoNow() });
    const updated = await store.update(candidate);
    return { ok: true, action_id: "baseline.block", data: { baseline: updated.artifact, revision: updated.revision }, diagnostics: [], mutations: [{ artifact: "runtime_baseline", operation: "update", paths: ["/status", "/blocker"], summary: `Blocked RuntimeBaseline at revision ${updated.revision}.` }], next_actions: [], summary: "Runtime baseline blocked." };
  } catch (error) {
    return failureResult("baseline.block", "Runtime baseline block rejected.", [diagnostic("BASELINE_BLOCK_REJECTED", error instanceof Error ? error.message : String(error), "error", "/blocker")]) as ActionResult<{ baseline: RuntimeBaseline; revision: number }>;
  }
}

export async function baselineAccept(input: z.infer<typeof BaselineAcceptInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult<{ baseline?: RuntimeBaseline; decision: HumanDecision | null; runtime_baseline_ref: RuntimeBaselineRef | null }>> {
  const store = storeForContext(context);
  try {
    const parsed = BaselineAcceptInputSchema.parse(input);
    if ((parsed.selected_number === 1 || parsed.selected_number === 2) && parsed.human_confirmed !== true) {
      throw new Error("Yes/No baseline acceptance requires human_confirmed: true");
    }
    if (parsed.selected_number === 3) {
      return { ok: true, action_id: "baseline.accept", data: { decision: null, runtime_baseline_ref: null }, diagnostics: [], mutations: [{ artifact: "runtime_baseline", operation: "none", paths: [], summary: "Discuss selected; no HumanDecision or RuntimeBaseline mutation." }], next_actions: [], summary: "Discuss selected; baseline unchanged." };
    }

    const baseline = await readBaseline(context, parsed.target_id ?? DEFAULT_TARGET_ID);
    const snapshot = await createStoredValidationReviewSnapshot(baseline, context);
    if (snapshot.snapshot_hash !== parsed.review_snapshot_hash || snapshot.snapshot_revision !== parsed.review_snapshot_revision || !sourceRefsEqual(snapshot.source_artifact_refs, parsed.source_artifact_refs)) {
      return failureResult("baseline.accept", "Runtime baseline acceptance snapshot is stale or mismatched.", [diagnostic("BASELINE_REVIEW_SNAPSHOT_STALE", "Submitted review snapshot hash/revision/source refs do not match the current RuntimeBaseline review snapshot.", "error", "/review_snapshot_hash")], { decision: null, runtime_baseline_ref: null }) as ActionResult<{ baseline?: RuntimeBaseline; decision: HumanDecision | null; runtime_baseline_ref: RuntimeBaselineRef | null }>;
    }

    const log = new DecisionLog(store.root);
    if (parsed.selected_number === 2) {
      const decision = buildHumanDecision({ action_id: "baseline.accept", decision_type: "runtime_baseline_acceptance", selected_number: 2, raw_response: parsed.raw_response, decision_prompt: parsed.decision_prompt, human_confirmed: true, prompt_id: parsed.prompt_id, normalized_decision: "no", final_decision: false, review_snapshot_hash: snapshot.snapshot_hash, review_snapshot_revision: snapshot.snapshot_revision, source_artifact_refs: snapshot.source_artifact_refs, reviewed_payload: snapshot.payload, source_interface: parsed.source_interface ?? "core" });
      await log.append(decision);
      const candidate = RuntimeBaselineSchema.parse({ ...baseline, status: "blocked", blocker: { reason: "human_declined_baseline_acceptance", owner: parsed.actor ?? null, next_action: null, at: isoNow() }, decision_history: [...baseline.decision_history, decision], updated_at: isoNow() });
      const updated = await store.update(candidate);
      return { ok: true, action_id: "baseline.accept", data: { baseline: updated.artifact, decision, runtime_baseline_ref: null }, diagnostics: [], mutations: [{ artifact: "decision_log", operation: "create", paths: [`/decisions/${decision.id}`], summary: "Recorded runtime baseline decline HumanDecision." }, { artifact: "runtime_baseline", operation: "update", paths: ["/status", "/blocker", "/decision_history"], summary: `Blocked RuntimeBaseline at revision ${updated.revision}.` }], next_actions: [], summary: "Runtime baseline declined and blocked." };
    }

    const validation = snapshot.validation;
    if (!validation.acceptance_ready) {
      return failureResult("baseline.accept", "Runtime baseline deterministic validation failed; acceptance was not recorded.", validation.diagnostics, { decision: null, runtime_baseline_ref: null }) as ActionResult<{ baseline?: RuntimeBaseline; decision: HumanDecision | null; runtime_baseline_ref: RuntimeBaselineRef | null }>;
    }

    const acceptedAt = isoNow();
    const postRevision = baseline.revision + 1;
    const decision = buildHumanDecision({ action_id: "baseline.accept", decision_type: "runtime_baseline_acceptance", selected_number: 1, raw_response: parsed.raw_response, decision_prompt: parsed.decision_prompt, human_confirmed: true, prompt_id: parsed.prompt_id, normalized_decision: "yes", final_decision: true, review_snapshot_hash: snapshot.snapshot_hash, review_snapshot_revision: snapshot.snapshot_revision, source_artifact_refs: snapshot.source_artifact_refs, source_interface: parsed.source_interface ?? "core", target_artifact_revision: postRevision });
    await log.append(decision);
    const runtimeBaselineRef: RuntimeBaselineRef = { artifact_type: "runtime_baseline", id: baseline.id, revision: postRevision, accepted_at: acceptedAt, acceptance_decision_id: decision.id, acceptance_snapshot_hash: snapshot.snapshot_hash, acceptance_snapshot_revision: snapshot.snapshot_revision };
    const candidate = RuntimeBaselineSchema.parse({ ...baseline, status: "accepted", acceptance: decision, decision_history: [...baseline.decision_history, decision], blocker: null, updated_at: acceptedAt });
    const updated = await store.update(candidate);
    return { ok: true, action_id: "baseline.accept", data: { baseline: updated.artifact, decision, runtime_baseline_ref: runtimeBaselineRef }, diagnostics: [], mutations: [{ artifact: "decision_log", operation: "create", paths: [`/decisions/${decision.id}`], summary: "Recorded runtime baseline acceptance HumanDecision." }, { artifact: "runtime_baseline", operation: "update", paths: ["/status", "/acceptance", "/decision_history"], summary: `Accepted RuntimeBaseline at revision ${updated.revision}.` }], next_actions: [], summary: "Runtime baseline accepted." };
  } catch (error) {
    return failureResult("baseline.accept", "Runtime baseline acceptance rejected.", [diagnostic("BASELINE_ACCEPT_REJECTED", error instanceof Error ? error.message : String(error), "error", "/baseline.accept")]) as ActionResult<{ baseline?: RuntimeBaseline; decision: HumanDecision | null; runtime_baseline_ref: RuntimeBaselineRef | null }>;
  }
}

export const BaselineEstablishInputSchema = z.object({ target_id: TargetIdInputSchema }).strict();

// Deterministic runtime-baseline acceptance (sub-slice C). When the baseline's deterministic validation
// passes (commands valid + dev runtime PROVEN by baseline.dev_runtime.run), accept it AUTOMATICALLY with a
// system-actor acceptance record — no human gate. The dev-runtime proof is deterministic (the runner, not
// a person, decides pass/fail), so the human's judgment lives at packet approval (the baseline spec /
// AC-BOOTSTRAP) and the work.complete completion gate, not in a separate baseline ceremony. The acceptance
// record keeps the RuntimeBaselineRef's anchor intact (human_confirmed: false, honestly). (RUNTIME_BASELINE_ORIGINATION_DESIGN.md.)
export async function baselineEstablish(input: z.infer<typeof BaselineEstablishInputSchema> = {}, context: ActionExecutionContext = {}): Promise<ActionResult<{ baseline?: RuntimeBaseline; runtime_baseline_ref: RuntimeBaselineRef | null }>> {
  const store = storeForContext(context);
  try {
    const parsed = BaselineEstablishInputSchema.parse(input);
    const baseline = await readBaseline(context, parsed.target_id ?? DEFAULT_TARGET_ID);
    if (baseline.status === "accepted" && baseline.acceptance !== null && baseline.acceptance.review_snapshot_hash !== null && baseline.acceptance.review_snapshot_revision !== null) {
      const accepted = baseline.acceptance;
      const ref = RuntimeBaselineRefSchema.parse({ artifact_type: "runtime_baseline", id: baseline.id, revision: accepted.target_artifact_revision ?? baseline.revision, accepted_at: accepted.at, acceptance_decision_id: accepted.id, acceptance_snapshot_hash: accepted.review_snapshot_hash, acceptance_snapshot_revision: accepted.review_snapshot_revision });
      return { ok: true, action_id: "baseline.establish", data: { baseline, runtime_baseline_ref: ref }, diagnostics: [], mutations: [{ artifact: "runtime_baseline", operation: "none", paths: [], summary: "RuntimeBaseline already established (accepted)." }], next_actions: [], summary: "Runtime baseline already established." };
    }
    const snapshot = await createStoredValidationReviewSnapshot(baseline, context);
    if (!snapshot.validation.acceptance_ready) {
      return failureResult("baseline.establish", "Runtime baseline deterministic validation failed; not established.", snapshot.validation.diagnostics, { runtime_baseline_ref: null }) as ActionResult<{ baseline?: RuntimeBaseline; runtime_baseline_ref: RuntimeBaselineRef | null }>;
    }
    const acceptedAt = isoNow();
    const postRevision = baseline.revision + 1;
    const decision = buildHumanDecision({ action_id: "baseline.establish", decision_type: "runtime_baseline_acceptance", selected_number: 1, raw_response: "deterministic acceptance: commands valid and dev-runtime proof passed", decision_prompt: "Deterministic runtime baseline acceptance (no human gate; the dev-runtime proof is deterministic).", human_confirmed: false, normalized_decision: "yes", final_decision: true, review_snapshot_hash: snapshot.snapshot_hash, review_snapshot_revision: snapshot.snapshot_revision, source_artifact_refs: snapshot.source_artifact_refs, source_interface: "deterministic_acceptance", target_artifact_revision: postRevision });
    const log = new DecisionLog(store.root);
    await log.append(decision);
    const runtimeBaselineRef: RuntimeBaselineRef = { artifact_type: "runtime_baseline", id: baseline.id, revision: postRevision, accepted_at: acceptedAt, acceptance_decision_id: decision.id, acceptance_snapshot_hash: snapshot.snapshot_hash, acceptance_snapshot_revision: snapshot.snapshot_revision };
    const candidate = RuntimeBaselineSchema.parse({ ...baseline, status: "accepted", acceptance: decision, decision_history: [...baseline.decision_history, decision], blocker: null, updated_at: acceptedAt });
    const updated = await store.update(candidate);
    return { ok: true, action_id: "baseline.establish", data: { baseline: updated.artifact, runtime_baseline_ref: runtimeBaselineRef }, diagnostics: [], mutations: [{ artifact: "decision_log", operation: "create", paths: [`/decisions/${decision.id}`], summary: "Recorded deterministic runtime baseline acceptance (system-actor)." }, { artifact: "runtime_baseline", operation: "update", paths: ["/status", "/acceptance", "/decision_history"], summary: `Established (accepted) RuntimeBaseline at revision ${updated.revision}.` }], next_actions: [], summary: "Runtime baseline established (deterministic acceptance)." };
  } catch (error) {
    return failureResult("baseline.establish", "Runtime baseline establish rejected.", [diagnostic("BASELINE_ESTABLISH_REJECTED", error instanceof Error ? error.message : String(error), "error", "/baseline.establish")], { runtime_baseline_ref: null }) as ActionResult<{ baseline?: RuntimeBaseline; runtime_baseline_ref: RuntimeBaselineRef | null }>;
  }
}

export const BaselineDevRuntimeRunInputSchema = z.object({ target_id: TargetIdInputSchema }).strict();

// Slice 3b: actually run the declared dev runtime (start the process group, poll the readiness probe, tear
// down) and record the result on the draft baseline so dev_runtime_check can require a PASSED run. This is
// a real long-running execution, so it is its own action rather than part of deterministic command.run.
export async function baselineDevRuntimeRun(input: z.infer<typeof BaselineDevRuntimeRunInputSchema> = {}, context: ActionExecutionContext = {}): Promise<ActionResult<{ baseline?: RuntimeBaseline; run_result: DevRuntimeRunResult | null }>> {
  const store = storeForContext(context);
  try {
    const parsed = BaselineDevRuntimeRunInputSchema.parse(input);
    const baseline = await readBaseline(context, parsed.target_id ?? DEFAULT_TARGET_ID);
    if (baseline.status !== "draft") throw new Error(`runtime baseline must be in draft to record a dev-runtime run (current status: ${baseline.status})`);
    const dev = baseline.commands.runtime_development;
    if (dev === null) {
      return failureResult("baseline.dev_runtime.run", "No dev runtime is declared to run.", [diagnostic("BASELINE_DEV_RUNTIME_ABSENT", "runtime_development is null; declare a dev runtime before running it.", "error", "/commands/runtime_development")], { run_result: null }) as ActionResult<{ baseline?: RuntimeBaseline; run_result: DevRuntimeRunResult | null }>;
    }
    const result = DevRuntimeRunResultSchema.parse(await runDevRuntime(dev, { projectRoot: context.projectRoot ?? process.cwd() }));
    const candidate = RuntimeBaselineSchema.parse({ ...baseline, validation: { ...baseline.validation, dev_runtime_run_result: result }, updated_at: isoNow() });
    const updated = await store.update(candidate);
    const diagnostics: Diagnostic[] = result.status === "passed" ? [] : [diagnostic("BASELINE_DEV_RUNTIME_RUN_NOT_PASSED", `Dev-runtime run did not pass (status ${result.status}): ${result.error_message ?? "readiness probe failed"}.`, "error", "/validation/dev_runtime_run_result")];
    return { ok: true, action_id: "baseline.dev_runtime.run", data: { baseline: updated.artifact, run_result: result }, diagnostics, mutations: [{ artifact: "runtime_baseline", operation: "update", paths: ["/validation/dev_runtime_run_result"], summary: `Recorded dev-runtime run result (${result.status}).` }], next_actions: result.status === "passed" ? [{ action_id: "baseline.review", cli: "spec-guard baseline review --json", mcp: "spec_guard_baseline_review", reason: "Dev runtime passed; produce the acceptance review snapshot.", suggested_input: {} }] : [], summary: `Dev-runtime run ${result.status}.` };
  } catch (error) {
    return failureResult("baseline.dev_runtime.run", "Dev-runtime run rejected.", [diagnostic("BASELINE_DEV_RUNTIME_RUN_REJECTED", error instanceof Error ? error.message : String(error), "error", "/commands/runtime_development")], { run_result: null }) as ActionResult<{ baseline?: RuntimeBaseline; run_result: DevRuntimeRunResult | null }>;
  }
}

export const BaselineListInputSchema = z.object({}).strict();

export interface BaselineTargetSummary { target_id: string; status: string; revision: number; product_platform: string | null; has_dev_runtime: boolean; accepted: boolean }

// List every per-target RuntimeBaseline (target_id + acceptance status) so an agent can DISCOVER existing
// targets — needed to pick a consistent target_id and for modify_existing to find the target to inherit
// (work.target.attach). (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §9.)
export async function baselineList(input: z.infer<typeof BaselineListInputSchema> = {}, context: ActionExecutionContext = {}): Promise<ActionResult<{ targets: BaselineTargetSummary[] }>> {
  const store = storeForContext(context);
  try {
    BaselineListInputSchema.parse(input);
    await relocateLegacyDefaultBaseline(store, DEFAULT_TARGET_ID);
    const entries = await store.listCurrent<RuntimeBaseline>();
    const targets: BaselineTargetSummary[] = entries
      .filter((entry) => entry.artifact_type === "runtime_baseline")
      .map((entry) => {
        const baseline = RuntimeBaselineSchema.parse(entry.artifact);
        return { target_id: baseline.id, status: baseline.status, revision: baseline.revision, product_platform: baseline.stack.product_platform, has_dev_runtime: baseline.commands.runtime_development !== null, accepted: baseline.status === "accepted" };
      })
      .sort((a, b) => a.target_id.localeCompare(b.target_id));
    return { ok: true, action_id: "baseline.list", data: { targets }, diagnostics: [], mutations: [{ artifact: "runtime_baseline", operation: "none", paths: [], summary: `Listed ${targets.length} runtime baseline target(s).` }], next_actions: [], summary: `${targets.length} runtime baseline target(s).` };
  } catch (error) {
    return failureResult("baseline.list", "Runtime baseline list failed.", [diagnostic("BASELINE_LIST_FAILED", error instanceof Error ? error.message : String(error), "error", "/runtime_baseline")]) as ActionResult<{ targets: BaselineTargetSummary[] }>;
  }
}

export async function appendBaselineCommandResult(context: ActionExecutionContext, result: z.infer<typeof CommandResultSchema>, draftRevision: number, targetId: string = DEFAULT_TARGET_ID): Promise<RuntimeBaseline> {
  const store = storeForContext(context);
  const baseline = await readBaseline(context, targetId);
  if (baseline.revision !== draftRevision || baseline.status !== "draft") throw new Error(`stale runtime baseline draft revision: expected current draft revision ${baseline.revision}, got ${draftRevision}`);
  const candidate = RuntimeBaselineSchema.parse({ ...baseline, validation: { ...baseline.validation, command_results: [...baseline.validation.command_results, result] }, updated_at: isoNow() });
  return (await store.update(candidate)).artifact;
}
