import { z } from "zod";
import type { RoleName } from "../role-config/config.ts";

/** M9: the deterministic workflow engine — the authoritative lifecycle (the legacy flat `WorkStatus`
 * is removed in M9.5). Encodes the design's state table: valid transitions, invalidation routing to
 * the earliest valid prior state, and a coordinator next-actor resolver. Pure functions; the live
 * CLI/MCP action surface is wired in M9.5. */

export const WORKFLOW_STATES = [
  "packet_draft",
  "packet_approved",
  "evidence_preparation_authorized",
  "evidence_preparation_attempt_complete",
  "evidence_prep_review_blocked",
  "evidence_preparation_complete",
  "implementation_authorized",
  "implementation_attempt_complete",
  "validation_pending",
  "validation_recorded",
  "validation_satisfied",
  "validation_failed",
  "review_pending",
  "review_blocked",
  "clarification_pending",
  "fix_authorized",
  "fix_attempt_complete",
  "rereview_pending",
  "review_passed",
  "review_complete",
  "complete",
  "cancelled"
] as const;
export type WorkflowState = typeof WORKFLOW_STATES[number];
export const WorkflowStateSchema = z.enum(WORKFLOW_STATES);

export const TERMINAL_STATES: ReadonlySet<WorkflowState> = new Set(["complete", "cancelled"]);

/** Allowed forward transitions per the design's state table. */
export const WORKFLOW_TRANSITIONS: Record<WorkflowState, readonly WorkflowState[]> = {
  packet_draft: ["packet_approved"],
  packet_approved: ["evidence_preparation_authorized", "implementation_authorized"],
  evidence_preparation_authorized: ["evidence_preparation_attempt_complete", "evidence_prep_review_blocked"],
  evidence_preparation_attempt_complete: ["evidence_preparation_complete", "evidence_prep_review_blocked"],
  evidence_prep_review_blocked: ["evidence_preparation_authorized", "packet_draft"],
  evidence_preparation_complete: ["implementation_authorized"],
  implementation_authorized: ["implementation_attempt_complete"],
  implementation_attempt_complete: ["validation_pending"],
  validation_pending: ["validation_recorded"],
  validation_recorded: ["validation_satisfied", "validation_failed"],
  validation_satisfied: ["review_pending", "rereview_pending"],
  validation_failed: ["review_pending", "rereview_pending", "validation_pending"],
  review_pending: ["review_blocked", "review_passed"],
  review_blocked: ["fix_authorized", "clarification_pending"],
  clarification_pending: ["packet_draft", "fix_authorized", "review_pending", "review_blocked", "clarification_pending", "cancelled"],
  fix_authorized: ["fix_attempt_complete", "clarification_pending"],
  fix_attempt_complete: ["validation_pending"],
  rereview_pending: ["review_blocked", "review_passed"],
  review_passed: ["review_complete"],
  // review_complete -> complete is the human completion gate (work.complete, Yes); No routes back to
  // review_blocked for rework. (RUNTIME_BASELINE_ORIGINATION_DESIGN.md.)
  review_complete: ["complete", "review_blocked"],
  complete: [],
  cancelled: []
};

export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  return WORKFLOW_TRANSITIONS[from].includes(to);
}

/** Transitions whose TARGET is the output of mechanical/review work: they must be set by work.loop.record
 * (which appends the sealed lineage record AND enforces the producer identity — #11), never by the bare
 * work.loop.advance. Otherwise the coordinator could skip the implementation/review gate and its identity
 * enforcement by simply advancing. (Validation outcomes + coordinator routing stay advance-legit.) */
const RECORD_GATED_TRANSITIONS: ReadonlySet<string> = new Set([
  "implementation_authorized->implementation_attempt_complete",
  "fix_authorized->fix_attempt_complete",
  "evidence_preparation_authorized->evidence_preparation_attempt_complete",
  "review_pending->review_passed",
  "review_pending->review_blocked",
  "rereview_pending->review_passed",
  "rereview_pending->review_blocked"
]);
export function isRecordGatedTransition(from: WorkflowState, to: WorkflowState): boolean {
  return RECORD_GATED_TRANSITIONS.has(`${from}->${to}`);
}

