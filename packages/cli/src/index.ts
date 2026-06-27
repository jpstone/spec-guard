#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { executeAction, failureResult, diagnostic, evaluatePreEditHook, editCapableAgentNames, loadRoleConfig, aggregateStoreForContext, normalizeGovernedPath, type ActionResult } from "@spec-guard/core";
import path from "node:path";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { serveViewer, type ViewerServerHandle } from "@spec-guard/viewer";
import { renderInitPlainText } from "./render-init.ts";

interface ParsedCommand {
  actionId: string;
  input: Record<string, unknown>;
  json: boolean;
}

function takeOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined) throw new Error(`${name} requires a value`);
  args.splice(index, 2);
  return value;
}

function hasFlag(args: string[], name: string): boolean {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

export function parseArgs(argv: string[]): ParsedCommand {
  const args = [...argv];
  const command = args.shift();
  if (command === "init") {
    const json = hasFlag(args, "--json");
    const artifactRoot = takeOption(args, "--artifact-root");
    const projectId = takeOption(args, "--project-id");
    if (args.length > 0) throw new Error(`unknown init arguments: ${args.join(" ")}`);
    return { actionId: "init", input: { ...(artifactRoot ? { artifact_root: artifactRoot } : {}), ...(projectId ? { project_id: projectId } : {}), json }, json };
  }

  if (command === "config") {
    const subcommand = args.shift();
    const json = hasFlag(args, "--json");
    if (subcommand === "get") return { actionId: "config.get", input: {}, json };
    if (subcommand === "check") return { actionId: "config.check", input: {}, json };
    if (subcommand === "update") {
      const patchText = takeOption(args, "--patch");
      if (patchText === undefined) throw new Error("config update requires --patch '<json>'");
      if (args.length > 0) throw new Error(`unknown config update arguments: ${args.join(" ")}`);
      return { actionId: "config.update", input: { patch: JSON.parse(patchText) as unknown }, json };
    }
  }

  if (command === "serve" || command === "serve.viewer") {
    const subcommand = command === "serve" ? args.shift() : "viewer";
    const json = hasFlag(args, "--json");
    if (subcommand === "viewer") {
      const host = takeOption(args, "--host");
      const portText = takeOption(args, "--port");
      if (args.length > 0) throw new Error(`unknown serve viewer arguments: ${args.join(" ")}`);
      const port = portText === undefined ? undefined : Number(portText);
      if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) throw new Error("--port must be an integer between 0 and 65535");
      return { actionId: "serve.viewer", input: { ...(host ? { host } : {}), ...(port !== undefined ? { port } : {}) }, json };
    }
  }

  if (command === "mcp") {
    const subcommand = args.shift();
    const json = hasFlag(args, "--json");
    if (subcommand === "quickstart") return { actionId: "mcp.quickstart", input: {}, json };
    if (subcommand === "status") return { actionId: "mcp.status", input: {}, json };
  }

  throw new Error("Usage: spec-guard init [--json] [--artifact-root <path>] [--project-id <id>] | spec-guard config get|check [--json] | spec-guard config update --patch '<json>' [--json] | spec-guard serve viewer [--host <host>] [--port <port>] [--json]");
}

function renderResult(result: ActionResult<Record<string, unknown>>, json: boolean): string {
  if (result.action_id === "init" && result.ok && !json) return renderInitPlainText(result);
  if (json) return `${JSON.stringify(result, null, 2)}\n`;
  if (!result.ok) return `${result.summary}\n${result.diagnostics.map((diag) => `- ${diag.code}: ${diag.message}`).join("\n")}\n`;
  if (result.action_id === "serve.viewer" && typeof (result.data as { url?: unknown }).url === "string") return `Viewer running at ${(result.data as { url: string }).url}\n`;
  return `${JSON.stringify(result.data, null, 2)}\n`;
}

export interface RunCliOptions {
  cwd?: string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  stdin?: string; // for `hook pre-edit`: the host PreToolUse JSON (tests pass it directly)
  keepAlive?: boolean;
  onViewerStarted?: (handle: ViewerServerHandle) => void;
}

async function waitForViewerTermination(handle: ViewerServerHandle): Promise<void> {
  await new Promise<void>((resolve) => {
    const shutdown = (): void => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      void handle.close().finally(resolve);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    handle.server.once("close", () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      resolve();
    });
  });
}

