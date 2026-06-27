import { z } from "zod";
import { Sha256HexSchema } from "../schemas/embedded.ts";
import { sha256CanonicalJson } from "./canonical-hash.ts";
import { SCHEMA_VERSION_V1 } from "./constants.ts";
import {
  AcEvidenceClassificationSchema,
  DocsImpactSchema,
  EvidenceModeSchema,
  EvidenceRequirementSchema,
  PlanTestEntryKindSchema,
  ReadinessGateSchema,
  RequiredForSchema,
  WaiverAuthoritySchema,
  WorkKindSchema,
  WorkspaceEditIntentSchema
} from "./enums.ts";

// Normative appendix: ProducerIdentity / HumanDecisionRefV1 / refs.
export const ProducerIdentitySchema = z.object({
  principal_id: z.string().nullable(),
  agent_instance_id: z.string().nullable()
}).strict();
export type ProducerIdentity = z.infer<typeof ProducerIdentitySchema>;

export const HumanDecisionRefV1Schema = z.object({
  decision_id: z.string(),
  decision_type: z.string(),
  revision: z.number().int(),
  decision_hash: Sha256HexSchema
}).strict();
export type HumanDecisionRefV1 = z.infer<typeof HumanDecisionRefV1Schema>;

export const SourceArtifactRefV1Schema = z.object({
  artifact_type: z.string(),
  id: z.string(),
  revision: z.number().int(),
  governed_content_hash: z.string()
}).strict();
export type SourceArtifactRefV1 = z.infer<typeof SourceArtifactRefV1Schema>;

export const ReviewAttestationRefV1Schema = z.object({
  review_id: z.string(),
  review_hash: z.string()
}).strict();
export type ReviewAttestationRefV1 = z.infer<typeof ReviewAttestationRefV1Schema>;

// HumanDecisionPayloadV1 discriminated union (Normative appendix).
export const WorkKindExceptionPayloadV1Schema = z.object({
  work_kind: WorkKindSchema.optional(),
  docs_impact: DocsImpactSchema.optional(),
  workspace_edit_intent: WorkspaceEditIntentSchema.optional(),
  rationale_code: z.string()
}).strict();

export const PlanWaivedNoopDecisionPayloadV1Schema = z.object({
  reason_code: z.enum(["no_edit_analysis", "non_implementation_only"]),
  rationale_code: z.string()
}).strict();

export const AcEvidenceClassificationPayloadV1Schema = z.object({
  ac_id: z.string(),
  classification: AcEvidenceClassificationSchema,
  mode: EvidenceModeSchema,
  rationale_code: z.string(),
  reclassifies_signal: z.boolean()
}).strict();

export const AdditionalValidationRequirementPayloadV1Schema = z.object({
  ac_id: z.string(),
  entry_kind: PlanTestEntryKindSchema,
  command_or_evidence: z.string(),
  evidence_type: EvidenceRequirementSchema,
  required_for: RequiredForSchema,
  waiver_authority: WaiverAuthoritySchema.nullable(),
  rationale_code: z.string()
}).strict();

const PreapprovalWaivedRequirementSchema = z.union([
  z.object({ kind: z.literal("evidence"), evidence: EvidenceRequirementSchema }).strict(),
  z.object({ kind: z.literal("validation_requirement"), requirement_id: z.string() }).strict()
]);

export const PreapprovalWaiverIntentPayloadV1Schema = z.object({
  ac_id: z.string(),
  waived_requirement: PreapprovalWaivedRequirementSchema,
  gates: z.array(z.enum(["authorization", "review_entry", "review_verdict", "completion"])),
  requested_authority: WaiverAuthoritySchema,
  rationale_code: z.string()
}).strict();

export const HumanDecisionPayloadV1Schema = z.discriminatedUnion("decision_type", [
  z.object({ decision_type: z.literal("work_kind_exception_v1"), payload: WorkKindExceptionPayloadV1Schema }).strict(),
  z.object({ decision_type: z.literal("plan_waived_noop_v1"), payload: PlanWaivedNoopDecisionPayloadV1Schema }).strict(),
  z.object({ decision_type: z.literal("ac_evidence_classification_v1"), payload: AcEvidenceClassificationPayloadV1Schema }).strict(),
  z.object({ decision_type: z.literal("additional_validation_requirement_v1"), payload: AdditionalValidationRequirementPayloadV1Schema }).strict(),
  z.object({ decision_type: z.literal("preapproval_waiver_intent_v1"), payload: PreapprovalWaiverIntentPayloadV1Schema }).strict()
]);
export type HumanDecisionPayloadV1 = z.infer<typeof HumanDecisionPayloadV1Schema>;
export type HumanDecisionTypeV1 = HumanDecisionPayloadV1["decision_type"];

export interface DecisionWithRefV1 {
  ref: HumanDecisionRefV1;
  payload: HumanDecisionPayloadV1;
}

// HumanDecisionHashProjectionV1 = { schema_version, decision_type, revision, payload }.
export function humanDecisionHashProjection(payload: HumanDecisionPayloadV1, revision: number): {
  schema_version: number;
  decision_type: HumanDecisionTypeV1;
  revision: number;
  payload: HumanDecisionPayloadV1["payload"];
} {
  return { schema_version: SCHEMA_VERSION_V1, decision_type: payload.decision_type, revision, payload: payload.payload };
}

export function decisionHashV1(payload: HumanDecisionPayloadV1, revision: number): string {
  return sha256CanonicalJson(humanDecisionHashProjection(payload, revision));
}

// A decision is valid when its recomputed decision_hash matches the ref (Normative appendix step 1).
export function decisionRefValid(decision: DecisionWithRefV1): boolean {
  return decisionHashV1(decision.payload, decision.ref.revision) === decision.ref.decision_hash;
}
