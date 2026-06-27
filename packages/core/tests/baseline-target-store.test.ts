import { mkdtemp, rm, mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArtifactStore } from "../src/storage/artifact-store.ts";
import { readRuntimeBaselineCurrent } from "../src/baseline/target-store.ts";
import type { RuntimeBaseline } from "../src/index.ts";

// RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §8: the pre-target-scope singleton baseline
// (runtime_baseline/__singleton__) must be reachable as the DEFAULT target after the switch.
let root: string;
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), "spec-guard-target-store-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("runtime baseline target-store", () => {
  it("relocates a legacy singleton baseline to the default target on read", async () => {
    const store = new ArtifactStore({ root: path.join(root, ".spec-guard") });
    const singleton = store.currentPath("runtime_baseline", null);
    await mkdir(path.dirname(singleton), { recursive: true });
    // A minimal legacy baseline (no id field — pre-target-scope shape); migration fills the rest.
    await writeFile(singleton, JSON.stringify({ artifact_type: "runtime_baseline", created_at: "2026-06-21T00:00:00.000Z", updated_at: "2026-06-21T00:00:00.000Z", status: "draft" }), "utf8");

    const current = await readRuntimeBaselineCurrent<RuntimeBaseline>(store, "default");
    expect(current.artifact.id).toBe("default");
    // The file is moved: default slot now present, the legacy singleton is gone.
    await expect(access(store.currentPath("runtime_baseline", "default"))).resolves.toBeUndefined();
    await expect(access(singleton)).rejects.toThrow();
  });

  it("does not relocate for a named (non-default) target", async () => {
    const store = new ArtifactStore({ root: path.join(root, ".spec-guard") });
    const singleton = store.currentPath("runtime_baseline", null);
    await mkdir(path.dirname(singleton), { recursive: true });
    await writeFile(singleton, JSON.stringify({ artifact_type: "runtime_baseline", created_at: "2026-06-21T00:00:00.000Z", updated_at: "2026-06-21T00:00:00.000Z", status: "draft" }), "utf8");

    // A named target never had a legacy singleton; reading it must NOT consume the singleton and must 404.
    await expect(readRuntimeBaselineCurrent(store, "web")).rejects.toThrow();
    await expect(access(singleton)).resolves.toBeUndefined();
  });
});
