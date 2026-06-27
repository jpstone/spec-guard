import { sha256HexCanonical } from "../canonical/hashes.ts";
import { hashSourceArtifactRefs, normalizeSourceArtifactRefs } from "../canonical/source-refs.ts";
import type { SourceArtifactRef } from "../schemas/embedded.ts";

export function snapshotPayloadHash(payload: unknown): string {
  return sha256HexCanonical(payload);
}

export function ephemeralSnapshotRevision(sourceArtifactRefs: readonly unknown[], payloadHash: string): string {
  return `ephemeral:${hashSourceArtifactRefs(sourceArtifactRefs)}:${payloadHash}`;
}

export function buildEphemeralSnapshotIdentity(payload: unknown, sourceArtifactRefs: readonly unknown[] = []): { snapshot_hash: string; snapshot_revision: string; source_artifact_refs: SourceArtifactRef[]; source_refs_hash: string } {
  const refs = normalizeSourceArtifactRefs(sourceArtifactRefs);
  const snapshot_hash = snapshotPayloadHash(payload);
  const source_refs_hash = hashSourceArtifactRefs(refs);
  return { snapshot_hash, snapshot_revision: `ephemeral:${source_refs_hash}:${snapshot_hash}`, source_artifact_refs: refs, source_refs_hash };
}

export function persistedSnapshotRevision(auditRevision: number): string {
  return `persisted:${auditRevision}`;
}
