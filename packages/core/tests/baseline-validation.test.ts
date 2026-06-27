import { describe, expect, it } from "vitest";
import { validateRuntimeBaseline, type CommandResult, type CommandSpec, type RuntimeBaseline } from "../src/index.ts";

const spec = (arg = "ok"): CommandSpec => ({ mode: "argv", argv: [process.execPath, "-e", `console.log(${JSON.stringify(arg)})`], working_directory: ".", timeout_ms: 1000, env_mode: "inherit", env_overrides_ref: null });
const shellSpec = (shell_command: string): CommandSpec => ({ mode: "shell", shell_command, working_directory: ".", timeout_ms: 1000, env_mode: "inherit", env_overrides_ref: null });

const result = (overrides: Partial<CommandResult> = {}): CommandResult => ({
  id: "cr-a",
  storage_ref: "command-result:cr-a",
  command: "node -e",
  command_spec: spec(),
  purpose: "test",
  working_directory: ".",
  timeout_ms: 1000,
  env_mode: "inherit",
  related_work_id: null,
  related_runtime_baseline_ref: null,
  related_runtime_baseline_draft_revision: 1,
  exit_code: 0,
  started_at: "2026-06-21T00:00:00.000Z",
  finished_at: "2026-06-21T00:00:01.000Z",
  duration_ms: 1000,
  status: "passed",
  skip_reason: null,
  skip_precondition: null,
  error_message: null,
  output_ref: null,
  output_excerpt: null,
  resource_categories: [],
  cleanup_observations: null,
  source_interface: "core",
  ...overrides
});

const baseline = (partial: Partial<RuntimeBaseline>): RuntimeBaseline => ({
  artifact_type: "runtime_baseline",
  schema_version: 1,
  revision: 1,
  created_at: "2026-06-21T00:00:00.000Z",
  updated_at: "2026-06-21T00:00:00.000Z",
  status: "draft",
  stack: { product_platform: null, runtime: null, language: null, package_manager: null, framework: null, build_tool: null, architecture: null },
  commands: { test: null, test_not_applicable_reason: "no tests", build: null, build_not_applicable_reason: "no build", runtime_production: null, runtime_production_not_applicable_reason: "no production runtime", runtime_development: null, runtime_development_not_applicable_reason: "no development runtime" },
  configuration: { environment_strategy: null, required_env_vars: [], greenfield_scaffold: false },
  dependency_modes: { install_mode: null, external_services: null },
  diff_policy: { dependency_changes_require_approval: true, include_untracked: true },
  validation: { command_results: [], diagnostics: [] },
  acceptance: null,
  decision_history: [],
  blocker: null,
  diagnostics: [],
  ...partial
});

