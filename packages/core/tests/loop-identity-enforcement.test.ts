import { describe, it, expect } from "vitest";
import { buildDefaultRoleConfig } from "../src/index.ts";
import { enforceImplementationAttemptIdentity, enforceReviewCycleIdentity, enforceSpecReviewIdentity } from "../src/role-loop/loop-identity.ts";
import type { ImplementationAttempt, ReviewCycle, SpecReviewCycle } from "../src/lineage/records.ts";
import type { WorkPacket } from "../src/schemas/artifacts.ts";

// #11 enforcement is a pure check over the producer identities; test it directly (the happy path through
// work.loop.record is exercised by the e2e). Minimal casts — the functions only read producer + attempt links.
const config = buildDefaultRoleConfig(); // strict self-review by default; coordinator inline, rest subagent
const attempt = (role: string, agentId: string): ImplementationAttempt => ({ id: "attempt:1", producer: { role, agent_instance_id: agentId } } as unknown as ImplementationAttempt);
const review = (role: string, agentId: string, override = false): ReviewCycle => ({ attempt_id: "attempt:1", self_review_override: override, producer: { role, agent_instance_id: agentId } } as unknown as ReviewCycle);
const workImplementedBy = (agentId: string): WorkPacket => ({ implementation_attempts: [{ id: "attempt:1", producer: { agent_instance_id: agentId } }] } as unknown as WorkPacket);

describe("#11 role-loop identity enforcement", () => {
  it("allows implementation by the edit-capable implementer subagent", () => {
    expect(enforceImplementationAttemptIdentity(attempt("implementer", "sg-role-implementer"), config)).toEqual([]);
  });

  it("blocks implementation recorded by the coordinator (inline + not edit-capable)", () => {
    const codes = enforceImplementationAttemptIdentity(attempt("coordinator", "sg-role-coordinator"), config).map((diag) => diag.code);
    expect(codes).toContain("LOOP_IMPLEMENTATION_NOT_DELEGATED"); // not edit-capable
    expect(codes).toContain("LOOP_INLINE_MECHANICAL_WORK_BLOCKED"); // runs inline
  });

  it("blocks implementation recorded by a non-edit role (reviewer)", () => {
    expect(enforceImplementationAttemptIdentity(attempt("reviewer", "sg-role-reviewer"), config).map((diag) => diag.code)).toContain("LOOP_IMPLEMENTATION_NOT_DELEGATED");
  });

  it("a label-distinct review is non-blocking but flagged unverified (core can't prove a separate agent)", () => {
    const diags = enforceReviewCycleIdentity(review("reviewer", "sg-role-reviewer"), workImplementedBy("sg-role-implementer"), config);
    expect(diags.some((diag) => diag.severity === "error")).toBe(false); // does not block
    expect(diags.map((diag) => diag.code)).toContain("LOOP_REVIEW_INDEPENDENCE_UNVERIFIED"); // honest, like the spec review
  });

  it("blocks self-review: reviewer identity == the implementer that produced the attempt", () => {
    const codes = enforceReviewCycleIdentity(review("reviewer", "sg-role-implementer"), workImplementedBy("sg-role-implementer"), config).map((diag) => diag.code);
    expect(codes).toContain("LOOP_SELF_REVIEW_BLOCKED");
  });

  it("strict mode (the default) does NOT honor self_review_override", () => {
    const codes = enforceReviewCycleIdentity(review("reviewer", "sg-role-implementer", true), workImplementedBy("sg-role-implementer"), config).map((diag) => diag.code);
    expect(codes).toContain("LOOP_SELF_REVIEW_BLOCKED");
  });

  it("a non-strict mode honors a justified self_review_override", () => {
    const permissive = { ...config, self_review_identity_mode: "logical_role_identity_allowed_with_visible_trust_boundary" as const };
    expect(enforceReviewCycleIdentity(review("reviewer", "sg-role-implementer", true), workImplementedBy("sg-role-implementer"), permissive)).toEqual([]);
  });

  // Part C: pre-approval spec review independence (reviewer != spec author).
  const specReview = (role: string, agentId: string): SpecReviewCycle => ({ producer: { role, agent_instance_id: agentId } } as unknown as SpecReviewCycle);
  const workAuthoredBy = (agentId: string | null): WorkPacket => ({ spec_author_agent_instance_id: agentId } as unknown as WorkPacket);

  it("allows a spec review by an agent different from the spec author", () => {
    expect(enforceSpecReviewIdentity(specReview("reviewer", "sg-role-reviewer"), workAuthoredBy("sg-role-coordinator"), config)).toEqual([]);
  });

  it("blocks spec self-review: reviewer identity == the spec author", () => {
    expect(enforceSpecReviewIdentity(specReview("reviewer", "sg-role-coordinator"), workAuthoredBy("sg-role-coordinator"), config).map((diag) => diag.code)).toContain("SPEC_SELF_REVIEW_BLOCKED");
  });

  it("warns (non-blocking) when the spec author identity is null (unverifiable)", () => {
    expect(enforceSpecReviewIdentity(specReview("reviewer", "sg-role-reviewer"), workAuthoredBy(null), config).map((diag) => diag.code)).toContain("SPEC_REVIEW_IDENTITY_UNVERIFIED");
  });
});
