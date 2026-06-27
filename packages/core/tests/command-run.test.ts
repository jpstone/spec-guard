import { mkdtemp, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { baselineCheck, baselineInit, commandRun, CommandResultStore, initAction } from "../src/index.ts";

let projectRoot: string;

const nodeCommand = (code: string, timeout_ms = 5000) => ({
  mode: "argv" as const,
  argv: [process.execPath, "-e", code],
  working_directory: ".",
  timeout_ms,
  env_mode: "inherit" as const,
  env_overrides_ref: null
});

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), "spec-guard-command-"));
  await initAction({ project_id: "demo" }, { projectRoot });
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe("command.run", () => {
  it("derives passed and failed from exit codes and stores durable results", async () => {
    const passed = await commandRun({ command_spec: nodeCommand("process.exit(0)"), purpose: "test" }, { projectRoot });
    expect(passed.ok).toBe(true);
    expect(passed.data.command_result.status).toBe("passed");
    expect(passed.data.command_result.exit_code).toBe(0);

    const store = new CommandResultStore(path.join(projectRoot, ".spec-guard"));
    await expect(store.get(passed.data.command_result.storage_ref)).resolves.toMatchObject({ status: "passed" });

    const failed = await commandRun({ command_spec: nodeCommand("process.exit(7)"), purpose: "test" }, { projectRoot });
    expect(failed.data.command_result.status).toBe("failed");
    expect(failed.data.command_result.exit_code).toBe(7);
  });

  it("does not persist command output to a blob (verdict + bounded excerpt only)", async () => {
    const result = await commandRun({ command_spec: nodeCommand("console.log('hello from the command'); process.exit(0)"), purpose: "test" }, { projectRoot });
    expect(result.data.command_result.status).toBe("passed");
    expect(result.data.command_result.output_ref).toBeNull(); // full log is NOT blobbed
    expect(result.data.command_result.output_excerpt).toContain("hello from the command"); // bounded excerpt for routing
    const blobCount = await readdir(path.join(projectRoot, ".spec-guard", "blobs")).then((entries) => entries.length).catch(() => 0);
    expect(blobCount).toBe(0); // no .spec-guard/blobs growth from command output
  });

  it("records missing executable as failed with null exit code and an error", async () => {
    const result = await commandRun({ command_spec: { mode: "argv", argv: ["definitely-missing-spec-guard-test-executable"], working_directory: ".", timeout_ms: 1000, env_mode: "inherit", env_overrides_ref: null }, purpose: "test" }, { projectRoot });
    expect(result.ok).toBe(true);
    expect(result.data.command_result.status).toBe("failed");
    expect(result.data.command_result.exit_code).toBeNull();
    expect(result.data.command_result.error_message).toBeTruthy();
  });

  it("records timeouts deterministically", async () => {
    const result = await commandRun({ command_spec: nodeCommand("setTimeout(() => {}, 1000)", 50), purpose: "test" }, { projectRoot });
    expect(result.ok).toBe(true);
    expect(result.data.command_result.status).toBe("timed_out");
    expect(result.data.command_result.exit_code).toBeNull();
  });

  it("appends baseline-linked results only for matching draft revision", async () => {
    const init = await baselineInit({}, { projectRoot });
    const linked = await commandRun({ command_spec: nodeCommand("process.exit(0)"), purpose: "test", related_runtime_baseline_draft_revision: init.data.revision }, { projectRoot });
    expect(linked.ok).toBe(true);
    expect(linked.data.baseline!.validation.command_results).toHaveLength(1);

    const stale = await commandRun({ command_spec: nodeCommand("process.exit(0)"), purpose: "test", related_runtime_baseline_draft_revision: init.data.revision }, { projectRoot });
    expect(stale.ok).toBe(false);
    expect(stale.diagnostics[0]?.message).toContain("stale runtime baseline draft revision");
  });

  it("records placeholder commands for purpose other without satisfying governed baseline slots", async () => {
    const placeholder = { mode: "shell" as const, shell_command: "echo ok", working_directory: ".", timeout_ms: 5000, env_mode: "inherit" as const, env_overrides_ref: null };
    const init = await baselineInit({ commands: { test: placeholder, test_not_applicable_reason: null, build: null, build_not_applicable_reason: "no build", runtime_production: null, runtime_production_not_applicable_reason: "no production runtime", runtime_development: null, runtime_development_not_applicable_reason: "no development runtime" } }, { projectRoot });
    const recorded = await commandRun({ command_spec: placeholder, purpose: "other", related_runtime_baseline_draft_revision: init.data.revision }, { projectRoot });
    expect(recorded.ok).toBe(true);
    expect(recorded.data.command_result.purpose).toBe("other");

    const check = await baselineCheck({}, { projectRoot });
    expect(check.data.acceptance_ready).toBe(false);
    expect(check.diagnostics.map((d) => d.code)).toContain("BASELINE_COMMAND_PLACEHOLDER");
  });

  it("rejects caller-supplied trusted command result fields", async () => {
    const result = await commandRun({ command_spec: nodeCommand("process.exit(0)"), purpose: "test", status: "passed" } as never, { projectRoot });
    expect(result.ok).toBe(false);
  });
});
