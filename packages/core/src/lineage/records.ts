import { z } from "zod";
import { HASH_ALGORITHM_V1, SCHEMA_VERSION_V1 } from "../role-loop/constants.ts";
import { RoleNameSchema } from "../role-config/config.ts";
import { WorkBreakdownRefSchema } from "../schemas/embedded.ts";

/** M5: compact execution/review lineage records attached to the WorkPacket. These are audit lineage,
 * not approval-bound payload (adding them never stales packet approval). Records are discriminated
 * in-progress/sealed; only sealed records carry their authoritative hash. Command output and raw
 * transcripts are never duplicated here — they live in durable storage and are referenced. */

const HashAlgorithmSchema = z.literal(HASH_ALGORITHM_V1);
const SchemaVersionSchema = z.literal(SCHEMA_VERSION_V1);

/** Execution-time producer identity (richer than the appendix minimal `ProducerIdentity`, which
 * carries only principal_id/agent_instance_id). Deferred from M2; consumed here. */
export const LineageProducerSchema = z.object({
  role: RoleNameSchema,
  principal_id: z.string().nullable(),
  agent_instance_id: z.string().nullable(),
  provider: z.string(),
  model: z.string().nullable(),
  run_id: z.string()
}).strict();
export type LineageProducer = z.infer<typeof LineageProducerSchema>;

export const LineageRecordKindSchema = z.enum([
  "implementation_attempt",
  "review_cycle",
  "fix_instruction",
  "clarification_request",
  "evidence_waiver",
  "spec_review"
]);
export type LineageRecordKind = z.infer<typeof LineageRecordKindSchema>;

/** Stable ref to a rotated-out lineage record; moving inline → rotated must not change record_hash. */
export const LineageRecordRefSchema = z.object({
  record_kind: LineageRecordKindSchema,
  id: z.string().min(1),
  record_hash: z.string(),
  storage_ref: z.string().min(1),
  artifact_revision: z.number().int().positive(),
  artifact_hash: z.string()
}).strict();
export type LineageRecordRef = z.infer<typeof LineageRecordRefSchema>;

// --- Implementation attempts ------------------------------------------------------------------

const attemptBase = {
  schema_version: SchemaVersionSchema,
  hash_algorithm: HashAlgorithmSchema,
  id: z.string().min(1),
  kind: z.enum(["initial_implementation", "blocker_fix", "evidence_preparation"]),
  producer: LineageProducerSchema,
  authorization_id: z.string(),
  authorization_type: z.enum(["implementation_authorization", "fix_authorization", "evidence_preparation_authorization"]),
  packet_approval_hash: z.string(),
  implementation_plan_hash: z.string().nullable(),
  focused_fix_instruction_id: z.string().nullable(),
  evidence_preparation_scope_ref: z.string().nullable(),
  source_instruction_id: z.string().nullable(),
  pre_attempt_tree_hash: z.string(),
  started_at: z.string(),
  changed_files: z.array(z.string()),
  summary: z.string(),
  clarification_request_ids: z.array(z.string())
};

export const ImplementationAttemptSchema = z.discriminatedUnion("state", [
  z.object({ ...attemptBase, state: z.literal("in_progress"), attempt_hash: z.null(), completed_at: z.null(), post_attempt_tree_hash: z.null(), diff_hash: z.null() }).strict(),
  z.object({ ...attemptBase, state: z.literal("sealed"), attempt_hash: z.string(), completed_at: z.string(), post_attempt_tree_hash: z.string(), diff_hash: z.string() }).strict()
]);
export type ImplementationAttempt = z.infer<typeof ImplementationAttemptSchema>;

// --- Review cycles ----------------------------------------------------------------------------

export const ReviewBlockerSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  blocker_text_hash: z.string(),
  severity: z.literal("blocking"),
  paths: z.array(z.string()),
  rationale: z.string(),
  suggested_focus: z.string()
}).strict();
export type ReviewBlocker = z.infer<typeof ReviewBlockerSchema>;

export const ReviewNonBlockingSchema = z.object({
  title: z.string(),
  paths: z.array(z.string()),
  recommendation: z.string()
}).strict();

export const ReviewCommandSummarySchema = z.object({
  command_result_ref: z.string().nullable(),
  command_result_hash: z.string().nullable(),
  command: z.string(),
  // Diagnostic summary; derives from the canonical CommandResultFactsV1.status. The review_hash binds
  // commands by ref + command_result_hash (which encodes canonical status), not this diagnostic enum.
  result: z.enum(["passed", "failed", "timed_out", "not_run"]),
  notes: z.string()
}).strict();

export const ReviewEvidenceSatisfactionSchema = z.object({
  ac_id: z.string(),
  mode: z.string(),
  satisfied: z.boolean(),
  evidence_refs: z.array(z.string()),
  waiver_refs: z.array(z.string()),
  notes: z.string()
}).strict();

export const ReviewedRefsSchema = z.object({
  work_packet_revision: z.number().int().positive(),
  packet_approval_hash: z.string().nullable(),
  implementation_plan_hash: z.string().nullable(),
  evidence_policy_resolution_hash: z.string().nullable(),
  attempt_hash: z.string(),
  reviewed_diff_hash: z.string().nullable(),
  post_attempt_tree_hash: z.string().nullable(),
  focused_fix_instruction_id: z.string().nullable(),
  focused_fix_instruction_hash: z.string().nullable(),
  changed_files_hash: z.string().nullable(),
  evidence_refs: z.array(z.string()),
  waiver_refs: z.array(z.string())
}).strict();

