import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActionResultSchema, initAction, PI_EXTENSION_TOOL_NAMES } from "../src/index.ts";

interface RegisteredPiTool {
  name?: string;
  description?: string;
  execute?: (toolCallId: string, params: unknown, signal?: AbortSignal, onUpdate?: unknown, ctx?: { cwd?: string }) => Promise<{ details?: { result?: unknown } }>;
}

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), "spec-guard-pi-"));
  await initAction({}, { projectRoot });
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe("generated Pi extension", () => {
  it("default factory loads and registers expected direct tools", async () => {
    const modulePath = path.join(projectRoot, ".pi/extensions/spec-guard.ts");
    const mod = await import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);

    expect(typeof mod.default).toBe("function");
    expect(Object.keys(mod).filter((key) => key !== "default")).toEqual([]);

    const registered: RegisteredPiTool[] = [];
    await mod.default({ registerTool: (definition: RegisteredPiTool) => registered.push(definition) });

    const names = registered.map((tool) => tool.name).sort();
    expect(names).toEqual([...PI_EXTENSION_TOOL_NAMES].sort());
    expect(registered.find((tool) => tool.name === "spec_guard_mcp_status")?.description).toContain("Recommended first call");
    expect(registered.find((tool) => tool.name === "spec_guard_config_update")?.description).toContain("actual human responses");
    expect(registered.every((tool) => typeof tool.execute === "function")).toBe(true);
  });

  it("registered tools execute shared core actions against the initialized project's artifact store", async () => {
    const modulePath = path.join(projectRoot, ".pi/extensions/spec-guard.ts");
    const mod = await import(`${pathToFileURL(modulePath).href}?execute=${Date.now()}`);
    const registered: RegisteredPiTool[] = [];
    await mod.default({ registerTool: (definition: RegisteredPiTool) => registered.push(definition) });

    const configCheck = registered.find((tool) => tool.name === "spec_guard_config_check");
    if (typeof configCheck?.execute !== "function") throw new Error("spec_guard_config_check did not register an executable tool");

    const toolResult = await configCheck.execute("call-1", {}, undefined, undefined, { cwd: path.join(projectRoot, "not-used") });
    const result = ActionResultSchema.parse(toolResult.details?.result);
    expect(result.ok).toBe(true);
    expect(result.action_id).toBe("config.check");
    expect(result.data).toMatchObject({ config_exists: true, config_valid: true });
    expect(result.data.governance_summary).toMatchObject({ artifact_counts_by_type: { config: 1 } });
  });
});
