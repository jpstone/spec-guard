import { spawn, type ChildProcess } from "node:child_process";
import { connect } from "node:net";
import { access } from "node:fs/promises";
import path from "node:path";
import { sha256HexCanonical } from "../canonical/hashes.ts";
import type { DevRuntime, DevRuntimeProcess, ReadinessProbe, DevRuntimeProcessObservation, DevRuntimeRunResult } from "../schemas/embedded.ts";

// Slice 3a: the dev-runtime RUNNER. Unlike the run-to-completion command runner, a dev runtime is a group
// of LONG-RUNNING processes. We start them all, poll the readiness_probe until it passes (proving the
// composed runtime is actually usable -- crossing the process seam when multi-process), then tear the
// whole group down. This is what catches "declared but broken" dev runtimes (e.g. `npm run dev` alone:
// the frontend port opens but an integration probe to the backend fails).

export interface RunDevRuntimeOptions {
  projectRoot: string;
  pollIntervalMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cwdFor(projectRoot: string, workingDirectory: string): string {
  return path.isAbsolute(workingDirectory) ? workingDirectory : path.join(projectRoot, workingDirectory);
}

// Best-effort cross-platform group teardown. On POSIX each process is spawned detached so we can signal the
// whole group (negative pid); on Windows we taskkill the tree. Falls back to child.kill().
function killGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      try { process.kill(-child.pid, signal); } catch { child.kill(signal); }
    }
  } catch {
    try { child.kill("SIGKILL"); } catch { /* already gone */ }
  }
}

async function tcpProbe(value: string): Promise<boolean> {
  // Accept "port", "host:port", and "[ipv6]:port"; split on the LAST colon so IPv6 literals parse.
  let host = "127.0.0.1";
  let portPart = value;
  if (value.includes(":")) {
    const idx = value.lastIndexOf(":");
    host = value.slice(0, idx).replace(/^\[|\]$/g, "") || "127.0.0.1";
    portPart = value.slice(idx + 1);
  }
  const port = Number(portPart);
  if (!Number.isInteger(port) || port <= 0) return false;
  return new Promise<boolean>((resolve) => {
    const socket = connect({ host, port }, () => { socket.destroy(); resolve(true); });
    socket.on("error", () => { socket.destroy(); resolve(false); });
    socket.setTimeout(2000, () => { socket.destroy(); resolve(false); });
  });
}

async function httpProbe(value: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(value, { signal: controller.signal });
    clearTimeout(t);
    return res.status >= 200 && res.status < 400;
  } catch { return false; }
}

async function probeCommand(value: string, projectRoot: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = spawn(value, { cwd: projectRoot, shell: true, stdio: "ignore" });
    const t = setTimeout(() => { child.kill("SIGKILL"); resolve(false); }, 5000);
    child.on("error", () => { clearTimeout(t); resolve(false); });
    child.on("close", (code) => { clearTimeout(t); resolve(code === 0); });
  });
}

async function probeOnce(probe: ReadinessProbe, log: string, projectRoot: string): Promise<boolean> {
  switch (probe.kind) {
    case "http_healthcheck": return httpProbe(probe.value);
    case "port_open": return tcpProbe(probe.value);
    case "file_ready": return access(cwdFor(projectRoot, probe.value)).then(() => true, () => false);
    case "log_pattern": { try { return new RegExp(probe.value).test(log); } catch { return false; } }
    case "probe_command": return probeCommand(probe.value, projectRoot);
  }
}

function spawnProcess(proc: DevRuntimeProcess, projectRoot: string): ChildProcess {
  const spec = proc.command;
  const cwd = cwdFor(projectRoot, spec.working_directory);
  const detached = process.platform !== "win32";
  return spec.mode === "argv"
    ? spawn(spec.argv?.[0] ?? "", spec.argv?.slice(1) ?? [], { cwd, env: { ...process.env }, shell: false, detached })
    : spawn(spec.shell_command ?? "", { cwd, env: { ...process.env }, shell: true, detached });
}

export async function runDevRuntime(devRuntime: DevRuntime, options: RunDevRuntimeOptions): Promise<DevRuntimeRunResult> {
  const startedAt = Date.now();
  const pollIntervalMs = options.pollIntervalMs ?? 250;
  const probe = devRuntime.readiness_probe;
  const children: Array<{ proc: DevRuntimeProcess; child: ChildProcess; observation: DevRuntimeProcessObservation }> = [];
  let log = "";

  for (const proc of devRuntime.processes) {
    const observation: DevRuntimeProcessObservation = { name: proc.name, started: false, exited_early: false, exit_code: null };
    try {
      const child = spawnProcess(proc, options.projectRoot);
      observation.started = child.pid !== undefined;
      child.stdout?.on("data", (chunk: Buffer) => { log += chunk.toString("utf8"); });
      child.stderr?.on("data", (chunk: Buffer) => { log += chunk.toString("utf8"); });
      child.on("error", () => { observation.exited_early = true; });
      child.on("close", (code) => { observation.exited_early = true; observation.exit_code = code; });
      children.push({ proc, child, observation });
    } catch {
      children.push({ proc, child: {} as ChildProcess, observation });
    }
  }

  let readiness_passed = false;
  let timedOut = false;
  try {
    const deadline = startedAt + probe.timeout_ms;
    while (Date.now() < deadline) {
      // Fail fast if any process crashed before becoming ready.
      if (children.some((c) => c.observation.exited_early)) break;
      if (await probeOnce(probe, log, options.projectRoot)) { readiness_passed = true; break; }
      await sleep(pollIntervalMs);
    }
    if (!readiness_passed && Date.now() >= deadline) timedOut = true;
  } finally {
    for (const { child } of children) killGroup(child, devRuntime.stop.signal);
    await sleep(Math.min(devRuntime.stop.grace_ms, 1000));
    for (const { child } of children) { try { child.kill("SIGKILL"); } catch { /* gone */ } }
  }

  const crashed = children.find((c) => c.observation.exited_early && !readiness_passed);
  const status: DevRuntimeRunResult["status"] = readiness_passed ? "passed" : timedOut ? "timed_out" : "failed";
  const error_message = readiness_passed ? null
    : crashed !== undefined ? `dev-runtime process '${crashed.observation.name}' exited before readiness (code ${crashed.observation.exit_code})`
    : timedOut ? `dev-runtime readiness probe (${probe.kind}) did not pass within ${probe.timeout_ms} ms`
    : `dev-runtime readiness probe (${probe.kind}) failed`;

  return {
    status,
    readiness_passed,
    probe_kind: probe.kind,
    process_observations: children.map((c) => c.observation),
    error_message,
    output_excerpt: log.length === 0 ? null : log.slice(0, 4000),
    duration_ms: Math.max(0, Date.now() - startedAt),
    dev_runtime_hash: sha256HexCanonical(devRuntime)
  };
}
