import { hashSourceArtifactRefs } from "../canonical/source-refs.ts";
import { snapshotPayloadHash } from "./revisions.ts";

export interface SnapshotMismatch {
  kind: "payload_hash" | "source_refs_hash" | "snapshot_revision";
  expected: string;
  actual: string;
}

export function detectEphemeralSnapshotMismatch(input: {
  payload: unknown;
  source_artifact_refs: readonly unknown[];
  expected_snapshot_hash: string;
  expected_snapshot_revision: string;
}): SnapshotMismatch[] {
  const mismatches: SnapshotMismatch[] = [];
  const actualPayloadHash = snapshotPayloadHash(input.payload);
  const actualSourceRefsHash = hashSourceArtifactRefs(input.source_artifact_refs);
  const actualRevision = `ephemeral:${actualSourceRefsHash}:${actualPayloadHash}`;
  if (actualPayloadHash !== input.expected_snapshot_hash) {
    mismatches.push({ kind: "payload_hash", expected: input.expected_snapshot_hash, actual: actualPayloadHash });
  }
  const expectedParts = input.expected_snapshot_revision.split(":");
  const expectedSourceRefsHash = expectedParts.length === 3 && expectedParts[0] === "ephemeral" ? expectedParts[1] : "";
  if (expectedSourceRefsHash !== actualSourceRefsHash) {
    mismatches.push({ kind: "source_refs_hash", expected: expectedSourceRefsHash ?? "", actual: actualSourceRefsHash });
  }
  if (actualRevision !== input.expected_snapshot_revision) {
    mismatches.push({ kind: "snapshot_revision", expected: input.expected_snapshot_revision, actual: actualRevision });
  }
  return mismatches;
}
