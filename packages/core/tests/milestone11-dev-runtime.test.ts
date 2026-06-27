import { describe, expect, it } from "vitest";
import { validateRuntimeBaseline, DevRuntimeSchema, ReadinessProbeSchema, sha256HexCanonical, type DevRuntime, type DevRuntimeRunResult, type RuntimeBaseline } from "../src/index.ts";

const devRuntime = (): DevRuntime => DevRuntimeSchema.parse({
  processes: [
    { name: "frontend", command: { mode: "shell", shell_command: "npm run dev" } },
    { name: "backend", command: { mode: "shell", shell_command: "npm start" } }
  ],
  readiness_probe: { kind: "http_healthcheck", value: "http://localhost:5173/" }
});

// A passing run result bound to a given dev runtime spec (mirrors what baseline.dev_runtime.run records).
const passedRun = (dev: DevRuntime): DevRuntimeRunResult => ({
  status: "passed", readiness_passed: true, probe_kind: dev.readiness_probe.kind,
  process_observations: dev.processes.map((p) => ({ name: p.name, started: true, exited_early: false, exit_code: null })),
  error_message: null, output_excerpt: null, duration_ms: 100, dev_runtime_hash: sha256HexCanonical(dev)
});

const baseline = (partial: Partial<RuntimeBaseline["commands"]>, productPlatform: string | null = null, devRun?: DevRuntimeRunResult): RuntimeBaseline => ({
  artifact_type: "runtime_baseline", schema_version: 1, id: "default", revision: 1,
  created_at: "2026-06-21T00:00:00.000Z", updated_at: "2026-06-21T00:00:00.000Z", status: "draft",
  stack: { product_platform: productPlatform, runtime: null, language: null, package_manager: null, framework: null, build_tool: null, architecture: null },
  commands: { test: null, test_not_applicable_reason: "no tests", build: null, build_not_applicable_reason: "no build", runtime_production: null, runtime_production_not_applicable_reason: "no prod runtime", runtime_development: null, runtime_development_not_applicable_reason: "no dev runtime", ...partial },
  configuration: { environment_strategy: null, required_env_vars: [], greenfield_scaffold: false },
  dependency_modes: { install_mode: null, external_services: null },
  diff_policy: { dependency_changes_require_approval: true, include_untracked: true },
  validation: { command_results: [], dev_runtime_run_result: devRun, diagnostics: [] },
  acceptance: null, decision_history: [], blocker: null, diagnostics: []
});

