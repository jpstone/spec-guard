import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { ActionResult } from "./result.ts";
import { aggregateStoreForContext, storeForContext, diagnostic, failureResult, isoNow } from "./config.ts";
import { capturePacketChangeBaseline } from "../baselines/packet-change-baseline.ts";
import { ConfigSchema, WorkPacketSchema, RuntimeBaselineSchema, type Config, type RuntimeBaseline } from "../schemas/artifacts.ts";
import { readRuntimeBaselineCurrent, acceptedBaselineRef } from "../baseline/target-store.ts";
import { resolveProjectRoot, type ActionExecutionContext } from "./context.ts";
import { buildDefaultWorkPacket } from "../work/defaults.ts";
import { foldIntoAggregate, specFromWorkPacket, specAsV1WorkPacket } from "../storage/aggregate-mapping.ts";
import { aggregateApprovalProjection, specReviewContentHash } from "../role-loop/aggregate-approval.ts";
import { buildStandardImplementationPlanProjectionV1, buildPlanWaivedNoopProjectionV1, implementationPlanHash, PlanExpectedFileV1Schema, PlanTestV1Schema, DevRuntimeProofPlanV1Schema } from "../role-loop/implementation-plan.ts";
import { buildApprovedWorkPacketProjectionV1 } from "../role-loop/packet-approval.ts";
import { HumanDecisionRefV1Schema, SourceArtifactRefV1Schema } from "../role-loop/human-decision.ts";
import { AggregateWorkPacketSchema, SpecDependenciesSchema, CONTRACT_PRODUCING_CLASSIFICATIONS, type AggregateWorkPacket, type Spec } from "../schemas/work-packet.ts";
import { detectDependencyCycle, topologicalOrder } from "../role-loop/dependencies.ts";
import path from "node:path";
import { validateDocsPolicyForClassification } from "../work/docs-policy.ts";
import { mockupGateDiagnostics } from "../work/mockup-gate.ts";
import { validateAcceptanceCriteria, normalizeAcceptanceCriteria } from "../work/source-evidence.ts";
import { bootstrapAcsMissing } from "../work/bootstrap-acs.ts";
import { runtimeRelevanceApprovalDiagnostics, runtimeLessDiffContradiction, devRuntimeProofApprovalDiagnostics } from "../work/runtime-relevance.ts";
import { establishesNewTarget } from "../work/runtime-baseline-ref.ts";
import { completionReadinessDiagnostics, completionValidationDiagnostics } from "./completion-readiness.ts";
import { acContentHash } from "../work/ac-snapshots.ts";
import { enforceSpecReviewIdentity } from "../role-loop/loop-identity.ts";
import { independenceBasis } from "../storage/spec-projection.ts";
import { LineageProducerSchema, SpecReviewVerdictSchema, SpecReviewBlockerSchema, SpecReviewCycleSchema, type SpecReviewCycle } from "../lineage/records.ts";
import { HASH_ALGORITHM_V1, SCHEMA_VERSION_V1 } from "../role-loop/constants.ts";
import { AcceptanceCriterionSchema } from "../schemas/embedded.ts";
import { buildHumanDecision } from "../decisions/human-decision.ts";
import { DecisionLog } from "../decisions/decision-log.ts";
import { assertTransition, canTransition, isRecordGatedTransition, WorkflowStateSchema } from "../workflow/state-machine.ts";
import { ImplementationAttemptSchema, ReviewCycleSchema, ReviewVerdictSchema } from "../lineage/records.ts";
import { sealImplementationAttempt, sealReviewCycle, buildReviewBlocker } from "../lineage/hashes.ts";
import { buildFocusedFixInstruction } from "../workflow/review-loop.ts";
import { sha256CanonicalJson } from "../role-loop/canonical-hash.ts";
import { captureFileStateSnapshot, snapshotHash } from "../evidence/file-state.ts";
import { ContractStore } from "../storage/contract-store.ts";
import { sha256HexCanonical } from "../canonical/hashes.ts";
import { normalizeGovernedPath, toPosixPath } from "../paths/normalize.ts";
import { classifyPath, changedFileAllowedByGlobs } from "../paths/classify.ts";
import { CommandResultStore } from "../commands/command-results.ts";

// Reported changed_files arrive RAW (`z.array(z.string())`); the real-diff side is normalized via the same
// pipeline, so both must be normalized before any comparison (else `./src/x` or a Windows `src\x` falsely mismatches).
const normalizeReportedPath = (value: string): string => { try { return normalizeGovernedPath(toPosixPath(value)); } catch { return value; } };

// The effective scope for the footprint/backstop: the Spec's declared allowed_globs, or — when none was declared —
// DERIVED from the implementation plan's expected_files (their directories), so the footprint/backstop are never
// silently inert just because the agent didn't hand-write a scope. Explicit scope always wins.
function effectiveScopeGlobs(spec: Spec): string[] {
  if (spec.scope.allowed_globs.length > 0) return spec.scope.allowed_globs;
  const plan = spec.implementation_plan as { kind?: string; expected_files?: Array<{ path?: unknown }> } | null;
  if (plan === null || plan.kind !== "standard_plan" || !Array.isArray(plan.expected_files)) return [];
  const globs = new Set<string>();
  for (const file of plan.expected_files) {
    const p = typeof file.path === "string" ? toPosixPath(file.path) : "";
    if (p.length === 0) continue;
    const dir = path.posix.dirname(p);
    globs.add(dir === "." || dir === "" ? p : `${dir}/**`);
  }
  return [...globs];
}
import { enforceImplementationAttemptIdentity, enforceReviewCycleIdentity } from "../role-loop/loop-identity.ts";
import { loadRoleConfig } from "../role-config/load.ts";
import { resolveRoleModel, type RoleName, type SpecGuardRoleConfig } from "../role-config/config.ts";
import { WorkClassificationSchema, WorkOriginationSchema, DEFAULT_TARGET_ID } from "../schemas/enums.ts";
import type { Diagnostic, JsonValue } from "../schemas/embedded.ts";

/**
 * The work flow: ONE aggregate document per Work Packet (container + embedded specs[]), with THREE whole-WP human
 * gates — approve -> authorize -> complete — and per-Spec AGENT implementation (record/advance) between them. This
 * is the ONLY work flow (the v1 action layer was deleted in the switch). It reuses the v1 CONTENT helpers
 * (buildDefaultWorkPacket + fold) and re-attaches the v1 READINESS layer (docs-policy, mockup, AC validation,
 * independent spec review, dev-runtime completion proof, change-baseline) over a synthesized per-Spec v1 view.
 *
 * KNOWN GAPS (post-switch follow-ups):
 *  - source-derived ACs: workSpecAcs validates them (source-evidence.ts), but there's no convenience action to
 *    compute the evidence hash (v1's bind_source_evidence) — the agent supplies the SourceEvidence directly.
 *  - WIRE minimization: actions still echo the full work_packet; the scoped-data shape is best designed against
 *    the real ../todos run rather than guessed at now.
 *  - change_baseline.artifact_hash is captured but has no consumer here (the embedded baseline is the source of
 *    truth). Gate decisions are embedded on lifecycle.* + decision_history AND appended best-effort to the
 *    DecisionLog (so decision.get/list see them; a failed audit append never fails the gate).
 */

/**
 * v2 CUTOVER — the v2 action layer, built as a parallel path on the aggregate store while the v1 actions stay
 * live, so the suite stays green until the entry points are switched over. This is the first vertical: create.
 *
 * Create an undecomposed aggregate Work Packet. Reuses the v1 content defaults (buildDefaultWorkPacket) + the
 * v1->v2 fold, so a fresh WP is a one-Spec aggregate persisted as one `packets/<id>.json` document. The richer
 * v1 intake (origination step-0 gate, source-derived ACs, …) ports in later cutover increments.
 */
export const WorkCreateInputSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  goal: z.string().min(1),
  classification: WorkClassificationSchema,
  // new_entirely establishes structural decisions via classification defaults; modify_existing inherits them.
  origination: WorkOriginationSchema.optional(),
  // The target (app) this packet operates on (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §3): omit for the
  // classification default (operational_document → null, else the single-app default), or null for runtime-less.
  target_id: z.string().min(1).nullable().optional(),
  runtime_not_relevant_reason: z.string().min(1).optional(),
  allowed_globs: z.array(z.string()).optional()
}).strict();

export async function workCreate(input: z.infer<typeof WorkCreateInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  try {
    const parsed = WorkCreateInputSchema.parse(input);
    // new_in_existing stands up a BRAND-NEW target (app) inside an existing repo (§4.2): it must name a FRESH
    // target — an explicit, non-default id with no accepted baseline yet. Otherwise it is really modify_existing
    // (the target already exists and should be INHERITED), and deferring its baseline would let the packet
    // silently complete against an existing app's baseline.
    if (parsed.origination === "new_in_existing") {
      if (parsed.target_id === undefined || parsed.target_id === null || parsed.target_id === DEFAULT_TARGET_ID) {
        return failureResult("work.create", "new_in_existing requires an explicit, non-default target_id (the new app's id).", [diagnostic("NEW_IN_EXISTING_TARGET_REQUIRED", "A new app added to an existing repo needs its OWN target_id — pass an explicit non-default target_id (not the single-app default, not null). To extend an EXISTING app, use modify_existing.", "error", "/target_id")]);
      }
      let existing: RuntimeBaseline | null = null;
      try { existing = RuntimeBaselineSchema.parse((await readRuntimeBaselineCurrent(storeForContext(context), parsed.target_id)).artifact); } catch { existing = null; }
      if (existing !== null && existing.status === "accepted") {
        return failureResult("work.create", `Target '${parsed.target_id}' already has an accepted runtime baseline; it is not new.`, [diagnostic("NEW_IN_EXISTING_TARGET_NOT_FRESH", `Target '${parsed.target_id}' already exists (it has an accepted runtime baseline), so this is not new_in_existing — use modify_existing to inherit it.`, "error", "/target_id")]);
      }
    }
    const leaf = buildDefaultWorkPacket({
      id: parsed.id,
      title: parsed.title,
      goal: parsed.goal,
      classification: parsed.classification,
      origination: parsed.origination,
      target_id: parsed.target_id,
      runtime_not_relevant_reason: parsed.runtime_not_relevant_reason,
      allowed_globs: parsed.allowed_globs
    });
    const created = await aggregateStoreForContext(context).create(foldIntoAggregate(leaf));
    return {
      ok: true,
      action_id: "work.create",
      data: { work_packet: created },
      diagnostics: [],
      mutations: [{ artifact: "work_packet", operation: "create", paths: ["/"], summary: `Created aggregate Work Packet ${created.id} (${created.specs.length} Spec).` }],
      next_actions: [],
      summary: `Created aggregate Work Packet ${created.id} as a one-Spec ${parsed.classification} document.`
    };
  } catch (error) {
    return failureResult("work.create", "Aggregate Work Packet creation failed.", [diagnostic("WORK_CREATE_REJECTED", error instanceof Error ? error.message : String(error), "error", "/work")]);
  }
}

/**
 * Set the whole-Work-Packet INTENT (the container-level request the human approves): goal + desired outcomes,
 * in/out of scope, users/actors, edge cases, open questions. work.create seeds only the goal; this fleshes out
 * the rest (the v1 work.intent.draft, which the cutover dropped). Each field given REPLACES that field; omitted
 * fields are left as-is. Pre-approval (the intent is in the whole-WP approval hash).
 */
export const WorkIntentInputSchema = z.object({
  id: z.string().min(1),
  goal: z.string().min(1).optional(),
  desired_outcomes: z.array(z.string()).optional(),
  in_scope: z.array(z.string()).optional(),
  out_of_scope: z.array(z.string()).optional(),
  users_actors: z.array(z.string()).optional(),
  edge_cases: z.array(z.string()).optional(),
  open_questions: z.array(z.string()).optional(),
  // The runtime-less justification (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §5). Settable here so a runtime-less
  // (target_id null) packet that needs a Layer-2 reason isn't a permanent orphan when it wasn't given one at create.
  runtime_not_relevant_reason: z.string().min(1).nullable().optional()
}).strict();

export async function workIntent(input: z.infer<typeof WorkIntentInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  const store = aggregateStoreForContext(context);
  try {
    const parsed = WorkIntentInputSchema.parse(input);
    const aggregate = await store.read(parsed.id);
    if (aggregate.lifecycle.approval !== null) return failureResult("work.intent", "Work Packet is already approved; the intent is a pre-approval field (it is in the whole-WP approval hash) — re-approve after editing.", [diagnostic("WORK_INTENT_APPROVED", "Set the intent before the bulk approval.", "error", "/lifecycle/approval")]);
    const current = aggregate.intent;
    const intent = {
      goal: parsed.goal ?? current.goal,
      desired_outcomes: parsed.desired_outcomes ?? current.desired_outcomes,
      in_scope: parsed.in_scope ?? current.in_scope,
      out_of_scope: parsed.out_of_scope ?? current.out_of_scope,
      users_actors: parsed.users_actors ?? current.users_actors,
      edge_cases: parsed.edge_cases ?? current.edge_cases,
      open_questions: parsed.open_questions ?? current.open_questions
    };
    const runtime_not_relevant_reason = parsed.runtime_not_relevant_reason !== undefined ? parsed.runtime_not_relevant_reason : aggregate.runtime_not_relevant_reason;
    const updated = await store.update(AggregateWorkPacketSchema.parse({ ...aggregate, intent, runtime_not_relevant_reason }));
    const intentPaths = parsed.runtime_not_relevant_reason !== undefined ? ["/intent", "/runtime_not_relevant_reason"] : ["/intent"];
    return {
      ok: true,
      action_id: "work.intent",
      data: { work_packet: updated },
      diagnostics: [],
      mutations: [{ artifact: "work_packet", operation: "update", paths: intentPaths, summary: `Set the Work Packet intent (${intent.desired_outcomes.length} outcome(s)).` }],
      next_actions: [],
      summary: `Work Packet ${aggregate.id}: intent updated.`
    };
  } catch (error) {
    return failureResult("work.intent", "Setting the Work Packet intent failed.", [diagnostic("WORK_INTENT_REJECTED", error instanceof Error ? error.message : String(error), "error", "/work")]);
  }
}

/**
 * Inherit an existing target's ACCEPTED runtime baseline (the modify_existing path).
 * (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §4.1.) Reads runtime_baseline/<target_id>, requires it accepted,
 * and writes a fresh runtime_baseline_ref (id = target_id) onto the container. Pre-approval only (the ref is
 * in the approval hash); re-runnable to refresh a stale ref. For establish originations (new_entirely /
 * new_in_existing) the ref stays null pre-approval and is attached post-bootstrap from baseline.establish.
 */
export const WorkTargetAttachInputSchema = z.object({ id: z.string().min(1), target_id: z.string().min(1).optional() }).strict();

