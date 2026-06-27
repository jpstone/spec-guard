import { canonicalJson } from "../canonical/canonical-json.ts";
import { sha256HexCanonical } from "../canonical/hashes.ts";
import type { Diagnostic } from "../schemas/embedded.ts";
import type { CommandResult, CommandSpec, DevRuntime } from "../schemas/embedded.ts";
import type { RuntimeBaseline } from "../schemas/artifacts.ts";
import { diagnostic } from "../actions/config.ts";
import { CommandResultStore } from "../commands/command-results.ts";
import { detectInvalidBaselineCommand } from "../commands/placeholder.ts";

// runtime_development is validated separately from the run-to-completion CommandSpec slots: it is a
// long-running PROCESS GROUP (DevRuntime), validated structurally here; the actual start->probe->stop
// runner evidence is a later slice.
const COMMAND_SLOTS = ["test", "build", "runtime_production"] as const;
type CommandSlot = typeof COMMAND_SLOTS[number];

// Platforms whose runtime baseline must establish a real dev runtime (it cannot be N/A'd). A dev runtime
// is established ONCE on the project's runtime baseline (a singleton) and inherited by every packet, so
// incremental work (e.g. adding a page to an existing app) never re-chooses it. (A dedicated game platform
// would belong here too; games built as desktop apps are already covered.)
const DEV_RUNTIME_REQUIRED_PLATFORMS = new Set(["web_app", "desktop_app", "mobile_app"]);

export interface BaselineCommandCheck {
  slot: CommandSlot;
  command_spec: CommandSpec | null;
  not_applicable_reason: string | null;
  current_result: CommandResult | null;
  status: "valid" | "not_applicable" | "invalid";
  diagnostics: Diagnostic[];
}

export interface DevRuntimeCheck {
  dev_runtime: DevRuntime | null;
  not_applicable_reason: string | null;
  status: "valid" | "not_applicable" | "invalid";
  diagnostics: Diagnostic[];
}

export interface BaselineValidationReport {
  acceptance_ready: boolean;
  diagnostics: Diagnostic[];
  command_checks: BaselineCommandCheck[];
  dev_runtime_check: DevRuntimeCheck;
}

function validateDevRuntimeSlot(baseline: RuntimeBaseline): DevRuntimeCheck {
  const dev = baseline.commands.runtime_development;
  const reason = baseline.commands.runtime_development_not_applicable_reason;
  const diagnostics: Diagnostic[] = [];
  let status: DevRuntimeCheck["status"] = "invalid";
  if (dev === null) {
    if (DEV_RUNTIME_REQUIRED_PLATFORMS.has(baseline.stack.product_platform ?? "")) {
      diagnostics.push(diagnostic("DEV_RUNTIME_REQUIRED_FOR_APP_PLATFORM", `A ${baseline.stack.product_platform} runtime baseline must establish a real dev runtime (runtime_development); it cannot be marked not-applicable. The dev runtime is established once on the project baseline and inherited by every packet, so incremental work does not re-choose it.`, "error", "/commands/runtime_development"));
    } else if (typeof reason === "string" && reason.trim().length > 0) {
      status = "not_applicable";
    } else {
      diagnostics.push(diagnostic("BASELINE_COMMAND_NOT_APPLICABLE_REASON_MISSING", "runtime_development is null but no concrete not-applicable reason was recorded.", "error", "/commands/runtime_development_not_applicable_reason"));
    }
  } else {
    // For a MULTI-process runtime the readiness probe should cross the process seam; port_open / file_ready
    // only observe one process/file and can pass while another process is down (the "frontend up, backend
    // down" trap). Nudge toward http_healthcheck / probe_command. Non-blocking (warning).
    if (dev.processes.length > 1 && (dev.readiness_probe.kind === "port_open" || dev.readiness_probe.kind === "file_ready")) {
      diagnostics.push(diagnostic("DEV_RUNTIME_PROBE_MAY_NOT_CROSS_SEAM", `Multi-process dev runtime readiness_probe of kind ${dev.readiness_probe.kind} may not cross the process seam; prefer http_healthcheck or probe_command that exercises the cross-process path.`, "warning", "/commands/runtime_development/readiness_probe"));
    }
    // The teeth: a declared dev runtime must have a PASSED run result bound to this exact spec (the runner
    // started the group and the readiness probe passed). This is what rejects "declared but broken".
    const run = baseline.validation.dev_runtime_run_result;
    if (run === undefined) {
      diagnostics.push(diagnostic("BASELINE_DEV_RUNTIME_RUN_MISSING", "runtime_development is declared but has no recorded run result; run baseline.dev_runtime.run to start the process group and prove the readiness probe passes.", "error", "/validation/dev_runtime_run_result"));
    } else if (run.dev_runtime_hash !== sha256HexCanonical(dev)) {
      diagnostics.push(diagnostic("BASELINE_DEV_RUNTIME_RUN_STALE", "The recorded dev-runtime run result does not match the current runtime_development spec; re-run baseline.dev_runtime.run.", "error", "/validation/dev_runtime_run_result"));
    } else if (run.status !== "passed") {
      diagnostics.push(diagnostic("BASELINE_DEV_RUNTIME_RUN_NOT_PASSED", `The dev-runtime run did not pass (status ${run.status}): ${run.error_message ?? "readiness probe failed"}.`, "error", "/validation/dev_runtime_run_result"));
    } else {
      status = "valid";
    }
  }
  return { dev_runtime: dev, not_applicable_reason: reason, status, diagnostics };
}

function specsEqual(a: CommandSpec, b: CommandSpec): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

function resultSortKey(result: CommandResult): string {
  return `${result.finished_at ?? ""}\u0000${result.id}`;
}

