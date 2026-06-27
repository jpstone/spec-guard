import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArtifactStore, buildEphemeralSnapshotIdentity, configGet, detectEphemeralSnapshotMismatch, hashSourceArtifactRefs, initAction, reviewSnapshotPersist, sha256HexCanonical } from "../src/index.ts";

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), "spec-guard-snapshots-"));
  await initAction({ project_id: "demo" }, { projectRoot });
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe("review snapshots", () => {
  it("builds deterministic ephemeral snapshot revisions", () => {
    const refs = [{ artifact_type: "config", id: null, revision: 1 }];
    const payload = { z: 1, a: [true] };
    const identity = buildEphemeralSnapshotIdentity(payload, refs);
    expect(identity.snapshot_hash).toBe(sha256HexCanonical(payload));
    expect(identity.snapshot_revision).toBe(`ephemeral:${hashSourceArtifactRefs(refs)}:${sha256HexCanonical(payload)}`);
  });

  it("persists snapshots audit-only using persisted audit revision", async () => {
    const before = await configGet({}, { projectRoot });
    const beforeHash = before.data.governed_content_hash;
    const result = await reviewSnapshotPersist({ producer_action_id: "baseline.review", source_artifact_refs: [{ artifact_type: "config", id: null, revision: 1 }], payload: { reviewed: "payload" }, rendered_summary: "summary", owning_artifact_type: "config", owning_artifact_id: null }, { projectRoot });
    expect(result.ok).toBe(true);
    const snapshot = result.data.review_snapshot as { snapshot_hash: string; snapshot_revision: string; audit_revision: number };
    expect(snapshot.snapshot_hash).toBe(sha256HexCanonical({ reviewed: "payload" }));
    expect(snapshot.audit_revision).toBe(1);
    expect(snapshot.snapshot_revision).toBe("persisted:1");
    const after = await configGet({}, { projectRoot });
    expect(after.data.config.revision).toBe(before.data.config.revision);
    expect(after.data.governed_content_hash).toBe(beforeHash);
    const store = new ArtifactStore({ root: path.join(projectRoot, ".spec-guard") });
    expect((await store.readAudit("config", null)).length).toBe(1);
  });

  it("detects stale/mismatched payload and source refs at helper level", () => {
    const original = buildEphemeralSnapshotIdentity({ value: 1 }, [{ artifact_type: "config", id: null, revision: 1 }]);
    const mismatches = detectEphemeralSnapshotMismatch({ payload: { value: 2 }, source_artifact_refs: [{ artifact_type: "config", id: null, revision: 2 }], expected_snapshot_hash: original.snapshot_hash, expected_snapshot_revision: original.snapshot_revision });
    expect(mismatches.map((m) => m.kind)).toEqual(["payload_hash", "source_refs_hash", "snapshot_revision"]);
  });
});
