import {
  READINESS_DIAGNOSTIC_CODES,
  readinessDiagnostic,
  type ReadinessDiagnosticV1
} from "./diagnostics.ts";
import type { EvidenceMode, EvidenceRequirement, ReadinessGate, WaiverAuthority } from "./enums.ts";
import {
  evidencePolicyResolutionHash,
  type ApprovedEvidencePolicyProjectionV1,
  type EvidencePolicyPerAcV1,
  type EvidenceRequirementRef,
  type RequiredEvidenceGateEntryV1
} from "./evidence-policy.ts";
import type { EvidenceRefV1, EvidenceWaiverV1 } from "./evidence-refs.ts";
import {
  evidenceRefSatisfies,
  manualSmokeReviewAttestationAlternativeSatisfies,
  refMatchesRequirement,
  type RequirementBindingV1
} from "./satisfaction.ts";
import { EMPTY_SOURCE_FACTS_V1, type SourceFactsV1 } from "./source-facts.ts";

// Gate semantics + waiver effectiveness + readiness diagnostics (Normative implementation appendix).
// Milestone 1B is diagnostic-only: every readiness diagnostic is `blocking:true, enforced:false`.

// The effective evidence type of a gate entry: the generic evidence, or the validation
// requirement's evidence_type (which is authoritative for validation requirements). Returns null
// when a validation requirement id is not present in the per-AC policy.
function entryEvidenceType(entry: RequiredEvidenceGateEntryV1, perAc: EvidencePolicyPerAcV1): EvidenceRequirement | null {
  if (entry.requirement.kind === "evidence") return entry.requirement.evidence;
  const requirementId = entry.requirement.requirement_id;
  const requirement = perAc.validation_requirements.find((value) => value.requirement_id === requirementId);
  return requirement === undefined ? null : requirement.evidence_type;
}

function isReviewAttestationEntry(entry: RequiredEvidenceGateEntryV1, perAc: EvidencePolicyPerAcV1): boolean {
  return entryEvidenceType(entry, perAc) === "review_attestation";
}

// requirementsForGate (Gate semantics):
//   authorization  -> required_before_authorization
//   review_entry   -> []                              (review recording allowed once an attempt exists)
//   review_verdict -> authorization + completion, excluding review_attestation entries
//   completion     -> authorization + completion
export function requirementsForGate(perAc: EvidencePolicyPerAcV1, gate: ReadinessGate): RequiredEvidenceGateEntryV1[] {
  switch (gate) {
    case "authorization":
      return [...perAc.required_before_authorization];
    case "review_entry":
      return [];
    case "review_verdict":
      return [...perAc.required_before_authorization, ...perAc.required_before_completion].filter((entry) => !isReviewAttestationEntry(entry, perAc));
    case "completion":
      return [...perAc.required_before_authorization, ...perAc.required_before_completion];
  }
}

// evidenceRefEffectiveForGate (Gate semantics): an authorization ref is effective at every later
// gate; a completion ref is also visible during review entry/verdict.
export function evidenceRefEffectiveForGate(ref: EvidenceRefV1, gate: ReadinessGate): boolean {
  return ref.gate === gate
    || (ref.gate === "authorization" && gate !== "authorization")
    || (ref.gate === "completion" && (gate === "review_entry" || gate === "review_verdict"));
}

// authoritySatisfied (Waiver effectiveness predicate). Capability-based: a waiver satisfies a gate
// entry when it carries the approval refs the entry's required authority demands, so a strictly
// stronger `human_and_reviewer` waiver also satisfies a weaker `human`/`reviewer` requirement.
export function authoritySatisfied(requiredAuthority: WaiverAuthority | null, waiver: EvidenceWaiverV1): boolean {
  switch (requiredAuthority) {
    case null:
      return false; // no waiver needed/allowed for that requirement/gate
    case "human":
      return waiver.human_approval_ref !== null;
    case "reviewer":
      return waiver.reviewer_acceptance_ref !== null;
    case "human_and_reviewer":
      return waiver.human_approval_ref !== null && waiver.reviewer_acceptance_ref !== null;
  }
}

function waiverBoundToActive(waiver: EvidenceWaiverV1, binding: RequirementBindingV1): boolean {
  return waiver.packet_approval_hash === binding.packet_approval_hash
    && waiver.evidence_policy_resolution_hash === binding.evidence_policy_resolution_hash
    && waiver.ac_id === binding.ac_id
    && waiver.ac_content_hash === binding.ac_content_hash;
}

