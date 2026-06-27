import { sha256CanonicalJson } from "./canonical-hash.ts";
import { SCHEMA_VERSION_V1 } from "./constants.ts";
import { buildApprovedWorkPacketProjectionV1, type ApprovedWorkPacketProjectionV1, type ApprovedWorkPacketProjectionOptions } from "./packet-approval.ts";
import { specAsV1WorkPacket } from "../storage/aggregate-mapping.ts";
import type { AggregateWorkPacket, Spec } from "../schemas/work-packet.ts";
import type { Diagnostic } from "../schemas/embedded.ts";

/** A Spec's LOCAL content hash for per-Spec pre-approval review staleness — over ONLY the Spec's own approved
 *  content, EXCLUDING the inherited container fields (intent/platform/architecture/stack/runtime_baseline_ref) that
 *  `specAsV1WorkPacket` copies onto every Spec view. So editing one Spec moves only its hash; a container edit does
 *  not stale any per-Spec review (it stales the whole-WP coherence binding instead). */
export function specReviewContentHash(spec: Spec): string {
  return sha256CanonicalJson({
    classification: spec.classification,
    origination: spec.origination,
    acceptance_criteria: spec.acceptance_criteria,
    scope: spec.scope,
    mockup_decision: spec.mockup_decision,
    docs: spec.docs,
    work_kind_resolution_hash: spec.work_kind_resolution_hash,
    implementation_plan_hash: spec.implementation_plan_hash,
    evidence_policy_resolution_hash: spec.evidence_policy_resolution_hash,
    dependencies: spec.dependencies,
    contract: spec.contract
  });
}

/** A Spec's approval sub-projection: the v1 leaf projection MINUS the v1-only lineage fields (`parent_plan_id` /
 *  `plan_slice_id`). A v2 Spec is embedded — there is no separate Plan, so lineage is meaningless and the
 *  approval is lineage-INDEPENDENT (a Spec's approval depends only on its content, never on which plan/slice it
 *  was decomposed from). This is the v2 successor to `WORK_PACKET_APPROVED_FIELDS`, with the lineage dropped. */
export type SpecApprovalProjection = Omit<ApprovedWorkPacketProjectionV1, "parent_plan_id" | "plan_slice_id">;

export interface AggregateApprovalResult {
  /** The per-Spec approval sub-projections (faithful v1 leaf projection over the synthesized Spec, sans lineage). */
  specs: SpecApprovalProjection[];
  /** The ONE whole-Work-Packet approval hash: over id + title + every Spec sub-projection. */
  hash: string;
  diagnostics: Diagnostic[];
}

export const AGGREGATE_APPROVAL_VERSION_V1 = 1;

const LINEAGE_KEYS: ReadonlySet<string> = new Set(["parent_plan_id", "plan_slice_id"]);

/** Drop the v1-only lineage fields from a v1 leaf projection, yielding the lineage-independent v2 Spec projection. */
function dropLineage(projection: ApprovedWorkPacketProjectionV1): SpecApprovalProjection {
  return Object.fromEntries(Object.entries(projection).filter(([key]) => !LINEAGE_KEYS.has(key))) as SpecApprovalProjection;
}

/**
 * The v2 whole-Work-Packet approval projection (WORK_PACKET_AGGREGATE_V2_DESIGN.md §3): ONE hash over the entire
 * aggregate. Each Spec contributes the FAITHFUL v1 leaf approval sub-projection (reusing
 * `buildApprovedWorkPacketProjectionV1` over the synthesized Spec, so work-kind / evidence-policy / docs
 * resolution is byte-identical to v1), with the inherited container fields riding along inside each Spec's
 * sub-projection. So editing ANY Spec — or the container's inherited intent / structural decisions — changes the
 * one hash, which re-stales the whole approval => re-approve the whole Work Packet. No per-Spec boundary.
 *
 * This is a NEW hash shape; v1 golden approval hashes do not carry over (expected — §3 re-baselines them).
 */
export function aggregateApprovalProjection(aggregate: AggregateWorkPacket, options: ApprovedWorkPacketProjectionOptions = {}): AggregateApprovalResult {
  const diagnostics: Diagnostic[] = [];
  const specs = aggregate.specs.map((spec) => {
    const result = buildApprovedWorkPacketProjectionV1(specAsV1WorkPacket(aggregate, spec), options);
    diagnostics.push(...result.diagnostics);
    return dropLineage(result.projection);
  });
  const hash = sha256CanonicalJson({
    schema_version: SCHEMA_VERSION_V1,
    aggregate_approval_version: AGGREGATE_APPROVAL_VERSION_V1,
    id: aggregate.id,
    title: aggregate.title,
    specs,
    // The declared dependency EDGES + the producer `contract` are approved design too — bind them to the approval
    // hash (a parallel key so the per-Spec sub-projection type stays clean) so the approved snapshot records them.
    spec_dependencies: aggregate.specs.map((spec) => ({ spec_id: spec.id, dependencies: spec.dependencies, contract: spec.contract }))
  });
  return { specs, hash, diagnostics };
}
