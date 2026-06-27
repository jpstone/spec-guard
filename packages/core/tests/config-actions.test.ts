import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configCheck, configGet, configUpdate, initAction } from "../src/index.ts";

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), "spec-guard-config-"));
  await initAction({ project_id: "demo" }, { projectRoot });
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe("config actions", () => {
  it("config.get reads the persisted Config artifact", async () => {
    const result = await configGet({}, { projectRoot });
    expect(result.ok).toBe(true);
    expect(result.data.config.project_id).toBe("demo");
    expect(result.data.config.revision).toBe(1);
  });

  it("config.update applies a valid patch and writes a governed revision", async () => {
    const result = await configUpdate({ patch: [{ op: "replace", path: "/command_execution/default_timeout_ms", value: 12345 }] }, { projectRoot });
    expect(result.ok).toBe(true);
    expect(result.data.config.command_execution.default_timeout_ms).toBe(12345);
    expect(result.data.revision).toBe(2);
    expect(result.mutations[0]?.paths).toEqual(["/command_execution/default_timeout_ms"]);

    const get = await configGet({}, { projectRoot });
    expect(get.data.config.revision).toBe(2);
    expect(get.data.config.command_execution.default_timeout_ms).toBe(12345);
  });

  it("config.update rejects invalid operations and invalid paths", async () => {
    const invalidOp = await configUpdate({ patch: [{ op: "copy", path: "/project_id" } as never] }, { projectRoot });
    expect(invalidOp.ok).toBe(false);

    const invalidPath = await configUpdate({ patch: [{ op: "replace", path: "project_id", value: "x" }] }, { projectRoot });
    expect(invalidPath.ok).toBe(false);

    const nonexistent = await configUpdate({ patch: [{ op: "replace", path: "/does_not_exist", value: true }] }, { projectRoot });
    expect(nonexistent.ok).toBe(false);
  });

  it("config.check summary derives from persisted artifacts", async () => {
    const result = await configCheck({}, { projectRoot });
    expect(result.ok).toBe(true);
    const summary = result.data.governance_summary as {
      total_artifact_count: number;
      artifact_counts_by_type: Record<string, number>;
    };
    expect(summary.total_artifact_count).toBeGreaterThanOrEqual(1);
    expect(summary.artifact_counts_by_type.config).toBe(1);
  });
});
