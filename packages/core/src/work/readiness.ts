import type { Config, WorkPacket } from "../schemas/artifacts.ts";
import type { Diagnostic } from "../schemas/embedded.ts";
import { diagnostic, storeForContext } from "../actions/config.ts";
import { validateDocsPolicyForClassification } from "./docs-policy.ts";
import { validateAcceptanceCriteria } from "./source-evidence.ts";
import type { ActionExecutionContext } from "../actions/context.ts";
import { ConfigSchema } from "../schemas/artifacts.ts";
import { packetApprovalDiagnostics } from "./packet-review.ts";
import { authorizationDiagnostics } from "./authorization-review.ts";
import { architectureRequirementState, isValidArchitectureNotRequiredReason } from "./architecture-requirement.ts";
import { bootstrapAcsMissing } from "./bootstrap-acs.ts";
import { greenfieldBaselineDeferred } from "./runtime-baseline-ref.ts";
import { mockupGateDiagnostics } from "./mockup-gate.ts";

// The diagnostics that block AC approval / the deterministic AC anchor (work.ac.establish). work.ac.establish
// runs these so bad ACs fail fast at anchor time instead of detonating later at packet review. (Churn fix #4.)
export const AC_APPROVAL_BLOCKING_CODES = ["WORK_TITLE_REQUIRED", "WORK_GOAL_REQUIRED", "WORK_AC_REQUIRED", "BOOTSTRAP_ACS_REQUIRED", "MOCKUP_DECISION_REQUIRED", "MOCKUP_EVIDENCE_REQUIRED", "AC_ID_NOT_UNIQUE", "SOURCE_DERIVED_AC_MISSING_EVIDENCE", "SOURCE_EVIDENCE_REFS_EMPTY", "SOURCE_EVIDENCE_HASH_MISMATCH", "SOURCE_ARTIFACT_REF_UNRESOLVED", "DOCS_POLICY_INVALID"];

export function hasDraftRequiredFields(work: WorkPacket): boolean {
  return work.title.trim().length > 0 && work.intent.goal.trim().length > 0 && work.acceptance_criteria.length > 0;
}

// Intent is complete with just title + goal — ACs are drafted later (after the structural choices), so
// the intent gate must NOT require them. workNext routes on this; the lifecycle stage still uses the
// fuller hasDraftRequiredFields. (WORK_ORIGINATION_DESIGN.md §4 — draft_complete split.)
export function hasIntentRequiredFields(work: WorkPacket): boolean {
  return work.title.trim().length > 0 && work.intent.goal.trim().length > 0;
}

export type WorkLifecycleStage =
  | "draft" | "pending_ac_approval" | "pending_packet_approval"
  | "approved" | "decomposed" | "authorized" | "in_progress" | "complete"
  | "blocked" | "deferred" | "archived";

export function statusForDraftCompleteness(work: WorkPacket): "draft" | "pending_ac_approval" {
  return hasDraftRequiredFields(work) ? "pending_ac_approval" : "draft";
}

/** Derive the human-readable lifecycle stage from the authoritative workflow_state + lifecycle
 * decisions + disposition (M9.7 replaced the stored flat WorkStatus). Orthogonal dispositions
 * (archived/deferred/blocked) take precedence; otherwise the role-loop workflow_state drives, with the
 * fine pre-approval gates (draft / pending_ac_approval / pending_packet_approval) derived from the
 * recorded human decisions. */
export function workLifecycleStage(work: WorkPacket): WorkLifecycleStage {
  if (work.disposition === "archived") return "archived";
  if (work.disposition === "deferred") return "deferred";
  if (work.disposition === "blocked") return "blocked";
  const state = work.workflow_state;
  if (state === "complete") return "complete";
  if (state === "implementation_authorized") return "authorized";
  if (state !== "packet_draft" && state !== "packet_approved" && state !== "cancelled") return "in_progress";
  // A decomposed parent that has cleared its broad packet approval is realized through its children and is
  // never directly authorized — report it as "decomposed" rather than "approved". (ALWAYS_PLAN_DESIGN.md.)
  if (work.decomposed && (state === "packet_approved" || work.lifecycle.packet_approval !== null)) return "decomposed";
  if (state === "packet_approved" || work.lifecycle.packet_approval !== null) return "approved";
  if (work.lifecycle.ac_approval !== null) return "pending_packet_approval";
  return statusForDraftCompleteness(work);
}