describe("runtime baseline validation", () => {
  it("requires non-null commands to have current matching passed results or concrete not-applicable reasons", () => {
    const b = baseline({ commands: { ...baseline({}).commands, test: spec(), test_not_applicable_reason: null }, validation: { command_results: [result()], diagnostics: [] } });
    expect(validateRuntimeBaseline(b).acceptance_ready).toBe(true);

    const missingReason = baseline({ commands: { ...baseline({}).commands, runtime_development_not_applicable_reason: null } });
    expect(validateRuntimeBaseline(missingReason).diagnostics.map((d) => d.code)).toContain("BASELINE_COMMAND_NOT_APPLICABLE_REASON_MISSING");
  });

  it("blocks placeholder commands even when a result passed", () => {
    const echoSpec: CommandSpec = { mode: "argv", argv: ["echo", "ok"], working_directory: ".", timeout_ms: 1000, env_mode: "inherit", env_overrides_ref: null };
    const b = baseline({ commands: { ...baseline({}).commands, test: echoSpec, test_not_applicable_reason: null }, validation: { command_results: [result({ command_spec: echoSpec })], diagnostics: [] } });
    const report = validateRuntimeBaseline(b);
    expect(report.acceptance_ready).toBe(false);
    expect(report.diagnostics.map((d) => d.code)).toContain("BASELINE_COMMAND_PLACEHOLDER");
  });

  it.each(["echo ok && true", "pwd; whoami", "printf ok || echo fallback", "exit 0"])("blocks placeholder-only shell command %s", (shell_command) => {
    const commandSpec = shellSpec(shell_command);
    const b = baseline({ commands: { ...baseline({}).commands, test: commandSpec, test_not_applicable_reason: null }, validation: { command_results: [result({ command_spec: commandSpec })], diagnostics: [] } });
    const report = validateRuntimeBaseline(b);
    expect(report.acceptance_ready).toBe(false);
    expect(report.diagnostics.map((d) => d.code)).toContain("BASELINE_COMMAND_PLACEHOLDER");
  });

  it("blocks argv commands whose arguments are only version/help flags", () => {
    const commandSpec: CommandSpec = { mode: "argv", argv: ["node", "--version", "--help"], working_directory: ".", timeout_ms: 1000, env_mode: "inherit", env_overrides_ref: null };
    const b = baseline({ commands: { ...baseline({}).commands, test: commandSpec, test_not_applicable_reason: null }, validation: { command_results: [result({ command_spec: commandSpec })], diagnostics: [] } });
    const report = validateRuntimeBaseline(b);
    expect(report.acceptance_ready).toBe(false);
    expect(report.diagnostics.map((d) => d.code)).toContain("BASELINE_COMMAND_PLACEHOLDER");
  });

  it("does not reject real commands just because they contain non-placeholder arguments", () => {
    const realSpec = spec("echo is just data");
    const b = baseline({ commands: { ...baseline({}).commands, test: realSpec, test_not_applicable_reason: null }, validation: { command_results: [result({ command_spec: realSpec })], diagnostics: [] } });
    const report = validateRuntimeBaseline(b);
    expect(report.acceptance_ready).toBe(true);
    expect(report.diagnostics.map((d) => d.code)).not.toContain("BASELINE_COMMAND_PLACEHOLDER");
  });

  it("does not let placeholder commands recorded for purpose other satisfy governed command slots", () => {
    const echoSpec: CommandSpec = { mode: "argv", argv: ["echo", "ok"], working_directory: ".", timeout_ms: 1000, env_mode: "inherit", env_overrides_ref: null };
    const b = baseline({ commands: { ...baseline({}).commands, test: echoSpec, test_not_applicable_reason: null }, validation: { command_results: [result({ command_spec: echoSpec, purpose: "other" })], diagnostics: [] } });
    const report = validateRuntimeBaseline(b);
    expect(report.acceptance_ready).toBe(false);
    expect(report.diagnostics.map((d) => d.code)).toContain("BASELINE_COMMAND_PLACEHOLDER");
    expect(report.diagnostics.map((d) => d.code)).toContain("BASELINE_COMMAND_PURPOSE_MISMATCH");
  });

  it("blocks missing, stale, purpose-mismatched, and non-passed current results", () => {
    const currentSpec = spec("current");
    const oldSpec = spec("old");
    expect(validateRuntimeBaseline(baseline({ commands: { ...baseline({}).commands, test: currentSpec, test_not_applicable_reason: null } })).diagnostics.map((d) => d.code)).toContain("BASELINE_COMMAND_RESULT_MISSING");
    expect(validateRuntimeBaseline(baseline({ commands: { ...baseline({}).commands, test: currentSpec, test_not_applicable_reason: null }, validation: { command_results: [result({ command_spec: oldSpec })], diagnostics: [] } })).diagnostics.map((d) => d.code)).toContain("BASELINE_COMMAND_RESULT_STALE");
    expect(validateRuntimeBaseline(baseline({ commands: { ...baseline({}).commands, test: currentSpec, test_not_applicable_reason: null }, validation: { command_results: [result({ command_spec: currentSpec, purpose: "build" })], diagnostics: [] } })).diagnostics.map((d) => d.code)).toContain("BASELINE_COMMAND_PURPOSE_MISMATCH");
    expect(validateRuntimeBaseline(baseline({ commands: { ...baseline({}).commands, test: currentSpec, test_not_applicable_reason: null }, validation: { command_results: [result({ command_spec: currentSpec, status: "failed", exit_code: 1 })], diagnostics: [] } })).diagnostics.map((d) => d.code)).toContain("BASELINE_COMMAND_RESULT_NOT_PASSED");
    expect(validateRuntimeBaseline(baseline({ commands: { ...baseline({}).commands, test: currentSpec, test_not_applicable_reason: null }, validation: { command_results: [result({ command_spec: currentSpec, status: "timed_out", exit_code: null })], diagnostics: [] } })).diagnostics.map((d) => d.code)).toContain("BASELINE_COMMAND_RESULT_NOT_PASSED");
    expect(validateRuntimeBaseline(baseline({ commands: { ...baseline({}).commands, test: currentSpec, test_not_applicable_reason: null }, validation: { command_results: [result({ command_spec: currentSpec, status: "skipped", exit_code: null, skip_reason: "precondition", skip_precondition: "deterministic" })], diagnostics: [] } })).diagnostics.map((d) => d.code)).toContain("BASELINE_COMMAND_RESULT_NOT_PASSED");
  });

  it("selects current result by greatest finished_at then lexicographically greatest id", () => {
    const command = spec();
    const b = baseline({ commands: { ...baseline({}).commands, test: command, test_not_applicable_reason: null }, validation: { command_results: [result({ id: "cr-a", command_spec: command, status: "passed" }), result({ id: "cr-z", command_spec: command, status: "failed", exit_code: 1 })], diagnostics: [] } });
    expect(validateRuntimeBaseline(b).diagnostics.map((d) => d.code)).toContain("BASELINE_COMMAND_RESULT_NOT_PASSED");
  });
});
