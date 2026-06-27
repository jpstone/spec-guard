import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArtifactStore, ConfigSchema, governedContentHash } from "../src/index.ts";

let root: string;

const now = "2026-06-21T12:34:56.789Z";

function configArtifact() {
  return ConfigSchema.parse({
    artifact_type: "config",
    schema_version: 1,
    revision: 99,
    created_at: now,
    updated_at: now,
    project_id: "project",
    artifact_root: ".spec-guard/",
    project_root: ".",
    command_execution: {
      default_mode: "argv",
      configured_shell: null,
      default_timeout_ms: 30000,
      env_policy: "inherit"
    },
    path_policy: {
      spec_guard_artifact_evidence: [".spec-guard/**"],
      docs: ["docs/**"],
      tests: ["**/*.test.ts"],
      implementation_source: ["src/**"],
      runtime_product_configuration: ["package.json"],
      generated_build_output: ["dist/**"],
      docs_test_manifests: [],
      ignored_paths: ["node_modules/**"]
    },
    change_baseline_policy: { mode: "auto" },
    cleanup_observers: [],
    diagnostics: []
  });
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "spec-guard-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("filesystem artifact store", () => {
  it("defaults to .spec-guard/", () => {
    expect(new ArtifactStore().root).toBe(".spec-guard/");
  });

  it("creates an artifact at revision 1 and stores governed content hash", async () => {
    const store = new ArtifactStore({ root });
    const created = await store.create(configArtifact());
    expect(created.revision).toBe(1);
    expect(created.artifact.revision).toBe(1);
    expect(created.governed_content_hash).toBe(governedContentHash(created.artifact));

    const current = await store.readCurrent("config", null);
    expect(current.revision).toBe(1);
    expect(current.governed_content_hash).toBe(created.governed_content_hash);

    const revision = await store.readRevision("config", null, 1);
    expect(revision.revision).toBe(1);
    expect(revision.governed_content_hash).toBe(created.governed_content_hash);
    expect(revision.governed_projection).toEqual(created.artifact);
  });

  it("appends audit records without changing governed revision or hash", async () => {
    const store = new ArtifactStore({ root });
    const created = await store.create(configArtifact());

    const audit1 = await store.appendAudit("config", null, { kind: "prompt", text: "discuss" }, now);
    const audit2 = await store.appendAudit("config", null, { kind: "prompt", text: "again" }, now);
    expect(audit1.audit_revision).toBe(1);
    expect(audit2.audit_revision).toBe(2);

    const current = await store.readCurrent("config", null);
    expect(current.revision).toBe(1);
    expect(current.governed_content_hash).toBe(created.governed_content_hash);

    const revision = await store.readRevision("config", null, 1);
    expect(revision.governed_content_hash).toBe(created.governed_content_hash);
  });
});