export async function workTargetAttach(input: z.infer<typeof WorkTargetAttachInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  const store = aggregateStoreForContext(context);
  try {
    const parsed = WorkTargetAttachInputSchema.parse(input);
    const aggregate = await store.read(parsed.id);
    if (aggregate.lifecycle.approval !== null) return failureResult("work.target.attach", "Work Packet is already approved; the runtime baseline reference is a pre-approval field (it is in the approval hash) — re-approve after re-attaching.", [diagnostic("WORK_TARGET_ATTACH_APPROVED", "Attach the target baseline before the bulk approval.", "error", "/lifecycle/approval")]);
    const targetId = parsed.target_id ?? aggregate.target_id;
    if (targetId === null) return failureResult("work.target.attach", "This Work Packet is runtime-less (target_id is null); there is no target runtime to inherit.", [diagnostic("WORK_TARGET_ATTACH_RUNTIME_LESS", "Declare a target_id (the app this work is coupled to) before attaching, or keep the packet runtime-less.", "error", "/target_id")]);
    let baseline;
    try {
      baseline = RuntimeBaselineSchema.parse((await readRuntimeBaselineCurrent(storeForContext(context), targetId)).artifact);
    } catch {
      return failureResult("work.target.attach", `No runtime baseline exists for target '${targetId}'.`, [diagnostic("RUNTIME_TARGET_NOT_FOUND", `Target '${targetId}' has no runtime baseline. modify_existing inherits an EXISTING proven target — establish that target first, or use new_in_existing to create a brand-new target.`, "error", "/target_id")]);
    }
    const ref = acceptedBaselineRef(baseline);
    if (ref === null) return failureResult("work.target.attach", `Target '${targetId}' runtime baseline is not accepted (status ${baseline.status}); cannot inherit.`, [diagnostic("RUNTIME_TARGET_NOT_ACCEPTED", `The runtime baseline for target '${targetId}' must be ACCEPTED (proven) before a modify_existing packet can inherit it. Prove + accept it first.`, "error", "/target_id")]);
    // Attaching a real target makes any prior runtime-less justification moot — clear it so a stale reason
    // can't linger on a now-targeted packet. (Review fold: SHOULD-FIX #2 dangling reason.)
    const updated = await store.update(AggregateWorkPacketSchema.parse({ ...aggregate, target_id: targetId, runtime_baseline_ref: ref, runtime_not_relevant_reason: null }));
    return {
      ok: true,
      action_id: "work.target.attach",
      data: { work_packet: updated },
      diagnostics: [],
      mutations: [{ artifact: "work_packet", operation: "update", paths: ["/runtime_baseline_ref", "/target_id"], summary: `Inherited accepted runtime baseline for target '${targetId}' (revision ${ref.revision}).` }],
      next_actions: [],
      summary: `Work Packet ${aggregate.id}: inherited target '${targetId}' runtime baseline.`
    };
  } catch (error) {
    return failureResult("work.target.attach", "Attaching the target runtime baseline failed.", [diagnostic("WORK_TARGET_ATTACH_REJECTED", error instanceof Error ? error.message : String(error), "error", "/work")]);
  }
}

/**
 * Read ONE Work Packet (the whole aggregate document) plus its CURRENT whole-WP approval hash. Non-mutating.
 * This is how an agent re-inspects state and obtains the review_snapshot_hash to echo at a gate (work.approve /
 * work.authorize / work.complete) — especially a fresh session that doesn't hold a prior action's response.
 */
export const WorkGetInputSchema = z.object({ id: z.string().min(1) }).strict();

export async function workGet(input: z.infer<typeof WorkGetInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  const store = aggregateStoreForContext(context);
  try {
    const parsed = WorkGetInputSchema.parse(input);
    const aggregate = await store.read(parsed.id);
    const approval = aggregateApprovalProjection(aggregate);
    // Parallel-ready signal (best-effort): once authorized, every Spec whose depended-on producer contracts ALL
    // exist on disk is unblocked to implement — and they can run CONCURRENTLY (a frozen contract decouples a
    // consumer from its producer's body, so dependency-related Specs still parallelize; no mutual-independence
    // needed). Spec Guard surfaces the set as a directive; it cannot force the host to actually fan out.
    const readyInParallel: string[] = [];
    if (aggregate.lifecycle.authorization !== null) {
      const contractStore = new ContractStore(storeForContext(context).root);
      for (const spec of aggregate.specs) {
        let unblocked = true;
        for (const edge of spec.dependencies.spec_dependencies) {
          const producer = aggregate.specs.find((candidate) => candidate.id === edge.spec_id);
          const ref = edge.contract ?? producer?.contract ?? null;
          if (ref === null) continue;
          if (!(await contractStore.resolves(ref))) { unblocked = false; break; }
        }
        if (unblocked) for (const dep of spec.dependencies.contract_dependencies) { if (!(await contractStore.resolves(dep.contract))) { unblocked = false; break; } }
        if (unblocked) readyInParallel.push(spec.id);
      }
    }
    // Pre-approval REVIEW fan-out signal (distinct from ready_in_parallel, the post-authorize IMPLEMENT set): Specs
    // ready to review now — this Spec + every Spec it depends on drafted+planned — and not yet covered by a passing
    // review at their current Spec-local hash. The coordinator fans reviewers out across these concurrently.
    const passingReviews = [...aggregate.spec_review_cycles.filter((cycle) => cycle.state === "sealed" && cycle.verdict === "pass"), ...aggregate.specs.flatMap((spec) => spec.spec_review_cycles.filter((cycle) => cycle.state === "sealed" && cycle.verdict === "pass"))];
    const specsAwaitingReview: string[] = [];
    for (const spec of aggregate.specs) {
      const depIds = new Set(spec.dependencies.spec_dependencies.map((edge) => edge.spec_id));
      const ready = aggregate.specs.every((other) => !(other.id === spec.id || depIds.has(other.id)) || (other.acceptance_criteria.length > 0 && other.implementation_plan !== null));
      const localHash = specReviewContentHash(spec);
      const covered = passingReviews.some((cycle) => cycle.reviewed_spec_content_hashes.some((entry) => entry.spec_id === spec.id && entry.hash === localHash) || (cycle.review_scope === "whole_wp" && cycle.reviewed_spec_content_hashes.length === 0 && cycle.reviewed_ac_content_hash === approval.hash));
      if (ready && !covered) specsAwaitingReview.push(spec.id);
    }
    return {
      ok: true,
      action_id: "work.get",
      data: { work_packet: aggregate, approval_hash: approval.hash, ready_in_parallel: readyInParallel, specs_awaiting_review: specsAwaitingReview },
      diagnostics: [],
      mutations: [],
      next_actions: [],
      summary: `Work Packet ${aggregate.id}: ${aggregate.specs.length} Spec(s); approval ${aggregate.lifecycle.approval === null ? "pending" : "recorded"}; current hash ${approval.hash}.`
    };
  } catch (error) {
    return failureResult("work.get", "Work Packet read failed.", [diagnostic("WORK_GET_REJECTED", error instanceof Error ? error.message : String(error), "error", "/work")]);
  }
}

/** List every Work Packet as a compact summary (id, title, disposition, Spec count, gate state). Non-mutating. */
export const WorkListInputSchema = z.object({}).strict();

export async function workList(input: z.infer<typeof WorkListInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  const store = aggregateStoreForContext(context);
  try {
    WorkListInputSchema.parse(input);
    const work_packets: Array<Record<string, JsonValue>> = [];
    for (const id of await store.list()) {
      const aggregate = await store.tryRead(id);
      if (aggregate === null) continue;
      work_packets.push({
        id: aggregate.id,
        title: aggregate.title,
        disposition: aggregate.disposition,
        spec_count: aggregate.specs.length,
        approved: aggregate.lifecycle.approval !== null,
        authorized: aggregate.lifecycle.authorization !== null,
        completed: aggregate.lifecycle.completion !== null
      });
    }
    return {
      ok: true,
      action_id: "work.list",
      data: { work_packets },
      diagnostics: [],
      mutations: [],
      next_actions: [],
      summary: `${work_packets.length} Work Packet(s).`
    };
  } catch (error) {
    return failureResult("work.list", "Work Packet list failed.", [diagnostic("WORK_LIST_REJECTED", error instanceof Error ? error.message : String(error), "error", "/work")]);
  }
}

/**
 * v2 CUTOVER — the whole-Work-Packet approval gate (§3). ONE approval over the entire aggregate: it binds the
 * whole-WP approval hash (covering every Spec), collapsing v1's separate ac_approval + packet_approval into the
 * single `lifecycle.approval`. Compute-don't-demand: the action computes the current hash itself and only
 * requires the caller to echo the hash they reviewed (so the approval is "what you saw"); a mismatch means the
 * content changed since review => stale, re-review. Editing ANY Spec later changes the hash and re-stales this.
 * Records an `aggregate_work_packet_approval` decision whose approved_fields ({id,title,specs}) match the v2
 * approval payload.
 */
/**
 * Per-Spec approval readiness — the v1 readiness gates, now run over EACH Spec (the WP is approved only when
 * every Spec is ready). This is the seam the readiness restore extends; today it runs the docs-policy gate
 * (a Spec's docs policy must be valid for its classification — e.g. an API-contract Spec can't be none_required).
 * Still pending (must-restore-before-switch): the mockup gate (needs a v2 mockup-resolution action), AC
 * validation (needs per-Spec AC drafting), and the forced-classification gate.
 */
// Best-effort audit: lifecycle.* (+ decision_history) is the source of truth for a gate, so a failed DecisionLog
// append must NOT masquerade as a gate rejection (the gate already landed on disk). Swallow.
async function auditDecision(root: string, decision: ReturnType<typeof buildHumanDecision>): Promise<void> {
  try { await new DecisionLog(root).append(decision); } catch { /* audit is best-effort */ }
}

/**
 * A role must run at its CONFIGURED model tier (e.g. high_judgment -> claude-opus-4-8), not whatever the
 * coordinator happens to inherit — code quality + review quality both degrade on a cheaper model. Spec Guard
 * cannot VERIFY a subagent's real model, but it surfaces the configured model and flags a declared mismatch:
 * an ERROR when the declared model is below the configured tier (same provider), a WARNING when none is reported.
 */
function modelTierDiagnostics(roleConfig: SpecGuardRoleConfig | null, role: RoleName, producer: { model: string | null; provider: string }, codes: { below: string; unverified: string }): { expectedModel: string | null; diagnostics: Diagnostic[] } {
  const expectedModel = roleConfig !== null ? resolveRoleModel(roleConfig, role).model : null;
  const diagnostics: Diagnostic[] = [];
  if (roleConfig !== null && expectedModel !== null) {
    if (producer.model === null) {
      diagnostics.push(diagnostic(codes.unverified, `The ${role} role is configured to run on '${expectedModel}', but no producer.model was reported, so the tier cannot be confirmed. Spawn the ${role} subagent EXPLICITLY on '${expectedModel}' and report the model you actually used.`, "warning", "/producer/model"));
    } else if (roleConfig.roles[role].provider === producer.provider && producer.model !== expectedModel) {
      diagnostics.push(diagnostic(codes.below, `The ${role} role is configured to run on '${expectedModel}' (its tier), but the producer.model is '${producer.model}'. Spawn the ${role} subagent EXPLICITLY on '${expectedModel}' (your subagent tool's model parameter) — do not rely on the coordinator's inherited model.`, "error", "/producer/model"));
    }
  }
  return { expectedModel, diagnostics };
}

async function specApprovalReadiness(aggregate: AggregateWorkPacket, context: ActionExecutionContext): Promise<Diagnostic[]> {
  const errors: Diagnostic[] = [];
  for (const spec of aggregate.specs) {
    const docsError = validateDocsPolicyForClassification({ classification: spec.classification, policy: spec.docs.policy, none_required_reason: spec.docs.none_required_reason, not_applicable_reason: spec.docs.not_applicable_reason });
    if (docsError !== null) errors.push(diagnostic("WORK_APPROVE_SPEC_DOCS_INVALID", `Spec ${spec.id} (${spec.classification}): ${docsError}`, "error", `/specs/${spec.id}/docs`));
    // Mockup gate: a UI Spec must resolve its mockup question (none/present) before approval, so ACs aren't
    // approved against an unanswered mockup. Run the v1 gate over the synthesized Spec view.
    for (const mockupDiag of mockupGateDiagnostics(specAsV1WorkPacket(aggregate, spec))) {
      if (mockupDiag.severity === "error") errors.push(diagnostic(mockupDiag.code, `Spec ${spec.id}: ${mockupDiag.message}`, "error", `/specs/${spec.id}/mockup_decision`));
    }
    // AC validation AT THE APPROVAL GATE — re-validate, not just at draft (workSpecAcs): ACs could be planted
    // by a path that bypasses the draft action, and v1 re-validates ACs at the approval gate.
    for (const acDiag of await validateAcceptanceCriteria(spec.acceptance_criteria, context)) {
      if (acDiag.severity === "error") errors.push(diagnostic(acDiag.code, `Spec ${spec.id}: ${acDiag.message}`, "error", `/specs/${spec.id}/acceptance_criteria`));
    }
    // Bootstrap-ACs gate: greenfield work (new_entirely standing up a required architecture/stack) must carry at
    // least one bootstrap AC, not only leaf-feature ACs. (WORK_ORIGINATION_DESIGN.md §5.)
    if (bootstrapAcsMissing(specAsV1WorkPacket(aggregate, spec))) {
      errors.push(diagnostic("BOOTSTRAP_ACS_MISSING", `Spec ${spec.id} (${spec.classification}): greenfield work that stands up new architecture/stack must include a bootstrap acceptance criterion (bootstrap: true).`, "error", `/specs/${spec.id}/acceptance_criteria`));
    }
    // Implementation plan REQUIRED per Spec — implementation planning happens BEFORE the bulk approval (and the
    // spec review), so the approved Spec is complete.
    if (spec.implementation_plan === null) {
      errors.push(diagnostic("IMPLEMENTATION_PLAN_REQUIRED", `Spec ${spec.id}: an implementation plan is required before approval — set it with work.spec.plan.`, "error", `/specs/${spec.id}/implementation_plan`));
    }
  }
  // The whole-WP INTENT must be COMPLETE before the bulk approval: every section populated (set with work.intent).
  const intentMissing = (["desired_outcomes", "in_scope", "out_of_scope", "users_actors", "edge_cases", "open_questions"] as const).filter((field) => aggregate.intent[field].length === 0);
  if (intentMissing.length > 0) {
    errors.push(diagnostic("INTENT_INCOMPLETE", `The Work Packet intent is incomplete — every section must be populated before the bulk approval (set them with work.intent). Empty: ${intentMissing.join(", ")}.`, "error", "/intent"));
  }
  // Runtime-relevance policing (Layers 1 + 2): a runtime-less (null target_id) claim must be legitimate
  // (not a runtime-relevant classification / app platform) and, when not pure docs, carry a human-approved
  // runtime_not_relevant_reason. (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §5.)
  errors.push(...runtimeRelevanceApprovalDiagnostics(aggregate));
  // Runtime baseline INHERITANCE (modify_existing): a packet that inherits an existing target MUST attach its
  // accepted runtime baseline BEFORE approval — the ref is in the approval hash, so attaching after approval is
  // blocked (WORK_TARGET_ATTACH_APPROVED); requiring it here is what makes inherit-before-approval the only path
  // (no deadlock). New targets (new_entirely / new_in_existing) establish theirs post-authorization as bootstrap
  // work (deferred); runtime-less packets (null target_id) need none. (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §4.)
  if (aggregate.target_id !== null && !establishesNewTarget(aggregate) && aggregate.runtime_baseline_ref === null) {
    errors.push(diagnostic("RUNTIME_BASELINE_REF_REQUIRED", `This packet modifies existing target '${aggregate.target_id}', so it must inherit that target's accepted runtime baseline before approval — run work.target.attach (target_id '${aggregate.target_id}'). If '${aggregate.target_id}' has no proven baseline yet, establish it (or use new_in_existing to create a new target).`, "error", "/runtime_baseline_ref"));
  }
  // Dev-runtime PROOF DESIGN reviewed at approval (§4.3): an establishing app packet must declare a dev_runtime_proof
  // on >=1 Spec's plan (the run command + readiness assertion). Proven post-auth; its design is reviewed here.
  errors.push(...devRuntimeProofApprovalDiagnostics(aggregate));
  // Independent pre-approval review, in TWO requirements (parallel spec reviews). Reviews may be PER-SPEC (run
  // concurrently) or a single WHOLE-WP review; both record each covered Spec's local hash so coverage is per-Spec.
  const currentWholeHash = aggregateApprovalProjection(aggregate).hash;
  const wholeReviews = aggregate.spec_review_cycles.filter((cycle) => cycle.state === "sealed" && cycle.verdict === "pass");
  const passing = [...wholeReviews, ...aggregate.specs.flatMap((spec) => spec.spec_review_cycles.filter((cycle) => cycle.state === "sealed" && cycle.verdict === "pass"))];
  // REQ 1 — per-Spec QUALITY coverage: every Spec covered by a passing review at its CURRENT Spec-local hash. A
  // single edited Spec stales ONLY its coverage (the others stay covered) — the parallel win. re_review_waived (the
  // human accepted the changes) waives STALENESS but never the requirement that a passing review exists.
  for (const spec of aggregate.specs) {
    const localHash = specReviewContentHash(spec);
    const reviewedThis = passing.filter((cycle) => cycle.reviewed_spec_content_hashes.some((entry) => entry.spec_id === spec.id) || (cycle.review_scope === "whole_wp" && cycle.reviewed_spec_content_hashes.length === 0));
    const current = reviewedThis.some((cycle) => cycle.reviewed_spec_content_hashes.some((entry) => entry.spec_id === spec.id && entry.hash === localHash) || (cycle.reviewed_spec_content_hashes.length === 0 && cycle.reviewed_ac_content_hash === currentWholeHash));
    if (reviewedThis.length === 0) errors.push(diagnostic("SPEC_REVIEW_REQUIRED", `Spec ${spec.id} has no passing independent review. Run work.review (spec_id ${spec.id} for a per-Spec review, or no spec_id for the whole WP) before approval.`, "error", `/specs/${spec.id}/spec_review_cycles`));
    else if (!current && !aggregate.re_review_waived) errors.push(diagnostic("SPEC_REVIEW_STALE", `Spec ${spec.id} changed since its independent review; re-review it (work.review with spec_id ${spec.id}, or a whole-WP work.review).`, "error", `/specs/${spec.id}/spec_review_cycles`));
  }
  // REQ 2 — whole-WP COHERENCE (N>1): the structural gates + per-Spec reviews can't catch two unconnected Specs that
  // conflict, so a single reviewer over ALL Specs (independent of every author, enforced at record) bound to the
  // CURRENT whole-WP content is required. Any Spec edit moves the whole hash and re-stales it. N=1 = trivially coherent.
  if (aggregate.specs.length > 1 && !aggregate.re_review_waived && !wholeReviews.some((cycle) => cycle.reviewed_ac_content_hash === currentWholeHash)) {
    errors.push(diagnostic("SPEC_REVIEW_COHERENCE_REQUIRED", "A whole-Work-Packet coherence review (one reviewer over ALL Specs, independent of every author) bound to the current content is required before approval — run work.review with NO spec_id. Per-Spec reviews alone don't check cross-Spec coherence.", "error", "/spec_review_cycles"));
  }
  // Defense-in-depth: a cross-Spec dependency cycle must NEVER reach approval. work.review already rejects one, but
  // a cycle introduced after a passing review that was then re-review-WAIVED (re_review_waived) would otherwise
  // slip the stale check above — so re-check it here at the approval gate too.
  const approvalCycle = detectDependencyCycle(aggregate.specs);
  if (approvalCycle !== null) errors.push(diagnostic("DEPENDENCY_CYCLE", `Cross-Spec dependencies form a cycle: ${approvalCycle.join(" -> ")}. Resolve it (one Spec, or a shared-contract Spec) before approval.`, "error", "/specs"));
  return errors;
}

