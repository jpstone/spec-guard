import type { WorkPacket } from "../schemas/artifacts.ts";
import type { Diagnostic } from "../schemas/embedded.ts";
import { diagnostic } from "../actions/config.ts";
import { isUiClassification } from "./docs-policy.ts";

// MANDATORY mockup gate for UI work (PLANNING_BEFORE_APPROVAL_DESIGN.md). The agent must answer the mockup
// question before drafting ACs, so UI ACs aren't drafted from a guess and then discarded. workNext routes
// ONLY to the decision while pending; AC approval + packet approval block until it is resolved.

// A child WorkPacket inherits its ACs from an approved decomposed parent that already resolved the mockup
// question, so the gate never re-runs for a child (it would dead-end: ACs already exist, so the
// mockup-recording route is unreachable). Children are identified by parent_plan_id.
function mockupGateApplies(work: WorkPacket): boolean {
  return work.parent_plan_id === null && isUiClassification(work.classification);
}

/** True when a UI packet still has the mockup question unanswered — workNext routes only to the decision. */
export function mockupGatePending(work: WorkPacket): boolean {
  return mockupGateApplies(work) && work.mockup_decision === "pending";
}

// Whether a source_evidence.kind denotes a mockup/design reference. Tolerant on purpose: agents reasonably
// write "ui_mockup", "design_mockup", "wireframe", "figma", etc. The gate only needs to confirm the AC was
// derived from a visual design reference, not police an exact spelling — so accept the whole family rather
// than chase one canonical string.
export function isMockupEvidenceKind(kind: string): boolean {
  return /mockup|wireframe|figma|sketch|design|prototype/i.test(kind);
}

/** Blocking diagnostics for the mockup gate: pending blocks (UI), and a "present" decision must be backed
 * by at least one mockup/design-derived AC (any mockup-family source_evidence.kind) so it cannot be a
 * hollow bypass. */
export function mockupGateDiagnostics(work: WorkPacket): Diagnostic[] {
  if (!mockupGateApplies(work)) return [];
  if (work.mockup_decision === "pending") {
    return [diagnostic("MOCKUP_DECISION_REQUIRED", "UI work must resolve the mockup question before AC approval: set mockup_decision to \"present\" (the human has a mockup — obtain it, register it, and derive ACs from it) or \"none\" (no mockup — draft features directly). This prevents drafting ACs that get discarded.", "error", "/mockup_decision")];
  }
  if (work.mockup_decision === "present" && !work.acceptance_criteria.some((ac) => ac.source_evidence !== null && isMockupEvidenceKind(ac.source_evidence.kind))) {
    return [diagnostic("MOCKUP_EVIDENCE_REQUIRED", "mockup_decision is \"present\" but no acceptance criterion is derived from the mockup. Register the mockup and bind at least one AC to it via work.ac.bind_source_evidence (any mockup/design source_evidence.kind such as \"mockup\", \"ui_mockup\", \"wireframe\", or \"figma\" is accepted), or set mockup_decision to \"none\".", "error", "/acceptance_criteria")];
  }
  return [];
}
