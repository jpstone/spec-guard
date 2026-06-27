import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActionResultSchema, buildPiToolDefinitions, initAction } from "../src/index.ts";

interface RegisteredPiTool {
  name?: string;
  description?: string;
  parameters?: unknown;
  inputSchema?: unknown;
  execute?: (toolCallId: string, params: unknown, signal?: AbortSignal, onUpdate?: unknown, ctx?: { cwd?: string }) => Promise<{ details?: { result?: unknown } }>;
}

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), "spec-guard-generated-pi-"));
  await initAction({}, { projectRoot });
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe("generated Pi registry parity", () => {
  it("registers all generated registry-parity tools from the default factory", async () => {
    const mod = await import(`${pathToFileURL(path.join(projectRoot, ".pi/extensions/spec-guard.ts")).href}?piParity=${Date.now()}`);
    expect(typeof mod.default).toBe("function");
    expect(Object.keys(mod)).toEqual(["default"]);

    const registered: RegisteredPiTool[] = [];
    await mod.default({ registerTool: (definition: RegisteredPiTool) => registered.push(definition) });

    const expected = buildPiToolDefinitions();
    expect(registered.map((tool) => tool.name).sort()).toEqual(expected.map((tool) => tool.name).sort());
    for (const expectedTool of expected) {
      const actual = registered.find((tool) => tool.name === expectedTool.name);
      expect(actual?.parameters).toEqual(expectedTool.input_schema);
      expect(actual?.inputSchema).toEqual(expectedTool.input_schema);
    }
  });

  it("descriptions make first calls and human/review-bound fields obvious", async () => {
    const mod = await import(`${pathToFileURL(path.join(projectRoot, ".pi/extensions/spec-guard.ts")).href}?piDesc=${Date.now()}`);
    const registered: RegisteredPiTool[] = [];
    await mod.default({ registerTool: (definition: RegisteredPiTool) => registered.push(definition) });

    expect(registered.find((tool) => tool.name === "spec_guard_mcp_quickstart")?.description).toContain("first-call");
    expect(registered.find((tool) => tool.name === "spec_guard_mcp_status")?.description).toContain("persisted artifacts");
    expect(registered.find((tool) => tool.name === "spec_guard_baseline_accept")?.description).toContain("human_confirmed");
    expect(registered.find((tool) => tool.name === "spec_guard_baseline_accept")?.description).toContain("source_artifact_refs");
  });

  it("invoking a generated Pi tool returns a core ActionResult", async () => {
    const mod = await import(`${pathToFileURL(path.join(projectRoot, ".pi/extensions/spec-guard.ts")).href}?piExec=${Date.now()}`);
    const registered: RegisteredPiTool[] = [];
    await mod.default({ registerTool: (definition: RegisteredPiTool) => registered.push(definition) });
    const status = registered.find((tool) => tool.name === "spec_guard_mcp_status");
    if (!status?.execute) throw new Error("status tool missing execute");
    const result = ActionResultSchema.parse((await status.execute("call", {})).details?.result);
    expect(result.action_id).toBe("mcp.status");
    expect(result.data).toHaveProperty("config");
  });
});
