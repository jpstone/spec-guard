import { describe, expect, it } from "vitest";
import { ActionResultSchema, buildMcpToolDefinitions, buildPiToolDefinitions, executeAction, foundationalActionRegistry, specGuardToolName, validateParityDefinitions } from "../src/index.ts";

const mcpActions = foundationalActionRegistry.list().filter((metadata) => metadata.exposed_via.includes("mcp"));

describe("registry/tool parity", () => {
  it("generates exactly one deterministic MCP tool for every implemented MCP-exposed action", () => {
    const tools = buildMcpToolDefinitions();
    expect(tools.map((tool) => tool.name)).toEqual([...tools.map((tool) => tool.name)].sort());
    expect(tools.map((tool) => tool.name)).toEqual(mcpActions.map((metadata) => specGuardToolName(metadata.id)).sort());
    expect(tools.every((tool) => tool.name === `spec_guard_${tool.action_id.replaceAll(".", "_")}`)).toBe(true);
    expect(tools.some((tool) => tool.action_id === "init")).toBe(false);
  });

  it("validate.parity succeeds for generated MCP and Pi definitions", async () => {
    const result = ActionResultSchema.parse(await executeAction("validate.parity", {}));
    expect(result.ok).toBe(true);
    expect(result.action_id).toBe("validate.parity");
    expect(result.data).toMatchObject({ missing_mcp_tools: [], missing_pi_tools: [], schema_gaps: [] });
  });

  it("parity helper reports missing, description, and schema gaps for simulated mismatches", () => {
    const mcpTools = buildMcpToolDefinitions();
    const piTools = buildPiToolDefinitions();
    const humanTool = mcpTools.find((tool) => tool.human_gated);
    if (!humanTool) throw new Error("expected a human-gated tool");

    const report = validateParityDefinitions({
      actions: foundationalActionRegistry.list(),
      mcpTools: mcpTools.filter((tool) => tool.name !== "spec_guard_config_check").map((tool) => tool.name === humanTool.name ? { ...tool, description: "too short", input_schema: { type: "object", properties: { wrong: { type: "string" } } } } : tool),
      piTools: [...piTools, { ...piTools[0]!, name: "spec_guard_extra" }]
    });

    expect(report.missing_mcp_tools).toContain("spec_guard_config_check");
    expect(report.extra_pi_tools).toContain("spec_guard_extra");
    expect(report.schema_gaps).toContain(`mcp:${humanTool.name}:input_schema`);
    expect(report.description_gaps).toContain(`mcp:${humanTool.name}:description`);
    expect(report.human_gated_description_gaps).toContain(`mcp:${humanTool.name}:human_confirmation_fields`);
  });

  it("human-gated and review-bound descriptions expose required fields", () => {
    for (const tool of buildMcpToolDefinitions()) {
      if (tool.human_gated) {
        expect(tool.description).toContain("selected_number");
        expect(tool.description).toContain("raw_response");
        expect(tool.description).toContain("decision_prompt");
        expect(tool.description).toContain("human_confirmed");
      }
      if (tool.review_bound) {
        expect(tool.description).toMatch(/snapshot hash/i);
        expect(tool.description).toMatch(/snapshot revision/i);
        expect(tool.description).toContain("source_artifact_refs");
      }
    }
  });
});
