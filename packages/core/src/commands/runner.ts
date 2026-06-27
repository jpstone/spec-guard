import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { CommandResultSchema, type CommandResult, type CommandSpec, type RuntimeBaselineRef } from "../schemas/embedded.ts";
import { CommandResultStore } from "./command-results.ts";

export type CommandPurpose = CommandResult["purpose"];

export interface RunCommandOptions {
  commandSpec: CommandSpec;
  purpose: CommandPurpose;
  projectRoot: string;
  artifactRoot: string;
  relatedWorkId?: string | null;
  relatedRuntimeBaselineRef?: RuntimeBaselineRef | null;
  relatedRuntimeBaselineDraftRevision?: number | null;
  resourceCategories?: string[] | undefined;
  sourceInterface?: string | undefined;
  skipReason?: string | null | undefined;
  skipPrecondition?: string | null | undefined;
}

function iso(date: Date): string {
  return date.toISOString();
}

function displayCommand(commandSpec: CommandSpec): string {
  return commandSpec.mode === "argv" ? (commandSpec.argv ?? []).join(" ") : (commandSpec.shell_command ?? "");
}

function cwdFor(projectRoot: string, workingDirectory: string): string {
  return path.isAbsolute(workingDirectory) ? workingDirectory : path.join(projectRoot, workingDirectory);
}

function processEnv(mode: CommandSpec["env_mode"]): NodeJS.ProcessEnv {
  if (mode === "clean") return {};
  return { ...process.env };
}