// waiverEffective (Waiver effectiveness predicate). The appendix signature is
// `waiverEffective(waiver, requiredAuthority, gate)`; the "bound to active packet/evidence
// policy/ac hash" clause needs the active binding, supplied explicitly here.
export function waiverEffective(
  waiver: EvidenceWaiverV1,
  requiredAuthority: WaiverAuthority | null,
  gate: ReadinessGate,
  binding: RequirementBindingV1
): boolean {
  return waiverBoundToActive(waiver, binding)
    && waiver.gates.includes(gate)
    && waiver.rejected_ref === null
    && authoritySatisfied(requiredAuthority, waiver);
}

export function waiverEffectiveForGate(
  waiver: EvidenceWaiverV1,
  entry: RequiredEvidenceGateEntryV1,
  gate: ReadinessGate,
  binding: RequirementBindingV1
): boolean {
  return waiverEffective(waiver, entry.waiver_authority, gate, binding);
}

function requirementRefEquals(a: EvidenceRequirementRef, b: EvidenceRequirementRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "evidence" && b.kind === "evidence") return a.evidence === b.evidence;
  if (a.kind === "validation_requirement" && b.kind === "validation_requirement") return a.requirement_id === b.requirement_id;
  return false;
}

export type GateEntrySatisfiedBy = "evidence_ref" | "waiver" | "review_attestation_alternative";

export interface GateEntrySatisfactionV1 {
  requirement: EvidenceRequirementRef;
  effective_evidence_type: EvidenceRequirement | null;
  satisfied: boolean;
  satisfied_by: GateEntrySatisfiedBy | null;
  matched_ref_id: string | null;
  diagnostics: ReadinessDiagnosticV1[];
}

export interface ReadinessEvaluationContextV1 {
  gate: ReadinessGate;
  binding: RequirementBindingV1;
  mode: EvidenceMode;
  refs: EvidenceRefV1[];
  waivers: EvidenceWaiverV1[];
  facts: SourceFactsV1;
}

// Is a single gate entry satisfied for this AC at this gate, via an evidence ref, an effective
// waiver, or the manual_smoke review-attestation alternative? Pure (no I/O); diagnostics carry
// blocking:true, enforced:false.
export function isGateEntrySatisfied(
  entry: RequiredEvidenceGateEntryV1,
  perAc: EvidencePolicyPerAcV1,
  ctx: ReadinessEvaluationContextV1
): GateEntrySatisfactionV1 {
  const acId = ctx.binding.ac_id;
  const requirementId = entry.requirement.kind === "validation_requirement" ? entry.requirement.requirement_id : null;
  const effectiveEvidenceType = entryEvidenceType(entry, perAc);

  // A validation requirement entry that is not present in the per-AC policy cannot be resolved.
  if (entry.requirement.kind === "validation_requirement" && effectiveEvidenceType === null) {
    return {
      requirement: entry.requirement,
      effective_evidence_type: null,
      satisfied: false,
      satisfied_by: null,
      matched_ref_id: null,
      diagnostics: [readinessDiagnostic(
        READINESS_DIAGNOSTIC_CODES.EVIDENCE_VALIDATION_REQUIREMENT_MISSING,
        `Validation requirement ${requirementId} referenced by a ${ctx.gate} gate entry is absent from AC ${acId}'s evidence policy.`,
        { gate: ctx.gate, ac_id: acId, requirement: entry.requirement }
      )]
    };
  }

  const evidenceType = effectiveEvidenceType as EvidenceRequirement;
  const refIssues: ReadinessDiagnosticV1[] = [];

  const candidates = ctx.refs.filter((ref) =>
    refMatchesRequirement(ref, evidenceType, requirementId, ctx.binding)
    && evidenceRefEffectiveForGate(ref, ctx.gate));

  for (const ref of candidates) {
    const result = evidenceRefSatisfies(ref, {
      effectiveEvidenceType: evidenceType,
      requirementId,
      requiresReviewerAttestation: entry.requires_reviewer_attestation,
      acId,
      facts: ctx.facts
    });
    if (result.status === "satisfied") {
      return { requirement: entry.requirement, effective_evidence_type: evidenceType, satisfied: true, satisfied_by: "evidence_ref", matched_ref_id: ref.id, diagnostics: [] };
    }
    if (result.status === "not_found") {
      refIssues.push(readinessDiagnostic(
        READINESS_DIAGNOSTIC_CODES.EVIDENCE_SOURCE_FACT_UNAVAILABLE,
        `Evidence ref ${ref.id} for AC ${acId} (${evidenceType}) points at a source fact that is unavailable; it does not satisfy the obligation.`,
        { gate: ctx.gate, ac_id: acId, requirement: entry.requirement }
      ));
    } else if (result.status === "hash_mismatch") {
      refIssues.push(readinessDiagnostic(
        READINESS_DIAGNOSTIC_CODES.EVIDENCE_SOURCE_FACT_HASH_MISMATCH,
        `Evidence ref ${ref.id} for AC ${acId} (${evidenceType}) resolves a source fact whose hash does not match; it does not satisfy the obligation.`,
        { gate: ctx.gate, ac_id: acId, requirement: entry.requirement }
      ));
    }
  }

  // Effective waiver: capability-based authority + bound + not rejected + gate covered, and the
  // waiver must waive this exact requirement.
  const waiver = ctx.waivers.find((candidate) =>
    requirementRefEquals(candidate.waived_requirement, entry.requirement)
    && waiverEffectiveForGate(candidate, entry, ctx.gate, ctx.binding));
  if (waiver !== undefined) {
    return { requirement: entry.requirement, effective_evidence_type: evidenceType, satisfied: true, satisfied_by: "waiver", matched_ref_id: null, diagnostics: [] };
  }

  // manual_or_smoke_allowed alternative: a sealed post-review review_attestation can satisfy the
  // manual_smoke completion entry when no accepted manual source fact exists.
  if (
    evidenceType === "manual_smoke"
    && ctx.mode === "manual_or_smoke_allowed"
    && ctx.gate === "completion"
    && manualSmokeReviewAttestationAlternativeSatisfies(ctx.facts, acId)
  ) {
    return { requirement: entry.requirement, effective_evidence_type: evidenceType, satisfied: true, satisfied_by: "review_attestation_alternative", matched_ref_id: null, diagnostics: [] };
  }

  const diagnostics = [
    ...refIssues,
    readinessDiagnostic(
      READINESS_DIAGNOSTIC_CODES.EVIDENCE_REQUIREMENT_NOT_SATISFIED,
      `AC ${acId} ${evidenceType} obligation for the ${ctx.gate} gate is not satisfied by available evidence or an effective waiver.`,
      { gate: ctx.gate, ac_id: acId, requirement: entry.requirement }
    )
  ];
  return { requirement: entry.requirement, effective_evidence_type: evidenceType, satisfied: false, satisfied_by: null, matched_ref_id: null, diagnostics };
}

