import { describe, expect, it } from "vitest";
import {
  canTransition,
  assertTransition,
  routeInvalidation,
  nextStep,
  TERMINAL_STATES,
  WORKFLOW_TRANSITIONS,
  type WorkflowState
} from "../src/index.ts";

function walk(sequence: WorkflowState[]): void {
  for (let i = 0; i < sequence.length - 1; i += 1) {
    const from = sequence[i]!;
    const to = sequence[i + 1]!;
    expect(canTransition(from, to), `${from} -> ${to}`).toBe(true);
  }
}

describe("M9 transitions", () => {
  it("allows table-valid transitions and rejects invalid ones", () => {
    expect(canTransition("packet_draft", "packet_approved")).toBe(true);
    expect(canTransition("packet_approved", "implementation_authorized")).toBe(true);
    expect(canTransition("review_blocked", "fix_authorized")).toBe(true);
    expect(canTransition("packet_draft", "complete")).toBe(false);
    expect(canTransition("implementation_authorized", "review_passed")).toBe(false);
    expect(canTransition("complete", "packet_draft")).toBe(false);
  });

  it("assertTransition throws on an invalid transition", () => {
    expect(() => assertTransition("packet_draft", "complete")).toThrow();
    expect(() => assertTransition("packet_draft", "packet_approved")).not.toThrow();
  });

  it("terminal states have no outgoing transitions", () => {
    for (const terminal of TERMINAL_STATES) {
      expect(WORKFLOW_TRANSITIONS[terminal]).toEqual([]);
    }
  });

  it("walks the full single-packet happy path deterministically", () => {
    walk([
      "packet_draft", "packet_approved", "implementation_authorized", "implementation_attempt_complete",
      "validation_pending", "validation_recorded", "validation_satisfied", "review_pending",
      "review_passed", "review_complete", "complete"
    ]);
  });

  it("walks the blocked -> fix -> re-review loop to completion", () => {
    walk([
      "review_pending", "review_blocked", "fix_authorized", "fix_attempt_complete",
      "validation_pending", "validation_recorded", "validation_satisfied", "rereview_pending",
      "review_passed", "review_complete", "complete"
    ]);
  });

  it("walks the evidence-preparation path", () => {
    walk([
      "packet_approved", "evidence_preparation_authorized", "evidence_preparation_attempt_complete",
      "evidence_preparation_complete", "implementation_authorized"
    ]);
  });
});

describe("M9 invalidation routing", () => {
  it("approval staling routes to packet_draft", () => {
    expect(routeInvalidation("approval_staled", "implementation_authorized")).toBe("packet_draft");
    expect(routeInvalidation("approval_staled", "review_pending")).toBe("packet_draft");
  });

  it("evidence/validation invalidation routes to validation_pending", () => {
    expect(routeInvalidation("evidence_invalidated", "review_pending")).toBe("validation_pending");
  });

  it("boundary/attempt-hash violations route to the most recent authorization state", () => {
    expect(routeInvalidation("boundary_violation", "implementation_attempt_complete")).toBe("implementation_authorized");
    expect(routeInvalidation("attempt_hash_invalid", "implementation_attempt_complete")).toBe("implementation_authorized");
    expect(routeInvalidation("boundary_violation", "fix_attempt_complete")).toBe("fix_authorized");
    expect(routeInvalidation("attempt_hash_invalid", "evidence_preparation_attempt_complete")).toBe("evidence_preparation_authorized");
    // no authorization state in context -> re-approval required
    expect(routeInvalidation("boundary_violation", "review_pending")).toBe("packet_draft");
  });

  it("clarification routing: withdrawn keeps the blocker, superseded re-opens, abandonment cancels", () => {
    expect(routeInvalidation("clarification_withdrawn", "clarification_pending")).toBe("review_blocked");
    expect(routeInvalidation("clarification_superseded", "clarification_pending")).toBe("clarification_pending");
    expect(routeInvalidation("work_abandoned", "clarification_pending")).toBe("cancelled");
  });

  it("clarification_pending can route to packet_draft (payload-changing) or fix_authorized/review_pending (non-payload)", () => {
    // these are forward transitions the coordinator chooses based on the answer
    expect(canTransition("clarification_pending", "packet_draft")).toBe(true);
    expect(canTransition("clarification_pending", "fix_authorized")).toBe(true);
    expect(canTransition("clarification_pending", "review_pending")).toBe(true);
    expect(canTransition("clarification_pending", "cancelled")).toBe(true);
  });
});

describe("M9 coordinator next-actor", () => {
  it("routes each state to the role/human that acts next", () => {
    expect(nextStep("packet_draft").actor).toBe("human");
    expect(nextStep("implementation_authorized").actor).toBe("implementer");
    expect(nextStep("implementation_attempt_complete").actor).toBe("validator");
    expect(nextStep("validation_satisfied").actor).toBe("reviewer");
    expect(nextStep("review_blocked").actor).toBe("coordinator");
    expect(nextStep("fix_authorized").actor).toBe("fixer");
    expect(nextStep("rereview_pending").actor).toBe("rereviewer");
    expect(nextStep("clarification_pending").actor).toBe("human");
    expect(nextStep("complete").actor).toBeNull();
  });
});
