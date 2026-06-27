import { normalizeSourceArtifactRefs } from "../canonical/source-refs.ts";
import { canonicalJson } from "../canonical/canonical-json.ts";
import type { Config, WorkPacket } from "../schemas/artifacts.ts";
import type { Diagnostic, SourceArtifactRef } from "../schemas/embedded.ts";
import { buildEphemeralSnapshotIdentity } from "../snapshots/revisions.ts";
import { diagnostic } from "../actions/config.ts";
import type { ActionExecutionContext } from "../actions/context.ts";
import { workPacketSourceRef, acContentHash } from "./ac-snapshots.ts";
import { independenceBasis } from "../storage/spec-projection.ts";
import { sourceArtifactRefsForAcs, validateAcceptanceCriteria } from "./source-evidence.ts";
import { validateDocsPolicyForClassification } from "./docs-policy.ts";
import { acApprovalFreshnessDiagnostics } from "./ac-freshness.ts";
import { validateRuntimeBaselineRef, greenfieldBaselineDeferred } from "./runtime-baseline-ref.ts";
import { validateGlobPatterns } from "../paths/glob.ts";
import { validatePathPolicyGlobs } from "../paths/classify.ts";
import { architectureRequirementState, isValidArchitectureNotRequiredReason } from "./architecture-requirement.ts";
import { bootstrapAcsMissing } from "./bootstrap-acs.ts";
import { mockupGateDiagnostics } from "./mockup-gate.ts";
import { buildApprovedWorkPacketProjectionV1, type ApprovedWorkPacketProjectionV1 } from "../role-loop/packet-approval.ts";

// D3: the packet-review snapshot payload is the ApprovedWorkPacketProjectionV1, so the snapshot
// hash IS the work_packet_approval_hash (one hash scheme). Approved-field pointers gain the new
// implementation-plan/work-kind/evidence-policy approval-bound fields.
export const WORK_PACKET_APPROVED_FIELDS = ["/title", "/parent_plan_id", "/plan_slice_id", "/intent", "/acceptance_criteria", "/docs/policy", "/docs/none_required_reason", "/docs/not_applicable_reason", "/scope/allowed_globs", "/platform", "/architecture", "/stack", "/classification", "/runtime_baseline_ref", "/mockup_decision", "/work_kind_resolution", "/implementation_plan", "/evidence_policy_resolution"];

export interface PacketReview { payload: ApprovedWorkPacketProjectionV1; snapshot_hash: string; snapshot_revision: string; source_artifact_refs: SourceArtifactRef[]; rendered_summary: string; readiness: { packet_approval_ready: boolean; diagnostics: Diagnostic[] } }

export function packetReviewPayload(work: WorkPacket): ApprovedWorkPacketProjectionV1 {
  return buildApprovedWorkPacketProjectionV1(work).projection;
}

// requires_implementation_plan is resolved from the WorkPacket classification; a standard_plan
// must be present before approval when it is required (Milestone 1A hard block).
export function requiresImplementationPlanBlockDiagnostics(work: WorkPacket): Diagnostic[] {
  // A decomposed parent does no work itself (its children do), so it needs no standard_plan — the
  // requirement attaches only to leaf units (a 1-slice parent or the children). (ALWAYS_PLAN_DESIGN.md.)
  if (work.decomposed) return [];
  const projection = buildApprovedWorkPacketProjectionV1(work).projection;
  if (!projection.work_kind_resolution.requires_implementation_plan) return [];
  if (work.implementation_plan !== null && work.implementation_plan.kind === "standard_plan") return [];
  return [diagnostic("WORK_REQUIRES_IMPLEMENTATION_PLAN", "This work requires an approved standard_plan (work.plan.set) before packet approval; implementation_plan is missing or is a plan_waived_noop.", "error", "/implementation_plan")];
}