export const WorkApproveInputSchema = z.object({
  id: z.string().min(1),
  review_snapshot_hash: z.string().min(1),
  selected_number: z.number().int(),
  raw_response: z.string(),
  decision_prompt: z.string(),
  human_confirmed: z.boolean(),
  prompt_id: z.string().optional(),
  // The human's choice at the gate: "approve" (the default Yes path) or "request_changes" (No). For
  // request_changes the human MUST also answer re_review_required (prompt them) — true keeps the normal
  // re-review-on-change requirement; false waives the next approval's stale-review check.
  decision: z.enum(["approve", "request_changes"]).optional(),
  re_review_required: z.boolean().optional()
}).strict();

export async function workApprove(input: z.infer<typeof WorkApproveInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  const store = aggregateStoreForContext(context);
  try {
    const parsed = WorkApproveInputSchema.parse(input);
    if (parsed.human_confirmed !== true) return failureResult("work.approve", "Work Packet approval requires human_confirmed: true.", [diagnostic("WORK_APPROVE_UNCONFIRMED", "Approval is a human gate; human_confirmed must be true.", "error", "/human_confirmed")]);
    const aggregate = await store.read(parsed.id);
    // REQUEST CHANGES (the gate's "No"): record the decline + the human's re-review choice; do NOT approve. The
    // human MUST be asked whether they want a re-review (re_review_required is required here). re_review_required
    // false sets re_review_waived so the NEXT approval skips the stale-whole-WP-review check (the human accepts the
    // changes without a fresh agent review); true keeps the normal re-review-on-change requirement.
    if (parsed.decision === "request_changes") {
      if (parsed.re_review_required === undefined) return failureResult("work.approve", "Requesting changes requires the human's re-review choice — ask whether they want a re-review of the changes.", [diagnostic("WORK_APPROVE_REREVIEW_PROMPT_REQUIRED", "Set re_review_required: true (re-review the changes before re-approval) or false (re-approve without a fresh agent review).", "error", "/re_review_required")]);
      const declineDecision = buildHumanDecision({ action_id: "work.approve", decision_type: "aggregate_work_packet_approval", selected_number: parsed.selected_number, raw_response: parsed.raw_response, decision_prompt: parsed.decision_prompt, human_confirmed: true, prompt_id: parsed.prompt_id, normalized_decision: "no", final_decision: false, source_interface: "core", target_artifact_revision: aggregate.revision + 1 });
      const declined = await store.update(AggregateWorkPacketSchema.parse({ ...aggregate, re_review_waived: !parsed.re_review_required, decision_history: [...aggregate.decision_history, declineDecision] }));
      await auditDecision(store.root, declineDecision);
      return {
        ok: true,
        action_id: "work.approve",
        data: { work_packet: declined, decision: declineDecision },
        diagnostics: [diagnostic("WORK_APPROVE_CHANGES_REQUESTED", parsed.re_review_required ? "Changes requested; after editing, a fresh whole-WP review (work.review) is required before re-approval." : "Changes requested; the human WAIVED re-review — the next approval will skip the stale-review check.", "warning", "/lifecycle/approval")],
        mutations: [{ artifact: "work_packet", operation: "update", paths: ["/decision_history", "/re_review_waived"], summary: `Changes requested (re-review ${parsed.re_review_required ? "required" : "waived"}).` }],
        next_actions: [],
        summary: `Changes requested on Work Packet ${aggregate.id}; re-review ${parsed.re_review_required ? "required" : "waived"}.`
      };
    }
    const approval = aggregateApprovalProjection(aggregate);
    if (parsed.review_snapshot_hash !== approval.hash) {
      return failureResult("work.approve", "Approval snapshot is stale; the Work Packet changed since review.", [diagnostic("WORK_APPROVE_STALE", `Submitted review_snapshot_hash does not match the current whole-Work-Packet approval hash (${approval.hash}); re-review and approve the fresh state.`, "error", "/review_snapshot_hash")]);
    }
    const readiness = await specApprovalReadiness(aggregate, context);
    if (readiness.length > 0) return failureResult("work.approve", "Work Packet is not ready for approval; fix the Spec(s) below.", readiness);
    const decision = buildHumanDecision({
      action_id: "work.approve",
      decision_type: "aggregate_work_packet_approval",
      selected_number: parsed.selected_number,
      raw_response: parsed.raw_response,
      decision_prompt: parsed.decision_prompt,
      human_confirmed: true,
      prompt_id: parsed.prompt_id,
      normalized_decision: "yes",
      final_decision: true,
      approved_payload: { id: aggregate.id, title: aggregate.title, specs: approval.specs } as unknown as Record<string, JsonValue>,
      review_snapshot_hash: approval.hash,
      approved_content_hash: approval.hash,
      source_interface: "core",
      target_artifact_revision: aggregate.revision + 1
    });
    const updated = await store.update(AggregateWorkPacketSchema.parse({ ...aggregate, re_review_waived: false, lifecycle: { ...aggregate.lifecycle, approval: decision } }));
    await auditDecision(store.root, decision);
    return {
      ok: true,
      action_id: "work.approve",
      data: { work_packet: updated, decision },
      diagnostics: [],
      mutations: [{ artifact: "work_packet", operation: "update", paths: ["/lifecycle/approval"], summary: `Approved the whole Work Packet (${updated.specs.length} Spec) under hash ${approval.hash}.` }],
      next_actions: [],
      summary: `Approved Work Packet ${updated.id} — one whole-WP approval over ${updated.specs.length} Spec(s).`
    };
  } catch (error) {
    return failureResult("work.approve", "Work Packet approval failed.", [diagnostic("WORK_APPROVE_REJECTED", error instanceof Error ? error.message : String(error), "error", "/work")]);
  }
}

/**
 * v2 CUTOVER — the whole-Work-Packet authorization gate (§3). ONE authorization greenlights EVERY Spec to build;
 * the coordinator never stops per-Spec for the human. Gated on the CURRENT whole-WP approval: the WP must be
 * approved AND that approval must still be current (its bound hash equals the live whole-WP hash). Editing a Spec
 * after approval re-stales the approval, so authorization is blocked until re-approval — exactly the §3 chain.
 */
export const WorkAuthorizeInputSchema = z.object({
  id: z.string().min(1),
  review_snapshot_hash: z.string().min(1),
  selected_number: z.number().int(),
  raw_response: z.string(),
  decision_prompt: z.string(),
  human_confirmed: z.boolean(),
  prompt_id: z.string().optional()
}).strict();

export async function workAuthorize(input: z.infer<typeof WorkAuthorizeInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  const store = aggregateStoreForContext(context);
  try {
    const parsed = WorkAuthorizeInputSchema.parse(input);
    if (parsed.human_confirmed !== true) return failureResult("work.authorize", "Authorization requires human_confirmed: true.", [diagnostic("WORK_AUTHORIZE_UNCONFIRMED", "Authorization is a human gate; human_confirmed must be true.", "error", "/human_confirmed")]);
    const aggregate = await store.read(parsed.id);
    if (aggregate.lifecycle.approval === null) return failureResult("work.authorize", "Work Packet is not approved; approve it before authorizing.", [diagnostic("WORK_AUTHORIZE_NOT_APPROVED", "The whole-Work-Packet approval gate must pass before authorization.", "error", "/lifecycle/approval")]);
    const approval = aggregateApprovalProjection(aggregate);
    if (parsed.review_snapshot_hash !== approval.hash) return failureResult("work.authorize", "Authorization snapshot is stale; the Work Packet changed since review.", [diagnostic("WORK_AUTHORIZE_STALE", `Submitted review_snapshot_hash does not match the current whole-Work-Packet hash (${approval.hash}).`, "error", "/review_snapshot_hash")]);
    if (aggregate.lifecycle.approval.review_snapshot_hash !== approval.hash) return failureResult("work.authorize", "The approval is stale (a Spec changed since approval); re-approve before authorizing.", [diagnostic("WORK_AUTHORIZE_APPROVAL_STALE", "lifecycle.approval no longer matches the current whole-Work-Packet hash; re-approve the whole Work Packet.", "error", "/lifecycle/approval")]);
    const decision = buildHumanDecision({
      action_id: "work.authorize",
      decision_type: "aggregate_implementation_authorization",
      selected_number: parsed.selected_number,
      raw_response: parsed.raw_response,
      decision_prompt: parsed.decision_prompt,
      human_confirmed: true,
      prompt_id: parsed.prompt_id,
      normalized_decision: "yes",
      final_decision: true,
      approved_payload: { id: aggregate.id, title: aggregate.title, specs: approval.specs } as unknown as Record<string, JsonValue>,
      review_snapshot_hash: approval.hash,
      approved_content_hash: approval.hash,
      source_interface: "core",
      target_artifact_revision: aggregate.revision + 1
    });
    // Authorization greenlights EVERY fresh Spec to build (draft -> implementation_authorized; workflow_state
    // isn't in the approval hash, so this doesn't stale the approval) AND captures each Spec's change-baseline —
    // the pre-implementation tree state scoped to the Spec's globs, exactly as v1 does at authorize, bound to the
    // whole-WP approval hash + this authorization decision (manifest mode when there's no git, so no repo is
    // required). NOTE: the v1 artifact-hash re-verify binds to a standalone WorkPacket revision and is deferred —
    // the v2 baseline is embedded in the aggregate, which is the source of truth.
    const config = ConfigSchema.parse((await storeForContext(context).readCurrent<Config>("config", null)).artifact);
    const projectRoot = resolveProjectRoot(context);
    const captureDiagnostics: Diagnostic[] = [];
    const authorizedSpecs: Spec[] = [];
    for (const spec of aggregate.specs) {
      if (spec.workflow_state !== "packet_draft") { authorizedSpecs.push(spec); continue; }
      const capture = await capturePacketChangeBaseline({ projectRoot, config, work: specAsV1WorkPacket(aggregate, spec), reviewSnapshotHash: approval.hash, authorizationDecision: decision });
      captureDiagnostics.push(...capture.diagnostics);
      authorizedSpecs.push({ ...spec, workflow_state: "implementation_authorized", change_baseline: capture.baseline });
    }
    const captureErrors = captureDiagnostics.filter((diag) => diag.severity === "error");
    if (captureErrors.length > 0) return failureResult("work.authorize", "Change-baseline capture failed; authorization was not recorded.", captureErrors);
    const updated = await store.update(AggregateWorkPacketSchema.parse({ ...aggregate, lifecycle: { ...aggregate.lifecycle, authorization: decision }, specs: authorizedSpecs }));
    await auditDecision(store.root, decision);
    return {
      ok: true,
      action_id: "work.authorize",
      data: { work_packet: updated, decision },
      diagnostics: [],
      mutations: [{ artifact: "work_packet", operation: "update", paths: ["/lifecycle/authorization"], summary: `Authorized the whole Work Packet (${updated.specs.length} Spec) for implementation.` }],
      next_actions: [],
      summary: `Authorized Work Packet ${updated.id} — all ${updated.specs.length} Spec(s) greenlit to build.`
    };
  } catch (error) {
    return failureResult("work.authorize", "Work Packet authorization failed.", [diagnostic("WORK_AUTHORIZE_REJECTED", error instanceof Error ? error.message : String(error), "error", "/work")]);
  }
}

/**
 * v2 CUTOVER — advance ONE Spec's implementation lifecycle (§3: per-Spec, AGENT-driven, no human gate between
 * Specs). Validates the transition against the shared workflow state machine and advances only the target Spec,
 * leaving its siblings untouched — the per-Spec independence the decomposition exists for. `complete` is NOT
 * reachable here: it's the whole-WP completion gate (a later vertical). Requires the WP to be authorized.
 *
 * NOTE (follow-up): this advances workflow_state only; appending the sealed lineage records
 * (implementation_attempts / review_cycles) lands with the role-loop port in a later increment.
 */
export const WorkSpecAdvanceInputSchema = z.object({
  id: z.string().min(1),
  spec_id: z.string().min(1),
  next_state: WorkflowStateSchema
}).strict();

