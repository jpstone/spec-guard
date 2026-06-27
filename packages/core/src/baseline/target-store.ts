import { access, rename } from "node:fs/promises";
import path from "node:path";
import type { ArtifactStore } from "../storage/artifact-store.ts";
import type { StoredArtifact } from "../storage/artifact-store.ts";
import { DEFAULT_TARGET_ID } from "../schemas/enums.ts";
import { RuntimeBaselineRefSchema, type RuntimeBaselineRef } from "../schemas/embedded.ts";
import type { RuntimeBaseline } from "../schemas/artifacts.ts";

/**
 * RuntimeBaseline is scoped per target (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §3): the store keys it at
 * runtime_baseline/<target_id>. Pre-target-scope it was a singleton at runtime_baseline/__singleton__. This
 * module is the single read chokepoint so the legacy→default relocation (§8) and the future committed store
 * (§12 slice 8) both attach in ONE place.
 *
 * One-time, best-effort, idempotent: only relocates when the default target's slot is ABSENT and a legacy
 * singleton EXISTS. A rename moves current.json + the revisions/ subtree together (so readRevision resolves).
 * Only the DEFAULT target maps onto the legacy singleton; named targets never had one. (§7 option B.)
 */
export async function relocateLegacyDefaultBaseline(store: ArtifactStore, targetId: string): Promise<void> {
  if (targetId !== DEFAULT_TARGET_ID) return;
  const defaultDir = path.dirname(store.currentPath("runtime_baseline", DEFAULT_TARGET_ID));
  const singletonDir = path.dirname(store.currentPath("runtime_baseline", null));
  try { await access(path.join(defaultDir, "current.json")); return; } catch { /* default absent → maybe relocate */ }
  try { await access(path.join(singletonDir, "current.json")); } catch { return; /* no legacy baseline to move */ }
  try { await rename(singletonDir, defaultDir); } catch { /* best-effort: a fresh establish still works */ }
}

/** Read a target's current RuntimeBaseline artifact, relocating a legacy default singleton first. */
export async function readRuntimeBaselineCurrent<T = unknown>(store: ArtifactStore, targetId: string = DEFAULT_TARGET_ID): Promise<StoredArtifact<T>> {
  await relocateLegacyDefaultBaseline(store, targetId);
  return store.readCurrent<T>("runtime_baseline", targetId);
}

/**
 * Mint the RuntimeBaselineRef pinning a target's ACCEPTED baseline (the acceptance anchor: revision + decision
 * id + snapshot hash/revision), or null if the baseline is not accepted. This is what work.target.attach writes
 * onto a modify_existing packet to inherit, mirroring the ref baseline.establish returns.
 * (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §4.1.)
 */
export function acceptedBaselineRef(baseline: RuntimeBaseline): RuntimeBaselineRef | null {
  const accepted = baseline.acceptance;
  if (baseline.status !== "accepted" || accepted === null || accepted.review_snapshot_hash === null || accepted.review_snapshot_revision === null) return null;
  return RuntimeBaselineRefSchema.parse({
    artifact_type: "runtime_baseline",
    id: baseline.id,
    revision: accepted.target_artifact_revision ?? baseline.revision,
    accepted_at: accepted.at,
    acceptance_decision_id: accepted.id,
    acceptance_snapshot_hash: accepted.review_snapshot_hash,
    acceptance_snapshot_revision: accepted.review_snapshot_revision
  });
}