describe("M11 dev-runtime schema + validation slot (Floor slice 1)", () => {
  it("DevRuntime is a process group with a required readiness probe and defaulted stop", () => {
    const dev = devRuntime();
    expect(dev.processes).toHaveLength(2);
    expect(dev.readiness_probe.kind).toBe("http_healthcheck");
    expect(dev.readiness_probe.timeout_ms).toBe(60000); // default
    expect(dev.stop).toEqual({ signal: "SIGTERM", grace_ms: 5000 }); // default
    expect(dev.processes[0]!.readiness).toBeNull(); // default
    // readiness_probe is required.
    expect(() => DevRuntimeSchema.parse({ processes: [{ name: "x", command: { mode: "shell", shell_command: "x" } }] })).toThrow();
    // at least one process.
    expect(() => DevRuntimeSchema.parse({ processes: [], readiness_probe: { kind: "port_open", value: "3000" } })).toThrow();
    expect(() => ReadinessProbeSchema.parse({ kind: "log_pattern", value: "" })).toThrow();
  });

  it("a declared dev runtime needs a PASSED, spec-matching run result to be valid", () => {
    const dev = devRuntime();
    // No run result yet -> RUN_MISSING, not acceptance-ready.
    const missing = validateRuntimeBaseline(baseline({ runtime_development: dev, runtime_development_not_applicable_reason: null }));
    expect(missing.dev_runtime_check.status).toBe("invalid");
    expect(missing.diagnostics.map((d) => d.code)).toContain("BASELINE_DEV_RUNTIME_RUN_MISSING");
    // A passing, matching run result -> valid + acceptance-ready.
    const passed = validateRuntimeBaseline(baseline({ runtime_development: dev, runtime_development_not_applicable_reason: null }, null, passedRun(dev)));
    expect(passed.dev_runtime_check.status).toBe("valid");
    expect(passed.acceptance_ready).toBe(true);
    // A run result for a DIFFERENT spec -> stale.
    const otherDev = DevRuntimeSchema.parse({ processes: [{ name: "x", command: { mode: "shell", shell_command: "other" } }], readiness_probe: { kind: "port_open", value: "9999" } });
    const stale = validateRuntimeBaseline(baseline({ runtime_development: dev, runtime_development_not_applicable_reason: null }, null, passedRun(otherDev)));
    expect(stale.diagnostics.map((d) => d.code)).toContain("BASELINE_DEV_RUNTIME_RUN_STALE");
    // A non-passing run result -> not passed.
    const failed = validateRuntimeBaseline(baseline({ runtime_development: dev, runtime_development_not_applicable_reason: null }, null, { ...passedRun(dev), status: "timed_out", readiness_passed: false, error_message: "probe never passed" }));
    expect(failed.diagnostics.map((d) => d.code)).toContain("BASELINE_DEV_RUNTIME_RUN_NOT_PASSED");
  });

  it("null dev runtime with a reason is not_applicable", () => {
    const report = validateRuntimeBaseline(baseline({ runtime_development: null, runtime_development_not_applicable_reason: "headless library; no dev runtime" }));
    expect(report.dev_runtime_check.status).toBe("not_applicable");
  });

  it("null dev runtime WITHOUT a reason fails", () => {
    const report = validateRuntimeBaseline(baseline({ runtime_development: null, runtime_development_not_applicable_reason: null }));
    expect(report.dev_runtime_check.status).toBe("invalid");
    expect(report.diagnostics.map((d) => d.code)).toContain("BASELINE_COMMAND_NOT_APPLICABLE_REASON_MISSING");
    expect(report.acceptance_ready).toBe(false);
  });

  it("warns (non-blocking) when a MULTI-process dev runtime uses a probe that cannot cross the seam", () => {
    const multiPortOpen = DevRuntimeSchema.parse({ processes: [{ name: "fe", command: { mode: "shell", shell_command: "vite" } }, { name: "be", command: { mode: "shell", shell_command: "node server" } }], readiness_probe: { kind: "port_open", value: "5173" } });
    const report = validateRuntimeBaseline(baseline({ runtime_development: multiPortOpen, runtime_development_not_applicable_reason: null }, null, passedRun(multiPortOpen)));
    expect(report.diagnostics.map((d) => d.code)).toContain("DEV_RUNTIME_PROBE_MAY_NOT_CROSS_SEAM");
    expect(report.acceptance_ready).toBe(true); // warning, not error
  });

  it("does NOT warn for a single-process runtime (no seam) or a multi-process http/probe_command probe", () => {
    const singlePortOpen = DevRuntimeSchema.parse({ processes: [{ name: "game", command: { mode: "shell", shell_command: "engine --play" } }], readiness_probe: { kind: "port_open", value: "7777" } });
    expect(validateRuntimeBaseline(baseline({ runtime_development: singlePortOpen, runtime_development_not_applicable_reason: null }, null, passedRun(singlePortOpen))).diagnostics.map((d) => d.code)).not.toContain("DEV_RUNTIME_PROBE_MAY_NOT_CROSS_SEAM");
    const dev = devRuntime();
    expect(validateRuntimeBaseline(baseline({ runtime_development: dev, runtime_development_not_applicable_reason: null }, null, passedRun(dev))).diagnostics.map((d) => d.code)).not.toContain("DEV_RUNTIME_PROBE_MAY_NOT_CROSS_SEAM");
  });

  it("an app-platform baseline MUST establish a real dev runtime (cannot N/A it, even with a reason)", () => {
    for (const platform of ["web_app", "desktop_app", "mobile_app"]) {
      const report = validateRuntimeBaseline(baseline({ runtime_development: null, runtime_development_not_applicable_reason: "skipping the dev runtime" }, platform));
      expect(report.diagnostics.map((d) => d.code)).toContain("DEV_RUNTIME_REQUIRED_FOR_APP_PLATFORM");
      expect(report.dev_runtime_check.status).toBe("invalid");
      expect(report.acceptance_ready).toBe(false);
    }
    // A real dev runtime with a passing run satisfies it.
    const dev = devRuntime();
    const ok = validateRuntimeBaseline(baseline({ runtime_development: dev, runtime_development_not_applicable_reason: null }, "web_app", passedRun(dev)));
    expect(ok.diagnostics.map((d) => d.code)).not.toContain("DEV_RUNTIME_REQUIRED_FOR_APP_PLATFORM");
    expect(ok.acceptance_ready).toBe(true);
  });

  it("non-app platforms may N/A the dev runtime with a reason (no requirement)", () => {
    for (const platform of ["cli_app", "backend_api_service", null]) {
      const report = validateRuntimeBaseline(baseline({ runtime_development: null, runtime_development_not_applicable_reason: "no dev runtime needed" }, platform));
      expect(report.dev_runtime_check.status).toBe("not_applicable");
      expect(report.diagnostics.map((d) => d.code)).not.toContain("DEV_RUNTIME_REQUIRED_FOR_APP_PLATFORM");
    }
  });
});