export async function workSpecAdvance(input: z.infer<typeof WorkSpecAdvanceInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  const store = aggregateStoreForContext(context);
  try {
    const parsed = WorkSpecAdvanceInputSchema.parse(input);
    const aggregate = await store.read(parsed.id);
    const spec = aggregate.specs.find((candidate) => candidate.id === parsed.spec_id);
    if (spec === undefined) return failureResult("work.spec.advance", `Spec ${parsed.spec_id} is not part of Work Packet ${parsed.id}.`, [diagnostic("WORK_SPEC_ADVANCE_NOT_FOUND", `No Spec ${parsed.spec_id} in the aggregate.`, "error", "/spec_id")]);
    if (parsed.next_state === "complete") return failureResult("work.spec.advance", "Completion is the whole-Work-Packet gate, not a per-Spec advance.", [diagnostic("WORK_SPEC_ADVANCE_COMPLETE_GATE", "A Spec reaches review_complete here; the whole Work Packet is completed by work.complete once every Spec is review_complete.", "error", "/next_state")]);
    if (aggregate.lifecycle.authorization === null) return failureResult("work.spec.advance", "Work Packet is not authorized; authorize it before implementing.", [diagnostic("WORK_SPEC_ADVANCE_NOT_AUTHORIZED", "The whole-Work-Packet authorization gate must pass before any Spec implements.", "error", "/lifecycle/authorization")]);
    if (!canTransition(spec.workflow_state, parsed.next_state)) return failureResult("work.spec.advance", "Invalid workflow transition.", [diagnostic("WORK_SPEC_ADVANCE_INVALID", `Cannot transition Spec ${spec.id}: ${spec.workflow_state} -> ${parsed.next_state}.`, "error", "/next_state")]);
    // Record-gated transitions (implementation/review/fix outputs) MUST go through work.spec.record, which
    // appends the sealed lineage record AND enforces producer identity (implementer != reviewer, #11) — not a
    // bare advance, which would let a Spec reach review_complete with no evidence and no self-review check.
    if (isRecordGatedTransition(spec.workflow_state, parsed.next_state)) return failureResult("work.spec.advance", "This transition is record-gated; it requires work.spec.record, not a bare advance.", [diagnostic("WORK_SPEC_ADVANCE_RECORD_REQUIRED", `${spec.workflow_state} -> ${parsed.next_state} must append a sealed lineage record (implementation_attempt/review_cycle/fix) and pass producer-identity enforcement; use work.spec.record.`, "error", "/next_state")]);
    const updated = await store.update(AggregateWorkPacketSchema.parse({
      ...aggregate,
      specs: aggregate.specs.map((candidate) => (candidate.id === parsed.spec_id ? { ...candidate, workflow_state: parsed.next_state } : candidate))
    }));
    return {
      ok: true,
      action_id: "work.spec.advance",
      data: { work_packet: updated, spec_id: parsed.spec_id, workflow_state: parsed.next_state },
      diagnostics: [],
      mutations: [{ artifact: "work_packet", operation: "update", paths: [`/specs/${parsed.spec_id}/workflow_state`], summary: `Advanced Spec ${parsed.spec_id}: -> ${parsed.next_state}.` }],
      next_actions: [],
      summary: `Spec ${parsed.spec_id} advanced to ${parsed.next_state} (siblings untouched).`
    };
  } catch (error) {
    return failureResult("work.spec.advance", "Spec advance failed.", [diagnostic("WORK_SPEC_ADVANCE_REJECTED", error instanceof Error ? error.message : String(error), "error", "/work")]);
  }
}

/**
 * v2 CUTOVER — the whole-Work-Packet completion gate (§3), the third and final human gate. ONE confirmation
 * completes the entire Work Packet — valid only when EVERY Spec is review_complete (the agent finished + reviewed
 * each Spec independently). It then marks every Spec complete. Gated like the others on the current whole-WP
 * approval (you complete the thing that was approved; a content edit during implementation re-stales it).
 *
 * NOTE (must-restore-before-switch): v1 also runs completionReadinessDiagnostics (the dev-runtime proof + the
 * per-Spec evidence) at this gate, and offers a decline path that routes back to review. Those land with the
 * readiness restore; this increment enforces the all-Specs-review_complete structural gate.
 */
export const WorkCompleteInputSchema = z.object({
  id: z.string().min(1),
  review_snapshot_hash: z.string().min(1),
  selected_number: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  raw_response: z.string(),
  decision_prompt: z.string(),
  human_confirmed: z.boolean(),
  prompt_id: z.string().optional()
}).strict();

/**
 * Evidence-restore §3c — the completion backstop (the un-bendable bypass catch): product code under a Spec's scope
 * that changed since authorize with NO recorded implementation_attempt covering it is a bypass (e.g. an edit that
 * evaded the edit gate). Even correct, compiling code is blocked at completion if it was never recorded. Works in
 * manifest AND vcs mode (vcs diffs against the baseline commit); skips when no Spec has a scope (undeterminable).
 * Matches each changed file against the UNION of ALL Specs' recorded changed_files (overlapping scopes / shared tree).
 */
export async function unrecordedChangesDiagnostics(aggregate: AggregateWorkPacket, context: ActionExecutionContext): Promise<Diagnostic[]> {
  const baseline = aggregate.specs.find((spec) => spec.change_baseline !== null)?.change_baseline ?? null;
  const allowedGlobs = [...new Set(aggregate.specs.flatMap((spec) => effectiveScopeGlobs(spec)))];
  if (baseline === null || allowedGlobs.length === 0) return [];
  const config = ConfigSchema.parse((await storeForContext(context).readCurrent<Config>("config", null)).artifact);
  const { snapshot, diagnostics } = await captureFileStateSnapshot({ projectRoot: resolveProjectRoot(context), config, baseline, allowedGlobs });
  // Don't fail OPEN: if the footprint couldn't be computed, the backstop can't run — block rather than silently pass.
  if (diagnostics.some((diag) => diag.code === "FILE_STATE_VCS_CAPTURE_FAILED")) return [diagnostic("COMPLETION_FOOTPRINT_UNAVAILABLE", "The working-tree footprint could not be computed (repository capture failed), so the unrecorded-changes backstop cannot run. Resolve the repository state and retry completion.", "error", "/specs")];
  const recorded = new Set(aggregate.specs.flatMap((spec) => spec.implementation_attempts.flatMap((attempt) => attempt.changed_files.map(normalizeReportedPath))));
  const unrecorded = snapshot.changed_files_since_packet_baseline.filter((cf) => cf.allowed_by_globs && !recorded.has(cf.path)).map((cf) => cf.path);
  if (unrecorded.length === 0) return [];
  return [diagnostic("COMPLETION_UNRECORDED_CHANGES", `Product code under a Spec's scope changed with NO recorded implementation_attempt: ${unrecorded.join(", ")}. Every change must be recorded (work.spec.record) by a delegated implementer — an unrecorded change is a bypass.`, "error", "/specs")];
}

/**
 * Evidence-restore §3b GATE — at completion every NON-bootstrap acceptance criterion must carry a satisfied
 * evidence_satisfaction entry on some review cycle (the reviewer declared what proves it). Bootstrap ACs (greenfield
 * scaffolding) are exempt — they're self-evident and covered by the completion build + the footprint. Deterministic
 * PRESENCE + (for behavioral evidence) RESOLUTION: any evidence_ref naming a CommandResult must resolve to a PASSED
 * one. bootstrap ACs are exempt ONLY on greenfield Specs (origination new_entirely) — so an agent can't dodge the gate
 * by tagging a substantive AC bootstrap on non-greenfield work (the design-review S-3 hole).
 */
export async function acEvidenceDiagnostics(aggregate: AggregateWorkPacket, context: ActionExecutionContext): Promise<Diagnostic[]> {
  const out: Diagnostic[] = [];
  const crStore = new CommandResultStore(storeForContext(context).root);
  for (const spec of aggregate.specs) {
    const greenfield = specAsV1WorkPacket(aggregate, spec).origination === "new_entirely";
    // Only the LATEST review cycle's satisfaction counts — a stale satisfied entry from an earlier cycle must not
    // clear the gate after a later blocking re-review (evidence reflects the current state of the work).
    const latest = spec.review_cycles.at(-1);
    const satisfied = (latest?.evidence_satisfaction ?? []).filter((entry) => entry.satisfied);
    const proven = new Set(satisfied.map((entry) => entry.ac_id));
    // bootstrap is only an exemption on greenfield Specs — otherwise a substantive AC tagged bootstrap would dodge.
    const unproven = spec.acceptance_criteria.filter((ac) => !(ac.bootstrap && greenfield) && !proven.has(ac.id)).map((ac) => ac.id);
    if (unproven.length > 0) out.push(diagnostic("COMPLETION_AC_UNPROVEN", `Spec ${spec.id}: these acceptance criteria have no satisfied evidence on the latest review cycle: ${unproven.join(", ")}. The reviewer must record per-AC evidence_satisfaction (work.spec.record review_cycle) before completion.`, "error", `/specs/${spec.id}/acceptance_criteria`));
    // Behavioral evidence is REAL only if a referenced CommandResult actually passed (B2): resolve every
    // `command-result:` ref and block if it's missing or not "passed".
    for (const entry of satisfied) {
      for (const ref of entry.evidence_refs.filter((r) => r.startsWith("command-result:"))) {
        const status = await crStore.get(ref).then((r) => r.status).catch(() => "missing");
        if (status !== "passed") out.push(diagnostic("COMPLETION_AC_EVIDENCE_NOT_PASSED", `Spec ${spec.id} AC ${entry.ac_id}: evidence ${ref} is '${status}', not 'passed'. Behavioral evidence must reference a passed CommandResult.`, "error", `/specs/${spec.id}/acceptance_criteria`));
      }
    }
  }
  return out;
}

export async function workComplete(input: z.infer<typeof WorkCompleteInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  const store = aggregateStoreForContext(context);
  try {
    const parsed = WorkCompleteInputSchema.parse(input);
    const aggregate = await store.read(parsed.id);
    // Discuss (3): non-mutating — the human is deliberating, not deciding. Nothing is recorded. (Without this an
    // unrecognized selection would fall through to the Yes path and silently complete the Work Packet.)
    if (parsed.selected_number === 3) {
      return { ok: true, action_id: "work.complete", data: { work_packet: aggregate }, diagnostics: [diagnostic("WORK_COMPLETE_DISCUSS", "Completion deferred for discussion; no changes recorded.", "info", "/lifecycle/completion")], mutations: [], next_actions: [], summary: "Completion deferred for discussion (no mutation)." };
    }
    if (parsed.human_confirmed !== true) return failureResult("work.complete", "Completion requires human_confirmed: true.", [diagnostic("WORK_COMPLETE_UNCONFIRMED", "Completion is a human gate; human_confirmed must be true.", "error", "/human_confirmed")]);
    if (aggregate.lifecycle.authorization === null) return failureResult("work.complete", "Work Packet is not authorized.", [diagnostic("WORK_COMPLETE_NOT_AUTHORIZED", "The whole-Work-Packet authorization gate must pass before completion.", "error", "/lifecycle/authorization")]);
    const unfinished = aggregate.specs.filter((spec) => spec.workflow_state !== "review_complete").map((spec) => spec.id);
    if (unfinished.length > 0) return failureResult("work.complete", "Not every Spec is review_complete; the whole Work Packet cannot be completed yet.", [diagnostic("WORK_COMPLETE_SPECS_UNFINISHED", `Specs not yet review_complete: ${unfinished.join(", ")}.`, "error", "/specs")]);
    // Decline path (No): route every Spec back to review_blocked for rework (parity with v1 work.complete No).
    if (parsed.selected_number === 2) {
      const declineDecision = buildHumanDecision({ action_id: "work.complete", decision_type: "aggregate_work_packet_completion", selected_number: 2, raw_response: parsed.raw_response, decision_prompt: parsed.decision_prompt, human_confirmed: true, prompt_id: parsed.prompt_id, normalized_decision: "no", final_decision: false, source_interface: "core", target_artifact_revision: aggregate.revision + 1 });
      const declined = await store.update(AggregateWorkPacketSchema.parse({ ...aggregate, decision_history: [...aggregate.decision_history, declineDecision], specs: aggregate.specs.map((spec) => ({ ...spec, workflow_state: "review_blocked" })) }));
      await auditDecision(store.root, declineDecision);
      return { ok: true, action_id: "work.complete", data: { work_packet: declined, decision: declineDecision }, diagnostics: [diagnostic("WORK_COMPLETE_DECLINED", "Completion declined; every Spec routed back to review_blocked for rework.", "warning", "/specs")], mutations: [{ artifact: "work_packet", operation: "update", paths: ["/specs"], summary: "Completion declined; Specs -> review_blocked." }], next_actions: [], summary: `Completion declined; ${declined.specs.length} Spec(s) routed to review_blocked.` };
    }
    const approval = aggregateApprovalProjection(aggregate);
    if (parsed.review_snapshot_hash !== approval.hash) return failureResult("work.complete", "Completion snapshot is stale; the Work Packet changed since review.", [diagnostic("WORK_COMPLETE_STALE", `Submitted review_snapshot_hash does not match the current whole-Work-Packet hash (${approval.hash}).`, "error", "/review_snapshot_hash")]);
    if (aggregate.lifecycle.approval !== null && aggregate.lifecycle.approval.review_snapshot_hash !== approval.hash) return failureResult("work.complete", "The approval is stale (a Spec changed since approval); re-approve before completing.", [diagnostic("WORK_COMPLETE_APPROVAL_STALE", "lifecycle.approval no longer matches the current whole-Work-Packet hash.", "error", "/lifecycle/approval")]);
    // Completion readiness — the dev-runtime proof (greenfield work can't complete until an accepted runtime
    // baseline exists). Run the v1 check per-Spec over the synthesized view (the baseline is project-level, so
    // dedupe by code). The architecture/stack that trigger it are container-level, inherited by every Spec.
    const completionErrors: Diagnostic[] = [];
    const seenCodes = new Set<string>();
    for (const spec of aggregate.specs) {
      for (const diag of await completionReadinessDiagnostics(specAsV1WorkPacket(aggregate, spec), context)) {
        if (diag.severity === "error" && !seenCodes.has(diag.code)) { seenCodes.add(diag.code); completionErrors.push(diag); }
      }
    }
    // End-state validation: run the TARGET's declared build against the FINAL tree — this is where contract
    // conformance bites (the build compiles each consumer against the producer's contract). Target-scoped; a
    // runtime-less packet (target_id null) has nothing to build. (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §10.)
    completionErrors.push(...await completionValidationDiagnostics(specAsV1WorkPacket(aggregate, aggregate.specs[0]!), context));
    // Layer 3 — runtime-less backstop: a runtime-less packet whose RECORDED changed files include executable
    // source contradicts the runtime-less claim. (Under-reporting of the footprint is caught by
    // unrecordedChangesDiagnostics below.) (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §5.)
    if (aggregate.target_id === null) {
      const config = ConfigSchema.parse((await storeForContext(context).readCurrent<Config>("config", null)).artifact);
      const changedFiles = aggregate.specs.flatMap((spec) => spec.implementation_attempts.flatMap((attempt) => attempt.changed_files));
      completionErrors.push(...runtimeLessDiffContradiction(aggregate.target_id, changedFiles, config));
    }
    completionErrors.push(...await unrecordedChangesDiagnostics(aggregate, context));
    completionErrors.push(...await acEvidenceDiagnostics(aggregate, context));
    if (completionErrors.length > 0) return failureResult("work.complete", "Work Packet is not completion-ready (the dev-runtime proof and/or end-state validation is not satisfied).", completionErrors);
    const decision = buildHumanDecision({
      action_id: "work.complete",
      decision_type: "aggregate_work_packet_completion",
      selected_number: parsed.selected_number,
      raw_response: parsed.raw_response,
      decision_prompt: parsed.decision_prompt,
      human_confirmed: true,
      prompt_id: parsed.prompt_id,
      normalized_decision: "yes",
      final_decision: true,
      approved_payload: { work_id: aggregate.id } as unknown as Record<string, JsonValue>,
      review_snapshot_hash: approval.hash,
      source_interface: "core",
      target_artifact_revision: aggregate.revision + 1
    });
    const updated = await store.update(AggregateWorkPacketSchema.parse({
      ...aggregate,
      lifecycle: { ...aggregate.lifecycle, completion: decision },
      // every Spec is review_complete (gated above); assert the transition so a future loosening of the gate
      // can't silently force an invalid jump to complete (defense-in-depth).
      specs: aggregate.specs.map((spec) => {
        assertTransition(spec.workflow_state, "complete");
        return { ...spec, workflow_state: "complete" as const };
      })
    }));
    await auditDecision(store.root, decision);
    return {
      ok: true,
      action_id: "work.complete",
      data: { work_packet: updated, decision },
      diagnostics: [],
      mutations: [{ artifact: "work_packet", operation: "update", paths: ["/lifecycle/completion"], summary: `Completed the whole Work Packet (${updated.specs.length} Spec).` }],
      next_actions: [],
      summary: `Completed Work Packet ${updated.id} — all ${updated.specs.length} Spec(s) done.`
    };
  } catch (error) {
    return failureResult("work.complete", "Work Packet completion failed.", [diagnostic("WORK_COMPLETE_REJECTED", error instanceof Error ? error.message : String(error), "error", "/work")]);
  }
}

