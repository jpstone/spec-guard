import { sha256HexCanonical } from "../canonical/hashes.ts";

const AUDIT_ONLY_KEYS = new Set([
  "audit_log",
  "audit_records",
  "review_snapshots"
]);
const PHYSICAL_METADATA_KEYS = new Set(["_storage", "_physical", "governed_content_hash"]);

export function governedProjection<T>(artifact: T): T {
  if (Array.isArray(artifact)) return artifact.map((item) => governedProjection(item)) as T;
  if (artifact !== null && typeof artifact === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(artifact)) {
      if (AUDIT_ONLY_KEYS.has(key) || PHYSICAL_METADATA_KEYS.has(key)) continue;
      output[key] = governedProjection(value);
    }
    return output as T;
  }
  return artifact;
}

export function governedContentHash(artifact: unknown): string {
  return sha256HexCanonical(governedProjection(artifact));
}

// Storage compaction (references-by-hash, Part A). A work packet's decision_history is audit lineage — the
// full decisions live in the decision log (the source of truth) and NOTHING reads these embedded payloads —
// so strip the heavy approved_payload/reviewed_payload to nulls before persisting (and before computing any
// hash over the stored form, so current.json stays self-consistent). The embedded projections were the
// ~quadratic 117 KB bloat; the shape stays a valid WorkPacket (payloads are nullable). Scoped to work_packet.
export function compactStoredArtifact<T>(artifact: T): T {
  if (artifact === null || typeof artifact !== "object") return artifact;
  if ((artifact as { artifact_type?: unknown }).artifact_type !== "work_packet") return artifact;
  const history = (artifact as { decision_history?: unknown }).decision_history;
  if (!Array.isArray(history)) return artifact;
  return { ...artifact, decision_history: history.map((decision) => (decision !== null && typeof decision === "object" ? { ...decision, approved_payload: null, reviewed_payload: null } : decision)) } as T;
}
