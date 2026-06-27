import { ActionResultSchema, buildMcpToolDefinitions, executeActionForAgent, type ActionResult, type ActionExecutionContext, type GeneratedActionToolDefinition } from "@spec-guard/core";

export interface McpRegisteredTool extends GeneratedActionToolDefinition {
  call(input: Record<string, unknown>, context?: ActionExecutionContext): Promise<ActionResult>;
}

export type CoreActionExecutor = (actionId: string, input: Record<string, unknown>, context?: ActionExecutionContext) => Promise<ActionResult>;

function errorResult(actionId: string, error: unknown): ActionResult {
  return {
    ok: false,
    action_id: actionId,
    data: {},
    diagnostics: [{
      code: "MCP_TOOL_CALL_FAILED",
      severity: "error",
      message: error instanceof Error ? error.message : String(error),
      field_path: null,
      gate: null,
      fix: "Check the tool input schema and persisted Spec Guard status."
    }],
    mutations: [],
    next_actions: [{ action_id: "mcp.status", cli: "spec-guard mcp status --json", mcp: "spec_guard_mcp_status", reason: "Inspect current Spec Guard state after a tool-call failure.", suggested_input: null }],
    summary: "MCP tool call failed before returning a core result."
  };
}

export function createMcpToolRegistry(options: { executor?: CoreActionExecutor } = {}): McpRegisteredTool[] {
  const executor = options.executor ?? executeActionForAgent; // agent-facing: lean responses (#1) unless overridden
  return buildMcpToolDefinitions().map((definition) => ({
    ...definition,
    async call(input: Record<string, unknown>, context: ActionExecutionContext = {}) {
      try {
        const result = await executor(definition.action_id, input, context);
        return ActionResultSchema.parse(result) as ActionResult;
      } catch (error) {
        return errorResult(definition.action_id, error);
      }
    }
  }));
}

export function findMcpTool(name: string, tools = createMcpToolRegistry()): McpRegisteredTool | undefined {
  return tools.find((tool) => tool.name === name);
}
