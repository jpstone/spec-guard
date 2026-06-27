import { z } from "zod";
import { sha256CanonicalJson } from "./canonical-hash.ts";
import { SCHEMA_VERSION_V1 } from "./constants.ts";
import { EvidenceRequirementSchema, ReadinessGateSchema, WaiverAuthoritySchema } from "./enums.ts";
import { EvidenceRequirementRefSchema } from "./evidence-policy.ts";
import { EvidenceSourceRefV1Schema } from "./evidence-source-ref.ts";
import { HumanDecisionRefV1Schema, ReviewAttestationRefV1Schema } from "./human-decision.ts";

// EvidenceRefV1 (Normative implementation appendix). Binds a source ref to a specific AC/gate
// evidence obligation under an active packet approval + evidence policy. Satisfaction is derived
// from this ref *plus* the resolved source fact; the bare ref does not assert satisfaction.
export const EvidenceRefV1Schema = z.object({
  schema_version: z.number().int(),
  id: z.string(),
  packet_approval_hash: z.string(),
  evidence_policy_resolution_hash: z.string(),
  ac_id: z.string(),
  ac_content_hash: z.string(),
  evidence_type: EvidenceRequirementSchema,
  requirement_id: z.string().nullable(),
  gate: ReadinessGateSchema,
  source_ref: EvidenceSourceRefV1Schema
}).strict();
export type EvidenceRefV1 = z.infer<typeof EvidenceRefV1Schema>;

export interface EvidenceRefInput {
  id: string;
  packet_approval_hash: string;
  evidence_policy_resolution_hash: string;
  ac_id: string;
  ac_content_hash: string;
  evidence_type: z.infer<typeof EvidenceRequirementSchema>;
  requirement_id?: string | null;
  gate: z.infer<typeof ReadinessGateSchema>;
  source_ref: z.infer<typeof EvidenceSourceRefV1Schema>;
}

export function buildEvidenceRefV1(input: EvidenceRefInput): EvidenceRefV1 {
  return EvidenceRefV1Schema.parse({
    schema_version: SCHEMA_VERSION_V1,
    id: input.id,
    packet_approval_hash: input.packet_approval_hash,
    evidence_policy_resolution_hash: input.evidence_policy_resolution_hash,
    ac_id: input.ac_id,
    ac_content_hash: input.ac_content_hash,
    evidence_type: input.evidence_type,
    requirement_id: input.requirement_id ?? null,
    gate: input.gate,
    source_ref: input.source_ref
  });
}

// EvidenceWaiverV1 (Normative implementation appendix). A separate post-approval record (not an
// EvidenceRefV1.source_ref variant). Effectiveness is capability-based — see `waiverEffective` in
// readiness.ts. `waiver_hash = hash(EvidenceWaiverV1 without waiver_hash)`.
const EvidenceWaiverWithoutHashShape = {
  schema_version: z.number().int(),
  id: z.string(),
  packet_approval_hash: z.string(),
  evidence_policy_resolution_hash: z.string(),
  ac_id: z.string(),
  ac_content_hash: z.string(),
  waived_requirement: EvidenceRequirementRefSchema,
  gates: z.array(ReadinessGateSchema),
  authority: WaiverAuthoritySchema,
  human_approval_ref: HumanDecisionRefV1Schema.nullable(),
  reviewer_acceptance_ref: ReviewAttestationRefV1Schema.nullable(),
  rejected_ref: z.union([HumanDecisionRefV1Schema, ReviewAttestationRefV1Schema]).nullable(),
  rationale_code: z.string()
} as const;

export const EvidenceWaiverWithoutHashSchema = z.object(EvidenceWaiverWithoutHashShape).strict();
export type EvidenceWaiverWithoutHash = z.infer<typeof EvidenceWaiverWithoutHashSchema>;

export const EvidenceWaiverV1Schema = z.object({
  ...EvidenceWaiverWithoutHashShape,
  waiver_hash: z.string()
}).strict();
export type EvidenceWaiverV1 = z.infer<typeof EvidenceWaiverV1Schema>;

// waiver_hash covers the canonical waiver projection excluding its own hash field.
export function evidenceWaiverHash(waiver: EvidenceWaiverWithoutHash): string {
  return sha256CanonicalJson(EvidenceWaiverWithoutHashSchema.parse(waiver));
}

export interface EvidenceWaiverInput {
  id: string;
  packet_approval_hash: string;
  evidence_policy_resolution_hash: string;
  ac_id: string;
  ac_content_hash: string;
  waived_requirement: z.infer<typeof EvidenceRequirementRefSchema>;
  gates: z.infer<typeof ReadinessGateSchema>[];
  authority: z.infer<typeof WaiverAuthoritySchema>;
  human_approval_ref?: z.infer<typeof HumanDecisionRefV1Schema> | null;
  reviewer_acceptance_ref?: z.infer<typeof ReviewAttestationRefV1Schema> | null;
  rejected_ref?: z.infer<typeof HumanDecisionRefV1Schema> | z.infer<typeof ReviewAttestationRefV1Schema> | null;
  rationale_code: string;
}

export function buildEvidenceWaiverV1(input: EvidenceWaiverInput): EvidenceWaiverV1 {
  const withoutHash = EvidenceWaiverWithoutHashSchema.parse({
    schema_version: SCHEMA_VERSION_V1,
    id: input.id,
    packet_approval_hash: input.packet_approval_hash,
    evidence_policy_resolution_hash: input.evidence_policy_resolution_hash,
    ac_id: input.ac_id,
    ac_content_hash: input.ac_content_hash,
    waived_requirement: input.waived_requirement,
    gates: input.gates,
    authority: input.authority,
    human_approval_ref: input.human_approval_ref ?? null,
    reviewer_acceptance_ref: input.reviewer_acceptance_ref ?? null,
    rejected_ref: input.rejected_ref ?? null,
    rationale_code: input.rationale_code
  });
  return EvidenceWaiverV1Schema.parse({ ...withoutHash, waiver_hash: evidenceWaiverHash(withoutHash) });
}