async function runServeViewer(parsed: ParsedCommand, options: RunCliOptions, stdout: (text: string) => void, stderr: (text: string) => void): Promise<number> {
  try {
    const viewerOptions = {
      projectRoot: options.cwd ?? process.cwd(),
      ...(typeof parsed.input.host === "string" ? { host: parsed.input.host } : {}),
      ...(typeof parsed.input.port === "number" ? { port: parsed.input.port } : {})
    };
    const handle = await serveViewer(viewerOptions);
    options.onViewerStarted?.(handle);
    stdout(renderResult(handle.result, parsed.json));
    if (options.keepAlive !== false) await waitForViewerTermination(handle);
    else if (options.onViewerStarted === undefined) await handle.close();
    return 0;
  } catch (error) {
    const result = failureResult("serve.viewer", "Viewer server failed to start.", [diagnostic("VIEWER_BIND_FAILED", error instanceof Error ? error.message : String(error), "error", "/serve.viewer")]);
    stderr(renderResult(result, parsed.json));
    return 1;
  }
}

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function relativizeNormalized(p: string, projectRoot: string): string {
  try {
    const forward = p.replace(/\\/g, "/");
    const isAbsolute = path.isAbsolute(forward) || /^[a-zA-Z]:/.test(forward);
    // Resolve RELATIVE paths against the project root too, so a `..`-prefixed path that re-enters the root
    // (e.g. ../<root>/src/x) collapses to its in-root form and is gated — not dropped as traversal and let through.
    const absolute = isAbsolute ? forward : path.resolve(projectRoot, forward);
    const rel = path.relative(projectRoot, absolute).replace(/\\/g, "/");
    return normalizeGovernedPath(rel);
  } catch {
    return ""; // genuinely escapes the root -> not product code under a Spec; skip
  }
}

function extractEditedPaths(toolInput: Record<string, unknown>, projectRoot: string): string[] {
  const raw: string[] = [];
  if (typeof toolInput.file_path === "string") raw.push(toolInput.file_path);
  if (typeof toolInput.notebook_path === "string") raw.push(toolInput.notebook_path);
  // apply_patch (Codex): the patch text carries "*** Add/Update/Delete File: <path>" headers
  const patch = [toolInput.command, toolInput.input, toolInput.patch].find((value) => typeof value === "string");
  if (typeof patch === "string") for (const match of patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) if (match[1] !== undefined) raw.push(match[1].trim());
  return raw.map((p) => relativizeNormalized(p, projectRoot)).filter((p) => p.length > 0);
}

const EDIT_LEASE_TTL_MS = 4 * 60 * 60 * 1000; // 4h — bounds a stale lease if a subagent ends without SubagentStop

interface EditLease { agent_type: string; agent_id: string | null; started_at: string }

// NOTE: assumes the DEFAULT .spec-guard/ artifact root (like the rest of the system in the live flow). A custom
// artifact_root is not discoverable by a fresh hook process — the Config that records it lives inside that root —
// so the gate reads packets/lease from .spec-guard/. Default-root projects (the norm) are fully gated.
function editLeasePath(projectRoot: string): string {
  return path.join(aggregateStoreForContext({ projectRoot }).root, ".edit-lease.json");
}

async function readActiveLease(projectRoot: string): Promise<EditLease | null> {
  try {
    const lease = JSON.parse(await readFile(editLeasePath(projectRoot), "utf8")) as EditLease;
    if (typeof lease.agent_type !== "string" || typeof lease.started_at !== "string") return null;
    const startedAt = new Date(lease.started_at).getTime();
    if (Number.isNaN(startedAt) || Date.now() - startedAt > EDIT_LEASE_TTL_MS) return null; // invalid/stale -> ignore
    return lease;
  } catch {
    return null;
  }
}

/** SubagentStart: an edit-capable subagent (implementer/fixer) is beginning — write the edit lease that PreToolUse
 *  reads on Codex (whose PreToolUse payload has no agent identity). Non-edit subagents (reviewer) get NO lease, so
 *  edits during their run stay denied. */
