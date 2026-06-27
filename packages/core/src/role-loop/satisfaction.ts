import type { EvidenceRequirement } from "./enums.ts";
import type { EvidenceRefV1 } from "./evidence-refs.ts";
import {
  resolveSourceFact,
  type CommandResultFactsV1,
  type ManualEvidenceFactsV1,
  type SourceFactsV1
} from "./source-facts.ts";

// Evidence satisfaction predicates v1 (Normative implementation appendix).
//
// Satisfaction is derived from an `EvidenceRefV1` PLUS the source fact resolved by id/hash from the
// ref's `source_ref`; a bare ref never asserts satisfaction, and an unavailable or hash-mismatched
// fact does not satisfy (the readiness layer turns those into diagnostics). Waivers are a SEPARATE
// effectiveness path combined at the readiness layer ("or by an effective waiver"); this module
// covers only evidence-ref-derived satisfaction.

// The active binding an evidence ref must match to count toward an AC/requirement obligation.
export interface RequirementBindingV1 {
  packet_approval_hash: string;
  evidence_policy_resolution_hash: string;
  ac_id: string;
  ac_content_hash: string;
}

// Generic evidence requirements (`{kind:"evidence", evidence}`) match an `EvidenceRefV1` by active
// packet approval hash, evidence policy hash, AC id/hash, `evidence_type`, and `requirement_id=null`.
// Validation requirements (`{kind:"validation_requirement", requirement_id}`) match ONLY by exact
// `requirement_id` plus the same binding hashes.
export function refMatchesRequirement(
  ref: EvidenceRefV1,
  effectiveEvidenceType: EvidenceRequirement,
  requirementId: string | null,
  binding: RequirementBindingV1
): boolean {
  if (ref.packet_approval_hash !== binding.packet_approval_hash) return false;
  if (ref.evidence_policy_resolution_hash !== binding.evidence_policy_resolution_hash) return false;
  if (ref.ac_id !== binding.ac_id) return false;
  if (ref.ac_content_hash !== binding.ac_content_hash) return false;
  if (requirementId === null) {
    // Generic evidence requirement: match by evidence_type + requirement_id=null.
    return ref.requirement_id === null && ref.evidence_type === effectiveEvidenceType;
  }
  // Validation requirement: the exact requirement id is authoritative.
  return ref.requirement_id === requirementId;
}

function commandResultBinds(fact: CommandResultFactsV1, acId: string, requirementId: string | null): boolean {
  if (!fact.bound_ac_ids.includes(acId)) return false;
  if (requirementId !== null && !fact.bound_requirement_ids.includes(requirementId)) return false;
  return true;
}

function manualEvidenceBinds(fact: ManualEvidenceFactsV1, acId: string): boolean {
  return fact.accepted && fact.bound_ac_ids.includes(acId);
}

// Whether a sealed reviewer attestation bound to the AC (and the requirement id when present) is
// available — required for `manual_smoke`/`target_rendered_runtime_smoke` when the gate entry's
// `requires_reviewer_attestation` is true.
export function reviewerAttestationPresent(facts: SourceFactsV1, acId: string, requirementId: string | null): boolean {
  return facts.review_attestations.some((attestation) =>
    attestation.sealed
    && attestation.attested_ac_ids.includes(acId)
    && (requirementId === null || attestation.attested_requirement_ids.includes(requirementId)));
}

export type RefSatisfactionStatus = "satisfied" | "unmet" | "not_found" | "hash_mismatch";

export interface RefSatisfactionResultV1 {
  status: RefSatisfactionStatus;
}

