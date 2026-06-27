import { z } from "zod";
import { HumanDecisionRefV1Schema, ProducerIdentitySchema } from "./human-decision.ts";

// EvidenceSourceRefV1 (Normative implementation appendix). The discriminated source of truth a
// satisfaction predicate dereferences (by id + hash) to a source-fact record. Milestone 1B does
// not build these from a live runner (that is M4); they are inputs to the readiness diagnostics.
//
// `accepted_by` for manual evidence is either a producer identity or a human decision ref; the two
// shapes are key-disjoint so a plain union resolves them unambiguously.
export const ManualEvidenceAcceptedBySchema = z.union([ProducerIdentitySchema, HumanDecisionRefV1Schema]);
export type ManualEvidenceAcceptedBy = z.infer<typeof ManualEvidenceAcceptedBySchema>;

export const EvidenceSourceRefV1Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("command_result"),
    id: z.string(),
    command_result_hash: z.string()
  }).strict(),
  z.object({
    kind: z.literal("manual_evidence"),
    id: z.string(),
    manual_evidence_hash: z.string(),
    accepted_by: ManualEvidenceAcceptedBySchema
  }).strict(),
  z.object({
    kind: z.literal("review_attestation"),
    review_id: z.string(),
    review_hash: z.string()
  }).strict()
]);
export type EvidenceSourceRefV1 = z.infer<typeof EvidenceSourceRefV1Schema>;

export type EvidenceSourceKind = EvidenceSourceRefV1["kind"];
