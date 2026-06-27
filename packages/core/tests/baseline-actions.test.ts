import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { baselineBlock, baselineCheck, baselineInit, baselineUpdate, initAction, type CommandResult } from "../src/index.ts";

const fabricatedResult = (): CommandResult => ({
  id: "fabricated",
  storage_ref: "command-result:fabricated",
  command: "node -e",
  command_spec: { mode: "argv", argv: [process.execPath, "-e", "process.exit(0)"], working_directory: ".", timeout_ms: 1000, env_mode: "inherit", env_overrides_ref: null },
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
  source_interface: "core"
});

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), "spec-guard-baseline-actions-"));
  await initAction({ project_id: "demo" }, { projectRoot });
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe("baseline lifecycle actions", () => {
  it("baseline.init creates singleton draft revision 1 and is idempotent", async () => {
    const first = await baselineInit({}, { projectRoot });
    expect(first.ok).toBe(true);
    expect(first.data.baseline.status).toBe("draft");
    expect(first.data.baseline.revision).toBe(1);

    const second = await baselineInit({}, { projectRoot });
    expect(second.ok).toBe(true);
    expect(second.data.baseline.revision).toBe(1);
    expect(second.mutations[0]?.operation).toBe("none");
  });

  it("baseline.update patches valid fields and rejects invalid/type-invalid patches", async () => {
    await baselineInit({}, { projectRoot });
    const updated = await baselineUpdate({ patch: [{ op: "replace", path: "/stack/runtime", value: "node" }] }, { projectRoot });
    expect(updated.ok).toBe(true);
    expect(updated.data.baseline.stack.runtime).toBe("node");
    expect(updated.data.revision).toBe(2);

    const invalidPath = await baselineUpdate({ patch: [{ op: "replace", path: "/stack/nope", value: "x" }] }, { projectRoot });
    expect(invalidPath.ok).toBe(false);

    const invalidType = await baselineUpdate({ patch: [{ op: "replace", path: "/configuration/greenfield_scaffold", value: "yes" }] }, { projectRoot });
    expect(invalidType.ok).toBe(false);
  });

  it("baseline.init rejects caller-supplied validation command results", async () => {
    const result = await baselineInit({ validation: { command_results: [fabricatedResult()], diagnostics: [] } } as never, { projectRoot });
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.message).toContain("validation");
  });

  it("baseline.update rejects all generic validation patches", async () => {
    await baselineInit({}, { projectRoot });
    const replaceValidation = await baselineUpdate({ patch: [{ op: "replace", path: "/validation", value: { command_results: [fabricatedResult()], diagnostics: [] } }] }, { projectRoot });
    expect(replaceValidation.ok).toBe(false);
    expect(replaceValidation.diagnostics[0]?.message).toContain("command.run");

    const addValidation = await baselineUpdate({ patch: [{ op: "add", path: "/validation", value: { command_results: [], diagnostics: [] } }] }, { projectRoot });
    expect(addValidation.ok).toBe(false);

    const removeValidation = await baselineUpdate({ patch: [{ op: "remove", path: "/validation" }] }, { projectRoot });
    expect(removeValidation.ok).toBe(false);

    const addCommandResult = await baselineUpdate({ patch: [{ op: "add", path: "/validation/command_results/0", value: {} }] }, { projectRoot });
    expect(addCommandResult.ok).toBe(false);
    expect(addCommandResult.diagnostics[0]?.message).toContain("command.run");
  });

  it("baseline.update rejects lifecycle/control patches without mutating the baseline", async () => {
    await baselineInit({}, { projectRoot });
    const before = await baselineCheck({}, { projectRoot });
    const beforeBaseline = before.data.baseline;
    const rejectedPatches = [
      { op: "replace" as const, path: "/status", value: "accepted" },
      { op: "replace" as const, path: "/status", value: "blocked" },
      { op: "replace" as const, path: "/acceptance", value: {} },
      { op: "add" as const, path: "/decision_history/0", value: {} },
      { op: "replace" as const, path: "/blocker", value: { reason: "blocked", owner: null, next_action: null, at: "2026-06-21T00:00:00.000Z" } },
      { op: "replace" as const, path: "/validation", value: { command_results: [fabricatedResult()], diagnostics: [] } },
      { op: "add" as const, path: "/validation/command_results/0", value: fabricatedResult() }
    ];

    for (const patch of rejectedPatches) {
      const result = await baselineUpdate({ patch: [patch] }, { projectRoot });
      expect(result.ok).toBe(false);
      const after = await baselineCheck({}, { projectRoot });
      expect(after.data.baseline).toEqual(beforeBaseline);
    }
  });

  it("baseline.block sets blocked status and blocker without decisions", async () => {
    await baselineInit({}, { projectRoot });
    const result = await baselineBlock({ reason: "missing env", owner: "team", next_action: "document setup" }, { projectRoot });
    expect(result.ok).toBe(true);
    expect(result.data.baseline.status).toBe("blocked");
    expect(result.data.baseline.blocker?.reason).toBe("missing env");
    expect(result.data.baseline.decision_history).toEqual([]);
  });
});