/**
 * v2 CUTOVER — append a sealed lineage record to ONE Spec and advance it (the record-gated path; the v2
 * per-Spec equivalent of work.loop.record). This is how a Spec legitimately moves through its
 * implementation/review transitions: the sealed implementation_attempt / review_cycle / fix_instruction is the
 * evidence, and identity is enforced (implementer != reviewer, #11) before the record lands — closing the
 * evidence-free path that workSpecAdvance blocks. Only the target Spec changes. `complete` stays the
 * whole-WP gate. (v2 has no clarification record — mid-flight clarification is eliminated, §3.)
 */
export const WorkSpecRecordInputSchema = z.object({
  id: z.string().min(1),
  spec_id: z.string().min(1),
  record_kind: z.enum(["implementation_attempt", "review_cycle", "fix_instruction"]),
  record: z.record(z.string(), z.unknown()),
  next_state: WorkflowStateSchema
}).strict();

// COMPUTE-DON'T-DEMAND: `record` is the agent's SIMPLE report; work.spec.record synthesizes + seals the full
// lineage record (ids, the six hashes, authorization linkage, tree-hash placeholders) the way the orchestrator
// does — the agent never hand-authors the internal record shape.
const SimpleAttemptInputSchema = z.object({
  producer: LineageProducerSchema,
  summary: z.string(),
  changed_files: z.array(z.string()).default([]),
  kind: z.enum(["initial_implementation", "blocker_fix", "evidence_preparation"]).default("initial_implementation")
}).strict();
const SimpleReviewInputSchema = z.object({
  producer: LineageProducerSchema,
  verdict: ReviewVerdictSchema,
  summary: z.string(),
  blockers: z.array(z.object({ title: z.string(), paths: z.array(z.string()).default([]), rationale: z.string().default(""), suggested_focus: z.string().default("") }).strict()).default([]),
  non_blocking: z.array(z.object({ title: z.string(), paths: z.array(z.string()).default([]), recommendation: z.string().default("") }).strict()).default([]),
  attempt_id: z.string().optional(), // which attempt is reviewed; default = the latest sealed attempt
  kind: z.enum(["initial_review", "focused_rereview"]).default("initial_review"),
  // Evidence-restore §3b: per-AC satisfaction the reviewer declares. Presence is the accountability signal; a
  // behavioral AC can carry a command_result_ref (a passed targeted test) in evidence_refs. Optional + default []
  // so existing flows are unaffected; the completion-time "every AC proven" GATE is the next increment.
  evidence_satisfaction: z.array(z.object({ ac_id: z.string().min(1), mode: z.string().default("test"), satisfied: z.boolean(), evidence_refs: z.array(z.string()).default([]), notes: z.string().default("") }).strict()).default([])
}).strict();
const SimpleFixInputSchema = z.object({
  producer: LineageProducerSchema,
  source_review_cycle_id: z.string().optional(), // default = the latest review on the Spec
  blocker_ids: z.array(z.string()).optional(),
  coordinator_added_instructions: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  allowed_files: z.array(z.string()).default([]),
  stop_conditions: z.array(z.string()).default([])
}).strict();

export async function workSpecRecord(input: z.infer<typeof WorkSpecRecordInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  const store = aggregateStoreForContext(context);
  try {
    const parsed = WorkSpecRecordInputSchema.parse(input);
    const aggregate = await store.read(parsed.id);
    const spec = aggregate.specs.find((candidate) => candidate.id === parsed.spec_id);
    if (spec === undefined) return failureResult("work.spec.record", `Spec ${parsed.spec_id} is not part of Work Packet ${parsed.id}.`, [diagnostic("WORK_SPEC_RECORD_NOT_FOUND", `No Spec ${parsed.spec_id} in the aggregate.`, "error", "/spec_id")]);
    if (aggregate.lifecycle.authorization === null) return failureResult("work.spec.record", "Work Packet is not authorized.", [diagnostic("WORK_SPEC_RECORD_NOT_AUTHORIZED", "The whole-Work-Packet authorization gate must pass before implementing.", "error", "/lifecycle/authorization")]);
    if (parsed.next_state === "complete") return failureResult("work.spec.record", "Completion is the whole-Work-Packet gate, not a per-Spec record.", [diagnostic("WORK_SPEC_RECORD_COMPLETE_GATE", "complete is set by work.complete once every Spec is review_complete.", "error", "/next_state")]);
    if (!canTransition(spec.workflow_state, parsed.next_state)) return failureResult("work.spec.record", "Invalid workflow transition.", [diagnostic("WORK_SPEC_RECORD_INVALID", `Cannot transition Spec ${spec.id}: ${spec.workflow_state} -> ${parsed.next_state}.`, "error", "/next_state")]);

    const roleConfig = await loadRoleConfig(resolveProjectRoot(context));
    const authorizationId = aggregate.lifecycle.authorization.id;
    const approvalHash = aggregateApprovalProjection(aggregate).hash;
    const enforcementWarnings: Diagnostic[] = [];
    let updatedSpec: Spec;
    switch (parsed.record_kind) {
      case "implementation_attempt": {
        const input = SimpleAttemptInputSchema.safeParse(parsed.record);
        if (!input.success) return failureResult("work.spec.record", "Implementation-attempt report invalid.", [diagnostic("WORK_SPEC_RECORD_RECORD_INVALID", z.prettifyError(input.error), "error", "/record")]);
        // Contract-first gate: a consumer cannot START implementing (initial_implementation) until every contract it
        // depends on EXISTS on disk — the producer must freeze its contract artifact first. Existence only (the build
        // enforces shape once the validator is wired into v2); a non-contract dependency (producer.contract null) is skipped.
        if (input.data.kind === "initial_implementation") {
          const contractStore = new ContractStore(storeForContext(context).root);
          const missing: string[] = [];
          for (const edge of spec.dependencies.spec_dependencies) {
            // The consumer's PIN (edge.contract) if it set one, else the producer Spec's own contract ref.
            const producer = aggregate.specs.find((candidate) => candidate.id === edge.spec_id);
            const ref = edge.contract ?? producer?.contract ?? null;
            if (ref === null) continue; // non-contract dependency -> no gate
            if (!(await contractStore.resolves(ref))) missing.push(`${edge.spec_id} -> ${ref.id}@${ref.content_hash.slice(0, 8)}`);
          }
          for (const dep of spec.dependencies.contract_dependencies) { // cross-packet pins
            if (!(await contractStore.resolves(dep.contract))) missing.push(`${dep.contract.id}@${dep.contract.content_hash.slice(0, 8)}`);
          }
          if (missing.length > 0) return failureResult("work.spec.record", "Contract-first: a depended-on contract is not frozen yet.", [diagnostic("CONTRACT_NOT_READY", `Spec ${spec.id} cannot start implementation until its dependency contracts are frozen in the contract registry: ${missing.join(", ")}. The producer must freeze its contract (work.spec.plan contract_surface) first.`, "error", `/specs/${spec.id}/dependencies`)]);
        }
        const attemptId = `attempt:${randomUUID()}`;
        const now = isoNow();
        const authorizationType = input.data.kind === "blocker_fix" ? "fix_authorization" : input.data.kind === "evidence_preparation" ? "evidence_preparation_authorization" : "implementation_authorization";
        // Evidence-restore §3a: REAL change footprint (manifest AND vcs — vcs diffs against the baseline commit via
        // gitDiffSinceCommit, EVIDENCE_RESTORE_DESIGN B1 fixed). Set real tree hashes + WARN (non-blocking) if the
        // agent's reported changed_files disagree with reality in scope. GATED ON A SCOPE (N1): the reported-vs-real
        // warn is the only consumer of this capture at record time — the tree hashes have NO downstream consumer
        // (§3c re-diffs the whole tree at completion) — so an UNSCOPED Spec skips the manifest/diff cost entirely.
        let preTreeHash = sha256CanonicalJson({ kind: "pre", attempt: attemptId });
        let postTreeHash = sha256CanonicalJson({ kind: "post", changed: input.data.changed_files });
        let attemptDiffHash = sha256CanonicalJson({ changed: input.data.changed_files });
        const scopeGlobs = effectiveScopeGlobs(spec);
        if (spec.change_baseline !== null && scopeGlobs.length > 0) {
          const config = ConfigSchema.parse((await storeForContext(context).readCurrent<Config>("config", null)).artifact);
          const { snapshot } = await captureFileStateSnapshot({ projectRoot: resolveProjectRoot(context), config, baseline: spec.change_baseline, allowedGlobs: scopeGlobs });
          preTreeHash = spec.change_baseline.manifest?.manifest_hash ?? preTreeHash;
          postTreeHash = snapshotHash(snapshot);
          attemptDiffHash = sha256HexCanonical(snapshot.changed_files_since_packet_baseline);
          const realInScope = new Set(snapshot.changed_files_since_packet_baseline.filter((cf) => cf.allowed_by_globs).map((cf) => cf.path));
          const reported = new Set(input.data.changed_files.map(normalizeReportedPath));
          const missing = [...realInScope].filter((p) => !reported.has(p)).sort(); // real IN-SCOPE changes the agent did not report
          const overInScope = [...reported].filter((p) => { if (realInScope.has(p)) return false; const cat = classifyPath(p, config).category; return cat !== null && changedFileAllowedByGlobs(p, cat, scopeGlobs); }).sort(); // reported IN-SCOPE but not actually changed
          if (missing.length > 0 || overInScope.length > 0) {
            enforcementWarnings.push(diagnostic("FOOTPRINT_REPORTED_MISMATCH", `Spec ${spec.id}: reported changed_files don't match the real in-scope diff since authorize — changed but NOT reported [${missing.join(", ") || "none"}], reported but NOT changed [${overInScope.join(", ") || "none"}]. Accountability warning, not a block.`, "warning", `/specs/${spec.id}`));
          }
        }
        const inProgress = ImplementationAttemptSchema.parse({
          schema_version: SCHEMA_VERSION_V1, hash_algorithm: HASH_ALGORITHM_V1, id: attemptId, state: "in_progress",
          attempt_hash: null, kind: input.data.kind, producer: input.data.producer,
          authorization_id: authorizationId, authorization_type: authorizationType,
          packet_approval_hash: approvalHash, implementation_plan_hash: spec.implementation_plan_hash,
          focused_fix_instruction_id: null, evidence_preparation_scope_ref: null, source_instruction_id: null,
          pre_attempt_tree_hash: preTreeHash,
          started_at: now, completed_at: null, post_attempt_tree_hash: null, diff_hash: null,
          changed_files: input.data.changed_files, summary: input.data.summary, clarification_request_ids: []
        });
        if (inProgress.state !== "in_progress") throw new Error("expected an in_progress attempt");
        const attempt = sealImplementationAttempt(inProgress, { completed_at: now, post_attempt_tree_hash: postTreeHash, diff_hash: attemptDiffHash });
        if (roleConfig !== null) {
          const violations = enforceImplementationAttemptIdentity(attempt, roleConfig);
          const errors = violations.filter((violation) => violation.severity === "error");
          if (errors.length > 0) return failureResult("work.spec.record", "Implementation attempt violates role delegation policy; record rejected.", errors);
          enforcementWarnings.push(...violations);
        }
        // The implementer/fixer must run at the configured edit-role tier (high_judgment): code quality degrades
        // sharply on a cheaper model. Surface the configured model + flag a declared mismatch.
        const implTier = modelTierDiagnostics(roleConfig, input.data.producer.role as RoleName, input.data.producer, { below: "IMPLEMENTATION_MODEL_BELOW_CONFIGURED_TIER", unverified: "IMPLEMENTATION_MODEL_UNVERIFIED" });
        const implTierErrors = implTier.diagnostics.filter((diag) => diag.severity === "error");
        if (implTierErrors.length > 0) return failureResult("work.spec.record", "Implementation ran below the configured implementer tier; record rejected.", implTierErrors);
        enforcementWarnings.push(...implTier.diagnostics);
        updatedSpec = { ...spec, implementation_attempts: [...spec.implementation_attempts, attempt], workflow_state: parsed.next_state };
        break;
      }
      case "review_cycle": {
        const input = SimpleReviewInputSchema.safeParse(parsed.record);
        if (!input.success) return failureResult("work.spec.record", "Review report invalid.", [diagnostic("WORK_SPEC_RECORD_RECORD_INVALID", z.prettifyError(input.error), "error", "/record")]);
        const reviewedAttempt = input.data.attempt_id !== undefined ? spec.implementation_attempts.find((candidate) => candidate.id === input.data.attempt_id) : spec.implementation_attempts.at(-1);
        if (reviewedAttempt === undefined || reviewedAttempt.state !== "sealed") return failureResult("work.spec.record", "No sealed implementation attempt to review.", [diagnostic("WORK_SPEC_RECORD_NO_ATTEMPT", "Record an implementation_attempt before a review_cycle — the review binds to a sealed attempt.", "error", "/record")]);
        const reviewId = `review:${randomUUID()}`;
        const now = isoNow();
        const blockers = input.data.blockers.map((blocker, index) => buildReviewBlocker({ id: `${reviewId}:b${index}`, title: blocker.title, paths: blocker.paths, rationale: blocker.rationale, suggested_focus: blocker.suggested_focus }));
        // Any blocker forces blocked; a clean pass that still carries non-blocking issues becomes
        // pass_with_non_blocking_issues (matches the orchestrator's resolveReviewVerdict).
        const verdict = blockers.length > 0 ? "blocked" : input.data.verdict === "pass" && input.data.non_blocking.length > 0 ? "pass_with_non_blocking_issues" : input.data.verdict;
        const inProgress = ReviewCycleSchema.parse({
          schema_version: SCHEMA_VERSION_V1, hash_algorithm: HASH_ALGORITHM_V1, id: reviewId, state: "in_progress",
          review_hash: null, kind: input.data.kind, attempt_id: reviewedAttempt.id, producer: input.data.producer,
          self_review_override: false, template_id: input.data.kind === "focused_rereview" ? "focused_rereview_v1" : "focused_implementation_review_v1", template_version: 1,
          verdict: null, reviewed_at: null,
          reviewed_refs: { work_packet_revision: Math.max(1, aggregate.revision), packet_approval_hash: approvalHash, implementation_plan_hash: spec.implementation_plan_hash, evidence_policy_resolution_hash: spec.evidence_policy_resolution_hash, attempt_hash: reviewedAttempt.attempt_hash, reviewed_diff_hash: reviewedAttempt.diff_hash, post_attempt_tree_hash: reviewedAttempt.post_attempt_tree_hash, focused_fix_instruction_id: null, focused_fix_instruction_hash: null, changed_files_hash: sha256CanonicalJson({ changed: reviewedAttempt.changed_files }), evidence_refs: [], waiver_refs: [] },
          reviewed_blocker_ids: blockers.map((blocker) => blocker.id), scope_expansion_reason: null, evidence_satisfaction: input.data.evidence_satisfaction.map((entry) => ({ ac_id: entry.ac_id, mode: entry.mode, satisfied: entry.satisfied, evidence_refs: entry.evidence_refs, waiver_refs: [], notes: entry.notes })), commands: [],
          blockers, non_blocking: input.data.non_blocking, summary: input.data.summary
        });
        if (inProgress.state !== "in_progress") throw new Error("expected an in_progress review");
        const review = sealReviewCycle(inProgress, { verdict, reviewed_at: now });
        if (roleConfig !== null) {
          const violations = enforceReviewCycleIdentity(review, specAsV1WorkPacket(aggregate, spec), roleConfig);
          const errors = violations.filter((violation) => violation.severity === "error");
          if (errors.length > 0) return failureResult("work.spec.record", "Review cycle violates reviewer-identity policy; record rejected.", errors);
          enforcementWarnings.push(...violations);
        }
        updatedSpec = { ...spec, review_cycles: [...spec.review_cycles, review], workflow_state: parsed.next_state };
        break;
      }
      case "fix_instruction": {
        const input = SimpleFixInputSchema.safeParse(parsed.record);
        if (!input.success) return failureResult("work.spec.record", "Fix-instruction report invalid.", [diagnostic("WORK_SPEC_RECORD_RECORD_INVALID", z.prettifyError(input.error), "error", "/record")]);
        const sourceReview = input.data.source_review_cycle_id !== undefined ? spec.review_cycles.find((candidate) => candidate.id === input.data.source_review_cycle_id) : spec.review_cycles.at(-1);
        if (sourceReview === undefined || sourceReview.state !== "sealed") return failureResult("work.spec.record", "No sealed source review cycle for the fix.", [diagnostic("WORK_SPEC_RECORD_NO_REVIEW", "A focused fix references a sealed review_cycle's blockers — record the blocked review first.", "error", "/record")]);
        const built = buildFocusedFixInstruction({ id: `fix:${randomUUID()}`, producer: input.data.producer, source_review: sourceReview, ...(input.data.blocker_ids !== undefined ? { blocker_ids: input.data.blocker_ids } : {}), coordinator_added_instructions: input.data.coordinator_added_instructions, constraints: input.data.constraints, allowed_files: input.data.allowed_files, allowed_globs: spec.scope.allowed_globs, stop_conditions: input.data.stop_conditions });
        const fixErrors = built.diagnostics.filter((diag) => diag.severity === "error");
        if (built.instruction === null || fixErrors.length > 0) return failureResult("work.spec.record", "Focused fix instruction invalid.", fixErrors.length > 0 ? fixErrors : [diagnostic("WORK_SPEC_RECORD_FIX_INVALID", "Could not build the fix instruction.", "error", "/record")]);
        updatedSpec = { ...spec, focused_fix_instructions: [...spec.focused_fix_instructions, built.instruction], workflow_state: parsed.next_state };
        break;
      }
    }

    const updated = await store.update(AggregateWorkPacketSchema.parse({ ...aggregate, specs: aggregate.specs.map((candidate) => (candidate.id === parsed.spec_id ? updatedSpec : candidate)) }));
    return {
      ok: true,
      action_id: "work.spec.record",
      data: { work_packet: updated, spec_id: parsed.spec_id, workflow_state: parsed.next_state },
      diagnostics: enforcementWarnings,
      mutations: [{ artifact: "work_packet", operation: "update", paths: [`/specs/${parsed.spec_id}/${parsed.record_kind}`, `/specs/${parsed.spec_id}/workflow_state`], summary: `Appended ${parsed.record_kind} to Spec ${parsed.spec_id}; -> ${parsed.next_state}.` }],
      next_actions: [],
      summary: `Spec ${parsed.spec_id}: recorded ${parsed.record_kind}, advanced to ${parsed.next_state}.`
    };
  } catch (error) {
    return failureResult("work.spec.record", "Spec record failed.", [diagnostic("WORK_SPEC_RECORD_REJECTED", error instanceof Error ? error.message : String(error), "error", "/work")]);
  }
}