async function fileManifest(root: string): Promise<Array<{ path: string; size: number; mtime_ms: number; content_hash: string }>> {
  const entries: Array<{ path: string; size: number; mtime_ms: number; content_hash: string }> = [];
  async function walk(absDir: string): Promise<void> {
    for (const dirent of await readdir(absDir, { withFileTypes: true })) {
      if (dirent.name === ".spec-guard" || dirent.name === "node_modules") continue;
      const abs = path.join(absDir, dirent.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (dirent.isDirectory()) { await walk(abs); continue; }
      if (!dirent.isFile()) continue;
      const s = await stat(abs);
      const content = await readFile(abs);
      entries.push({ path: rel, size: s.size, mtime_ms: Math.trunc(s.mtimeMs), content_hash: createHash("sha256").update(content).digest("hex") });
    }
  }
  await walk(root);
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function manifestsEqual(before: Array<{ path: string; size: number; content_hash: string }>, after: Array<{ path: string; size: number; content_hash: string }>): boolean {
  if (before.length !== after.length) return false;
  for (let i = 0; i < before.length; i += 1) {
    if (before[i]!.path !== after[i]!.path || before[i]!.size !== after[i]!.size || before[i]!.content_hash !== after[i]!.content_hash) return false;
  }
  return true;
}

function storeOutput(output: string): { output_ref: string | null; output_excerpt: string | null } {
  // Command output is NOT persisted to a blob. The verbose log is debugging noise — stale the instant it's
  // written, and a local working store shouldn't accumulate it (the wild .spec-guard/blobs growth). Keep only
  // a bounded excerpt for fix-routing; the structured verdict (status/exit_code/command/timestamp) is the
  // governance evidence, and live debugging is the implementer's job. (backlog wave 1: stop persisting logs.)
  return { output_ref: null, output_excerpt: output.length === 0 ? null : output.slice(0, 4000) };
}

// Default backstop so a one-shot verification command that HANGS (starts a server, watch mode, an interactive
// prompt) can't block forever — which, over MCP stdio, leaves the tool call unresolved until the client drops the
// whole server. Callers override per command via spec.timeout_ms for legitimately longer work.
export const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;

export async function runCommandDeterministically(options: RunCommandOptions): Promise<CommandResult> {
  const spec = options.commandSpec;
  const id = `command-result:${randomUUID()}`;
  const storage = new CommandResultStore(options.artifactRoot);
  const started = new Date();
  const started_at = iso(started);
  const timeout_ms = spec.timeout_ms ?? DEFAULT_COMMAND_TIMEOUT_MS;
  const working_directory = cwdFor(options.projectRoot, spec.working_directory);

  if (options.skipReason !== undefined || options.skipPrecondition !== undefined) {
    const finished = new Date();
    const skipped = CommandResultSchema.parse({
      id,
      storage_ref: storage.storageRef(id),
      command: displayCommand(spec),
      command_spec: spec,
      purpose: options.purpose,
      working_directory,
      timeout_ms,
      env_mode: spec.env_mode,
      related_work_id: options.relatedWorkId ?? null,
      related_runtime_baseline_ref: options.relatedRuntimeBaselineRef ?? null,
      related_runtime_baseline_draft_revision: options.relatedRuntimeBaselineDraftRevision ?? null,
      exit_code: null,
      started_at,
      finished_at: iso(finished),
      duration_ms: Math.max(0, finished.getTime() - started.getTime()),
      status: "skipped",
      skip_reason: options.skipReason ?? "deterministic precondition skip",
      skip_precondition: options.skipPrecondition ?? null,
      error_message: null,
      output_ref: null,
      output_excerpt: null,
      resource_categories: options.resourceCategories ?? [],
      cleanup_observations: null,
      source_interface: options.sourceInterface ?? "core"
    });
    return storage.put(skipped);
  }

  let output = "";
  let exit_code: number | null = null;
  let status: CommandResult["status"] = "failed";
  let error_message: string | null = null;
  const beforeFiles = options.resourceCategories?.includes("files") === true ? await fileManifest(options.projectRoot) : null;

  await new Promise<void>((resolve) => {
    let settled = false;
    let timedOut = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const child = spec.mode === "argv"
      ? spawn(spec.argv?.[0] ?? "", spec.argv?.slice(1) ?? [], { cwd: working_directory, env: processEnv(spec.env_mode), shell: false })
      : spawn(spec.shell_command ?? "", { cwd: working_directory, env: processEnv(spec.env_mode), shell: true });

    const timeout = timeout_ms === null ? null : setTimeout(() => {
      timedOut = true;
      status = "timed_out";
      error_message = `command timed out after ${timeout_ms} ms`;
      child.kill("SIGTERM");
    }, timeout_ms);

    child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.on("error", (error) => {
      if (timeout !== null) clearTimeout(timeout);
      status = "failed";
      exit_code = null;
      error_message = error.message;
      finish();
    });
    child.on("close", (code, signal) => {
      if (timeout !== null) clearTimeout(timeout);
      if (timedOut) {
        status = "timed_out";
        exit_code = null;
      } else if (signal !== null) {
        status = "failed";
        exit_code = null;
        error_message = `command terminated by signal ${signal}`;
      } else {
        exit_code = code;
        status = code === 0 ? "passed" : "failed";
      }
      finish();
    });
  });

  const finished = new Date();
  const afterFiles = beforeFiles !== null ? await fileManifest(options.projectRoot) : null;
  const cleanup_observations = beforeFiles !== null && afterFiles !== null ? { files: { before: beforeFiles, after: afterFiles, comparison_rule: "no_new_resources", passed: manifestsEqual(beforeFiles, afterFiles) } } : null;
  const outputStored = storeOutput(output);
  const result = CommandResultSchema.parse({
    id,
    storage_ref: storage.storageRef(id),
    command: displayCommand(spec),
    command_spec: spec,
    purpose: options.purpose,
    working_directory,
    timeout_ms,
    env_mode: spec.env_mode,
    related_work_id: options.relatedWorkId ?? null,
    related_runtime_baseline_ref: options.relatedRuntimeBaselineRef ?? null,
    related_runtime_baseline_draft_revision: options.relatedRuntimeBaselineDraftRevision ?? null,
    exit_code,
    started_at,
    finished_at: iso(finished),
    duration_ms: Math.max(0, finished.getTime() - started.getTime()),
    status,
    skip_reason: null,
    skip_precondition: null,
    error_message,
    output_ref: outputStored.output_ref,
    output_excerpt: outputStored.output_excerpt,
    resource_categories: options.resourceCategories ?? [],
    cleanup_observations,
    source_interface: options.sourceInterface ?? "core"
  });
  return storage.put(result);
}
