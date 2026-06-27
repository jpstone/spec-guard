#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startMcpServer, SpecGuardMcpServer } from "./server.ts";
import { createMcpToolRegistry, findMcpTool } from "./tool-registry.ts";

export { startMcpServer, SpecGuardMcpServer, createMcpToolRegistry, findMcpTool };

function isDirectInvocation(): boolean {
  if (process.argv[1] === undefined) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  // Last-resort guards: a stray uncaught exception / unhandled rejection must NOT exit the stdio server (that
  // drops every tool mid-session). Log to stderr (stdout is the JSON-RPC channel) and stay alive.
  process.on("uncaughtException", (error) => process.stderr.write(`spec-guard mcp: uncaught exception (kept alive): ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`));
  process.on("unhandledRejection", (reason) => process.stderr.write(`spec-guard mcp: unhandled rejection (kept alive): ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}\n`));
  startMcpServer();
}