/**
 * v2 CUTOVER — the Work Breakdown (§3/§5b): decompose a Work Packet into its embedded `specs[]`. In v2 the
 * breakdown IS the `specs[]` array — there is no separate Plan artifact and no separate child Work Packets — so
 * this REPLACES the undecomposed self-Spec with the breakdown Specs (each its own classification/scope; the
 * container keeps the inherited intent + structural decisions). Must happen BEFORE the bulk approval (you
 * decompose, then approve the whole Work Packet over all its Specs at once). Requires >= 2 Specs — an
 * undecomposed Work Packet just stays its single self-Spec. Replacing the self-Spec DISCARDS any content drafted
 * on it (e.g. ACs), so decompose FIRST, then draft ACs per-Spec — never the other way around.
 *
 * NOTE (must-restore-before-switch): the v1 breakdown also runs spec homogeneity + the forced-classification
 * gate (no Spec bulk-approved unclassified) + the independent spec review; ACs are drafted per-Spec after the
 * breakdown. This increment builds the structural decomposition; those gates land with the readiness restore.
 */
export const WorkDecomposeInputSchema = z.object({
  id: z.string().min(1),
  slices: z.array(z.object({
    id: z.string().min(1).optional(),
    title: z.string().min(1),
    classification: WorkClassificationSchema,
    allowed_globs: z.array(z.string()).optional()
  }).strict()).min(2)
}).strict();

export async function workDecompose(input: z.infer<typeof WorkDecomposeInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  const store = aggregateStoreForContext(context);
  try {
    const parsed = WorkDecomposeInputSchema.parse(input);
    const aggregate = await store.read(parsed.id);
    if (aggregate.lifecycle.approval !== null) return failureResult("work.decompose", "Work Packet is already approved; decompose before the bulk approval.", [diagnostic("WORK_DECOMPOSE_APPROVED", "The Work Breakdown defines what gets approved, so it must run before approval. Editing the breakdown after approval re-stales it — re-approve.", "error", "/lifecycle/approval")]);
    const specs = parsed.slices.map((slice, index) => specFromWorkPacket(buildDefaultWorkPacket({
      id: slice.id ?? `${aggregate.id}-s${index + 1}`,
      title: slice.title,
      goal: aggregate.intent.goal, // inherited; the Spec view drops container-level intent
      classification: slice.classification,
      allowed_globs: slice.allowed_globs
    })));
    const updated = await store.update(AggregateWorkPacketSchema.parse({ ...aggregate, specs }));
    return {
      ok: true,
      action_id: "work.decompose",
      data: { work_packet: updated },
      diagnostics: [],
      mutations: [{ artifact: "work_packet", operation: "update", paths: ["/specs"], summary: `Decomposed into ${updated.specs.length} Specs: ${updated.specs.map((spec) => `${spec.id} (${spec.classification})`).join(", ")}.` }],
      next_actions: [],
      summary: `Decomposed Work Packet ${updated.id} into ${updated.specs.length} Specs (approve the whole Work Packet next).`
    };
  } catch (error) {
    return failureResult("work.decompose", "Work Packet decomposition failed.", [diagnostic("WORK_DECOMPOSE_REJECTED", error instanceof Error ? error.message : String(error), "error", "/work")]);
  }
}

/**
 * v2 CUTOVER — resolve a Spec's mockup question (companion to the mockup approval gate). For a UI Spec the mockup
 * decision must be answered before approval: "present" (a mockup exists — derive ACs from it) or "none" (no
 * mockup — draft features directly). Pre-approval only. (workflow_state/mockup are not in the whole-WP approval hash,
 * so resolving the mockup does not stale the whole-WP coherence binding — but mockup_decision IS in the per-Spec
 * review hash, so it does re-stale that Spec's per-Spec quality coverage, which is the stricter, correct behavior.)
 */
export const WorkSpecMockupInputSchema = z.object({
  id: z.string().min(1),
  spec_id: z.string().min(1),
  mockup_decision: z.enum(["none", "present"]),
  // "Do you have a mockup/design?" is a HUMAN question — not an agent field. Same human-confirmation contract as
  // work.choice: the agent must present the prompt and record the human's ACTUAL answer; it CANNOT set this itself.
  human_confirmed: z.boolean(),
  raw_response: z.string().min(1),
  decision_prompt: z.string().min(1)
}).strict();

export async function workSpecMockup(input: z.infer<typeof WorkSpecMockupInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  const store = aggregateStoreForContext(context);
  try {
    const parsed = WorkSpecMockupInputSchema.parse(input);
    // The mockup decision is the FIRST UI question and it is the HUMAN's: setting "none" on their behalf (and then
    // inventing the UI) is exactly the failure this gate prevents. Require a real human confirmation, like work.choice.
    if (parsed.human_confirmed !== true) return failureResult("work.spec.mockup", "The mockup decision is a HUMAN question — ask whether they have a mockup/design and record their actual answer (human_confirmed: true, raw_response). Do NOT set it for them.", [diagnostic("WORK_SPEC_MOCKUP_UNCONFIRMED", "Whether the human has a mockup is their call, not the agent's. Present the question, then record human_confirmed + their raw_response; setting 'none' unconfirmed is what let an agent invent a UI the human never asked for.", "error", "/human_confirmed")]);
    const aggregate = await store.read(parsed.id);
    if (aggregate.lifecycle.approval !== null) return failureResult("work.spec.mockup", "Work Packet is already approved; resolve the mockup before approval.", [diagnostic("WORK_SPEC_MOCKUP_APPROVED", "The mockup decision is a pre-approval gate.", "error", "/lifecycle/approval")]);
    const spec = aggregate.specs.find((candidate) => candidate.id === parsed.spec_id);
    if (spec === undefined) return failureResult("work.spec.mockup", `Spec ${parsed.spec_id} is not part of Work Packet ${parsed.id}.`, [diagnostic("WORK_SPEC_MOCKUP_NOT_FOUND", `No Spec ${parsed.spec_id} in the aggregate.`, "error", "/spec_id")]);
    const updated = await store.update(AggregateWorkPacketSchema.parse({ ...aggregate, specs: aggregate.specs.map((candidate) => (candidate.id === parsed.spec_id ? { ...candidate, mockup_decision: parsed.mockup_decision } : candidate)) }));
    return {
      ok: true,
      action_id: "work.spec.mockup",
      data: { work_packet: updated, spec_id: parsed.spec_id, mockup_decision: parsed.mockup_decision },
      diagnostics: [],
      mutations: [{ artifact: "work_packet", operation: "update", paths: [`/specs/${parsed.spec_id}/mockup_decision`], summary: `Resolved mockup for Spec ${parsed.spec_id}: ${parsed.mockup_decision}.` }],
      next_actions: [],
      summary: `Spec ${parsed.spec_id} mockup -> ${parsed.mockup_decision}.`
    };
  } catch (error) {
    return failureResult("work.spec.mockup", "Spec mockup resolution failed.", [diagnostic("WORK_SPEC_MOCKUP_REJECTED", error instanceof Error ? error.message : String(error), "error", "/work")]);
  }
}

/**
 * v2 CUTOVER — draft a Spec's acceptance criteria (per-Spec AC drafting; the readiness companion to AC
 * validation). ACs are pre-approval (they define what gets approved — they ARE in the whole-WP approval hash),
 * so this is rejected once the Work Packet is approved (a re-draft would re-stale the approval — re-approve
 * instead). The ACs are validated on the way in (the v1 validateAcceptanceCriteria source-evidence checks).
 */
export const WorkSpecAcsInputSchema = z.object({
  id: z.string().min(1),
  spec_id: z.string().min(1),
  acceptance_criteria: z.array(AcceptanceCriterionSchema),
  // the agent anchoring these ACs — recorded as the Spec author so a later spec review can enforce reviewer != author.
  author_agent_instance_id: z.string().min(1).optional()
}).strict();

export async function workSpecAcs(input: z.infer<typeof WorkSpecAcsInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  const store = aggregateStoreForContext(context);
  try {
    const parsed = WorkSpecAcsInputSchema.parse(input);
    const aggregate = await store.read(parsed.id);
    if (aggregate.lifecycle.approval !== null) return failureResult("work.spec.acs", "Work Packet is already approved; drafting ACs would re-stale the approval — re-approve instead.", [diagnostic("WORK_SPEC_ACS_APPROVED", "ACs are a pre-approval input (they are in the whole-WP approval hash).", "error", "/lifecycle/approval")]);
    const spec = aggregate.specs.find((candidate) => candidate.id === parsed.spec_id);
    if (spec === undefined) return failureResult("work.spec.acs", `Spec ${parsed.spec_id} is not part of Work Packet ${parsed.id}.`, [diagnostic("WORK_SPEC_ACS_NOT_FOUND", `No Spec ${parsed.spec_id} in the aggregate.`, "error", "/spec_id")]);
    // Mockup-FIRST: a UI Spec must resolve its mockup question BEFORE any ACs are drafted, so the mockup is the
    // FIRST feature interaction (not 'what features do you want') and UI ACs aren't drafted from a guess + discarded.
    if (mockupGateDiagnostics(specAsV1WorkPacket(aggregate, spec)).some((diag) => diag.code === "MOCKUP_DECISION_REQUIRED")) {
      return failureResult("work.spec.acs", "Resolve the mockup question before drafting ACs for a UI Spec.", [diagnostic("MOCKUP_DECISION_REQUIRED", `Spec ${parsed.spec_id} is UI: resolve its mockup with work.spec.mockup (present/none) BEFORE drafting acceptance criteria. For UI work the mockup question is the FIRST feature interaction — do NOT ask 'what features do you want' first.`, "error", `/specs/${parsed.spec_id}/mockup_decision`)]);
    }
    // COMPUTE-DON'T-DEMAND: derive each source-derived AC's evidence_hash (overwriting any placeholder/omitted/wrong
    // value) BEFORE validating + storing, so the agent never computes or matches it. Then validate the normalized ACs.
    const acs = normalizeAcceptanceCriteria(parsed.acceptance_criteria);
    const acDiagnostics = await validateAcceptanceCriteria(acs, context);
    const errors = acDiagnostics.filter((diag) => diag.severity === "error");
    if (errors.length > 0) return failureResult("work.spec.acs", "Acceptance criteria are invalid; not drafted.", errors);
    const updated = await store.update(AggregateWorkPacketSchema.parse({ ...aggregate, specs: aggregate.specs.map((candidate) => (candidate.id === parsed.spec_id ? { ...candidate, acceptance_criteria: acs, spec_author_agent_instance_id: parsed.author_agent_instance_id ?? candidate.spec_author_agent_instance_id } : candidate)) }));
    return {
      ok: true,
      action_id: "work.spec.acs",
      data: { work_packet: updated, spec_id: parsed.spec_id },
      diagnostics: acDiagnostics.filter((diag) => diag.severity !== "error"),
      mutations: [{ artifact: "work_packet", operation: "update", paths: [`/specs/${parsed.spec_id}/acceptance_criteria`], summary: `Drafted ${parsed.acceptance_criteria.length} AC(s) on Spec ${parsed.spec_id}.` }],
      next_actions: [],
      summary: `Spec ${parsed.spec_id}: drafted ${parsed.acceptance_criteria.length} acceptance criteria.`
    };
  } catch (error) {
    return failureResult("work.spec.acs", "Spec AC drafting failed.", [diagnostic("WORK_SPEC_ACS_REJECTED", error instanceof Error ? error.message : String(error), "error", "/work")]);
  }
}

// A plan's expected_files should forecast the WHOLE footprint — the test files and (when the Spec requires docs)
// the doc files, not only the implementation files. Cross-language path heuristics:
function isTestFilePath(p: string): boolean {
  const s = p.toLowerCase();
  return /(\.|_)(test|spec)\.[a-z0-9]+$/.test(s) || /(^|\/)test_[^/]+\.[a-z0-9]+$/.test(s) || /(^|\/)(tests?|__tests__|specs?)\//.test(s);
}
function isDocFilePath(p: string): boolean {
  const s = p.toLowerCase();
  // Doc extensions, a docs/ dir, README/CHANGELOG as a filename (NOT a substring like readme-helper.ts), or an
  // OpenAPI/Swagger spec file.
  return /\.(md|mdx|rst|adoc)$/.test(s) || /(^|\/)docs?\//.test(s) || /(^|\/)(readme|changelog)(\.[a-z]+)?$/.test(s) || /(openapi|swagger)\.(ya?ml|json)$/.test(s);
}

/**
 * Set ONE Spec's implementation plan (the per-Spec implementation planning the workflow does BEFORE the spec
 * review + the bulk approval). Ports v1 work.plan.set: builds the standard/waived plan projection, recomputes the
 * Spec's work-kind + evidence-policy resolutions (+ hashes) from the new plan so the cached fields stay consistent
 * with the approval projection. Pre-approval (the plan is in the whole-WP approval hash).
 */
const StandardSpecPlanInputSchema = z.object({
  kind: z.literal("standard_plan"),
  template_id: z.string().min(1),
  template_version: z.number().int().positive(),
  source_refs: z.array(SourceArtifactRefV1Schema).optional(),
  summary: z.string(),
  approach: z.array(z.string()),
  expected_files: z.array(PlanExpectedFileV1Schema),
  tests: z.array(PlanTestV1Schema),
  risks: z.array(z.string()).optional(),
  out_of_scope_reminders: z.array(z.string()).optional(),
  // The dev-runtime proof design — REQUIRED at approval on >=1 Spec when the packet establishes a new app
  // target whose platform needs a real dev runtime (DEV_RUNTIME_PROOF_PLAN_REQUIRED); null/omitted otherwise.
  dev_runtime_proof: DevRuntimeProofPlanV1Schema.nullable().optional()
}).strict();
const WaivedSpecPlanInputSchema = z.object({
  kind: z.literal("plan_waived_noop"),
  human_exception_ref: HumanDecisionRefV1Schema,
  reason: z.string(),
  authorization_behavior: z.enum(["no_product_code_edits", "non_implementation_only"])
}).strict();