export async function packetApprovalDiagnostics(work: WorkPacket, config: Config, context: ActionExecutionContext = {}): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  if (work.lifecycle.ac_approval === null) diagnostics.push(diagnostic("AC_APPROVAL_REQUIRED", "Current AC approval is required before Work Packet approval.", "error", "/lifecycle/ac_approval"));
  diagnostics.push(...await acApprovalFreshnessDiagnostics(work, context));
  diagnostics.push(...await validateAcceptanceCriteria(work.acceptance_criteria, context));
  const sourceDerived = work.acceptance_criteria.filter((ac) => ac.source === "source_derived");
  if (sourceDerived.length > 0 && work.lifecycle.ac_approval === null) diagnostics.push(diagnostic("SOURCE_DERIVED_ACS_UNAPPROVED", "Source-derived ACs require current AC approval before packet approval.", "error", "/acceptance_criteria"));
  if (bootstrapAcsMissing(work)) diagnostics.push(diagnostic("BOOTSTRAP_ACS_REQUIRED", "This work establishes a new architecture/stack, so at least one bootstrap AcceptanceCriterion (bootstrap: true) covering repo bootstrap is required before packet approval.", "error", "/acceptance_criteria"));
  diagnostics.push(...mockupGateDiagnostics(work));
  // Greenfield establishes the baseline post-authorization as bootstrap work, so it is not required for
  // packet approval; modify_existing must reference an accepted (proven) baseline. (Origination-aware.)
  if (!greenfieldBaselineDeferred(work)) diagnostics.push(...(await validateRuntimeBaselineRef(work.runtime_baseline_ref, context)).diagnostics);
  const docsError = validateDocsPolicyForClassification({ classification: work.classification, policy: work.docs.policy, none_required_reason: work.docs.none_required_reason, not_applicable_reason: work.docs.not_applicable_reason });
  if (docsError !== null) diagnostics.push(diagnostic("DOCS_POLICY_INVALID", docsError, "error", "/docs/policy"));
  if (work.scope.allowed_globs.length === 0) diagnostics.push(diagnostic("ALLOWED_GLOBS_REQUIRED", "scope.allowed_globs must contain at least one valid glob before packet approval.", "error", "/scope/allowed_globs"));
  for (const glob of work.scope.allowed_globs) {
    try { validateGlobPatterns([glob]); } catch (error) { diagnostics.push(diagnostic("ALLOWED_GLOB_INVALID", error instanceof Error ? error.message : String(error), "error", "/scope/allowed_globs")); }
  }
  diagnostics.push(...validatePathPolicyGlobs(config));
  if (work.platform.required && work.platform.decision_id === null) diagnostics.push(diagnostic("PLATFORM_CHOICE_REQUIRED", "Required platform choice must be recorded before packet approval.", "error", "/platform/decision_id"));
  const architectureRequirement = architectureRequirementState(work);
  if (architectureRequirement.classification_required && work.architecture.required === false && !isValidArchitectureNotRequiredReason(work.architecture.not_required_reason)) diagnostics.push(diagnostic("ARCHITECTURE_REQUIREMENT_EXCEPTION_INVALID", "This classification requires an architecture/stack choice unless architecture.not_required_reason documents a valid explicit exception.", "error", "/architecture/not_required_reason"));
  if (architectureRequirement.required && work.architecture.decision_ids.length === 0) diagnostics.push(diagnostic("ARCHITECTURE_DECISION_REQUIRED", "Required architecture (structural) decision must be recorded before packet approval.", "error", "/architecture/decision_ids"));
  if (work.stack.required && work.stack.decision_ids.length === 0) diagnostics.push(diagnostic("STACK_DECISION_REQUIRED", "Required stack (framework/tooling) decision must be recorded before packet approval.", "error", "/stack/decision_ids"));
  diagnostics.push(...requiresImplementationPlanBlockDiagnostics(work));
  // Implementation planning happens BEFORE packet approval: a Work Breakdown must be auto-proposed and
  // established so it is co-reviewed in the bulk packet review (and visible in the Viewer). Routing computes
  // a breakdown-excluded readiness so workNext can offer the breakdown without dead-ending on this.
  // (PLANNING_BEFORE_APPROVAL_DESIGN.md.)
  if (work.work_breakdown_ref === null) diagnostics.push(diagnostic("WORK_BREAKDOWN_REQUIRED", "A Work Breakdown (slice breakdown) must be established (work.decompose) before packet approval — even a single slice — so it is co-reviewed in the bulk packet review.", "error", "/work_breakdown_ref"));

  // (C) Pre-approval independent spec review (SPEC_CLASSIFICATION_AND_REVIEW_DESIGN.md Part C). Only NON-CHILD
  // packets need their own: a child created from a decomposed parent inherits the parent's spec review (which
  // covered the whole breakdown), so the parent (parent_plan_id === null) is the unit that must pass it. This
  // also makes the batch-child path's skip of this gate intentional + consistent (children are exempt).
  // Suppressed once already approved, so it never retroactively flags a packet approved before this gate existed.
  if (work.parent_plan_id === null && work.lifecycle.packet_approval === null) {
    const latestSpecReview = work.spec_review_cycles.length > 0 ? work.spec_review_cycles[work.spec_review_cycles.length - 1]! : null;
    if (latestSpecReview === null) {
      diagnostics.push(diagnostic("SPEC_REVIEW_REQUIRED", "An independent spec review (work.spec_review.record) must PASS before packet approval — a SEPARATE reviewer agent reviews the ACs + their classifications, the Work Breakdown, and scope. Run it after the breakdown is established.", "error", "/spec_review_cycles"));
    } else if (latestSpecReview.verdict !== "pass") {
      diagnostics.push(diagnostic("SPEC_REVIEW_NOT_PASSED", `The latest spec review verdict is '${latestSpecReview.verdict}'${latestSpecReview.blockers.length > 0 ? ` (${latestSpecReview.blockers.length} blocker(s): ${latestSpecReview.blockers.map((blocker) => blocker.title).join("; ")})` : ""}. Resolve the spec blockers and re-review before packet approval.`, "error", "/spec_review_cycles"));
    } else if (latestSpecReview.reviewed_ac_content_hash !== acContentHash(work.acceptance_criteria) || canonicalJson(latestSpecReview.reviewed_work_breakdown_ref) !== canonicalJson(work.work_breakdown_ref)) {
      diagnostics.push(diagnostic("SPEC_REVIEW_STALE", "The spec changed (acceptance criteria or Work Breakdown) after the last passing spec review. Re-run the independent spec review before packet approval.", "error", "/spec_review_cycles"));
    } else {
      const basis = independenceBasis(latestSpecReview.producer.agent_instance_id, work.spec_author_agent_instance_id);
      if (basis === "self_review") {
        // Self-review (reviewer == author) — the one thing core CAN catch — blocks. (Enforced at the gate, not
        // only at record-time, which is skipped when there is no role config.)
        diagnostics.push(diagnostic("SPEC_REVIEW_NOT_INDEPENDENT", `The passing spec review was recorded by the same agent that authored the spec ('${latestSpecReview.producer.agent_instance_id}'). A self-reviewed spec is not independent — a genuinely separate reviewer agent must record it.`, "error", "/spec_review_cycles"));
      } else {
        // PASS, but independence is NOT verified: at best the reviewer label differs from the author (basis
        // "asserted"); if an identity is null ("unverified") not even that was shown. Either way core cannot
        // confirm a genuinely separate agent reviewed — surface it (warning, not block) so the human approves
        // knowing the truth; tool-acceptance is NOT proof of independence.
        const detail = basis === "unverified"
          ? "a null agent identity means independence is unverifiable (record a spec_author at work.ac.establish and a distinct reviewer identity)"
          : "Spec Guard only confirmed the reviewer label differs from the spec author — it cannot confirm a genuinely separate reviewer agent (own context/reasoning) actually reviewed";
        diagnostics.push(diagnostic("SPEC_REVIEW_INDEPENDENCE_UNVERIFIED", `The spec review verdict is PASS, but its independence is NOT verified: ${detail}. Before approving, confirm the review was truly delegated to a separate agent (not the author relabeling); do not treat it as proven-independent.`, "warning", "/spec_review_cycles"));
      }
    }
  }
  return diagnostics;
}

export async function createPacketReviewSnapshot(work: WorkPacket, config: Config, context: ActionExecutionContext = {}): Promise<PacketReview> {
  const payload = packetReviewPayload(work);
  const runtime = await validateRuntimeBaselineRef(work.runtime_baseline_ref, context);
  const refs = normalizeSourceArtifactRefs([workPacketSourceRef(work), ...(runtime.source_ref === null ? [] : [runtime.source_ref]), ...sourceArtifactRefsForAcs(work.acceptance_criteria)]);
  const identity = buildEphemeralSnapshotIdentity(payload, refs);
  const diagnostics = await packetApprovalDiagnostics(work, config, context);
  const ready = diagnostics.every((diag) => diag.severity !== "error");
  return { payload, snapshot_hash: identity.snapshot_hash, snapshot_revision: identity.snapshot_revision, source_artifact_refs: identity.source_artifact_refs, rendered_summary: `WorkPacket ${work.id} revision ${work.revision} is ${ready ? "ready" : "not ready"} for packet approval.`, readiness: { packet_approval_ready: ready, diagnostics } };
}