function currentResult(results: CommandResult[]): CommandResult | null {
  if (results.length === 0) return null;
  return [...results].sort((a, b) => resultSortKey(b).localeCompare(resultSortKey(a)))[0] ?? null;
}

export function validateRuntimeBaseline(baseline: RuntimeBaseline): BaselineValidationReport {
  const commandResults = baseline.validation.command_results;
  const command_checks: BaselineCommandCheck[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const slot of COMMAND_SLOTS) {
    const commandSpec = baseline.commands[slot];
    const reason = baseline.commands[`${slot}_not_applicable_reason` as const];
    const slotDiagnostics: Diagnostic[] = [];
    let status: BaselineCommandCheck["status"] = "invalid";
    let selected: CommandResult | null = null;
    const fieldPath = `/commands/${slot}`;

    if (commandSpec === null) {
      if (typeof reason === "string" && reason.trim().length > 0) {
        status = "not_applicable";
      } else {
        slotDiagnostics.push(diagnostic("BASELINE_COMMAND_NOT_APPLICABLE_REASON_MISSING", `${slot} command is null but no concrete not-applicable reason was recorded.`, "error", `${fieldPath}_not_applicable_reason`));
      }
    } else {
      const invalid = detectInvalidBaselineCommand(commandSpec);
      if (invalid.invalid) {
        slotDiagnostics.push(diagnostic("BASELINE_COMMAND_PLACEHOLDER", `${slot} command cannot satisfy baseline validation: ${invalid.reason ?? "invalid placeholder command"}.`, "error", fieldPath));
      }

      const exactPurpose = commandResults.filter((result) => result.purpose === slot && specsEqual(result.command_spec, commandSpec));
      selected = currentResult(exactPurpose);
      if (selected === null) {
        const sameSpecDifferentPurpose = commandResults.some((result) => result.purpose !== slot && specsEqual(result.command_spec, commandSpec));
        const samePurposeDifferentSpec = commandResults.some((result) => result.purpose === slot && !specsEqual(result.command_spec, commandSpec));
        if (sameSpecDifferentPurpose) {
          slotDiagnostics.push(diagnostic("BASELINE_COMMAND_PURPOSE_MISMATCH", `${slot} command has CommandResult records with a different purpose.`, "error", `/validation/command_results`));
        } else if (samePurposeDifferentSpec) {
          slotDiagnostics.push(diagnostic("BASELINE_COMMAND_RESULT_STALE", `${slot} command results do not match the current CommandSpec.`, "error", `/validation/command_results`));
        } else {
          slotDiagnostics.push(diagnostic("BASELINE_COMMAND_RESULT_MISSING", `${slot} command is missing a current matching passed CommandResult.`, "error", `/validation/command_results`));
        }
      } else {
        if (selected.related_runtime_baseline_ref !== null) {
          slotDiagnostics.push(diagnostic("BASELINE_COMMAND_RESULT_REF_NOT_DRAFT", `${slot} current CommandResult is linked to an accepted runtime baseline ref; draft validation requires null related_runtime_baseline_ref.`, "error", `/validation/command_results/${selected.id}`));
        }
        if (selected.status !== "passed") {
          slotDiagnostics.push(diagnostic("BASELINE_COMMAND_RESULT_NOT_PASSED", `${slot} current CommandResult status is ${selected.status}.`, "error", `/validation/command_results/${selected.id}`));
        }
      }

      if (slotDiagnostics.length === 0) status = "valid";
    }

    diagnostics.push(...slotDiagnostics);
    command_checks.push({ slot, command_spec: commandSpec, not_applicable_reason: reason, current_result: selected, status, diagnostics: slotDiagnostics });
  }

  const dev_runtime_check = validateDevRuntimeSlot(baseline);
  diagnostics.push(...dev_runtime_check.diagnostics);

  return { acceptance_ready: diagnostics.every((d) => d.severity !== "error"), diagnostics, command_checks, dev_runtime_check };
}

export async function validateRuntimeBaselineWithStoredCommandResults(baseline: RuntimeBaseline, artifactRoot: string): Promise<BaselineValidationReport> {
  const store = new CommandResultStore(artifactRoot);
  const trustedResults: CommandResult[] = [];
  const trustDiagnostics: Diagnostic[] = [];

  for (const [index, result] of baseline.validation.command_results.entries()) {
    try {
      const stored = await store.get(result.storage_ref);
      if (canonicalJson(stored) !== canonicalJson(result)) {
        trustDiagnostics.push(diagnostic("BASELINE_COMMAND_RESULT_UNTRUSTED", "Embedded CommandResult does not match the durable command-result record and cannot satisfy baseline validation.", "error", `/validation/command_results/${index}`));
      } else {
        trustedResults.push(result);
      }
    } catch (error) {
      trustDiagnostics.push(diagnostic("BASELINE_COMMAND_RESULT_UNTRUSTED", `Embedded CommandResult storage_ref is not resolvable through command-result storage: ${error instanceof Error ? error.message : String(error)}`, "error", `/validation/command_results/${index}`));
    }
  }

  const report = validateRuntimeBaseline({ ...baseline, validation: { ...baseline.validation, command_results: trustedResults } });
  const diagnostics = [...trustDiagnostics, ...report.diagnostics];
  return { ...report, diagnostics, acceptance_ready: diagnostics.every((d) => d.severity !== "error") };
}

export function approvedRuntimeBaselinePaths(): string[] {
  return ["/stack", "/commands", "/configuration", "/dependency_modes", "/diff_policy", "/validation"];
}

export function affectsApprovedRuntimeBaselinePath(path: string): boolean {
  return approvedRuntimeBaselinePaths().some((approvedPath) => path === approvedPath || path.startsWith(`${approvedPath}/`));
}
