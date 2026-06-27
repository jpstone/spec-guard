import type { CommandResult, CommandSpec, Diagnostic } from "../schemas/embedded.ts";
import { sha256CanonicalJson } from "../role-loop/canonical-hash.ts";
import type { ProducerIdentity } from "../role-loop/human-decision.ts";
import type { CommandResultFactsV1, CommandResultPurpose } from "../role-loop/source-facts.ts";
import type { SpecGuardRoleConfig } from "../role-config/config.ts";
import { deriveRoleExecutionContext, BackendTaskEnvelopeSchema } from "../harness/role-execution.ts";
import type { SubagentAdapter } from "../roles/adapter.ts";
import { dispatchBackendTask } from "../roles/dispatch.ts";
import { runEditRoleInWorktree } from "../roles/worktree.ts";
import { runValidatorCommand } from "../commands/validator.ts";
import type { ExpectedFailureCriteriaV1 } from "../commands/command-facts.ts";
import {
  ImplementationAttemptSchema,
  ReviewCycleSchema,
  type ImplementationAttempt,
  type ReviewCycle,
  type ReviewVerdict,
  type FocusedFixInstruction,
  type LineageProducer
} from "../lineage/records.ts";
import { sealImplementationAttempt, sealReviewCycle, buildReviewBlocker } from "../lineage/hashes.ts";
import { evaluateReviewGates, resolveReviewVerdict, type ReviewGateInput } from "../workflow/review-loop.ts";
import type { WorkflowState } from "../workflow/state-machine.ts";

/** M9.6: the coordinator orchestration core — composes the engine + dispatch + worktree + lineage +
 * gates into per-state steps, so the new role-loop is runnable end to end. This is a composition
 * library; the registered CLI/MCP action surface + WorkPacket lineage storage land in M9.7's
 * realignment. Deterministic with the fixture adapter; real adapters via the opt-in smoke. */

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

// --- Implementer step (worktree-isolated edit) ------------------------------------------------

export interface ImplementerStepInput {
  repoRoot: string;
  roleConfig: SpecGuardRoleConfig;
  allowedGlobs: string[];
  expectedFiles: string[];
  inputRefs: string[];
  model: string | null;
  adapter: SubagentAdapter;
  producer: LineageProducer;
  requestedIdentity: ProducerIdentity;
  authorizationId: string;
  packetApprovalHash: string;
  planHash: string | null;
  attemptId: string;
  at: string;
  timeoutMs?: number;
}

export interface ImplementerStepResult {
  attempt: ImplementationAttempt;
  accepted: boolean;
  next_state: WorkflowState;
  changed_files: string[];
  diagnostics: Diagnostic[];
}

/** Run the implementer in an isolated worktree, seal the attempt, and advance the state. The attempt
 * is sealed regardless of acceptance (for audit); `accepted` reflects whether the in-boundary diff was
 * applied to the main tree (M8b). */
export async function runImplementerStep(input: ImplementerStepInput): Promise<ImplementerStepResult> {
  const ctx = deriveRoleExecutionContext("implementer", input.roleConfig.roles.implementer, input.allowedGlobs);
  const envelope = BackendTaskEnvelopeSchema.parse({
    task_id: input.attemptId, role: "implementer", template_id: "implementation_execute_v1", template_version: 1,
    input_refs: input.inputRefs, allowed_capabilities: ctx, expected_output_schema: "implementation_attempt_v1",
    requested_role_identity: input.requestedIdentity, observed_producer_identity: null,
    identity_attestation: "logical_role_trust_boundary", timeout_ms: input.timeoutMs ?? 60000, retry_policy: "none"
  });
  const run = await runEditRoleInWorktree({ repoRoot: input.repoRoot, adapter: input.adapter, envelope, model: input.model, drift: { expectedFiles: input.expectedFiles, allowedGlobs: input.allowedGlobs } });
  const summary = asString(asRecord(run.dispatch.parsed_output).summary);

  const inProgress = ImplementationAttemptSchema.parse({
    schema_version: 1, hash_algorithm: "sha256-canonical-json-v1", id: input.attemptId, state: "in_progress",
    attempt_hash: null, kind: "initial_implementation", producer: input.producer,
    authorization_id: input.authorizationId, authorization_type: "implementation_authorization",
    packet_approval_hash: input.packetApprovalHash, implementation_plan_hash: input.planHash,
    focused_fix_instruction_id: null, evidence_preparation_scope_ref: null, source_instruction_id: null,
    // Tree hashes are synthesized deterministically from the observed diff here; real tree-state hashing
    // is wired when lineage is persisted on the WorkPacket (M9.7/M10).
    pre_attempt_tree_hash: sha256CanonicalJson({ kind: "pre", attempt: input.attemptId }),
    started_at: input.at, completed_at: null, post_attempt_tree_hash: null, diff_hash: null,
    changed_files: run.changed_files, summary, clarification_request_ids: []
  });
  if (inProgress.state !== "in_progress") throw new Error("expected in_progress attempt");
  const attempt = sealImplementationAttempt(inProgress, {
    completed_at: input.at,
    post_attempt_tree_hash: sha256CanonicalJson({ kind: "post", changed: run.changed_files, accepted: run.accepted }),
    diff_hash: sha256CanonicalJson({ changed: run.changed_files })
  });

  return {
    attempt,
    accepted: run.accepted,
    next_state: run.accepted ? "implementation_attempt_complete" : "implementation_authorized",
    changed_files: run.changed_files,
    diagnostics: [...run.diagnostics]
  };
}

