import { describe, expect, it } from "vitest";
import {
  ImplementationAttemptSchema,
  ReviewCycleSchema,
  FocusedFixInstructionSchema,
  sealImplementationAttempt,
  hashSealedAttempt,
  sealReviewCycle,
  hashSealedReview,
  sealFocusedFixInstruction,
  hashSealedFixInstruction,
  hashBlockerText,
  buildReviewBlocker,
  planLineageRotation,
  buildLineageRecordRef,
  getTemplate,
  listTemplates,
  type LineageProducer,
  type ImplementationAttempt,
  type ReviewCycle,
  type FocusedFixInstruction
} from "../src/index.ts";

const producer: LineageProducer = { role: "implementer", principal_id: null, agent_instance_id: "sg-role-implementer", provider: "claude_code", model: null, run_id: "run-1" };
const reviewerProducer: LineageProducer = { ...producer, role: "reviewer", agent_instance_id: "sg-role-reviewer" };

function inProgressAttempt(over: Partial<Record<string, unknown>> = {}): Extract<ImplementationAttempt, { state: "in_progress" }> {
  const parsed = ImplementationAttemptSchema.parse({
    schema_version: 1, hash_algorithm: "sha256-canonical-json-v1", id: "attempt:1", state: "in_progress",
    attempt_hash: null, kind: "initial_implementation", producer,
    authorization_id: "auth:1", authorization_type: "implementation_authorization",
    packet_approval_hash: "pah", implementation_plan_hash: "iph",
    focused_fix_instruction_id: null, evidence_preparation_scope_ref: null, source_instruction_id: null,
    pre_attempt_tree_hash: "pre", started_at: "2026-01-01T00:00:00.000Z",
    completed_at: null, post_attempt_tree_hash: null, diff_hash: null,
    changed_files: ["src/x.ts"], summary: "did the thing", clarification_request_ids: [],
    ...over
  });
  if (parsed.state !== "in_progress") throw new Error("expected in_progress");
  return parsed;
}

const completion = { completed_at: "2026-01-01T00:05:00.000Z", post_attempt_tree_hash: "post", diff_hash: "diff" };

describe("M5 implementation attempt sealing + hash", () => {
  it("seals with a non-self-referential, recomputable attempt_hash", () => {
    const sealed = sealImplementationAttempt(inProgressAttempt(), completion);
    expect(sealed.state).toBe("sealed");
    expect(sealed.attempt_hash).toBe(hashSealedAttempt(sealed));
  });

  it("hash is sensitive to content but ignores timestamps", () => {
    const base = sealImplementationAttempt(inProgressAttempt(), completion);
    const diffSummary = sealImplementationAttempt(inProgressAttempt({ summary: "different" }), completion);
    expect(diffSummary.attempt_hash).not.toBe(base.attempt_hash);
    const diffStart = sealImplementationAttempt(inProgressAttempt({ started_at: "2026-02-02T00:00:00.000Z" }), { ...completion, completed_at: "2026-02-02T01:00:00.000Z" });
    expect(diffStart.attempt_hash).toBe(base.attempt_hash);
  });

  it("in_progress rejects a non-null attempt_hash", () => {
    const bad = ImplementationAttemptSchema.safeParse({ ...inProgressAttempt(), attempt_hash: "x" });
    expect(bad.success).toBe(false);
  });
});

function inProgressReview(commands: unknown[], over: Partial<Record<string, unknown>> = {}): Extract<ReviewCycle, { state: "in_progress" }> {
  const parsed = ReviewCycleSchema.parse({
    schema_version: 1, hash_algorithm: "sha256-canonical-json-v1", id: "review:1", state: "in_progress",
    review_hash: null, kind: "initial_review", attempt_id: "attempt:1", producer: reviewerProducer,
    self_review_override: false, template_id: "focused_implementation_review_v1", template_version: 1,
    verdict: null, reviewed_at: null,
    reviewed_refs: {
      work_packet_revision: 1, packet_approval_hash: "pah", implementation_plan_hash: "iph",
      evidence_policy_resolution_hash: "eph", attempt_hash: "ath", reviewed_diff_hash: "diff",
      post_attempt_tree_hash: "post", focused_fix_instruction_id: null, focused_fix_instruction_hash: null,
      changed_files_hash: "cfh", evidence_refs: [], waiver_refs: []
    },
    reviewed_blocker_ids: [], scope_expansion_reason: null, evidence_satisfaction: [],
    commands, blockers: [], non_blocking: [], summary: "looks good",
    ...over
  });
  if (parsed.state !== "in_progress") throw new Error("expected in_progress");
  return parsed;
}