export interface EvidenceReadinessInputV1 {
  gate: ReadinessGate;
  packet_approval_hash: string;
  evidence_policy: ApprovedEvidencePolicyProjectionV1;
  // Optional: recomputed from `evidence_policy` when absent (the canonical resolution hash).
  evidence_policy_resolution_hash?: string;
  refs?: EvidenceRefV1[];
  waivers?: EvidenceWaiverV1[];
  facts?: SourceFactsV1;
}

export interface AcGateReadinessV1 {
  ac_id: string;
  ac_content_hash: string;
  entries: GateEntrySatisfactionV1[];
}

export interface EvidenceReadinessResultV1 {
  gate: ReadinessGate;
  ready: boolean;
  ac_results: AcGateReadinessV1[];
  diagnostics: ReadinessDiagnosticV1[];
}

// Evaluate evidence readiness for one gate across every AC's obligations. Returns the per-entry
// satisfaction breakdown and the flattened blocking-but-not-enforced diagnostics for unsatisfied
// obligations.
export function evaluateEvidenceReadiness(input: EvidenceReadinessInputV1): EvidenceReadinessResultV1 {
  const evidencePolicyResolutionHashValue = input.evidence_policy_resolution_hash ?? evidencePolicyResolutionHash(input.evidence_policy);
  const refs = input.refs ?? [];
  const waivers = input.waivers ?? [];
  const facts = input.facts ?? EMPTY_SOURCE_FACTS_V1;

  const acResults: AcGateReadinessV1[] = [];
  const diagnostics: ReadinessDiagnosticV1[] = [];
  let ready = true;

  for (const perAc of input.evidence_policy.per_ac) {
    const binding: RequirementBindingV1 = {
      packet_approval_hash: input.packet_approval_hash,
      evidence_policy_resolution_hash: evidencePolicyResolutionHashValue,
      ac_id: perAc.ac_id,
      ac_content_hash: perAc.ac_content_hash
    };
    const ctx: ReadinessEvaluationContextV1 = { gate: input.gate, binding, mode: perAc.mode, refs, waivers, facts };
    const entries = requirementsForGate(perAc, input.gate).map((entry) => isGateEntrySatisfied(entry, perAc, ctx));
    for (const entry of entries) {
      if (!entry.satisfied) {
        ready = false;
        diagnostics.push(...entry.diagnostics);
      }
    }
    acResults.push({ ac_id: perAc.ac_id, ac_content_hash: perAc.ac_content_hash, entries });
  }

  return { gate: input.gate, ready, ac_results: acResults, diagnostics };
}
