import { AcReviewSnapshotPayloadSchema, type AcReviewSnapshotPayload } from "../schemas/snapshots.ts";
import type { AcceptanceCriterion, SourceArtifactRef } from "../schemas/embedded.ts";
import type { WorkPacket } from "../schemas/artifacts.ts";
import { buildEphemeralSnapshotIdentity } from "../snapshots/revisions.ts";
import { sha256HexCanonical } from "../canonical/hashes.ts";
import { normalizeSourceArtifactRefs } from "../canonical/source-refs.ts";
import { sourceArtifactRefsForAcs } from "./source-evidence.ts";

export interface AcReviewSnapshot {
  payload: AcReviewSnapshotPayload;
  snapshot_hash: string;
  snapshot_revision: string;
  ac_content_hash: string;
  source_artifact_refs: SourceArtifactRef[];
  rendered_summary: string;
}

// Revision-INDEPENDENT hash of the approved AC content. The snapshot_hash embeds work_packet_revision (so it
// changes on every bump); this hashes only the acceptance_criteria, so AC freshness can compare the current
// ACs' hash to the approved one WITHOUT re-reading the approved revision (references-by-hash, Part B).
export function acContentHash(acs: readonly AcceptanceCriterion[]): string {
  return sha256HexCanonical(acs);
}

export function workPacketSourceRef(work: WorkPacket): SourceArtifactRef {
  return { artifact_type: "work_packet", id: work.id, revision: work.revision };
}

export function renderAcSummary(acs: readonly AcceptanceCriterion[]): string {
  if (acs.length === 0) return "No acceptance criteria are currently drafted.";
  return acs.map((ac, index) => `${index + 1}. [${ac.id}] (${ac.source}) ${ac.text}${ac.source === "source_derived" && ac.source_evidence !== null ? `\n   Source: ${ac.source_evidence.kind} ${ac.source_evidence.reference} — ${ac.source_evidence.description}` : ""}`).join("\n");
}

export function createAcReviewSnapshot(work: WorkPacket, acs: AcceptanceCriterion[]): AcReviewSnapshot {
  const payload = AcReviewSnapshotPayloadSchema.parse({ work_id: work.id, work_packet_revision: work.revision, acceptance_criteria: acs });
  const refs = normalizeSourceArtifactRefs([workPacketSourceRef(work), ...sourceArtifactRefsForAcs(acs)]);
  const identity = buildEphemeralSnapshotIdentity(payload, refs);
  return { payload, snapshot_hash: identity.snapshot_hash, snapshot_revision: identity.snapshot_revision, ac_content_hash: acContentHash(acs), source_artifact_refs: identity.source_artifact_refs, rendered_summary: renderAcSummary(acs) };
}
