import { describe, expect, it } from "vitest";
import {
  evaluateSelfReview,
  evaluateReviewGates,
  resolveReviewVerdict,
  buildFocusedFixInstruction,
  evaluateRereviewCoverage,
  buildReviewBlocker,
  sealReviewCycle,
  ReviewCycleSchema,
  type LineageProducer,
  type ReviewCycle,
  type ReviewGateResult
} from "../src/index.ts";

const implementer: LineageProducer = { role: "implementer", principal_id: null, agent_instance_id: "sg-role-implementer", provider: "claude_code", model: null, run_id: "r1" };
const reviewer: LineageProducer = { role: "reviewer", principal_id: null, agent_instance_id: "sg-role-reviewer", provider: "claude_code", model: null, run_id: "r2" };

describe("M7 self-review prevention", () => {
  it("blocks a reviewer that shares the attempt producer identity (default), allows distinct", () => {
    const collide = evaluateSelfReview({ reviewer: { ...reviewer, agent_instance_id: "sg-role-implementer" }, attemptProducer: implementer, mode: "logical_role_identity_allowed_with_visible_trust_boundary", override: false });
    expect(collide.allowed).toBe(false);
    expect(collide.diagnostics.some((d) => d.code === "SELF_REVIEW_BLOCKED")).toBe(true);

    const distinct = evaluateSelfReview({ reviewer, attemptProducer: implementer, mode: "logical_role_identity_allowed_with_visible_trust_boundary", override: false });
    expect(distinct.allowed).toBe(true);
  });

  it("allows self-review only with a disclosed override", () => {
    const overridden = evaluateSelfReview({ reviewer: { ...reviewer, agent_instance_id: "sg-role-implementer" }, attemptProducer: implementer, mode: "logical_role_identity_allowed_with_visible_trust_boundary", override: true });
    expect(overridden.allowed).toBe(true);
    expect(overridden.diagnostics.some((d) => d.code === "SELF_REVIEW_OVERRIDE_DISCLOSED")).toBe(true);
  });

  it("strict mode rejects logical-only identities; unknown identity is blocked without override", () => {
    expect(evaluateSelfReview({ reviewer, attemptProducer: implementer, mode: "strict_provider_identity_required", override: false }).allowed).toBe(false);
    const unknown = evaluateSelfReview({ reviewer: { ...reviewer, agent_instance_id: null }, attemptProducer: implementer, mode: "logical_role_identity_allowed_with_visible_trust_boundary", override: false });
    expect(unknown.allowed).toBe(false);
    expect(unknown.diagnostics.some((d) => d.code === "REVIEW_IDENTITY_UNKNOWN")).toBe(true);
  });
});

const cleanGateInput = { packet_approval_current: true, plan_hash_matches: true, runtime_baseline_ready: true, evidence_ready: true, command_statuses: ["passed" as const], attempt_boundary_blocked: false };

describe("M7 deterministic review gates", () => {
  it("passable only when every gate holds", () => {
    expect(evaluateReviewGates(cleanGateInput).passable).toBe(true);
    expect(evaluateReviewGates({ ...cleanGateInput, evidence_ready: false }).passable).toBe(false);
    expect(evaluateReviewGates({ ...cleanGateInput, command_statuses: ["failed"] }).passable).toBe(false);
    expect(evaluateReviewGates({ ...cleanGateInput, command_statuses: ["errored"] }).passable).toBe(false);
    expect(evaluateReviewGates({ ...cleanGateInput, attempt_boundary_blocked: true }).passable).toBe(false);
    expect(evaluateReviewGates({ ...cleanGateInput, packet_approval_current: false }).passable).toBe(false);
    expect(evaluateReviewGates({ ...cleanGateInput, plan_hash_matches: false }).passable).toBe(false);
    expect(evaluateReviewGates({ ...cleanGateInput, runtime_baseline_ready: false }).passable).toBe(false);
  });

  it("expected_failure command status does not block (reproduction success)", () => {
    expect(evaluateReviewGates({ ...cleanGateInput, command_statuses: ["expected_failure"] }).passable).toBe(true);
  });
});

describe("M7 verdict enforcement", () => {
  const passable: ReviewGateResult = { passable: true, diagnostics: [] };
  const notPassable: ReviewGateResult = { passable: false, diagnostics: [] };
  it("a failed gate or any blocker forces blocked; otherwise pass / pass_with_non_blocking", () => {
    expect(resolveReviewVerdict({ gates: notPassable, reviewer_blocker_count: 0, has_non_blocking: false })).toBe("blocked");
    expect(resolveReviewVerdict({ gates: passable, reviewer_blocker_count: 1, has_non_blocking: false })).toBe("blocked");
    expect(resolveReviewVerdict({ gates: passable, reviewer_blocker_count: 0, has_non_blocking: true })).toBe("pass_with_non_blocking_issues");
    expect(resolveReviewVerdict({ gates: passable, reviewer_blocker_count: 0, has_non_blocking: false })).toBe("pass");
  });
});

