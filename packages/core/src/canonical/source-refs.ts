import { z } from "zod";
import { SourceArtifactRefSchema, type SourceArtifactRef } from "../schemas/embedded.ts";
import { compareUnicodeCodePointStrings } from "./canonical-json.ts";
import { sha256HexCanonical } from "./hashes.ts";

export class SourceArtifactRefConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceArtifactRefConflictError";
  }
}

function identity(ref: SourceArtifactRef): string {
  return `${ref.artifact_type}\u0000${ref.id === null ? "<null>" : ref.id}\u0000${ref.revision}`;
}

export function compareSourceArtifactRefs(a: SourceArtifactRef, b: SourceArtifactRef): number {
  const typeOrder = compareUnicodeCodePointStrings(a.artifact_type, b.artifact_type);
  if (typeOrder !== 0) return typeOrder;
  if (a.id === null && b.id !== null) return -1;
  if (a.id !== null && b.id === null) return 1;
  if (a.id !== null && b.id !== null) {
    const idOrder = compareUnicodeCodePointStrings(a.id, b.id);
    if (idOrder !== 0) return idOrder;
  }
  return a.revision - b.revision;
}

export function normalizeSourceArtifactRefs(refs: readonly unknown[]): SourceArtifactRef[] {
  const byIdentity = new Map<string, SourceArtifactRef>();
  for (const raw of refs) {
    const ref = SourceArtifactRefSchema.parse(raw);
    const key = identity(ref);
    const existing = byIdentity.get(key);
    if (existing === undefined) {
      byIdentity.set(key, ref);
      continue;
    }
    if (existing.content_hash !== ref.content_hash) {
      throw new SourceArtifactRefConflictError(
        `conflicting content_hash for SourceArtifactRef ${ref.artifact_type}/${ref.id ?? "null"}@${ref.revision}`
      );
    }
  }
  return [...byIdentity.values()].sort(compareSourceArtifactRefs);
}

export function parseAndNormalizeSourceArtifactRefs(refs: unknown): SourceArtifactRef[] {
  const array = z.array(z.unknown()).parse(refs);
  return normalizeSourceArtifactRefs(array);
}

export function hashSourceArtifactRefs(refs: readonly unknown[]): string {
  return sha256HexCanonical(normalizeSourceArtifactRefs(refs));
}