const reviewBase = {
  schema_version: SchemaVersionSchema,
  hash_algorithm: HashAlgorithmSchema,
  id: z.string().min(1),
  kind: z.enum(["initial_review", "focused_rereview"]),
  attempt_id: z.string(),
  producer: LineageProducerSchema,
  self_review_override: z.boolean(),
  template_id: z.string(),
  template_version: z.number().int().positive(),
  reviewed_refs: ReviewedRefsSchema,
  reviewed_blocker_ids: z.array(z.string()),
  scope_expansion_reason: z.string().nullable(),
  evidence_satisfaction: z.array(ReviewEvidenceSatisfactionSchema),
  commands: z.array(ReviewCommandSummarySchema),
  blockers: z.array(ReviewBlockerSchema),
  non_blocking: z.array(ReviewNonBlockingSchema),
  summary: z.string()
};

export const ReviewVerdictSchema = z.enum(["pass", "pass_with_non_blocking_issues", "blocked"]);
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;

export const ReviewCycleSchema = z.discriminatedUnion("state", [
  z.object({ ...reviewBase, state: z.literal("in_progress"), review_hash: z.null(), verdict: z.null(), reviewed_at: z.null() }).strict(),
  z.object({ ...reviewBase, state: z.literal("sealed"), review_hash: z.string(), verdict: ReviewVerdictSchema, reviewed_at: z.string() }).strict()
]);
export type ReviewCycle = z.infer<typeof ReviewCycleSchema>;

// --- Spec review cycles (PRE-approval, independent) -------------------------------------------
// Reviews the SPEC (ACs + their classifications, the Work Breakdown, scope) before the human bulk approval —
// symmetric with the implementation review that precedes the human completion gate. NOT an implementation
// review (no attempt/diff); it binds to the AC content + breakdown so a re-draft stales it.

export const SpecReviewVerdictSchema = z.enum(["pass", "blocked"]);
export type SpecReviewVerdict = z.infer<typeof SpecReviewVerdictSchema>;

export const SpecReviewBlockerSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  detail: z.string()
}).strict();
export type SpecReviewBlocker = z.infer<typeof SpecReviewBlockerSchema>;

const specReviewBase = {
  schema_version: SchemaVersionSchema,
  hash_algorithm: HashAlgorithmSchema,
  id: z.string().min(1),
  producer: LineageProducerSchema,
  // What spec was reviewed, revision-independent: the AC content hash + the Work Breakdown ref. Approval
  // freshness compares the CURRENT acContentHash + work_breakdown_ref to these; a re-draft/re-breakdown stales it.
  // reviewed_ac_content_hash holds the WHOLE-WP hash for a whole_wp review (the coherence binding); for a spec
  // review it holds that Spec's local hash. reviewed_work_breakdown_ref is null in v2 (the breakdown IS specs[]).
  reviewed_ac_content_hash: z.string(),
  reviewed_work_breakdown_ref: WorkBreakdownRefSchema.nullable(),
  // Parallel pre-approval reviews: which Specs this review covered, each pinned to its Spec-LOCAL content hash, so
  // editing one Spec stales only its coverage. A whole_wp review records all Specs; a spec review records one.
  review_scope: z.enum(["whole_wp", "spec"]).default("whole_wp"),
  reviewed_spec_content_hashes: z.array(z.object({ spec_id: z.string(), hash: z.string() }).strict()).default([]),
  blockers: z.array(SpecReviewBlockerSchema),
  summary: z.string()
};

export const SpecReviewCycleSchema = z.discriminatedUnion("state", [
  z.object({ ...specReviewBase, state: z.literal("in_progress"), verdict: z.null(), reviewed_at: z.null() }).strict(),
  z.object({ ...specReviewBase, state: z.literal("sealed"), verdict: SpecReviewVerdictSchema, reviewed_at: z.string() }).strict()
]);
export type SpecReviewCycle = z.infer<typeof SpecReviewCycleSchema>;

// --- Focused fix instructions -----------------------------------------------------------------

export const ReviewerBlockerRefSchema = z.object({
  blocker_id: z.string(),
  source_review_cycle_id: z.string(),
  blocker_text_hash: z.string()
}).strict();

const fixInstructionBase = {
  schema_version: SchemaVersionSchema,
  hash_algorithm: HashAlgorithmSchema,
  id: z.string().min(1),
  producer: LineageProducerSchema,
  source_review_cycle_id: z.string(),
  blocker_ids: z.array(z.string()),
  reviewer_blocker_refs: z.array(ReviewerBlockerRefSchema),
  coordinator_added_instructions: z.array(z.string()),
  constraints: z.array(z.string()),
  allowed_files: z.array(z.string()),
  stop_conditions: z.array(z.string())
};

export const FocusedFixInstructionSchema = z.discriminatedUnion("state", [
  z.object({ ...fixInstructionBase, state: z.literal("draft"), instruction_hash: z.null() }).strict(),
  z.object({ ...fixInstructionBase, state: z.literal("sealed"), instruction_hash: z.string() }).strict()
]);
export type FocusedFixInstruction = z.infer<typeof FocusedFixInstructionSchema>;

// --- Clarification requests -------------------------------------------------------------------

export const ClarificationRequestSchema = z.object({
  schema_version: SchemaVersionSchema,
  id: z.string().min(1),
  producer: LineageProducerSchema,
  status: z.enum(["open", "answered", "superseded"]),
  question: z.string(),
  blocked_reason: z.string(),
  affected_artifacts: z.array(z.string()),
  proposed_options: z.array(z.string()),
  created_at: z.string(),
  answered_by_decision_id: z.string().nullable()
}).strict();
export type ClarificationRequest = z.infer<typeof ClarificationRequestSchema>;
