import { sha256CanonicalJson } from "../role-loop/canonical-hash.ts";
import {
  ImplementationAttemptSchema,
  ReviewCycleSchema,
  FocusedFixInstructionSchema,
  ReviewBlockerSchema,
  type LineageProducer,
  type ImplementationAttempt,
  type ReviewCycle,
  type FocusedFixInstruction,
  type ReviewBlocker
} from "./records.ts";

/** M5 sealing + authoritative hashes. Each `*_hash` is computed over a canonical projection that
 * EXCLUDES its own hash field, timestamps, and mutable storage metadata, so moving a record from
 * inline to rotated storage never changes its hash, and two records with equal content hash equally. */

type SealedAttempt = Extract<ImplementationAttempt, { state: "sealed" }>;
type InProgressAttempt = Extract<ImplementationAttempt, { state: "in_progress" }>;
type SealedReview = Extract<ReviewCycle, { state: "sealed" }>;
type InProgressReview = Extract<ReviewCycle, { state: "in_progress" }>;
type SealedFixInstruction = Extract<FocusedFixInstruction, { state: "sealed" }>;
type DraftFixInstruction = Extract<FocusedFixInstruction, { state: "draft" }>;

// Stable producer projection: role + stable identity only. Volatile run_id and audit-only
// provider/model are excluded so identical-content records by the same role hash identically.
function producerHashProjection(producer: LineageProducer): { role: string; principal_id: string | null; agent_instance_id: string | null } {
  return { role: producer.role, principal_id: producer.principal_id, agent_instance_id: producer.agent_instance_id };
}

// --- blocker_text_hash ------------------------------------------------------------------------

export function hashBlockerText(input: { title: string; paths: string[]; rationale: string; suggested_focus: string }): string {
  return sha256CanonicalJson({ projection: "blocker_text_v1", title: input.title, paths: input.paths, rationale: input.rationale, suggested_focus: input.suggested_focus });
}

export function buildReviewBlocker(input: { id: string; title: string; paths: string[]; rationale: string; suggested_focus: string }): ReviewBlocker {
  return ReviewBlockerSchema.parse({
    id: input.id,
    title: input.title,
    blocker_text_hash: hashBlockerText(input),
    severity: "blocking",
    paths: input.paths,
    rationale: input.rationale,
    suggested_focus: input.suggested_focus
  });
}

// --- attempt_hash -----------------------------------------------------------------------------

function attemptHashProjection(attempt: SealedAttempt): unknown {
  return {
    projection: "implementation_attempt_v1",
    schema_version: attempt.schema_version,
    hash_algorithm: attempt.hash_algorithm,
    id: attempt.id,
    kind: attempt.kind,
    producer: producerHashProjection(attempt.producer),
    authorization_id: attempt.authorization_id,
    authorization_type: attempt.authorization_type,
    packet_approval_hash: attempt.packet_approval_hash,
    implementation_plan_hash: attempt.implementation_plan_hash,
    focused_fix_instruction_id: attempt.focused_fix_instruction_id,
    evidence_preparation_scope_ref: attempt.evidence_preparation_scope_ref,
    source_instruction_id: attempt.source_instruction_id,
    pre_attempt_tree_hash: attempt.pre_attempt_tree_hash,
    post_attempt_tree_hash: attempt.post_attempt_tree_hash,
    diff_hash: attempt.diff_hash,
    changed_files: attempt.changed_files,
    summary: attempt.summary,
    clarification_request_ids: attempt.clarification_request_ids
  };
}

export function hashSealedAttempt(attempt: SealedAttempt): string {
  return sha256CanonicalJson(attemptHashProjection(attempt));
}

export function sealImplementationAttempt(attempt: InProgressAttempt, completion: { completed_at: string; post_attempt_tree_hash: string; diff_hash: string }): SealedAttempt {
  const draft = { ...attempt, state: "sealed" as const, attempt_hash: "", completed_at: completion.completed_at, post_attempt_tree_hash: completion.post_attempt_tree_hash, diff_hash: completion.diff_hash };
  const attempt_hash = sha256CanonicalJson(attemptHashProjection(draft as SealedAttempt));
  return ImplementationAttemptSchema.parse({ ...draft, attempt_hash }) as SealedAttempt;
}

// --- review_hash ------------------------------------------------------------------------------

function reviewHashProjection(review: SealedReview): unknown {
  return {
    projection: "review_cycle_v1",
    schema_version: review.schema_version,
    hash_algorithm: review.hash_algorithm,
    id: review.id,
    kind: review.kind,
    attempt_id: review.attempt_id,
    producer: producerHashProjection(review.producer),
    self_review_override: review.self_review_override,
    template_id: review.template_id,
    template_version: review.template_version,
    verdict: review.verdict,
    reviewed_refs: review.reviewed_refs,
    reviewed_blocker_ids: review.reviewed_blocker_ids,
    scope_expansion_reason: review.scope_expansion_reason,
    evidence_satisfaction: review.evidence_satisfaction,
    // Commands bind by ref + command_result_hash (which encodes the canonical CommandResultFactsV1
    // status), NOT the diagnostic `result`/`notes`, so two reviews citing the same result hash equally.
    commands: review.commands.map((command) => ({ command_result_ref: command.command_result_ref, command_result_hash: command.command_result_hash, command: command.command })),
    blockers: review.blockers,
    non_blocking: review.non_blocking,
    summary: review.summary
  };
}

export function hashSealedReview(review: SealedReview): string {
  return sha256CanonicalJson(reviewHashProjection(review));
}

export function sealReviewCycle(review: InProgressReview, sealInput: { verdict: SealedReview["verdict"]; reviewed_at: string }): SealedReview {
  const draft = { ...review, state: "sealed" as const, review_hash: "", verdict: sealInput.verdict, reviewed_at: sealInput.reviewed_at };
  const review_hash = sha256CanonicalJson(reviewHashProjection(draft as SealedReview));
  return ReviewCycleSchema.parse({ ...draft, review_hash }) as SealedReview;
}

// --- instruction_hash -------------------------------------------------------------------------

function fixInstructionHashProjection(instruction: SealedFixInstruction): unknown {
  return {
    projection: "focused_fix_instruction_v1",
    schema_version: instruction.schema_version,
    hash_algorithm: instruction.hash_algorithm,
    id: instruction.id,
    source_review_cycle_id: instruction.source_review_cycle_id,
    blocker_ids: instruction.blocker_ids,
    reviewer_blocker_refs: instruction.reviewer_blocker_refs,
    coordinator_added_instructions: instruction.coordinator_added_instructions,
    constraints: instruction.constraints,
    allowed_files: instruction.allowed_files,
    stop_conditions: instruction.stop_conditions
  };
}

export function hashSealedFixInstruction(instruction: SealedFixInstruction): string {
  return sha256CanonicalJson(fixInstructionHashProjection(instruction));
}

export function sealFocusedFixInstruction(instruction: DraftFixInstruction): SealedFixInstruction {
  const draft = { ...instruction, state: "sealed" as const, instruction_hash: "" };
  const instruction_hash = sha256CanonicalJson(fixInstructionHashProjection(draft as SealedFixInstruction));
  return FocusedFixInstructionSchema.parse({ ...draft, instruction_hash }) as SealedFixInstruction;
}
