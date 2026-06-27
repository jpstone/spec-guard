import { randomUUID } from "node:crypto";
import { sha256HexCanonical } from "../canonical/hashes.ts";
import { normalizeSourceArtifactRefs } from "../canonical/source-refs.ts";
import { HumanDecisionSchema, type HumanDecision, type JsonValue } from "../schemas/embedded.ts";
import { assertCanonicalApprovedFields } from "./approved-fields.ts";
import { deriveApprovedFields, getDecisionTypeDefinition, isRegisteredDecisionType } from "./decision-types.ts";
import { assertJsonPointersExist } from "./json-pointer.ts";

export interface HumanDecisionBuildInput {
  action_id: string;
  decision_type: string;
  selected_number: number;
  raw_response: string;
  decision_prompt: string;
  // Usually true (a real human gate). Deterministic/system decisions (e.g. deterministic runtime-baseline
  // acceptance, where the runner — not a person — decides pass/fail) honestly record false.
  human_confirmed: boolean;
  prompt_id?: string | undefined;
  normalized_decision: string;
  final_decision: boolean;
  custom_response?: string | null | undefined;
  approved_fields?: string[] | undefined;
  approved_payload?: Record<string, JsonValue> | null | undefined;
  approved_payload_ref?: HumanDecision["approved_payload_ref"] | undefined;
  reviewed_payload?: Record<string, JsonValue> | null | undefined;
  review_snapshot_hash?: string | null | undefined;
  review_snapshot_revision?: string | null | undefined;
  approved_content_hash?: string | null | undefined;
  source_artifact_refs?: unknown[] | undefined;
  supersedes_decision_id?: string | null | undefined;
  superseded_by_decision_id?: string | null | undefined;
  target_artifact_revision?: number | null | undefined;
  parent_batch_snapshot_hash?: string | null | undefined;
  parent_batch_snapshot_revision?: string | null | undefined;
  source_interface?: string | undefined;
  at?: string | undefined;
}

export function generatedPromptId(actionId: string, decisionPrompt: string): string {
  return `prompt:${actionId}:${sha256HexCanonical(decisionPrompt)}`;
}

export function payloadRevision(hash: string): string {
  return `payload:${hash}`;
}

export function buildHumanDecision(input: HumanDecisionBuildInput): HumanDecision {
  const isFinal = input.final_decision;
  const registeredFields = deriveApprovedFields(input.decision_type, isFinal);
  if (isRegisteredDecisionType(input.decision_type) && input.approved_fields !== undefined) {
    throw new Error("callers must not supply approved_fields for registered standard decision types");
  }
  const approvedFields = registeredFields ?? (isFinal ? assertCanonicalApprovedFields(input.approved_fields ?? []) : []);
  if (!isRegisteredDecisionType(input.decision_type) && isFinal && approvedFields.length === 0) {
    throw new Error("custom final approval/selection decisions require explicit approved_fields");
  }
  if (!isRegisteredDecisionType(input.decision_type) && isFinal && input.approved_payload === undefined) {
    throw new Error("custom final approval/selection decisions require approved_payload");
  }
  if (!isRegisteredDecisionType(input.decision_type) && isFinal) {
    assertJsonPointersExist(input.approved_payload, approvedFields);
  }

  const definition = getDecisionTypeDefinition(input.decision_type);
  if (isFinal && definition?.approved_field_root === "human_decision_approved_payload" && input.approved_payload === undefined) {
    throw new Error(`${input.decision_type} requires approved_payload for final selecting decisions`);
  }
  const approvedPayload = isFinal ? (input.approved_payload ?? null) : null;
  const approvedPayloadHash = approvedPayload === null ? null : sha256HexCanonical(approvedPayload);
  const reviewedPayload = !isFinal && input.reviewed_payload !== undefined ? input.reviewed_payload : null;
  const reviewedPayloadHash = reviewedPayload === null ? null : sha256HexCanonical(reviewedPayload);

  const decision = {
    id: `decision:${randomUUID()}`,
    decision_type: input.decision_type,
    prompt_id: input.prompt_id ?? generatedPromptId(input.action_id, input.decision_prompt),
    prompt_text: input.decision_prompt,
    raw_response: input.raw_response,
    selected_number: input.selected_number,
    normalized_decision: input.normalized_decision,
    approved_fields: approvedFields,
    custom_response: input.custom_response ?? null,
    supersedes_decision_id: input.supersedes_decision_id ?? null,
    superseded_by_decision_id: input.superseded_by_decision_id ?? null,
    review_snapshot_hash: input.review_snapshot_hash ?? null,
    review_snapshot_revision: input.review_snapshot_revision ?? null,
    approved_content_hash: input.approved_content_hash ?? null,
    source_artifact_refs: normalizeSourceArtifactRefs(input.source_artifact_refs ?? []),
    approved_payload_hash: approvedPayloadHash,
    approved_payload_revision: approvedPayloadHash === null ? null : payloadRevision(approvedPayloadHash),
    approved_payload: approvedPayload,
    approved_payload_ref: input.approved_payload_ref ?? null,
    reviewed_payload_hash: reviewedPayloadHash,
    reviewed_payload_revision: reviewedPayloadHash === null ? null : payloadRevision(reviewedPayloadHash),
    reviewed_payload: reviewedPayload,
    target_artifact_revision: input.target_artifact_revision ?? null,
    parent_batch_snapshot_hash: input.parent_batch_snapshot_hash ?? null,
    parent_batch_snapshot_revision: input.parent_batch_snapshot_revision ?? null,
    source_interface: input.source_interface ?? "core",
    human_confirmed: input.human_confirmed,
    at: input.at ?? new Date().toISOString()
  } satisfies HumanDecision;
  return HumanDecisionSchema.parse(decision);
}

export function isDiscussDecision(normalizedDecision: string): boolean {
  return normalizedDecision.toLowerCase() === "discuss";
}

export function isDeclineLikeDecision(normalizedDecision: string): boolean {
  const value = normalizedDecision.toLowerCase();
  return value === "no" || value === "decline" || value === "declined" || value === "reject" || value === "rejected" || value === "block" || value === "blocked" || value === "do_not_use_custom_decision";
}
