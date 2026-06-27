import { z } from "zod";
import { randomUUID } from "node:crypto";
import { JsonValueSchema, SourceArtifactRefSchema } from "../schemas/embedded.ts";
import { ReviewSnapshotSchema } from "../schemas/snapshots.ts";
import { normalizeSourceArtifactRefs } from "../canonical/source-refs.ts";
import { snapshotPayloadHash, persistedSnapshotRevision } from "../snapshots/revisions.ts";
import { storeForContext, diagnostic, failureResult } from "./config.ts";
import type { ActionExecutionContext } from "./context.ts";
import type { ActionResult } from "./result.ts";

export const ReviewSnapshotPersistInputSchema = z.object({
  producer_action_id: z.string().min(1),
  source_artifact_refs: z.array(SourceArtifactRefSchema),
  payload: z.record(z.string(), JsonValueSchema),
  rendered_summary: z.string().optional(),
  snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  owning_artifact_type: z.string().min(1).optional(),
  owning_artifact_id: z.string().min(1).nullable().optional()
}).strict();
export type ReviewSnapshotPersistInput = z.infer<typeof ReviewSnapshotPersistInputSchema>;

export async function reviewSnapshotPersist(input: ReviewSnapshotPersistInput, context: ActionExecutionContext = {}): Promise<ActionResult> {
  try {
    const parsed = ReviewSnapshotPersistInputSchema.parse(input);
    const refs = normalizeSourceArtifactRefs(parsed.source_artifact_refs);
    const hash = snapshotPayloadHash(parsed.payload);
    if (parsed.snapshot_hash !== undefined && parsed.snapshot_hash !== hash) {
      throw new Error(`snapshot_hash does not match canonical payload hash; expected ${hash}`);
    }
    const store = storeForContext(context);
    const artifactType = parsed.owning_artifact_type ?? "review_snapshot";
    const artifactId = parsed.owning_artifact_id ?? null;
    const existing = await store.readAudit(artifactType, artifactId);
    const auditRevision = existing.length + 1;
    const snapshot = ReviewSnapshotSchema.parse({
      id: `review_snapshot:${randomUUID()}`,
      category: "persisted",
      producer_action_id: parsed.producer_action_id,
      snapshot_hash: hash,
      snapshot_revision: persistedSnapshotRevision(auditRevision),
      audit_revision: auditRevision,
      source_artifact_refs: refs,
      payload: parsed.payload,
      rendered_summary: parsed.rendered_summary ?? "",
      created_at: new Date().toISOString()
    });
    const auditRecord = await store.appendAudit(artifactType, artifactId, snapshot, snapshot.created_at);
    return {
      ok: true,
      action_id: "review_snapshot.persist",
      data: { review_snapshot: snapshot, audit_revision: auditRecord.audit_revision },
      diagnostics: [],
      mutations: [{ artifact: artifactType, operation: "audit_record", paths: ["/review_snapshots"], summary: "Persisted review snapshot as audit-only storage; governed artifacts were not revised." }],
      next_actions: [],
      summary: "Review snapshot persisted audit-only."
    };
  } catch (error) {
    return failureResult("review_snapshot.persist", "Review snapshot persistence rejected.", [diagnostic("REVIEW_SNAPSHOT_PERSIST_REJECTED", error instanceof Error ? error.message : String(error), "error", "/review_snapshot")]);
  }
}