export const WorkSpecPlanInputSchema = z.object({
  id: z.string().min(1),
  spec_id: z.string().min(1),
  plan: z.union([StandardSpecPlanInputSchema, WaivedSpecPlanInputSchema]),
  // REQUIRED, no default — the planner must declare its dependency EDGES (or an explicit empty list). The call
  // bounces without it, which is how the planner learns the field exists (the schema, not the prose, is the teacher).
  dependencies: SpecDependenciesSchema,
  // The producer's typed SURFACE — a hard JSON-Schema of the interface (operations + input/output types). Spec Guard
  // freezes + hashes it into the committed ContractStore and owns it. Required (via the gate) for contract-producing
  // classifications. `contract_id` names the contract's first-class identity (defaults to the Spec id).
  contract_surface: z.unknown().optional(),
  contract_id: z.string().min(1).optional()
}).strict();

export async function workSpecPlan(input: z.infer<typeof WorkSpecPlanInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  const store = aggregateStoreForContext(context);
  try {
    const parsed = WorkSpecPlanInputSchema.parse(input);
    const aggregate = await store.read(parsed.id);
    if (aggregate.lifecycle.approval !== null) return failureResult("work.spec.plan", "Work Packet is already approved; changing a Spec's plan would re-stale the approval — re-approve instead.", [diagnostic("WORK_SPEC_PLAN_APPROVED", "The implementation plan is a pre-approval input (it is in the whole-WP approval hash).", "error", "/lifecycle/approval")]);
    const spec = aggregate.specs.find((candidate) => candidate.id === parsed.spec_id);
    if (spec === undefined) return failureResult("work.spec.plan", `Spec ${parsed.spec_id} is not part of Work Packet ${parsed.id}.`, [diagnostic("WORK_SPEC_PLAN_NOT_FOUND", `No Spec ${parsed.spec_id} in the aggregate.`, "error", "/spec_id")]);
    // The plan's expected_files must forecast its TEST files (and DOC files when the Spec requires docs), not only
    // the implementation files — so the footprint the reviewer + human approve is the complete one.
    if (parsed.plan.kind === "standard_plan") {
      const paths = parsed.plan.expected_files.map((file) => file.path);
      const planErrors: Diagnostic[] = [];
      if (spec.classification !== "operational_document" && !paths.some(isTestFilePath)) {
        planErrors.push(diagnostic("PLAN_EXPECTED_TEST_FILE_MISSING", `Spec ${parsed.spec_id}: the implementation plan's expected_files must include the TEST file(s) the work will add/modify (e.g. a *.test.ts), not only the implementation files.`, "error", "/plan/expected_files"));
      }
      if ((spec.docs.policy === "required" || spec.docs.policy === "changed") && !paths.some(isDocFilePath)) {
        planErrors.push(diagnostic("PLAN_EXPECTED_DOC_FILE_MISSING", `Spec ${parsed.spec_id} requires docs (docs.policy=${spec.docs.policy}); the plan's expected_files must include the documentation file(s) it will produce (e.g. docs/*.md or an OpenAPI spec).`, "error", "/plan/expected_files"));
      }
      if (planErrors.length > 0) return failureResult("work.spec.plan", "The implementation plan must forecast its test + doc files in expected_files.", planErrors);
    }
    // Declared dependency EDGES must resolve to real sibling Specs (no self-edge). The build verifies the actual
    // exports and the reviewer judges truthfulness; here we only confirm the edge points somewhere real.
    const knownSpecIds = new Set(aggregate.specs.map((candidate) => candidate.id));
    const depErrors: Diagnostic[] = [];
    for (const edge of parsed.dependencies.spec_dependencies) {
      if (edge.spec_id === parsed.spec_id) depErrors.push(diagnostic("DEPENDENCY_SELF", `Spec ${parsed.spec_id} cannot declare a dependency on itself.`, "error", "/dependencies/spec_dependencies"));
      else if (!knownSpecIds.has(edge.spec_id)) depErrors.push(diagnostic("DEPENDENCY_SPEC_UNKNOWN", `Spec ${parsed.spec_id} declares a dependency on '${edge.spec_id}', which is not a Spec in this Work Packet.`, "error", "/dependencies/spec_dependencies"));
    }
    // Cross-PACKET contract dependencies: the pinned contract must already be FROZEN in the registry (it was produced
    // + committed by another packet). This is how a new Work Packet references an existing contract.
    const planContractStore = new ContractStore(storeForContext(context).root);
    for (const dep of parsed.dependencies.contract_dependencies) {
      if (!(await planContractStore.resolves(dep.contract))) depErrors.push(diagnostic("CONTRACT_DEP_UNKNOWN", `Spec ${parsed.spec_id} pins cross-packet contract ${dep.contract.id}@${dep.contract.content_hash.slice(0, 8)}, which is not frozen in the contract registry. The contract must be produced + committed before another packet can depend on it.`, "error", "/dependencies/contract_dependencies"));
    }
    if (depErrors.length > 0) return failureResult("work.spec.plan", "Declared dependencies must resolve (sibling Specs in this Work Packet, or frozen cross-packet contracts).", depErrors);
    // The producer contract: a contract-producing classification must FREEZE its typed surface — Spec Guard registers
    // + hashes it in the committed ContractStore and OWNS it; Spec.contract becomes a ref. Re-planning without a new
    // surface keeps the existing frozen contract. (CONTRACT_NOT_IN_SCOPE retired: the contract is a registry artifact
    // Spec Guard owns, not an in-tree path.)
    let contract = spec.contract;
    if (parsed.contract_surface !== undefined) {
      contract = await new ContractStore(storeForContext(context).root).put(parsed.contract_id ?? parsed.spec_id, parsed.contract_surface, { work_id: parsed.id, spec_id: parsed.spec_id });
    } else if (contract === null && (CONTRACT_PRODUCING_CLASSIFICATIONS as readonly string[]).includes(spec.classification)) {
      return failureResult("work.spec.plan", "The contract declaration is invalid.", [diagnostic("CONTRACT_REQUIRED", `Spec ${parsed.spec_id} (${spec.classification}) is a contract-producing surface; FREEZE its typed interface by passing contract_surface (a hard JSON-Schema of the operations + input/output types). Spec Guard owns the authoritative contract.`, "error", "/contract_surface")]);
    }
    const plan = parsed.plan.kind === "standard_plan"
      ? buildStandardImplementationPlanProjectionV1({ identity_binding_policy: "content_only", template_id: parsed.plan.template_id, template_version: parsed.plan.template_version, source_refs: parsed.plan.source_refs ?? [], summary: parsed.plan.summary, approach: parsed.plan.approach, expected_files: parsed.plan.expected_files, tests: parsed.plan.tests, risks: parsed.plan.risks ?? [], out_of_scope_reminders: parsed.plan.out_of_scope_reminders ?? [], dev_runtime_proof: parsed.plan.dev_runtime_proof ?? null, approval_bound_producer_ref: null })
      : buildPlanWaivedNoopProjectionV1({ human_exception_ref: parsed.plan.human_exception_ref, reason: parsed.plan.reason, authorization_behavior: parsed.plan.authorization_behavior });
    const planHash = implementationPlanHash(plan);
    // Recompute the Spec's work-kind + evidence-policy resolutions from the new plan (via the v1 projection over
    // the synthesized Spec view) so the cached fields stay consistent with the approval projection.
    const withPlan = WorkPacketSchema.parse({ ...specAsV1WorkPacket(aggregate, spec), implementation_plan: plan, implementation_plan_hash: planHash });
    const projection = buildApprovedWorkPacketProjectionV1(withPlan).projection;
    const updatedSpec = { ...spec, implementation_plan: plan, implementation_plan_hash: planHash, dependencies: parsed.dependencies, contract, work_kind_resolution: projection.work_kind_resolution, work_kind_resolution_hash: projection.work_kind_resolution_hash, evidence_policy_resolution: projection.evidence_policy_resolution, evidence_policy_resolution_hash: projection.evidence_policy_resolution_hash };
    const updated = await store.update(AggregateWorkPacketSchema.parse({ ...aggregate, specs: aggregate.specs.map((candidate) => (candidate.id === parsed.spec_id ? updatedSpec : candidate)) }));
    return {
      ok: true,
      action_id: "work.spec.plan",
      data: { work_packet: updated, spec_id: parsed.spec_id },
      diagnostics: [],
      mutations: [{ artifact: "work_packet", operation: "update", paths: [`/specs/${parsed.spec_id}/implementation_plan`], summary: `Set ${plan.kind} implementation plan on Spec ${parsed.spec_id}.` }],
      next_actions: [],
      summary: `Spec ${parsed.spec_id}: set ${plan.kind} implementation plan.`
    };
  } catch (error) {
    return failureResult("work.spec.plan", "Spec implementation plan could not be set.", [diagnostic("WORK_SPEC_PLAN_REJECTED", error instanceof Error ? error.message : String(error), "error", "/work")]);
  }
}

/**
 * v2 — record the PRE-approval INDEPENDENT WHOLE-WORK-PACKET review (Part C). ONE reviewer subagent reviews ALL
 * Specs TOGETHER — so cross-Spec coherence (Specs that must synergize, not step on each other) is caught — AFTER
 * every Spec is drafted (>=1 AC) and planned (work.spec.plan), and BEFORE the human bulk approval. Recorded on the
 * CONTAINER, binding to the CURRENT whole-WP content hash (a later edit to ANY Spec stales it). Reviewer
 * INDEPENDENCE is enforced against EVERY Spec author; a self-review of any Spec is rejected. System-actor record
 * (no HumanDecision); the human gate is still work.approve.
 */
export const WorkReviewInputSchema = z.object({
  id: z.string().min(1),
  // Optional: a PER-SPEC pre-approval review (parallelizable). Omit for the whole-WP coherence review (all Specs).
  spec_id: z.string().optional(),
  producer: LineageProducerSchema,
  verdict: SpecReviewVerdictSchema,
  blockers: z.array(SpecReviewBlockerSchema).default([]),
  summary: z.string()
}).strict();