// --- Review step (dispatch -> seal review_cycle -> gates -> verdict) ---------------------------

export interface ReviewStepInput {
  roleConfig: SpecGuardRoleConfig;
  adapter: SubagentAdapter;
  model: string | null;
  cwd: string;
  reviewer: LineageProducer;
  requestedIdentity: ProducerIdentity;
  reviewId: string;
  attemptId: string;
  inputRefs: string[];
  reviewedRefs: ReviewCycle["reviewed_refs"];
  gateInput: ReviewGateInput;
  at: string;
  rereview?: boolean;
}

export interface ReviewStepResult {
  review_cycle: ReviewCycle;
  verdict: ReviewVerdict;
  next_state: WorkflowState;
  diagnostics: Diagnostic[];
}

/** Dispatch the reviewer, seal a review_cycle from its findings, apply the deterministic review gates,
 * resolve the enforced verdict, and advance the state. A failed gate or any blocker forces `blocked`
 * regardless of what the reviewer subagent proposed. */
export async function runReviewStep(input: ReviewStepInput): Promise<ReviewStepResult> {
  const ctx = deriveRoleExecutionContext("reviewer", input.roleConfig.roles.reviewer, []);
  const templateId = input.rereview === true ? "focused_rereview_v1" : "focused_implementation_review_v1";
  const envelope = BackendTaskEnvelopeSchema.parse({
    task_id: input.reviewId, role: input.rereview === true ? "rereviewer" : "reviewer", template_id: templateId, template_version: 1,
    input_refs: input.inputRefs, allowed_capabilities: ctx, expected_output_schema: "review_cycle_v1",
    requested_role_identity: input.requestedIdentity, observed_producer_identity: null,
    identity_attestation: "logical_role_trust_boundary", timeout_ms: 60000, retry_policy: "none"
  });
  const dispatch = await dispatchBackendTask({ envelope, adapter: input.adapter, cwd: input.cwd, model: input.model });
  const out = asRecord(dispatch.parsed_output);

  const rawBlockers = Array.isArray(out.blockers) ? out.blockers : [];
  const blockers = rawBlockers.map((raw, index) => {
    const record = asRecord(raw);
    return buildReviewBlocker({
      id: `${input.reviewId}:b${index}`,
      title: asString(record.title, "blocker"),
      paths: Array.isArray(record.paths) ? record.paths.map((p) => asString(p)) : [],
      rationale: asString(record.rationale),
      suggested_focus: asString(record.suggested_focus)
    });
  });
  const rawNonBlocking = Array.isArray(out.non_blocking) ? out.non_blocking : [];
  const nonBlocking = rawNonBlocking.map((raw) => {
    const record = asRecord(raw);
    return { title: asString(record.title), paths: Array.isArray(record.paths) ? record.paths.map((p) => asString(p)) : [], recommendation: asString(record.recommendation) };
  });

  const gates = evaluateReviewGates(input.gateInput);
  const verdict = resolveReviewVerdict({ gates, reviewer_blocker_count: blockers.length, has_non_blocking: nonBlocking.length > 0 });

  const inProgress = ReviewCycleSchema.parse({
    schema_version: 1, hash_algorithm: "sha256-canonical-json-v1", id: input.reviewId, state: "in_progress",
    review_hash: null, kind: input.rereview === true ? "focused_rereview" : "initial_review", attempt_id: input.attemptId,
    producer: input.reviewer, self_review_override: false, template_id: templateId, template_version: 1,
    verdict: null, reviewed_at: null, reviewed_refs: input.reviewedRefs, reviewed_blocker_ids: blockers.map((b) => b.id),
    scope_expansion_reason: null, evidence_satisfaction: [], commands: [], blockers, non_blocking: nonBlocking,
    summary: asString(out.summary)
  });
  if (inProgress.state !== "in_progress") throw new Error("expected in_progress review");
  const review_cycle = sealReviewCycle(inProgress, { verdict, reviewed_at: input.at });

  return {
    review_cycle,
    verdict,
    next_state: verdict === "blocked" ? "review_blocked" : "review_passed",
    diagnostics: [...dispatch.diagnostics, ...gates.diagnostics]
  };
}

// --- Validator step (local, deterministic) ----------------------------------------------------

export interface ValidatorStepInput {
  projectRoot: string;
  artifactRoot: string;
  commandSpec: CommandSpec;
  factsPurpose: CommandResultPurpose;
  boundAcIds?: string[];
  boundRequirementIds?: string[];
  expectedFailure?: ExpectedFailureCriteriaV1 | null;
}

