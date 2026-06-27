import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initAction, baselineInit, baselineDevRuntimeRun, baselineCheck } from "../src/index.ts";

const node = process.execPath;
const port = (): number => 41000 + Math.floor(Math.random() * 20000);

function commandsWith(devProcesses: unknown, probe: unknown) {
  return {
    test: null, test_not_applicable_reason: "no tests",
    build: null, build_not_applicable_reason: "no build",
    runtime_production: null, runtime_production_not_applicable_reason: "long-running server",
    runtime_development: { processes: devProcesses, readiness_probe: probe },
    runtime_development_not_applicable_reason: null
  };
}
const webStack = { product_platform: "web_app", runtime: null, language: null, package_manager: null, framework: null, build_tool: null, architecture: null };

let projectRoot: string;
beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), "sg-devgate-"));
  await initAction({ project_id: "demo" }, { projectRoot });
});
afterEach(async () => { await rm(projectRoot, { recursive: true, force: true }); });

describe("M11 dev-runtime gate (Floor slice 3b)", () => {
  it("a web_app baseline is not acceptance-ready until the dev runtime is run AND passes", async () => {
    const p = port();
    await baselineInit({ stack: webStack, commands: commandsWith([{ name: "server", command: { mode: "argv", argv: [node, "-e", `require('http').createServer((q,r)=>r.end('ok')).listen(${p})`] } }], { kind: "http_healthcheck", value: `http://127.0.0.1:${p}/`, timeout_ms: 10000 }) } as never, { projectRoot });

    // Before running the dev runtime: declared but no run result -> blocked.
    const before = await baselineCheck({}, { projectRoot });
    expect(before.data.acceptance_ready).toBe(false);
    expect(before.diagnostics.map((d) => d.code)).toContain("BASELINE_DEV_RUNTIME_RUN_MISSING");

    // Run it (actually spawns the server, probes it, tears it down).
    const run = await baselineDevRuntimeRun({}, { projectRoot });
    expect(run.ok).toBe(true);
    expect(run.data.run_result!.status).toBe("passed");

    // Now acceptance-ready.
    const after = await baselineCheck({}, { projectRoot });
    expect(after.data.acceptance_ready).toBe(true);
    expect(after.diagnostics.map((d) => d.code)).not.toContain("BASELINE_DEV_RUNTIME_RUN_MISSING");
  }, 30000);

  it("a declared-but-broken dev runtime is recorded as not-passed and keeps the baseline un-acceptable", async () => {
    await baselineInit({ stack: webStack, commands: commandsWith([{ name: "crasher", command: { mode: "argv", argv: [node, "-e", "process.exit(1)"] } }], { kind: "port_open", value: String(port()), timeout_ms: 4000 }) } as never, { projectRoot });
    const run = await baselineDevRuntimeRun({}, { projectRoot });
    expect(run.data.run_result!.status).not.toBe("passed");
    const after = await baselineCheck({}, { projectRoot });
    expect(after.data.acceptance_ready).toBe(false);
    expect(after.diagnostics.map((d) => d.code)).toContain("BASELINE_DEV_RUNTIME_RUN_NOT_PASSED");
  }, 30000);
});
