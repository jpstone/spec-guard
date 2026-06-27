import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActionResultSchema, executeAction, initAction } from "../src/index.ts";

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), "spec-guard-mcp-status-"));
  await initAction({}, { projectRoot });
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe("mcp quickstart/status", () => {
  it("quickstart includes first-call guidance and governance rules", async () => {
    const result = ActionResultSchema.parse(await executeAction("mcp.quickstart", {}, { projectRoot }));
    expect(result.ok).toBe(true);
    const text = JSON.stringify(result.data);
    expect(text).toContain("spec_guard_mcp_status");
    expect(text).toContain("do not substitute CLI");
    expect(text).toContain("selected_number");
    expect(text).toContain("Discuss is non-mutating");
    expect(text).toContain("fixed binary decisions");
    expect(text).toContain("work.create the packet");
    expect(text).toContain("work.decompose");
    expect(text).toContain("Backend roles execute under harness-enforced permissions");
    expect(text).toContain("self-review is blocked by default");
  });

  it("status is derived from persisted config/governance summary", async () => {
    const result = ActionResultSchema.parse(await executeAction("mcp.status", {}, { projectRoot }));
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      config: { exists: true, valid: true, revision: 1 },
      runtime_baseline: { status: null },
      pending_gates: { count: 0 },
      blocked_packets: { count: 0 },
      validation_failures: { count: 0 }
    });
    expect(result.data.governance_summary).toMatchObject({ total_artifact_count: 1, artifact_counts_by_type: { config: 1 } });
    expect(result.data).toHaveProperty("stale_approvals");
    expect(result.data).toHaveProperty("recommended_next_actions");
  });

  it("status reflects persisted runtime baseline changes", async () => {
    await executeAction("baseline.init", {}, { projectRoot });
    const result = ActionResultSchema.parse(await executeAction("mcp.status", {}, { projectRoot }));
    expect(result.data).toMatchObject({ runtime_baseline: { status: "draft" } });
    expect(result.data.governance_summary).toMatchObject({ total_artifact_count: 2, artifact_counts_by_type: { config: 1, runtime_baseline: 1 } });
  });
});