// Per-`EvidenceRequirement` satisfaction of a single matched `EvidenceRefV1` against the resolved
// source fact. `effectiveEvidenceType` is the requirement's evidence type (the gate entry's
// evidence, or the validation requirement's evidence_type), which for validation requirements is
// authoritative over the ref's own `evidence_type` label.
export function evidenceRefSatisfies(
  ref: EvidenceRefV1,
  params: {
    effectiveEvidenceType: EvidenceRequirement;
    requirementId: string | null;
    requiresReviewerAttestation: boolean;
    acId: string;
    facts: SourceFactsV1;
  }
): RefSatisfactionResultV1 {
  const resolution = resolveSourceFact(ref.source_ref, params.facts);
  if (!resolution.ok) return { status: resolution.reason };

  const { acId, requirementId } = { acId: params.acId, requirementId: params.requirementId };
  let satisfied = false;

  switch (params.effectiveEvidenceType) {
    case "automated_test":
      satisfied = resolution.kind === "command_result"
        && resolution.fact.status === "passed"
        && commandResultBinds(resolution.fact, acId, requirementId);
      break;
    case "passing_command":
      satisfied = resolution.kind === "command_result"
        && resolution.fact.purpose === "validation_expected_pass"
        && resolution.fact.status === "passed"
        && commandResultBinds(resolution.fact, acId, requirementId);
      break;
    case "reproduction":
      if (resolution.kind === "command_result") {
        satisfied = resolution.fact.purpose === "reproduction_expected_failure"
          && resolution.fact.status === "expected_failure"
          && resolution.fact.expected_failure_matched === true
          && commandResultBinds(resolution.fact, acId, requirementId);
      } else if (resolution.kind === "manual_evidence") {
        satisfied = manualEvidenceBinds(resolution.fact, acId);
      }
      break;
    case "target_rendered_runtime_reproduction":
      // Like `reproduction`, but the reproduction was captured in the target rendered runtime; the
      // ref's evidence_type label carries that assertion.
      if (resolution.kind === "command_result") {
        satisfied = resolution.fact.purpose === "reproduction_expected_failure"
          && resolution.fact.status === "expected_failure"
          && resolution.fact.expected_failure_matched === true
          && commandResultBinds(resolution.fact, acId, requirementId);
      } else if (resolution.kind === "manual_evidence") {
        satisfied = manualEvidenceBinds(resolution.fact, acId);
      }
      break;
    case "target_rendered_runtime_e2e":
      // Passed command result that launched the target view-rendering runtime (asserted by the
      // ref's evidence_type). jsdom/unit/mock-only runs carry a different evidence_type label.
      satisfied = resolution.kind === "command_result"
        && resolution.fact.status === "passed"
        && commandResultBinds(resolution.fact, acId, requirementId);
      break;
    case "target_rendered_runtime_smoke":
      if (resolution.kind === "command_result") {
        satisfied = resolution.fact.status === "passed" && commandResultBinds(resolution.fact, acId, requirementId);
      } else if (resolution.kind === "manual_evidence") {
        satisfied = manualEvidenceBinds(resolution.fact, acId);
      }
      if (satisfied && params.requiresReviewerAttestation) {
        satisfied = reviewerAttestationPresent(params.facts, acId, requirementId);
      }
      break;
    case "manual_smoke":
      satisfied = resolution.kind === "manual_evidence" && manualEvidenceBinds(resolution.fact, acId);
      if (satisfied && params.requiresReviewerAttestation) {
        satisfied = reviewerAttestationPresent(params.facts, acId, requirementId);
      }
      break;
    case "docs_static_check":
      if (resolution.kind === "command_result") {
        satisfied = resolution.fact.status === "passed" && commandResultBinds(resolution.fact, acId, requirementId);
      } else if (resolution.kind === "manual_evidence") {
        satisfied = manualEvidenceBinds(resolution.fact, acId);
      }
      break;
    case "review_attestation":
      // Satisfied only by a sealed review attestation that explicitly attests the AC/requirement;
      // used only for post-review completion (the readiness layer excludes it from review gates).
      satisfied = resolution.kind === "review_attestation"
        && resolution.fact.sealed
        && resolution.fact.attested_ac_ids.includes(acId)
        && (requirementId === null || resolution.fact.attested_requirement_ids.includes(requirementId));
      break;
  }

  return { status: satisfied ? "satisfied" : "unmet" };
}

// The `manual_or_smoke_allowed` satisfaction alternative: a sealed post-review review_attestation
// bound to the AC also satisfies the `manual_smoke` completion entry when no accepted manual source
// fact exists. This is a satisfaction alternative, NOT an added obligation — it does not mutate the
// approval-time hashed obligation set.
export function manualSmokeReviewAttestationAlternativeSatisfies(facts: SourceFactsV1, acId: string): boolean {
  const acceptedManualExists = facts.manual_evidence.some((fact) => manualEvidenceBinds(fact, acId));
  if (acceptedManualExists) return false;
  return facts.review_attestations.some((attestation) => attestation.sealed && attestation.attested_ac_ids.includes(acId));
}
