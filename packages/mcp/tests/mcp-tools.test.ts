import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionResultSchema, buildMcpToolDefinitions, foundationalActionRegistry, initAction, specGuardToolName } from "@spec-guard/core";
import { PassThrough } from "node:stream";
import { createMcpToolRegistry } from "../src/tool-registry.ts";
import { SpecGuardMcpServer, startMcpServer } from "../src/server.ts";

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), "spec-guard-mcp-tools-"));
  await initAction({}, { projectRoot });
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe("MCP generated tools", () => {
  it("registers expected tools with schemas matching the core registry", () => {
    const tools = createMcpToolRegistry();
    const expectedNames = foundationalActionRegistry.list().filter((metadata) => metadata.exposed_via.includes("mcp")).map((metadata) => specGuardToolName(metadata.id)).sort();
    expect(tools.map((tool) => tool.name).sort()).toEqual(expectedNames);

    const generated = buildMcpToolDefinitions();
    for (const expected of generated) {
      const actual = tools.find((tool) => tool.name === expected.name);
      expect(actual?.input_schema).toEqual(expected.input_schema);
      expect(actual?.output_schema).toEqual(expected.output_schema);
      expect(actual?.description).toEqual(expected.description);
    }
  });

  it("tool calls invoke the shared core action executor directly", async () => {
    const executor = vi.fn(async (actionId: string) => ({
      ok: true,
      action_id: actionId,
      data: { direct_core: true },
      diagnostics: [],
      mutations: [],
      next_actions: [],
      summary: "called"
    }));
    const tools = createMcpToolRegistry({ executor });
    const configCheck = tools.find((tool) => tool.name === "spec_guard_config_check");
    if (!configCheck) throw new Error("missing config_check tool");

    const result = ActionResultSchema.parse(await configCheck.call({}, { projectRoot }));
    expect(result).toMatchObject({ ok: true, action_id: "config.check", data: { direct_core: true } });
    expect(executor).toHaveBeenCalledWith("config.check", {}, { projectRoot });
  });

  it("server list/call methods expose and return valid ActionResult values", async () => {
    const server = new SpecGuardMcpServer({ context: { projectRoot } });
    expect(server.listTools().some((tool) => tool.name === "spec_guard_config_check")).toBe(true);

    const response = await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "spec_guard_config_check", arguments: {} } });
    const result = ActionResultSchema.parse((response?.result as { structuredContent?: unknown }).structuredContent);
    expect(result.ok).toBe(true);
    expect(result.action_id).toBe("config.check");
  });

  it("human-gated tool schema and description expose required confirmation fields", () => {
    const accept = createMcpToolRegistry().find((tool) => tool.name === "spec_guard_baseline_accept");
    expect(JSON.stringify(accept?.input_schema)).toContain("selected_number");
    expect(accept?.description).toContain("selected_number");
    expect(accept?.description).toContain("raw_response");
    expect(accept?.description).toContain("decision_prompt");
    expect(accept?.description).toContain("human_confirmed");
  });

  it("MCP package does not shell out to CLI or import child_process", async () => {
    const sources = await Promise.all([
      readFile(path.join(process.cwd(), "packages/mcp/src/tool-registry.ts"), "utf8"),
      readFile(path.join(process.cwd(), "packages/mcp/src/server.ts"), "utf8")
    ]);
    const joined = sources.join("\n");
    expect(joined).not.toContain("child_process");
    expect(joined).not.toContain("spawn(");
    expect(joined).not.toContain("execFile(");
  });
});

describe("MCP stdio server resilience", () => {
  it("a malformed JSON line does NOT crash the server (parse error replied; later requests still work)", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const chunks: string[] = [];
    stdout.on("data", (c: Buffer) => chunks.push(c.toString("utf8")));
    startMcpServer({ context: { projectRoot }, stdin, stdout });
    stdin.write("this is not json\n"); // would previously throw in the void async IIFE -> unhandled rejection -> exit
    stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list" })}\n`);
    await new Promise((resolve) => setTimeout(resolve, 75));
    const out = chunks.join("");
    expect(out).toContain("-32700"); // the bad line got a JSON-RPC parse error
    expect(out).toContain("\"id\":7"); // and the server survived to answer the next request
  });
});
