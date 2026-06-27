import type { Diagnostic } from "../schemas/embedded.ts";
import { matchesAnyGlob } from "../paths/glob.ts";
import type { SelfReviewIdentityMode } from "../role-config/config.ts";
import { sealFocusedFixInstruction } from "../lineage/hashes.ts";
import { FocusedFixInstructionSchema, type LineageProducer, type ReviewCycle, type ReviewVerdict, type FocusedFixInstruction } from "../lineage/records.ts";
import type { CommandResultCanonicalStatus } from "../role-loop/source-facts.ts";

/** M7: enforce the review + fix/re-review loop — self-review prevention, deterministic review gates
 * (a review cannot pass when a gate failed), focused fix-instruction construction bound to the exact
 * reviewer blockers (no artifact laundering), and re-review coverage. Deterministic predicates here are
 * consumed by the dispatch/state machine (M8/M9); M7 does not run subagents. */

// --- Self-review prevention -------------------------------------------------------------------

export interface SelfReviewResult {
  allowed: boolean;
  self_review_detected: boolean;
  diagnostics: Diagnostic[];
}

/** Compare a review's producer against the reviewed attempt's producer by stable `agent_instance_id`.
 * Same instance = self-review (blocked unless an explicit override is recorded). Unknown identity
 * (null instance id) is unsafe and blocked unless overridden; strict mode rejects logical-only ids. */
export function evaluateSelfReview(input: { reviewer: LineageProducer; attemptProducer: LineageProducer; mode: SelfReviewIdentityMode; override: boolean }): SelfReviewResult {
  const reviewerId = input.reviewer.agent_instance_id;
  const attemptId = input.attemptProducer.agent_instance_id;
  const selfReviewDetected = reviewerId !== null && attemptId !== null && reviewerId === attemptId;
  const unknownIdentity = reviewerId === null || attemptId === null;
  const diagnostics: Diagnostic[] = [];

  if (selfReviewDetected) {
    if (input.override) {
      diagnostics.push({ code: "SELF_REVIEW_OVERRIDE_DISCLOSED", severity: "info", message: `Self-review by ${reviewerId} proceeds under an explicit, disclosed override.`, field_path: null, gate: null, fix: null });
      return { allowed: true, self_review_detected: true, diagnostics };
    }
    diagnostics.push({ code: "SELF_REVIEW_BLOCKED", severity: "error", message: `Reviewer and implementer/fixer share agent_instance_id ${reviewerId}; review-gated work requires a distinct reviewer.`, field_path: null, gate: null, fix: "Configure a distinct reviewer identity or record an explicit self-review override." });
    return { allowed: false, self_review_detected: true, diagnostics };
  }

  if (input.mode === "strict_provider_identity_required") {
    diagnostics.push({ code: "SELF_REVIEW_STRICT_IDENTITY_UNPROVEN", severity: "error", message: "strict_provider_identity_required: logical role identities are not provider-proven distinct identities.", field_path: null, gate: null, fix: null });
    return { allowed: false, self_review_detected: false, diagnostics };
  }

  if (unknownIdentity) {
    if (input.override) {
      diagnostics.push({ code: "UNKNOWN_IDENTITY_OVERRIDE_DISCLOSED", severity: "info", message: "Review proceeds with unknown reviewer/attempt identity under an explicit override.", field_path: null, gate: null, fix: null });
      return { allowed: true, self_review_detected: false, diagnostics };
    }
    diagnostics.push({ code: "REVIEW_IDENTITY_UNKNOWN", severity: "error", message: "Reviewer or attempt identity is unknown (null agent_instance_id); cannot prove a distinct reviewer.", field_path: null, gate: null, fix: "Provision distinct reviewer identity or record an unknown-identity override." });
    return { allowed: false, self_review_detected: false, diagnostics };
  }

  return { allowed: true, self_review_detected: false, diagnostics };
}

// --- Deterministic review gates ---------------------------------------------------------------

