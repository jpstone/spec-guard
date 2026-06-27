import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { baselineAccept, baselineCheck, baselineInit, baselineReview, baselineUpdate, commandRun, initAction, type CommandResult } from "../src/index.ts";

let projectRoot: string;

const commandSpec = { mode: "argv" as const, argv: [process.execPath, "-e", "process.exit(0)"], working_directory: ".", timeout_ms: 5000, env_mode: "inherit" as const, env_overrides_ref: null };

const allNotApplicable = {
  commands: {
    test: null,
    test_not_applicable_reason: "no test command for docs-only seed",
    build: null,
    build_not_applicable_reason: "no build step",
    runtime_production: null,
    runtime_production_not_applicable_reason: "library has no production runtime",
    runtime_development: null,
    runtime_development_not_applicable_reason: "library has no development runtime"
  }
};

const testCommandWithOtherSlotsNotApplicable = {
  commands: {
    ...allNotApplicable.commands,
    test: commandSpec,
    test_not_applicable_reason: null
  }
};

const fabricatedResult = (): CommandResult => ({
  id: "fabricated",
  storage_ref: "command-result:fabricated",
  command: "node -e",
  command_spec: commandSpec,
  purpose: "test",
  working_directory: ".",
  timeout_ms: 5000,
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

async function initReady() {
  await baselineInit(allNotApplicable, { projectRoot });
  return baselineReview({}, { projectRoot });
}

function acceptInput(review: Awaited<ReturnType<typeof baselineReview>>, selected_number: 1 | 2 | 3) {
  return {
    selected_number,
    raw_response: String(selected_number),
    decision_prompt: "Accept runtime baseline? 1 Yes 2 No 3 Discuss",
    human_confirmed: true,
    review_snapshot_hash: review.data.snapshot_hash as string,
    review_snapshot_revision: review.data.snapshot_revision as string,
    source_artifact_refs: review.data.source_artifact_refs as unknown[]
  };
}

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), "spec-guard-baseline-accept-"));
  await initAction({ project_id: "demo" }, { projectRoot });
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe("baseline review and acceptance", () => {
  it("baseline.review is non-mutating and deterministic", async () => {
    await baselineInit(allNotApplicable, { projectRoot });
    const first = await baselineReview({}, { projectRoot });
    const second = await baselineReview({}, { projectRoot });
    expect(first.ok).toBe(true);
    expect(first.data.snapshot_hash).toBe(second.data.snapshot_hash);
    expect(first.data.snapshot_revision).toBe(second.data.snapshot_revision);

    const check = await baselineCheck({}, { projectRoot });
    expect((check.data.baseline as { revision: number }).revision).toBe(1);
  });

  it("Discuss mutates nothing and creates no HumanDecision", async () => {
    const review = await initReady();
    const result = await baselineAccept(acceptInput(review, 3), { projectRoot });
    expect(result.ok).toBe(true);
    expect(result.data.decision).toBeNull();
    const check = await baselineCheck({}, { projectRoot });
    expect((check.data.baseline as { status: string; revision: number; decision_history: unknown[] }).status).toBe("draft");
    expect((check.data.baseline as { status: string; revision: number; decision_history: unknown[] }).decision_history).toHaveLength(0);
  });

  it("No records a decline decision and blocks without a RuntimeBaselineRef", async () => {
    const review = await initReady();
    const result = await baselineAccept(acceptInput(review, 2), { projectRoot });
    expect(result.ok).toBe(true);
    expect(result.data.runtime_baseline_ref).toBeNull();
    expect(result.data.decision!.approved_fields).toEqual([]);
    expect(result.data.baseline!.status).toBe("blocked");
    expect(result.data.baseline!.blocker!.reason).toBe("human_declined_baseline_acceptance");
  });

  it("Yes rejects stale snapshots and failed validation without recording approval", async () => {
    const review = await initReady();
    await baselineUpdate({ patch: [{ op: "replace", path: "/stack/runtime", value: "node" }] }, { projectRoot });
    const stale = await baselineAccept(acceptInput(review, 1), { projectRoot });
    expect(stale.ok).toBe(false);

    await baselineUpdate({ patch: [{ op: "replace", path: "/commands/test_not_applicable_reason", value: null }] }, { projectRoot });
    const freshInvalid = await baselineReview({}, { projectRoot });
    const failedValidation = await baselineAccept(acceptInput(freshInvalid, 1), { projectRoot });
    expect(failedValidation.ok).toBe(false);
    const check = await baselineCheck({}, { projectRoot });
    expect((check.data.baseline as { status: string; decision_history: unknown[] }).decision_history).toHaveLength(0);
  });

  it("baseline.init cannot seed fabricated command validation for check or acceptance", async () => {
    const seeded = await baselineInit({ ...testCommandWithOtherSlotsNotApplicable, validation: { command_results: [fabricatedResult()], diagnostics: [] } } as never, { projectRoot });
    expect(seeded.ok).toBe(false);

    await baselineInit(testCommandWithOtherSlotsNotApplicable, { projectRoot });
    const check = await baselineCheck({}, { projectRoot });
    expect(check.data.acceptance_ready).toBe(false);
    expect(check.diagnostics.map((d) => d.code)).toContain("BASELINE_COMMAND_RESULT_MISSING");

    const review = await baselineReview({}, { projectRoot });
    const accepted = await baselineAccept(acceptInput(review, 1), { projectRoot });
    expect(accepted.ok).toBe(false);
    expect(accepted.data.runtime_baseline_ref).toBeNull();
  });

  it("standalone durable CommandResults cannot be inserted through baseline.update for validation or acceptance", async () => {
    await baselineInit(testCommandWithOtherSlotsNotApplicable, { projectRoot });
    const standalone = await commandRun({ command_spec: commandSpec, purpose: "test" }, { projectRoot });
    expect(standalone.ok).toBe(true);
    expect(standalone.data.command_result.related_runtime_baseline_draft_revision).toBeNull();

    const injected = await baselineUpdate({ patch: [{ op: "replace", path: "/validation", value: { command_results: [standalone.data.command_result], diagnostics: [] } }] }, { projectRoot });
    expect(injected.ok).toBe(false);
    expect(injected.diagnostics[0]?.message).toContain("command.run");

    const check = await baselineCheck({}, { projectRoot });
    expect(check.data.acceptance_ready).toBe(false);
    expect(check.diagnostics.map((d) => d.code)).toContain("BASELINE_COMMAND_RESULT_MISSING");

    const review = await baselineReview({}, { projectRoot });
    const accepted = await baselineAccept(acceptInput(review, 1), { projectRoot });
    expect(accepted.ok).toBe(false);
    expect(accepted.data.runtime_baseline_ref).toBeNull();
  });

  it("command.run-created baseline-linked CommandResults satisfy validation and acceptance", async () => {
    const init = await baselineInit(testCommandWithOtherSlotsNotApplicable, { projectRoot });
    const run = await commandRun({ command_spec: commandSpec, purpose: "test", related_runtime_baseline_draft_revision: init.data.revision }, { projectRoot });
    expect(run.ok).toBe(true);

    const check = await baselineCheck({}, { projectRoot });
    expect(check.data.acceptance_ready).toBe(true);

    const review = await baselineReview({}, { projectRoot });
    const accepted = await baselineAccept(acceptInput(review, 1), { projectRoot });
    expect(accepted.ok).toBe(true);
    expect(accepted.data.baseline!.status).toBe("accepted");
  });

  it("Yes with valid snapshot accepts and changing approved fields invalidates acceptance", async () => {
    const review = await initReady();
    const accepted = await baselineAccept(acceptInput(review, 1), { projectRoot });
    expect(accepted.ok).toBe(true);
    expect(accepted.data.runtime_baseline_ref!.revision).toBe(2);
    expect(accepted.data.baseline!.status).toBe("accepted");
    expect(accepted.data.decision!.decision_type).toBe("runtime_baseline_acceptance");

    const invalidated = await baselineUpdate({ patch: [{ op: "replace", path: "/stack/runtime", value: "node" }] }, { projectRoot });
    expect(invalidated.ok).toBe(true);
    expect(invalidated.data.baseline.status).toBe("draft");
    expect(invalidated.data.baseline.acceptance).toBeNull();
    expect(invalidated.diagnostics.map((d) => d.code)).toContain("BASELINE_ACCEPTANCE_INVALIDATED");
  });
});