describe("M5 review cycle sealing + hash", () => {
  it("seals with a non-self-referential, recomputable review_hash", () => {
    const sealed = sealReviewCycle(inProgressReview([]), { verdict: "pass", reviewed_at: "2026-01-01T00:10:00.000Z" });
    expect(sealed.review_hash).toBe(hashSealedReview(sealed));
  });

  it("two reviews citing the same command_result_hash hash equally despite different diagnostic result/notes", () => {
    const cmdA = [{ command_result_ref: "cr1", command_result_hash: "h1", command: "npm test", result: "passed", notes: "ok" }];
    const cmdB = [{ command_result_ref: "cr1", command_result_hash: "h1", command: "npm test", result: "failed", notes: "totally different note" }];
    const a = sealReviewCycle(inProgressReview(cmdA), { verdict: "pass", reviewed_at: "2026-01-01T00:10:00.000Z" });
    const b = sealReviewCycle(inProgressReview(cmdB), { verdict: "pass", reviewed_at: "2026-01-01T00:11:00.000Z" });
    expect(a.review_hash).toBe(b.review_hash);
    const c = sealReviewCycle(inProgressReview([{ ...cmdA[0], command_result_hash: "h2" }]), { verdict: "pass", reviewed_at: "2026-01-01T00:10:00.000Z" });
    expect(c.review_hash).not.toBe(a.review_hash);
  });

  it("reviewed_at does not affect the hash", () => {
    const a = sealReviewCycle(inProgressReview([]), { verdict: "pass", reviewed_at: "2026-01-01T00:10:00.000Z" });
    const b = sealReviewCycle(inProgressReview([]), { verdict: "pass", reviewed_at: "2026-09-09T00:00:00.000Z" });
    expect(a.review_hash).toBe(b.review_hash);
  });
});

describe("M5 blocker text hash + fix instruction sealing", () => {
  it("blocker_text_hash binds the canonical blocker text fields", () => {
    const a = hashBlockerText({ title: "t", paths: ["a"], rationale: "r", suggested_focus: "f" });
    expect(a).toBe(hashBlockerText({ title: "t", paths: ["a"], rationale: "r", suggested_focus: "f" }));
    expect(a).not.toBe(hashBlockerText({ title: "t", paths: ["a"], rationale: "different", suggested_focus: "f" }));
    expect(buildReviewBlocker({ id: "b1", title: "t", paths: ["a"], rationale: "r", suggested_focus: "f" }).blocker_text_hash).toBe(a);
  });

  it("seals a fix instruction with a recomputable instruction_hash bound to blocker text", () => {
    const draft = FocusedFixInstructionSchema.parse({
      schema_version: 1, hash_algorithm: "sha256-canonical-json-v1", id: "fix:1", state: "draft",
      instruction_hash: null, producer: { ...producer, role: "coordinator", agent_instance_id: "sg-role-coordinator" },
      source_review_cycle_id: "review:1", blocker_ids: ["b1"],
      reviewer_blocker_refs: [{ blocker_id: "b1", source_review_cycle_id: "review:1", blocker_text_hash: "bth1" }],
      coordinator_added_instructions: [], constraints: [], allowed_files: ["src/x.ts"], stop_conditions: []
    });
    if (draft.state !== "draft") throw new Error("expected draft");
    const sealed = sealFocusedFixInstruction(draft);
    expect(sealed.instruction_hash).toBe(hashSealedFixInstruction(sealed));
    const draft2 = FocusedFixInstructionSchema.parse({ ...draft, reviewer_blocker_refs: [{ blocker_id: "b1", source_review_cycle_id: "review:1", blocker_text_hash: "DIFFERENT" }] });
    if (draft2.state !== "draft") throw new Error("expected draft");
    expect(sealFocusedFixInstruction(draft2).instruction_hash).not.toBe(sealed.instruction_hash);
  });
});

describe("M5 rotation + refs", () => {
  it("rotates oldest review cycles past the count budget, keeping the newest inline, preserving record_hash", () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({ record_kind: "review_cycle" as const, id: `review:${i}`, record_hash: `h${i}`, serialized_bytes: 100 }));
    const plan = planLineageRotation(entries, { maxBytes: 1_000_000, maxReviewCycles: 10 });
    expect(plan.inline).toHaveLength(10);
    expect(plan.rotate.map((e) => e.id)).toEqual(["review:0", "review:1"]);
    expect(plan.inline.at(-1)?.id).toBe("review:11");
    const ref = buildLineageRecordRef({ record_kind: "review_cycle", id: "review:0", record_hash: "h0", storage_ref: "blob:abc", artifact_revision: 1, artifact_hash: "ah" });
    expect(ref.record_hash).toBe("h0");
  });

  it("rotates past the byte budget but always keeps at least the newest inline", () => {
    const entries = Array.from({ length: 3 }, (_, i) => ({ record_kind: "implementation_attempt" as const, id: `a${i}`, record_hash: `h${i}`, serialized_bytes: 100 }));
    const plan = planLineageRotation(entries, { maxBytes: 50, maxReviewCycles: 100 });
    expect(plan.inline).toHaveLength(1);
    expect(plan.inline[0]?.id).toBe("a2");
  });
});

describe("M5 static prompt templates", () => {
  it("exposes the six templates by id/version and rejects an unknown version", () => {
    expect(listTemplates()).toHaveLength(6);
    expect(getTemplate("focused_implementation_review_v1").template_version).toBe(1);
    expect(() => getTemplate("validation_run_v1", 2)).toThrow();
  });
});