async function runSubagentStart(options: RunCliOptions, stdinContent: string): Promise<number> {
  try {
    const payload = JSON.parse(stdinContent) as Record<string, unknown>;
    const agentType = typeof payload.agent_type === "string" ? payload.agent_type : "";
    const agentId = typeof payload.agent_id === "string" ? payload.agent_id : null;
    const projectRoot = options.cwd ?? (typeof payload.cwd === "string" ? payload.cwd : process.cwd());
    if (!editCapableAgentNames(await loadRoleConfig(projectRoot)).has(agentType)) return 0;
    const leasePath = editLeasePath(projectRoot);
    await mkdir(path.dirname(leasePath), { recursive: true });
    await writeFile(leasePath, JSON.stringify({ agent_type: agentType, agent_id: agentId, started_at: new Date().toISOString() }), "utf8");
    return 0;
  } catch {
    return 0;
  }
}

/** SubagentStop: the edit-capable subagent has ended — clear the lease so the main session can no longer edit. */
async function runSubagentStop(options: RunCliOptions, stdinContent: string): Promise<number> {
  try {
    const payload = JSON.parse(stdinContent) as Record<string, unknown>;
    const projectRoot = options.cwd ?? (typeof payload.cwd === "string" ? payload.cwd : process.cwd());
    await rm(editLeasePath(projectRoot), { force: true });
    return 0;
  } catch {
    return 0;
  }
}

/** The PreToolUse edit-gate adapter (Claude + Codex share the schema): read the host payload from stdin, decide via
 *  evaluatePreEditHook, and block by writing the reason to stderr + exit 2 (the universal blocking method). Any
 *  unexpected error defaults to ALLOW (exit 0) — a guardrail must never brick the agent. */
async function runPreEditHook(options: RunCliOptions, stderr: (text: string) => void, stdinContent: string): Promise<number> {
  try {
    const payload = JSON.parse(stdinContent) as Record<string, unknown>;
    const toolName = typeof payload.tool_name === "string" ? payload.tool_name : "";
    const toolInput = payload.tool_input !== null && typeof payload.tool_input === "object" ? payload.tool_input as Record<string, unknown> : {};
    const agentType = typeof payload.agent_type === "string" ? payload.agent_type : null;
    const projectRoot = options.cwd ?? (typeof payload.cwd === "string" ? payload.cwd : process.cwd());
    // Resolve the actor: Claude carries agent_type in the payload; Codex doesn't, so fall back to the edit lease
    // SubagentStart wrote. No agent_type AND no lease => the main session (coordinator) => denied below.
    const actor = agentType ?? (await readActiveLease(projectRoot))?.agent_type ?? null;
    const editedPaths = extractEditedPaths(toolInput, projectRoot);
    const store = aggregateStoreForContext({ projectRoot });
    const packets = [];
    for (const id of await store.list()) {
      const aggregate = await store.tryRead(id);
      if (aggregate !== null) packets.push(aggregate);
    }
    const roleConfig = await loadRoleConfig(projectRoot);
    const decision = evaluatePreEditHook({ tool_name: toolName, agent_type: actor, edited_paths: editedPaths }, packets, roleConfig);
    if (decision.decision === "deny") {
      stderr(`spec-guard edit gate: ${decision.reason}\n`);
      return 2;
    }
    return 0;
  } catch {
    return 0; // never block on an internal error
  }
}

export async function runCli(argv: string[], options: RunCliOptions = {}): Promise<number> {
  const stdout = options.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = options.stderr ?? ((text: string) => process.stderr.write(text));
  try {
    if (argv[0] === "hook") {
      const stdinContent = options.stdin ?? await readAllStdin();
      if (argv[1] === "pre-edit") return await runPreEditHook(options, stderr, stdinContent);
      if (argv[1] === "subagent-start") return await runSubagentStart(options, stdinContent);
      if (argv[1] === "subagent-stop") return await runSubagentStop(options, stdinContent);
    }
    const parsed = parseArgs(argv);
    if (parsed.actionId === "serve.viewer") return runServeViewer(parsed, options, stdout, stderr);
    const result = await executeAction(parsed.actionId, parsed.input, { projectRoot: options.cwd ?? process.cwd() });
    const rendered = renderResult(result, parsed.json);
    if (result.ok) stdout(rendered);
    else stderr(rendered);
    return result.ok ? 0 : 1;
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function isDirectCliInvocation(): boolean {
  if (process.argv[1] === undefined) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectCliInvocation()) {
  process.exitCode = await runCli(process.argv.slice(2));
}