/** Throwing variant for callers that should never attempt an invalid transition. */
export function assertTransition(from: WorkflowState, to: WorkflowState): void {
  if (!canTransition(from, to)) {
    throw new Error(`invalid workflow transition: ${from} -> ${to}`);
  }
}

// --- Invalidation routing ---------------------------------------------------------------------

export type InvalidationEvent =
  | "approval_staled"
  | "boundary_violation"
  | "evidence_invalidated"
  | "attempt_hash_invalid"
  | "clarification_withdrawn"
  | "clarification_superseded"
  | "work_abandoned";

const AUTHORIZATION_FOR: Partial<Record<WorkflowState, WorkflowState>> = {
  implementation_authorized: "implementation_authorized",
  implementation_attempt_complete: "implementation_authorized",
  fix_authorized: "fix_authorized",
  fix_attempt_complete: "fix_authorized",
  evidence_preparation_authorized: "evidence_preparation_authorized",
  evidence_preparation_attempt_complete: "evidence_preparation_authorized"
};

/** Map an invalidating event to its single deterministic destination (design "Invalidation routing").
 * The machine must never silently remain in a state whose guards no longer hold. */
export function routeInvalidation(event: InvalidationEvent, current: WorkflowState): WorkflowState {
  switch (event) {
    case "approval_staled":
      // Approved-payload/runtime/evidence-policy/plan-hash staling → re-approval required.
      return "packet_draft";
    case "evidence_invalidated":
      // New failing validation / unexpected mutation / invalidated evidence.
      return "validation_pending";
    case "boundary_violation":
    case "attempt_hash_invalid":
      // Return to the most recent valid authorization state for a fresh sealed attempt; if there is
      // none (not in an authorized/attempt state), re-approval is required.
      return AUTHORIZATION_FOR[current] ?? "packet_draft";
    case "clarification_withdrawn":
      // The originating blocker still stands.
      return "review_blocked";
    case "clarification_superseded":
      return "clarification_pending";
    case "work_abandoned":
      return "cancelled";
    default: {
      // Exhaustiveness guard: adding an InvalidationEvent without a case is a compile error.
      const unexpected: never = event;
      return unexpected;
    }
  }
}

// --- Coordinator next-actor resolver ----------------------------------------------------------

export type WorkflowActor = RoleName | "human" | "system";

export interface NextStep {
  actor: WorkflowActor | null;
  action: string;
}

/** Who acts next from a given state, and what they do (the coordinator's routing decision). */
export function nextStep(state: WorkflowState): NextStep {
  switch (state) {
    case "packet_draft": return { actor: "human", action: "approve_work_packet" };
    case "packet_approved": return { actor: "coordinator", action: "request_implementation_authorization" };
    case "evidence_preparation_authorized": return { actor: "implementer", action: "run_evidence_preparation" };
    case "evidence_preparation_attempt_complete": return { actor: "validator", action: "validate_evidence_preparation" };
    case "evidence_prep_review_blocked": return { actor: "coordinator", action: "route_evidence_prep_blocker" };
    case "evidence_preparation_complete": return { actor: "coordinator", action: "request_implementation_authorization" };
    case "implementation_authorized": return { actor: "implementer", action: "run_implementation" };
    case "implementation_attempt_complete": return { actor: "validator", action: "run_validation" };
    case "validation_pending": return { actor: "validator", action: "run_validation" };
    case "validation_recorded": return { actor: "system", action: "evaluate_validation_satisfaction" };
    case "validation_satisfied": return { actor: "reviewer", action: "run_focused_review" };
    case "validation_failed": return { actor: "reviewer", action: "record_blocked_review" };
    case "review_pending": return { actor: "reviewer", action: "run_focused_review" };
    case "review_blocked": return { actor: "coordinator", action: "build_focused_fix_instruction" };
    case "clarification_pending": return { actor: "human", action: "answer_clarification" };
    case "fix_authorized": return { actor: "fixer", action: "run_blocker_fix" };
    case "fix_attempt_complete": return { actor: "validator", action: "run_validation" };
    case "rereview_pending": return { actor: "rereviewer", action: "run_focused_rereview" };
    case "review_passed": return { actor: "coordinator", action: "complete_review" };
    case "review_complete": return { actor: "human", action: "approve_completion" };
    case "complete": return { actor: null, action: "none" };
    case "cancelled": return { actor: null, action: "none" };
  }
}
