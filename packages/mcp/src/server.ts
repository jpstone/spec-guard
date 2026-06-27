import { stdin as defaultStdin, stdout as defaultStdout } from "node:process";
import type { Readable, Writable } from "node:stream";
import type { ActionExecutionContext } from "@spec-guard/core";
import { createMcpToolRegistry, type CoreActionExecutor, type McpRegisteredTool } from "./tool-registry.ts";

interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpServerOptions {
  executor?: CoreActionExecutor;
  context?: ActionExecutionContext;
  stdin?: Readable;
  stdout?: Writable;
}

function paramsRecord(params: unknown): Record<string, unknown> {
  return params && typeof params === "object" ? params as Record<string, unknown> : {};
}

function publicTool(tool: McpRegisteredTool): Record<string, unknown> {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.input_schema,
    outputSchema: tool.output_schema,
    annotations: {
      action_id: tool.action_id,
      mutability: tool.mutability,
      human_gated: tool.human_gated,
      review_bound: tool.review_bound
    }
  };
}

export class SpecGuardMcpServer {
  readonly tools: McpRegisteredTool[];
  readonly context: ActionExecutionContext;

  constructor(options: McpServerOptions = {}) {
    this.tools = createMcpToolRegistry(options.executor ? { executor: options.executor } : {});
    this.context = options.context ?? {
      projectRoot: process.env.SPEC_GUARD_PROJECT_ROOT ?? process.cwd(),
      ...(process.env.SPEC_GUARD_ARTIFACT_ROOT ? { artifactRoot: process.env.SPEC_GUARD_ARTIFACT_ROOT } : {})
    };
  }

  listTools(): Record<string, unknown>[] {
    return this.tools.map(publicTool);
  }

  async callTool(name: string, input: Record<string, unknown> = {}) {
    const tool = this.tools.find((candidate) => candidate.name === name);
    if (!tool) {
      return {
        ok: false,
        action_id: name,
        data: {},
        diagnostics: [{ code: "MCP_UNKNOWN_TOOL", severity: "error", message: `Unknown MCP tool: ${name}`, field_path: "/name", gate: null, fix: "Call tools/list and choose a registered spec_guard_* tool." }],
        mutations: [],
        next_actions: [{ action_id: "mcp.quickstart", cli: "spec-guard mcp quickstart --json", mcp: "spec_guard_mcp_quickstart", reason: "Review available first calls and tool usage.", suggested_input: null }],
        summary: "Unknown MCP tool."
      };
    }
    return tool.call(input, this.context);
  }

  async handleMessage(message: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const id = message.id ?? null;
    try {
      if (message.method === "initialize") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "spec-guard", version: "0.0.0" }
          }
        };
      }
      if (message.method === "notifications/initialized") return null;
      if (message.method === "tools/list") {
        return { jsonrpc: "2.0", id, result: { tools: this.listTools() } };
      }
      if (message.method === "tools/call") {
        const params = paramsRecord(message.params);
        const name = typeof params.name === "string" ? params.name : "";
        const args = params.arguments && typeof params.arguments === "object" ? params.arguments as Record<string, unknown> : {};
        const result = await this.callTool(name, args);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
            isError: !result.ok
          }
        };
      }
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${message.method ?? "<missing>"}` } };
    } catch (error) {
      return { jsonrpc: "2.0", id, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } };
    }
  }
}

function writeMcpFrame(output: Writable, response: JsonRpcResponse): void {
  // MCP stdio transport is newline-delimited JSON (one JSON-RPC message per line). JSON.stringify never
  // emits embedded newlines, so a single trailing "\n" is a complete, spec-compliant frame. (The reader
  // below still also accepts legacy Content-Length framing for robustness.)
  output.write(`${JSON.stringify(response)}\n`);
}

function takeFramedMessage(buffer: string): { body: string; rest: string } | null {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd === -1) return null;
  const header = buffer.slice(0, headerEnd);
  const match = /^Content-Length:\s*(\d+)$/im.exec(header);
  if (!match?.[1]) return null;
  const length = Number.parseInt(match[1], 10);
  const bodyStart = headerEnd + 4;
  if (Buffer.byteLength(buffer.slice(bodyStart), "utf8") < length) return null;
  const body = buffer.slice(bodyStart, bodyStart + length);
  return { body, rest: buffer.slice(bodyStart + length) };
}

export function startMcpServer(options: McpServerOptions = {}): SpecGuardMcpServer {
  const server = new SpecGuardMcpServer(options);
  const input = options.stdin ?? defaultStdin;
  const output = options.stdout ?? defaultStdout;
  let buffer = "";
  const handleBody = (body: string) => {
    if (body.trim().length === 0) return;
    void (async () => {
      try {
        const response = await server.handleMessage(JSON.parse(body) as JsonRpcRequest);
        if (response) writeMcpFrame(output, response);
      } catch (error) {
        // A malformed line (JSON.parse throws) or any unexpected error must NEVER become an unhandled rejection:
        // that would EXIT the stdio server and drop every tool. Log to stderr (stdout is the JSON-RPC channel) and
        // reply with a best-effort parse error so the client sees a response instead of a dead connection.
        process.stderr.write(`spec-guard mcp: dropped a bad message: ${error instanceof Error ? error.message : String(error)}\n`);
        try { writeMcpFrame(output, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); } catch { /* output is gone; nothing more to do */ }
      }
    })();
  };
  input.setEncoding("utf8");
  input.on("data", (chunk: string) => {
    buffer += chunk;
    while (buffer.startsWith("Content-Length:")) {
      const framed = takeFramedMessage(buffer);
      if (!framed) return;
      buffer = framed.rest;
      handleBody(framed.body);
    }
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) handleBody(line);
  });
  return server;
}