function blockedReview(): ReviewCycle {
  const inProgress = ReviewCycleSchema.parse({
    schema_version: 1, hash_algorithm: "sha256-canonical-json-v1", id: "review:1", state: "in_progress",
    review_hash: null, kind: "initial_review", attempt_id: "attempt:1", producer: reviewer,
    self_review_override: false, template_id: "focused_implementation_review_v1", template_version: 1,
    verdict: null, reviewed_at: null,
    reviewed_refs: { work_packet_revision: 1, packet_approval_hash: "pah", implementation_plan_hash: "iph", evidence_policy_resolution_hash: "eph", attempt_hash: "ath", reviewed_diff_hash: "diff", post_attempt_tree_hash: "post", focused_fix_instruction_id: null, focused_fix_instruction_hash: null, changed_files_hash: "cfh", evidence_refs: [], waiver_refs: [] },
    reviewed_blocker_ids: ["b1"], scope_expansion_reason: null, evidence_satisfaction: [], commands: [],
    blockers: [buildReviewBlocker({ id: "b1", title: "Null deref", paths: ["src/x.ts"], rationale: "x may be null", suggested_focus: "guard x" })],
    non_blocking: [], summary: "blocked"
  });
  if (inProgress.state !== "in_progress") throw new Error("expected in_progress");
  return sealReviewCycle(inProgress, { verdict: "blocked", reviewed_at: "2026-01-01T00:00:00.000Z" });
}

describe("M7 focused fix instruction from blockers (no laundering)", () => {
  const coordinator: LineageProducer = { ...reviewer, role: "coordinator", agent_instance_id: "sg-role-coordinator" };

  it("binds the exact reviewer blocker text hash and seals", () => {
    const review = blockedReview();
    const result = buildFocusedFixInstruction({ id: "fix:1", producer: coordinator, source_review: review, allowed_files: ["src/x.ts"], allowed_globs: ["src/**"] });
    expect(result.instruction?.state).toBe("sealed");
    const ref = result.instruction?.reviewer_blocker_refs[0];
    expect(ref?.blocker_id).toBe("b1");
    expect(ref?.blocker_text_hash).toBe(review.blockers[0]?.blocker_text_hash);
  });

  it("rejects allowed_files outside the boundary", () => {
    const result = buildFocusedFixInstruction({ id: "fix:2", producer: coordinator, source_review: blockedReview(), allowed_files: ["evil/y.ts"], allowed_globs: ["src/**"] });
    expect(result.instruction).toBeNull();
    expect(result.diagnostics.some((d) => d.code === "FIX_ALLOWED_FILE_OUTSIDE_BOUNDARY")).toBe(true);
  });

  it("rejects referencing a blocker absent from the source review (no fabricated blockers)", () => {
    const result = buildFocusedFixInstruction({ id: "fix:3", producer: coordinator, source_review: blockedReview(), blocker_ids: ["b1", "bX"], allowed_files: ["src/x.ts"], allowed_globs: ["src/**"] });
    expect(result.instruction).toBeNull();
    expect(result.diagnostics.some((d) => d.code === "FIX_BLOCKER_NOT_FOUND")).toBe(true);
  });
});

describe("M7 re-review coverage", () => {
  it("requires covering every fix blocker and a reason for widening", () => {
    expect(evaluateRereviewCoverage({ fix_instruction_blocker_ids: ["b1"], rereview_blocker_ids: ["b1"], scope_expansion_reason: null }).covered).toBe(true);
    const missing = evaluateRereviewCoverage({ fix_instruction_blocker_ids: ["b1", "b2"], rereview_blocker_ids: ["b1"], scope_expansion_reason: null });
    expect(missing.covered).toBe(false);
    expect(missing.diagnostics.some((d) => d.code === "REREVIEW_BLOCKER_NOT_COVERED")).toBe(true);
    const widened = evaluateRereviewCoverage({ fix_instruction_blocker_ids: ["b1"], rereview_blocker_ids: ["b1", "b9"], scope_expansion_reason: null });
    expect(widened.diagnostics.some((d) => d.code === "REREVIEW_SCOPE_EXPANDED_WITHOUT_REASON")).toBe(true);
    expect(evaluateRereviewCoverage({ fix_instruction_blocker_ids: ["b1"], rereview_blocker_ids: ["b1", "b9"], scope_expansion_reason: "found a regression" }).covered).toBe(true);
  });
});