export interface ReviewGateInput {
  packet_approval_current: boolean;
  plan_hash_matches: boolean;
  runtime_baseline_ready: boolean;
  evidence_ready: boolean;
  evidence_diagnostics?: Diagnostic[];
  command_statuses: CommandResultCanonicalStatus[];
  attempt_boundary_blocked: boolean;
}

export interface ReviewGateResult {
  passable: boolean;
  diagnostics: Diagnostic[];
}

/** Aggregate the deterministic gates that forbid a passing verdict. A review may return `pass` /
 * `pass_with_non_blocking_issues` only when ALL of these hold. */
export function evaluateReviewGates(input: ReviewGateInput): ReviewGateResult {
  const diagnostics: Diagnostic[] = [];
  if (!input.packet_approval_current) diagnostics.push({ code: "REVIEW_PACKET_APPROVAL_STALE", severity: "error", message: "Packet approval is stale; review cannot pass.", field_path: "/lifecycle/packet_approval", gate: null, fix: "Re-approve the WorkPacket." });
  if (!input.plan_hash_matches) diagnostics.push({ code: "REVIEW_PLAN_HASH_MISMATCH", severity: "error", message: "Implementation plan hash does not match the approved packet payload.", field_path: "/implementation_plan_hash", gate: null, fix: "Re-approve the packet with the current plan." });
  if (!input.runtime_baseline_ready) diagnostics.push({ code: "REVIEW_RUNTIME_BASELINE_NOT_READY", severity: "error", message: "Runtime baseline reference is missing/stale/invalid.", field_path: "/runtime_baseline_ref", gate: null, fix: "Attach a current accepted runtime baseline." });
  if (!input.evidence_ready) {
    diagnostics.push({ code: "REVIEW_EVIDENCE_NOT_READY", severity: "error", message: "Required evidence is missing for the review gate and no valid waiver exists.", field_path: "/evidence", gate: null, fix: "Provide the required evidence or an approved waiver." });
    for (const diag of input.evidence_diagnostics ?? []) diagnostics.push({ ...diag, severity: "error" });
  }
  if (input.command_statuses.some((status) => status === "failed" || status === "errored")) diagnostics.push({ code: "REVIEW_COMMAND_FAILED", severity: "error", message: "A required command failed or errored; review cannot pass.", field_path: "/review/commands", gate: null, fix: "Fix the failure or record an approved waiver." });
  if (input.attempt_boundary_blocked) diagnostics.push({ code: "REVIEW_BOUNDARY_VIOLATION", severity: "error", message: "Changed files violate the approved implementation boundary.", field_path: "/review/changed_files", gate: null, fix: "Revert/convert out-of-boundary changes." });
  return { passable: diagnostics.every((diag) => diag.severity !== "error"), diagnostics };
}

/** The enforced verdict: a failed gate or any reviewer blocker forces `blocked`; otherwise non-blocking
 * findings yield `pass_with_non_blocking_issues`, else `pass`. A review can never `pass` past a gate. */
export function resolveReviewVerdict(input: { gates: ReviewGateResult; reviewer_blocker_count: number; has_non_blocking: boolean }): ReviewVerdict {
  if (!input.gates.passable || input.reviewer_blocker_count > 0) return "blocked";
  return input.has_non_blocking ? "pass_with_non_blocking_issues" : "pass";
}

// --- Focused fix instruction from blockers ----------------------------------------------------

export interface BuildFixInstructionInput {
  id: string;
  producer: LineageProducer;
  source_review: ReviewCycle;
  blocker_ids?: string[];
  coordinator_added_instructions?: string[];
  constraints?: string[];
  allowed_files: string[];
  allowed_globs: string[];
  stop_conditions?: string[];
}

export interface BuildFixInstructionResult {
  instruction: FocusedFixInstruction | null;
  diagnostics: Diagnostic[];
}

/** Build a sealed focused fix instruction from a blocked review, binding the exact reviewer-authored
 * blocker text (by `blocker_text_hash`) so coordinator-added instructions can never launder or
 * misrepresent the reviewer's blockers. `allowed_files` must be a subset of `allowed_globs`. */
