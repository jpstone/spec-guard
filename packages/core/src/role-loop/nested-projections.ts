import { z } from "zod";
import { AcceptanceCriterionSchema, Sha256HexSchema, type AcceptanceCriterion, type RuntimeBaselineRef } from "../schemas/embedded.ts";
import { DocsPolicySchema } from "../schemas/enums.ts";
import { sha256CanonicalJson } from "./canonical-hash.ts";

// Nested approved-field projections for Milestone 1A.
//
// Decision D0 (confirmed): the AC, docs, and intent nested projections mirror the live
// `schemas/` values verbatim; the appendix's illustrative nested-enum values are
// non-authoritative where they differ. Platform/architecture are likewise projected by
// mirroring the live WorkPacket sub-objects rather than constructing decision-ref-shaped
// projections: building HumanDecisionRefV1 values requires decision-log dereferencing that
// belongs to the later identity/decision-binding milestone, and the migration rule forbids
// fabricating decisions.
//
// Sensitivity note: the platform/architecture mirror reproduces the prior `/platform` and
// `/architecture` approval surface — the same fields that already staled approval continue to
// stale it. It is NOT uniformly "more sensitive, never less" than the appendix's decision-ref
// projections: it OMITS the appendix's `decision_hash`/`approved_payload_hash`, so a same-id
// decision-content change is not detected here. Binding decision content into the approval hash
// is deferred to the identity/decision-binding milestone.
//
// runtime_baseline_ref is the exception: it is projected through RuntimeBaselineRefProjectionV1
// (below) rather than mirrored verbatim, because the live ref carries timestamp/storage-revision
// lineage that must not enter the packet approval hash.

// AcceptanceCriterionProjectionV1 == the live AcceptanceCriterion (D1: project
// `human|frontend_agent|source_derived` verbatim so `ac_content_hash` stays meaningful).
export const AcceptanceCriterionProjectionV1Schema = AcceptanceCriterionSchema;
export type AcceptanceCriterionProjectionV1 = AcceptanceCriterion;

export const AC_CONTENT_HASH_PROJECTION = "AcceptanceCriterionProjectionV1" as const;
export const AC_CONTENT_HASH_PROJECTION_VERSION = 1 as const;

export function acContentHashV1(ac: AcceptanceCriterionProjectionV1): string {
  return sha256CanonicalJson({
    projection: AC_CONTENT_HASH_PROJECTION,
    projection_version: AC_CONTENT_HASH_PROJECTION_VERSION,
    value: ac
  });
}

// WorkPacketIntentProjectionV1 mirrors the live WorkPacket.intent shape verbatim (D4: project
// the live field names; live uses `users_actors`).
export const WorkPacketIntentProjectionV1Schema = z.object({
  goal: z.string(),
  desired_outcomes: z.array(z.string()),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  users_actors: z.array(z.string()),
  edge_cases: z.array(z.string()),
  open_questions: z.array(z.string())
}).strict();
export type WorkPacketIntentProjectionV1 = z.infer<typeof WorkPacketIntentProjectionV1Schema>;

// ApprovedDocsPolicyProjectionV1 (D2: project the live 4-value docs policy enum plus BOTH
// `none_required_reason` and `not_applicable_reason`).
export const ApprovedDocsPolicyProjectionV1Schema = z.object({
  docs_policy: DocsPolicySchema,
  none_required_reason: z.string().nullable(),
  not_applicable_reason: z.string().nullable()
}).strict();
export type ApprovedDocsPolicyProjectionV1 = z.infer<typeof ApprovedDocsPolicyProjectionV1Schema>;

// Platform/architecture/runtime: mirror live sub-objects verbatim (see header note).
export const ApprovedPlatformProjectionV1Schema = z.object({
  required: z.boolean(),
  choice: z.string().nullable(),
  decision_id: z.string().nullable(),
  not_required_reason: z.string().nullable()
}).strict();
export type ApprovedPlatformProjectionV1 = z.infer<typeof ApprovedPlatformProjectionV1Schema>;

export const ApprovedArchitectureProjectionV1Schema = z.object({
  required: z.boolean(),
  required_reason: z.string().nullable(),
  not_required_reason: z.string().nullable(),
  decision_ids: z.array(z.string())
}).strict();
export type ApprovedArchitectureProjectionV1 = z.infer<typeof ApprovedArchitectureProjectionV1Schema>;

// The stack (framework/tooling) decision is bound to packet approval symmetrically with architecture
// (M11), so the approval hash covers both structural and stack decisions.
export const ApprovedStackProjectionV1Schema = z.object({
  required: z.boolean(),
  required_reason: z.string().nullable(),
  not_required_reason: z.string().nullable(),
  decision_ids: z.array(z.string())
}).strict();
export type ApprovedStackProjectionV1 = z.infer<typeof ApprovedStackProjectionV1Schema>;

export interface DocsPolicySource {
  policy: z.infer<typeof DocsPolicySchema>;
  none_required_reason: string | null;
  not_applicable_reason: string | null;
}

export function buildIntentProjectionV1(intent: WorkPacketIntentProjectionV1): WorkPacketIntentProjectionV1 {
  return WorkPacketIntentProjectionV1Schema.parse(intent);
}

export function buildDocsPolicyProjectionV1(docs: DocsPolicySource): ApprovedDocsPolicyProjectionV1 {
  return ApprovedDocsPolicyProjectionV1Schema.parse({
    docs_policy: docs.policy,
    none_required_reason: docs.none_required_reason,
    not_applicable_reason: docs.not_applicable_reason
  });
}

export function buildPlatformProjectionV1(platform: ApprovedPlatformProjectionV1): ApprovedPlatformProjectionV1 {
  return ApprovedPlatformProjectionV1Schema.parse(platform);
}

export function buildArchitectureProjectionV1(architecture: ApprovedArchitectureProjectionV1): ApprovedArchitectureProjectionV1 {
  return ApprovedArchitectureProjectionV1Schema.parse(architecture);
}

export function buildStackProjectionV1(stack: ApprovedStackProjectionV1): ApprovedStackProjectionV1 {
  return ApprovedStackProjectionV1Schema.parse(stack);
}

// RuntimeBaselineRefProjectionV1: a timestamp-free content/identity projection of the live
// RuntimeBaselineRef for inclusion in the packet approval hash. It keeps only the fields that
// identify the governed baseline content — `revision`, `acceptance_snapshot_hash` (the governed
// baseline content hash), and `acceptance_decision_id` — and EXCLUDES `accepted_at` (a
// timestamp), `acceptance_snapshot_revision` (a storage revision), and the always-null `id`.
// Re-accepting an identical baseline mints a fresh `accepted_at`/`acceptance_snapshot_revision`
// but, because neither is projected, must not stale an otherwise-current approval (§5 / appendix
// work_packet_approval_hash exclusion rule). `null` maps to `null`.
export const RuntimeBaselineRefProjectionV1Schema = z.object({
  revision: z.number().int().positive(),
  acceptance_snapshot_hash: Sha256HexSchema,
  acceptance_decision_id: z.string().min(1)
}).strict();
export type RuntimeBaselineRefProjectionV1 = z.infer<typeof RuntimeBaselineRefProjectionV1Schema>;

export function buildRuntimeBaselineRefProjectionV1(ref: RuntimeBaselineRef | null): RuntimeBaselineRefProjectionV1 | null {
  if (ref === null) return null;
  return RuntimeBaselineRefProjectionV1Schema.parse({
    revision: ref.revision,
    acceptance_snapshot_hash: ref.acceptance_snapshot_hash,
    acceptance_decision_id: ref.acceptance_decision_id
  });
}