export interface ValidatorStepResult {
  command_result: CommandResult;
  facts: CommandResultFactsV1 | null;
  satisfied: boolean;
  next_state: WorkflowState;
  diagnostics: Diagnostic[];
}

/** Run a validation command via the local deterministic validator (M4) and resolve the validation
 * state. `passed` (or a matched `expected_failure`) satisfies; anything else fails. The validator
 * never uses a model to decide pass/fail. The caller transitions validation_satisfied → review_pending
 * (initial) or → rereview_pending (after a blocker fix). */
export async function runValidatorStep(input: ValidatorStepInput): Promise<ValidatorStepResult> {
  const run = await runValidatorCommand({
    commandSpec: input.commandSpec,
    purpose: "test",
    factsPurpose: input.factsPurpose,
    projectRoot: input.projectRoot,
    artifactRoot: input.artifactRoot,
    boundAcIds: input.boundAcIds ?? [],
    boundRequirementIds: input.boundRequirementIds ?? [],
    expectedFailure: input.expectedFailure ?? null
  });
  const satisfied = run.facts !== null && (run.facts.status === "passed" || run.facts.status === "expected_failure");
  return {
    command_result: run.command_result,
    facts: run.facts,
    satisfied,
    next_state: satisfied ? "validation_satisfied" : "validation_failed",
    diagnostics: run.diagnostics
  };
}

// --- Fixer step (worktree-isolated, bound to a focused fix instruction) ------------------------

export interface FixerStepInput {
  repoRoot: string;
  roleConfig: SpecGuardRoleConfig;
  fixInstruction: FocusedFixInstruction;
  inputRefs: string[];
  model: string | null;
  adapter: SubagentAdapter;
  producer: LineageProducer;
  requestedIdentity: ProducerIdentity;
  authorizationId: string;
  packetApprovalHash: string;
  planHash: string | null;
  attemptId: string;
  at: string;
  timeoutMs?: number;
}

export interface FixerStepResult {
  attempt: ImplementationAttempt;
  accepted: boolean;
  next_state: WorkflowState;
  changed_files: string[];
  diagnostics: Diagnostic[];
}

/** Run the fixer in an isolated worktree bound to the focused fix instruction's allowed_files (which
 * are already a subset of the approved boundary, validated when the instruction was built). Seals a
 * `blocker_fix` attempt referencing the instruction; accepted → fix_attempt_complete, else fix_authorized. */
export async function runFixerStep(input: FixerStepInput): Promise<FixerStepResult> {
  const allowed = input.fixInstruction.allowed_files;
  const ctx = deriveRoleExecutionContext("fixer", input.roleConfig.roles.fixer, allowed);
  const envelope = BackendTaskEnvelopeSchema.parse({
    task_id: input.attemptId, role: "fixer", template_id: "focused_blocker_fix_v1", template_version: 1,
    input_refs: input.inputRefs, allowed_capabilities: ctx, expected_output_schema: "implementation_attempt_v1",
    requested_role_identity: input.requestedIdentity, observed_producer_identity: null,
    identity_attestation: "logical_role_trust_boundary", timeout_ms: input.timeoutMs ?? 60000, retry_policy: "none"
  });
  const run = await runEditRoleInWorktree({ repoRoot: input.repoRoot, adapter: input.adapter, envelope, model: input.model, drift: { expectedFiles: allowed, allowedGlobs: allowed } });
  const summary = asString(asRecord(run.dispatch.parsed_output).summary);

  const inProgress = ImplementationAttemptSchema.parse({
    schema_version: 1, hash_algorithm: "sha256-canonical-json-v1", id: input.attemptId, state: "in_progress",
    attempt_hash: null, kind: "blocker_fix", producer: input.producer,
    authorization_id: input.authorizationId, authorization_type: "fix_authorization",
    packet_approval_hash: input.packetApprovalHash, implementation_plan_hash: input.planHash,
    focused_fix_instruction_id: input.fixInstruction.id, evidence_preparation_scope_ref: null,
    source_instruction_id: input.fixInstruction.id,
    pre_attempt_tree_hash: sha256CanonicalJson({ kind: "pre", attempt: input.attemptId }),
    started_at: input.at, completed_at: null, post_attempt_tree_hash: null, diff_hash: null,
    changed_files: run.changed_files, summary, clarification_request_ids: []
  });
  if (inProgress.state !== "in_progress") throw new Error("expected in_progress attempt");
  const attempt = sealImplementationAttempt(inProgress, {
    completed_at: input.at,
    post_attempt_tree_hash: sha256CanonicalJson({ kind: "post", changed: run.changed_files, accepted: run.accepted }),
    diff_hash: sha256CanonicalJson({ changed: run.changed_files })
  });

  return {
    attempt,
    accepted: run.accepted,
    next_state: run.accepted ? "fix_attempt_complete" : "fix_authorized",
    changed_files: run.changed_files,
    diagnostics: [...run.diagnostics]
  };
}