export function buildFocusedFixInstruction(input: BuildFixInstructionInput): BuildFixInstructionResult {
  const diagnostics: Diagnostic[] = [];
  const blockerIds = input.blocker_ids ?? input.source_review.blockers.map((blocker) => blocker.id);

  const reviewerBlockerRefs = blockerIds.map((blockerId) => {
    const blocker = input.source_review.blockers.find((candidate) => candidate.id === blockerId);
    if (blocker === undefined) {
      diagnostics.push({ code: "FIX_BLOCKER_NOT_FOUND", severity: "error", message: `Blocker ${blockerId} is not present in source review ${input.source_review.id}.`, field_path: "/focused_fix_instruction/blocker_ids", gate: null, fix: "Reference only blockers from the source review." });
      return null;
    }
    return { blocker_id: blockerId, source_review_cycle_id: input.source_review.id, blocker_text_hash: blocker.blocker_text_hash };
  });

  for (const file of input.allowed_files) {
    if (!matchesAnyGlob(file, input.allowed_globs)) {
      diagnostics.push({ code: "FIX_ALLOWED_FILE_OUTSIDE_BOUNDARY", severity: "error", message: `Focused fix allowed_file is outside the approved boundary: ${file}`, field_path: "/focused_fix_instruction/allowed_files", gate: null, fix: "Restrict fix allowed_files to the approved allowed_globs." });
    }
  }

  if (diagnostics.some((diag) => diag.severity === "error")) return { instruction: null, diagnostics };

  const draft = FocusedFixInstructionSchema.parse({
    schema_version: 1, hash_algorithm: "sha256-canonical-json-v1", id: input.id, state: "draft",
    instruction_hash: null, producer: input.producer, source_review_cycle_id: input.source_review.id,
    blocker_ids: blockerIds,
    reviewer_blocker_refs: reviewerBlockerRefs.filter((ref): ref is NonNullable<typeof ref> => ref !== null),
    coordinator_added_instructions: input.coordinator_added_instructions ?? [],
    constraints: input.constraints ?? [],
    allowed_files: input.allowed_files,
    stop_conditions: input.stop_conditions ?? []
  });
  if (draft.state !== "draft") return { instruction: null, diagnostics };
  return { instruction: sealFocusedFixInstruction(draft), diagnostics };
}

// --- Re-review coverage -----------------------------------------------------------------------

/** A focused re-review must cover every blocker referenced by the fix instruction, and must not
 * silently widen beyond them without recording a scope-expansion reason. */
export function evaluateRereviewCoverage(input: { fix_instruction_blocker_ids: string[]; rereview_blocker_ids: string[]; scope_expansion_reason: string | null }): { covered: boolean; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const reviewed = new Set(input.rereview_blocker_ids);
  for (const blockerId of input.fix_instruction_blocker_ids) {
    if (!reviewed.has(blockerId)) {
      diagnostics.push({ code: "REREVIEW_BLOCKER_NOT_COVERED", severity: "error", message: `Re-review does not cover fix-instruction blocker ${blockerId}.`, field_path: "/review_cycle/reviewed_blocker_ids", gate: null, fix: "Cover every referenced blocker in the re-review." });
    }
  }
  const fixSet = new Set(input.fix_instruction_blocker_ids);
  const widened = input.rereview_blocker_ids.some((id) => !fixSet.has(id));
  if (widened && input.scope_expansion_reason === null) {
    diagnostics.push({ code: "REREVIEW_SCOPE_EXPANDED_WITHOUT_REASON", severity: "error", message: "Re-review covers blockers beyond the fix instruction without a scope_expansion_reason.", field_path: "/review_cycle/scope_expansion_reason", gate: null, fix: "Record a scope_expansion_reason for the widened re-review." });
  }
  return { covered: diagnostics.every((diag) => diag.severity !== "error"), diagnostics };
}