async function readConfigIfPresent(context: ActionExecutionContext): Promise<Config | null> {
  try { return ConfigSchema.parse((await storeForContext(context).readCurrent<Config>("config", null)).artifact); } catch { return null; }
}

export async function workReadinessDiagnostics(work: WorkPacket, context: ActionExecutionContext = {}): Promise<{ diagnostics: Diagnostic[]; draft_complete: boolean; intent_complete: boolean; ac_approval_ready: boolean; packet_approval_ready: boolean; authorization_ready: boolean; packet_approval_future_notes: string[] }> {
  const diagnostics: Diagnostic[] = [];
  if (work.title.trim().length === 0) diagnostics.push(diagnostic("WORK_TITLE_REQUIRED", "WorkPacket title is required before AC approval.", "error", "/title"));
  if (work.intent.goal.trim().length === 0) diagnostics.push(diagnostic("WORK_GOAL_REQUIRED", "WorkPacket intent.goal is required before AC approval.", "error", "/intent/goal"));
  if (work.acceptance_criteria.length === 0) diagnostics.push(diagnostic("WORK_AC_REQUIRED", "At least one AcceptanceCriterion is required before AC approval.", "error", "/acceptance_criteria"));
  if (bootstrapAcsMissing(work)) diagnostics.push(diagnostic("BOOTSTRAP_ACS_REQUIRED", "This work establishes a new platform/architecture/stack, so at least one bootstrap AcceptanceCriterion (bootstrap: true) covering repo bootstrap is required before AC approval — not only leaf-feature ACs.", "error", "/acceptance_criteria"));
  diagnostics.push(...mockupGateDiagnostics(work));
  diagnostics.push(...await validateAcceptanceCriteria(work.acceptance_criteria, context));
  const docsPolicyError = validateDocsPolicyForClassification({ classification: work.classification, policy: work.docs.policy, none_required_reason: work.docs.none_required_reason, not_applicable_reason: work.docs.not_applicable_reason });
  if (docsPolicyError !== null) diagnostics.push(diagnostic("DOCS_POLICY_INVALID", docsPolicyError, "error", "/docs/policy"));
  if (work.platform.required && work.platform.decision_id === null) diagnostics.push(diagnostic("PLATFORM_CHOICE_PENDING", "Required platform choice has not been recorded.", "warning", "/platform/decision_id"));
  const architectureRequirement = architectureRequirementState(work);
  if (architectureRequirement.classification_required && work.architecture.required === false && !isValidArchitectureNotRequiredReason(work.architecture.not_required_reason)) diagnostics.push(diagnostic("ARCHITECTURE_REQUIREMENT_EXCEPTION_INVALID", "This classification requires an architecture/stack choice unless architecture.not_required_reason documents a valid explicit exception.", "warning", "/architecture/not_required_reason"));
  if (architectureRequirement.required && work.architecture.decision_ids.length === 0) diagnostics.push(diagnostic("ARCHITECTURE_CHOICE_PENDING", "Required architecture/stack choice has not been recorded.", "warning", "/architecture/decision_ids"));
  const packetNotes: string[] = [];
  if (work.runtime_baseline_ref === null && !greenfieldBaselineDeferred(work) && work.target_id !== null) packetNotes.push("runtime_baseline_ref is required for packet approval readiness (inherit the target via work.target.attach)");
  const draftBlocking = diagnostics.filter((diag) => diag.severity === "error" && AC_APPROVAL_BLOCKING_CODES.includes(diag.code));
  const config = await readConfigIfPresent(context);
  let packet_approval_ready = false;
  let authorization_ready = false;
  if (config !== null) {
    const packetDiagnostics = await packetApprovalDiagnostics(work, config, context);
    const authDiagnostics = await authorizationDiagnostics(work, config, context).catch((error) => [diagnostic("AUTHORIZATION_READINESS_FAILED", error instanceof Error ? error.message : String(error), "error", "/work")]);
    diagnostics.push(...packetDiagnostics, ...authDiagnostics);
    packet_approval_ready = packetDiagnostics.every((diag) => diag.severity !== "error");
    authorization_ready = authDiagnostics.every((diag) => diag.severity !== "error");
  }
  return { diagnostics, draft_complete: hasDraftRequiredFields(work), intent_complete: hasIntentRequiredFields(work), ac_approval_ready: draftBlocking.length === 0, packet_approval_ready, authorization_ready, packet_approval_future_notes: packetNotes };
}