export async function workReview(input: z.infer<typeof WorkReviewInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  const store = aggregateStoreForContext(context);
  try {
    const parsed = WorkReviewInputSchema.parse(input);
    const aggregate = await store.read(parsed.id);
    // Pre-approval gate, but allow re-review when the approval is STALE (a Spec changed since approval): the
    // content the reviewer would re-check has moved, so a fresh review is exactly what's needed before re-approval.
    if (aggregate.lifecycle.approval !== null && aggregate.lifecycle.approval.review_snapshot_hash === aggregateApprovalProjection(aggregate).hash) {
      return failureResult("work.review", "Work Packet is already approved and current; the whole-WP review is a pre-approval gate.", [diagnostic("WORK_REVIEW_APPROVED", "The review is only needed when the approval is absent or stale.", "error", "/lifecycle/approval")]);
    }
    // PER-SPEC pre-approval review (parallelizable): record on THIS Spec, pinned to its Spec-local hash. Readiness is
    // narrower than the whole-WP review — only this Spec and the Specs it depends on must be drafted+planned (so its
    // dependency edges resolve), letting reviewers fan out before the whole WP is complete. Independence is vs THIS
    // Spec's author; the all-author-independent coherence guarantee is carried by the required whole-WP pass (gate).
    if (parsed.spec_id !== undefined) {
      const target = aggregate.specs.find((spec) => spec.id === parsed.spec_id);
      if (target === undefined) return failureResult("work.review", `Spec ${parsed.spec_id} is not part of Work Packet ${parsed.id}.`, [diagnostic("WORK_REVIEW_SPEC_NOT_FOUND", `No Spec ${parsed.spec_id} in the aggregate.`, "error", "/spec_id")]);
      const dependencyIds = new Set(target.dependencies.spec_dependencies.map((edge) => edge.spec_id));
      const notReady = aggregate.specs.filter((spec) => (spec.id === target.id || dependencyIds.has(spec.id)) && (spec.acceptance_criteria.length === 0 || spec.implementation_plan === null)).map((spec) => spec.id);
      if (notReady.length > 0) return failureResult("work.review", "The Spec and its dependencies must be drafted + planned before a per-Spec review.", [diagnostic("SPEC_REVIEW_NOT_READY", `Not yet drafted+planned: ${notReady.join(", ")}. A per-Spec review needs this Spec and every Spec it depends on drafted (work.spec.acs) + planned (work.spec.plan).`, "error", `/specs/${target.id}`)]);
      const perSpecCycle = detectDependencyCycle(aggregate.specs);
      if (perSpecCycle !== null) return failureResult("work.review", `Cross-Spec dependencies form a cycle: ${perSpecCycle.join(" -> ")}.`, [diagnostic("DEPENDENCY_CYCLE", `Dependency cycle: ${perSpecCycle.join(" -> ")}.`, "error", "/specs")]);
      const specHash = specReviewContentHash(target);
      const record: SpecReviewCycle = SpecReviewCycleSchema.parse({
        schema_version: SCHEMA_VERSION_V1, hash_algorithm: HASH_ALGORITHM_V1, id: `spec_review:${randomUUID()}`,
        producer: parsed.producer, reviewed_ac_content_hash: specHash, reviewed_work_breakdown_ref: null,
        review_scope: "spec", reviewed_spec_content_hashes: [{ spec_id: target.id, hash: specHash }],
        blockers: parsed.blockers, summary: parsed.summary, state: "sealed", verdict: parsed.verdict, reviewed_at: isoNow()
      });
      const perSpecRoleConfig = await loadRoleConfig(resolveProjectRoot(context));
      const perSpecViolations: Diagnostic[] = [];
      if (perSpecRoleConfig !== null) perSpecViolations.push(...enforceSpecReviewIdentity(record, specAsV1WorkPacket(aggregate, target), perSpecRoleConfig));
      const perSpecTier = modelTierDiagnostics(perSpecRoleConfig, "reviewer", parsed.producer, { below: "REVIEWER_MODEL_BELOW_CONFIGURED_TIER", unverified: "REVIEWER_MODEL_UNVERIFIED" });
      perSpecViolations.push(...perSpecTier.diagnostics);
      const perSpecSeen = new Set<string>();
      const perSpecDeduped = perSpecViolations.filter((violation) => { const key = `${violation.code}:${violation.message}`; if (perSpecSeen.has(key)) return false; perSpecSeen.add(key); return true; });
      const perSpecErrors = perSpecDeduped.filter((violation) => violation.severity === "error");
      if (perSpecErrors.length > 0) return failureResult("work.review", "Per-Spec review violates reviewer-identity policy; record rejected.", perSpecErrors);
      const perSpecUpdated = await store.update(AggregateWorkPacketSchema.parse({ ...aggregate, specs: aggregate.specs.map((spec) => spec.id === target.id ? { ...spec, spec_review_cycles: [...spec.spec_review_cycles, record] } : spec) }));
      return {
        ok: true, action_id: "work.review",
        data: { work_packet: perSpecUpdated, review: record, independence: independenceBasis(record.producer.agent_instance_id, target.spec_author_agent_instance_id), expected_reviewer_model: perSpecTier.expectedModel, implementation_order: topologicalOrder(aggregate.specs) },
        diagnostics: perSpecDeduped.filter((violation) => violation.severity !== "error"),
        mutations: [{ artifact: "work_packet", operation: "update", paths: [`/specs/${target.id}/spec_review_cycles`], summary: `Recorded per-Spec review for ${target.id} (${parsed.verdict}).` }],
        next_actions: [],
        summary: `Per-Spec review recorded (${parsed.verdict}) for ${target.id}.`
      };
    }
    // Ordering: the whole-WP review runs only AFTER every Spec is drafted (>=1 AC) and planned (implementation plan
    // set), so the reviewer sees the COMPLETE set of Specs and can judge how they fit together.
    const undrafted = aggregate.specs.filter((spec) => spec.acceptance_criteria.length === 0).map((spec) => spec.id);
    if (undrafted.length > 0) return failureResult("work.review", "Every Spec must be drafted before the whole-WP review.", [diagnostic("SPEC_REVIEW_DRAFT_INCOMPLETE", `Spec(s) without acceptance criteria: ${undrafted.join(", ")}. Draft ALL Specs (work.spec.acs) before work.review.`, "error", "/specs")]);
    const planless = aggregate.specs.filter((spec) => spec.implementation_plan === null).map((spec) => spec.id);
    if (planless.length > 0) return failureResult("work.review", "Every Spec must have an implementation plan before the whole-WP review.", [diagnostic("IMPLEMENTATION_PLAN_REQUIRED", `Spec(s) without an implementation plan: ${planless.join(", ")}. Set each (work.spec.plan) before work.review — the review covers the ACs AND the plans across ALL Specs.`, "error", "/specs")]);
    // Cross-Spec dependency edges must form a DAG. A cycle (A depends on B depends on A) is a design smell — make
    // it one Spec, or extract a shared-contract Spec. Edges were already resolved to real Specs at plan time.
    const cycle = detectDependencyCycle(aggregate.specs);
    if (cycle !== null) return failureResult("work.review", `Cross-Spec dependencies form a cycle: ${cycle.join(" -> ")}. Make it one Spec, or extract a shared-contract Spec.`, [diagnostic("DEPENDENCY_CYCLE", `Dependency cycle: ${cycle.join(" -> ")}.`, "error", "/specs")]);
    // Edge↔producer cross-check: the producer Spec.contract is the AUTHORITY; if a consumer PINNED a contract ref on
    // its edge, it must equal the producer's current frozen contract (id + content_hash) — else the pin is stale/wrong.
    const mismatchErrors: Diagnostic[] = [];
    for (const consumer of aggregate.specs) {
      for (const edge of consumer.dependencies.spec_dependencies) {
        if (edge.contract === null) continue; // no pin -> derives from the producer; nothing to cross-check
        const producer = aggregate.specs.find((candidate) => candidate.id === edge.spec_id);
        if (producer !== undefined && producer.contract !== null && (edge.contract.id !== producer.contract.id || edge.contract.content_hash !== producer.contract.content_hash)) {
          mismatchErrors.push(diagnostic("CONTRACT_EDGE_MISMATCH", `Spec ${consumer.id} pins its dependency on ${edge.spec_id} to contract ${edge.contract.id}@${edge.contract.content_hash.slice(0, 8)}, but ${edge.spec_id} produces ${producer.contract.id}@${producer.contract.content_hash.slice(0, 8)}. Re-pin to the producer's current frozen contract.`, "error", `/specs/${consumer.id}/dependencies`));
        }
      }
    }
    if (mismatchErrors.length > 0) return failureResult("work.review", "A dependency edge disagrees with the producer's declared contract.", mismatchErrors);
    const record: SpecReviewCycle = SpecReviewCycleSchema.parse({
      schema_version: SCHEMA_VERSION_V1,
      hash_algorithm: HASH_ALGORITHM_V1,
      id: `spec_review:${randomUUID()}`,
      producer: parsed.producer,
      reviewed_ac_content_hash: aggregateApprovalProjection(aggregate).hash, // the WHOLE-WP content hash (all Specs)
      reviewed_work_breakdown_ref: null, // v2: the breakdown IS specs[]; there is no separate Plan ref to bind
      review_scope: "whole_wp",
      // Record EVERY Spec's local hash so this one review provides per-Spec quality coverage: a later single-Spec
      // edit then re-reviews only that Spec (the others stay covered), while the whole-WP hash above stales coherence.
      reviewed_spec_content_hashes: aggregate.specs.map((spec) => ({ spec_id: spec.id, hash: specReviewContentHash(spec) })),
      blockers: parsed.blockers,
      summary: parsed.summary,
      state: "sealed",
      verdict: parsed.verdict,
      reviewed_at: isoNow()
    });
    // Independence is enforced against EVERY Spec author: one reviewer for all Specs must differ from each author
    // (a self-review of any Spec is invalid). Reuse the per-Spec identity check across every Spec, then dedupe.
    const roleConfig = await loadRoleConfig(resolveProjectRoot(context));
    const violations: Diagnostic[] = [];
    if (roleConfig !== null) for (const spec of aggregate.specs) violations.push(...enforceSpecReviewIdentity(record, specAsV1WorkPacket(aggregate, spec), roleConfig));
    // Review is where capability matters most, so the reviewer must run at the configured reviewer-role tier (e.g.
    // high_judgment -> claude-opus-4-8), NOT whatever model the coordinator happens to inherit. Spec Guard cannot
    // VERIFY the subagent's real model, but it surfaces the configured model and flags a declared mismatch.
    const reviewerTier = modelTierDiagnostics(roleConfig, "reviewer", parsed.producer, { below: "REVIEWER_MODEL_BELOW_CONFIGURED_TIER", unverified: "REVIEWER_MODEL_UNVERIFIED" });
    const expectedReviewerModel = reviewerTier.expectedModel;
    violations.push(...reviewerTier.diagnostics);
    const seen = new Set<string>();
    const deduped = violations.filter((violation) => { const key = `${violation.code}:${violation.message}`; if (seen.has(key)) return false; seen.add(key); return true; });
    const errors = deduped.filter((violation) => violation.severity === "error");
    if (errors.length > 0) return failureResult("work.review", "Whole-WP review violates reviewer-identity policy; record rejected.", errors);
    const bases = aggregate.specs.map((spec) => independenceBasis(record.producer.agent_instance_id, spec.spec_author_agent_instance_id));
    const basis = bases.includes("self_review") ? "self_review" : bases.includes("unverified") ? "unverified" : "asserted";
    const updated = await store.update(AggregateWorkPacketSchema.parse({ ...aggregate, spec_review_cycles: [...aggregate.spec_review_cycles, record] }));
    return {
      ok: true,
      action_id: "work.review",
      data: { work_packet: updated, review: record, independence: basis, expected_reviewer_model: expectedReviewerModel, implementation_order: topologicalOrder(aggregate.specs) },
      diagnostics: deduped.filter((violation) => violation.severity !== "error"),
      mutations: [{ artifact: "work_packet", operation: "update", paths: ["/spec_review_cycles"], summary: `Recorded whole-WP review over ${aggregate.specs.length} Spec(s) (${parsed.verdict}).` }],
      next_actions: [],
      summary: `Whole-WP review recorded (${parsed.verdict}) over ${aggregate.specs.length} Spec(s); independence ${basis}.`
    };
  } catch (error) {
    return failureResult("work.review", "Whole-WP review failed.", [diagnostic("WORK_REVIEW_REJECTED", error instanceof Error ? error.message : String(error), "error", "/work")]);
  }
}

/**
 * v2 CUTOVER — record a structural-decision CHOICE (platform / architecture / stack) on the Work Packet
 * container (parity with v1 work.choice.answer). The structural decisions are container-level and inherited by
 * every Spec; this records the human's choice + a `*_choice` decision and sets the container field. Pre-approval
 * (structural decisions are in the approval hash; choosing after approval re-stales — re-approve).
 */
// One structural choice (platform / architecture / stack). work.choice records ONE; work.choices records a BATCH
// the human already made in a single upfront prompt — same per-choice validation + decisions, one write.
const ChoiceItemSchema = z.object({
  choice_type: z.enum(["platform_choice", "architecture_choice", "stack_choice"]),
  choice: z.string().min(1),
  custom_response: z.string().nullable().optional(),
  option_details: z.record(z.string(), z.unknown()).nullable().optional(),
  selected_number: z.number().int(),
  raw_response: z.string(),
  decision_prompt: z.string(),
  // The options you ACTUALLY presented to the human. Must include BOTH a visible "type your own answer" option and a
  // "Discuss" option (not just the dialog's easy-to-miss 'Other') — the gate rejects a choice that omits either.
  options_presented: z.array(z.string().min(1)).min(1)
}).strict();
type ChoiceItem = z.infer<typeof ChoiceItemSchema>;

/** Validate ONE structural choice, build its human decision, and set the container field — returns the updated
 *  aggregate (threadable for a batch) + the decision, or the validation error. */
function applyStructuralChoice(aggregate: AggregateWorkPacket, item: ChoiceItem, workId: string, targetRevision: number, promptId: string | undefined): { ok: true; aggregate: AggregateWorkPacket; decision: ReturnType<typeof buildHumanDecision> } | { ok: false; error: Diagnostic } {
  // Never box the human into the agent's buttons: a structural choice must present, as VISIBLE numbered options, BOTH
  // a "type your own answer" path AND a "Discuss" path (the dialog's 'Other' is easy to miss). Reject if either is absent.
  // Match the AFFORDANCE phrase, not a coincidental substring: "Type A" must NOT count as a free-form option, and
  // "Discussion-driven design" must NOT count as a Discuss option (\bdiscuss\b stops at the word boundary).
  const offered = item.options_presented.map((opt) => opt.toLowerCase());
  const hasCustom = offered.some((opt) => /type your own|your own answer|custom answer|free.?form|other \(specify\)|something else|write your own|enter your own/.test(opt));
  const hasDiscuss = offered.some((opt) => /\bdiscuss\b/.test(opt));
  if (!hasCustom || !hasDiscuss) {
    const missing = [hasCustom ? null : "a 'type your own answer' option", hasDiscuss ? null : "a 'Discuss' option"].filter(Boolean).join(" and ");
    return { ok: false, error: diagnostic("WORK_CHOICE_OPTIONS_INCOMPLETE", `Structural ${item.choice_type} is missing ${missing} in options_presented. Present every choice as numbered options that include them, e.g. "1. ${item.choice}, 2. <other>, 3. Type your own answer, 4. Discuss" — then re-ask the human.`, "error", "/options_presented") };
  }
  // Structural-content rule (v1 parity): a NEW standalone application UI (one_off_application_ui) stack decision
  // must record its component library — option_details.component_library. (reusable UI libraries + API surfaces do NOT.)
  if (item.choice_type === "stack_choice" && aggregate.specs.some((spec) => spec.classification === "one_off_application_ui") && !item.option_details?.component_library) {
    return { ok: false, error: diagnostic("WORK_CHOICE_UI_STACK_COMPONENT_LIBRARY_REQUIRED", "A UI stack decision must record option_details.component_library (the chosen UI component library).", "error", "/option_details") };
  }
  const approvedPayload = { work_id: workId, choice: item.choice, custom_response: item.custom_response ?? null, ...(item.choice_type === "platform_choice" ? {} : { option_details: item.option_details ?? null }) };
  const decision = buildHumanDecision({
    action_id: "work.choice", decision_type: item.choice_type, selected_number: item.selected_number, raw_response: item.raw_response,
    decision_prompt: item.decision_prompt, human_confirmed: true, prompt_id: promptId, normalized_decision: item.choice, final_decision: true,
    approved_payload: approvedPayload as unknown as Record<string, JsonValue>, source_interface: "core", target_artifact_revision: targetRevision
  });
  const withChoice = item.choice_type === "platform_choice"
    ? { ...aggregate, platform: { ...aggregate.platform, choice: item.choice, decision_id: decision.id } }
    : item.choice_type === "stack_choice"
      ? { ...aggregate, stack: { ...aggregate.stack, decision_ids: [...aggregate.stack.decision_ids, decision.id] } }
      : { ...aggregate, architecture: { ...aggregate.architecture, decision_ids: [...aggregate.architecture.decision_ids, decision.id] } };
  return { ok: true, aggregate: withChoice, decision };
}

export const WorkChoiceInputSchema = z.object({ id: z.string().min(1), ...ChoiceItemSchema.shape, human_confirmed: z.boolean(), prompt_id: z.string().optional() }).strict();

export async function workChoice(input: z.infer<typeof WorkChoiceInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  const store = aggregateStoreForContext(context);
  try {
    const parsed = WorkChoiceInputSchema.parse(input);
    if (parsed.human_confirmed !== true) return failureResult("work.choice", "A structural choice requires human_confirmed: true.", [diagnostic("WORK_CHOICE_UNCONFIRMED", "Structural decisions are human choices.", "error", "/human_confirmed")]);
    const aggregate = await store.read(parsed.id);
    if (aggregate.lifecycle.approval !== null) return failureResult("work.choice", "Work Packet is already approved; a structural choice would re-stale it — re-approve instead.", [diagnostic("WORK_CHOICE_APPROVED", "Structural decisions are pre-approval (they are in the whole-WP approval hash).", "error", "/lifecycle/approval")]);
    const result = applyStructuralChoice(aggregate, parsed, parsed.id, aggregate.revision + 1, parsed.prompt_id);
    if (!result.ok) return failureResult("work.choice", "A UI stack choice must record its component library.", [result.error]);
    const updated = await store.update(AggregateWorkPacketSchema.parse({ ...result.aggregate, decision_history: [...aggregate.decision_history, result.decision] }));
    await auditDecision(store.root, result.decision);
    return {
      ok: true,
      action_id: "work.choice",
      data: { work_packet: updated, decision: result.decision },
      diagnostics: [],
      mutations: [{ artifact: "work_packet", operation: "update", paths: [`/${parsed.choice_type.replace("_choice", "")}`], summary: `Recorded ${parsed.choice_type}: ${parsed.choice}.` }],
      next_actions: [],
      summary: `Work Packet ${updated.id}: ${parsed.choice_type} -> ${parsed.choice}.`
    };
  } catch (error) {
    return failureResult("work.choice", "Structural choice failed.", [diagnostic("WORK_CHOICE_REJECTED", error instanceof Error ? error.message : String(error), "error", "/work")]);
  }
}

/**
 * Record a BATCH of structural choices in ONE call (platform + architecture + stack the human already chose in a
 * single upfront prompt). Same per-choice validation + a human decision each, written together — no per-choice
 * ceremony. human_confirmed covers the batch (the human answered all of them).
 */
export const WorkChoicesInputSchema = z.object({ id: z.string().min(1), choices: z.array(ChoiceItemSchema).min(1), human_confirmed: z.boolean(), prompt_id: z.string().optional() }).strict();

export async function workChoices(input: z.infer<typeof WorkChoicesInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  const store = aggregateStoreForContext(context);
  try {
    const parsed = WorkChoicesInputSchema.parse(input);
    if (parsed.human_confirmed !== true) return failureResult("work.choices", "Structural choices require human_confirmed: true.", [diagnostic("WORK_CHOICE_UNCONFIRMED", "Structural decisions are human choices.", "error", "/human_confirmed")]);
    const aggregate = await store.read(parsed.id);
    if (aggregate.lifecycle.approval !== null) return failureResult("work.choices", "Work Packet is already approved; a structural choice would re-stale it — re-approve instead.", [diagnostic("WORK_CHOICE_APPROVED", "Structural decisions are pre-approval (they are in the whole-WP approval hash).", "error", "/lifecycle/approval")]);
    let working = aggregate;
    const decisions: Array<ReturnType<typeof buildHumanDecision>> = [];
    const targetRevision = aggregate.revision + 1;
    for (const item of parsed.choices) {
      const result = applyStructuralChoice(working, item, parsed.id, targetRevision, parsed.prompt_id);
      if (!result.ok) return failureResult("work.choices", `Structural choice '${item.choice_type}' rejected.`, [result.error]);
      working = result.aggregate;
      decisions.push(result.decision);
    }
    const updated = await store.update(AggregateWorkPacketSchema.parse({ ...working, decision_history: [...aggregate.decision_history, ...decisions] }));
    for (const decision of decisions) await auditDecision(store.root, decision);
    return {
      ok: true,
      action_id: "work.choices",
      data: { work_packet: updated, decisions },
      diagnostics: [],
      mutations: [{ artifact: "work_packet", operation: "update", paths: parsed.choices.map((item) => `/${item.choice_type.replace("_choice", "")}`), summary: `Recorded ${decisions.length} structural decision(s) in one call.` }],
      next_actions: [],
      summary: `Work Packet ${updated.id}: recorded ${decisions.map((decision) => decision.decision_type).join(", ")}.`
    };
  } catch (error) {
    return failureResult("work.choices", "Structural choices failed.", [diagnostic("WORK_CHOICES_REJECTED", error instanceof Error ? error.message : String(error), "error", "/work")]);
  }
}
