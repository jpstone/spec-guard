import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initAction, aggregateStoreForContext, aggregateApprovalProjection, AggregateWorkPacketSchema, commandRun } from "../src/index.ts";
import { workCreate, workIntent, workSpecAcs, workSpecPlan, workReview, workApprove, workAuthorize, workSpecRecord, unrecordedChangesDiagnostics, acEvidenceDiagnostics } from "../src/actions/work.ts";

const PLAN = { kind: "standard_plan" as const, template_id: "t", template_version: 1, summary: "p", approach: ["go"], expected_files: [{ path: "src/index.ts", purpose: "impl", change_type: "create" as const }, { path: "src/index.test.ts", purpose: "tests", change_type: "create" as const }, { path: "docs/api.md", purpose: "docs", change_type: "create" as const }], tests: [] };
const reviewer = (id: string) => ({ role: "reviewer" as const, principal_id: null, agent_instance_id: id, provider: "claude_code" as const, model: null, run_id: "r" });
const impl = { role: "implementer" as const, principal_id: null, agent_instance_id: "agent-impl", provider: "claude_code" as const, model: "claude-opus-4-8", run_id: "r" };

// A single-Spec WP driven to implementation_authorized (a change-baseline captured then). `scopeGlobs` defaults to
// src/**; pass [] to leave the scope empty so the footprint/backstop must DERIVE it from the plan's expected_files.
async function driveToAuthorized(root: string, scopeGlobs: string[] = ["src/**"]): Promise<void> {
  await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
  await workIntent({ id: "WP1", desired_outcomes: ["o"], in_scope: ["i"], out_of_scope: ["x"], users_actors: ["u"], edge_cases: ["e"], open_questions: ["q"] }, { projectRoot: root });
  await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [{ id: "ac1", text: "do x", source: "human", source_evidence: null }], author_agent_instance_id: "agent-A" }, { projectRoot: root });
  const store = aggregateStoreForContext({ projectRoot: root });
  const agg = await store.read("WP1");
  await store.update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((s) => ({ ...s, scope: { ...s.scope, allowed_globs: scopeGlobs }, acceptance_criteria: s.acceptance_criteria.map((ac) => ({ ...ac, bootstrap: true })) })) }));
  await workSpecPlan({ id: "WP1", spec_id: "WP1", plan: PLAN, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] } }, { projectRoot: root });
  await workReview({ id: "WP1", producer: reviewer("agent-C"), verdict: "pass", blockers: [], summary: "ok" }, { projectRoot: root });
  const hash = aggregateApprovalProjection(await store.read("WP1")).hash;
  await workApprove({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
  await workAuthorize({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Authorize?", human_confirmed: true }, { projectRoot: root });
}
const recordAttempt = (root: string, changed_files: string[]) => workSpecRecord({ id: "WP1", spec_id: "WP1", record_kind: "implementation_attempt", record: { producer: impl, summary: "did it", changed_files }, next_state: "implementation_attempt_complete" }, { projectRoot: root });

describe("evidence footprint (§3a/§3c) — manifest mode", () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), "sg-fp-")); await initAction({ project_id: "demo" }, { projectRoot: root }); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("WARNS (non-blocking) when the agent reports a file it did not actually change", async () => {
    await driveToAuthorized(root);
    const r = await recordAttempt(root, ["src/ghost.ts"]); // never written
    expect(r.ok).toBe(true);
    expect(r.diagnostics.some((d) => d.code === "FOOTPRINT_REPORTED_MISMATCH")).toBe(true);
  });

  it("is CLEAN when the reported files match the real in-scope diff", async () => {
    await driveToAuthorized(root);
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "foo.ts"), "export const x = 1;\n", "utf8");
    const r = await recordAttempt(root, ["src/foo.ts"]);
    expect(r.ok).toBe(true);
    expect(r.diagnostics.some((d) => d.code === "FOOTPRINT_REPORTED_MISMATCH")).toBe(false);
  });

  it("§3c backstop: a recorded change passes; an UNRECORDED in-scope change blocks (COMPLETION_UNRECORDED_CHANGES)", async () => {
    await driveToAuthorized(root);
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "foo.ts"), "export const x = 1;\n", "utf8");
    await recordAttempt(root, ["src/foo.ts"]); // recorded
    const store = aggregateStoreForContext({ projectRoot: root });
    expect(await unrecordedChangesDiagnostics(await store.read("WP1"), { projectRoot: root })).toEqual([]);
    await writeFile(path.join(root, "src", "smuggled.ts"), "export const y = 2;\n", "utf8");
    const diags = await unrecordedChangesDiagnostics(await store.read("WP1"), { projectRoot: root });
    expect(diags.some((d) => d.code === "COMPLETION_UNRECORDED_CHANGES")).toBe(true);
  });

  it("§3b: the reviewer's per-AC evidence_satisfaction is recorded on the review cycle", async () => {
    await driveToAuthorized(root);
    await recordAttempt(root, ["src/foo.ts"]); // a real sealed attempt (by agent-impl) to review
    const store = aggregateStoreForContext({ projectRoot: root });
    const agg = await store.read("WP1");
    await store.update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((s) => ({ ...s, workflow_state: "review_pending" })) }));
    const reviewRes = await workSpecRecord({ id: "WP1", spec_id: "WP1", record_kind: "review_cycle", record: { producer: reviewer("agent-rev"), verdict: "pass", summary: "ok", evidence_satisfaction: [{ ac_id: "ac1", satisfied: true, mode: "test", evidence_refs: ["src/foo.test.ts"], notes: "covered" }] }, next_state: "review_passed" }, { projectRoot: root });
    expect(reviewRes.ok).toBe(true);
    const spec = (await store.read("WP1")).specs[0];
    expect(spec?.review_cycles.at(-1)?.evidence_satisfaction).toEqual([{ ac_id: "ac1", mode: "test", satisfied: true, evidence_refs: ["src/foo.test.ts"], waiver_refs: [], notes: "covered" }]);
  });

  it("§3c B-1: a recorded change reported with a NON-canonical path (./src/x) is not falsely flagged", async () => {
    await driveToAuthorized(root);
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "foo.ts"), "export const x = 1;\n", "utf8");
    await recordAttempt(root, ["./src/foo.ts"]); // reported with a leading ./ — must normalize to match the diff path
    const store = aggregateStoreForContext({ projectRoot: root });
    expect(await unrecordedChangesDiagnostics(await store.read("WP1"), { projectRoot: root })).toEqual([]);
  });

  it("§3a S-1: reporting an OUT-of-scope file alongside the in-scope change does not warn", async () => {
    await driveToAuthorized(root);
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "foo.ts"), "export const x = 1;\n", "utf8");
    await writeFile(path.join(root, "README.md"), "# notes\n", "utf8"); // out of the src/** scope
    const r = await recordAttempt(root, ["src/foo.ts", "README.md"]);
    expect(r.ok).toBe(true);
    expect(r.diagnostics.some((d) => d.code === "FOOTPRINT_REPORTED_MISMATCH")).toBe(false);
  });

  it("§3b gate: a substantive (non-bootstrap) AC blocks completion until the reviewer records satisfied evidence", async () => {
    await driveToAuthorized(root);
    await recordAttempt(root, ["src/foo.ts"]); // a sealed attempt to review
    const store = aggregateStoreForContext({ projectRoot: root });
    const agg = await store.read("WP1");
    // make ac1 substantive (non-bootstrap) + move to review_pending
    await store.update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((s) => ({ ...s, workflow_state: "review_pending", acceptance_criteria: s.acceptance_criteria.map((ac) => ({ ...ac, bootstrap: false })) })) }));
    expect((await acEvidenceDiagnostics(await store.read("WP1"), { projectRoot: root })).some((d) => d.code === "COMPLETION_AC_UNPROVEN")).toBe(true); // unproven
    await workSpecRecord({ id: "WP1", spec_id: "WP1", record_kind: "review_cycle", record: { producer: reviewer("agent-rev"), verdict: "pass", summary: "ok", evidence_satisfaction: [{ ac_id: "ac1", satisfied: true, mode: "test", evidence_refs: ["src/foo.test.ts"], notes: "covered" }] }, next_state: "review_passed" }, { projectRoot: root });
    expect(await acEvidenceDiagnostics(await store.read("WP1"), { projectRoot: root })).toEqual([]); // now proven
  });

  it("scope DERIVATION: with NO explicit scope, the backstop derives it from the plan's expected_files", async () => {
    await driveToAuthorized(root, []); // empty scope -> derive from the plan (expected_files include src/index.ts -> src/**)
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "smuggled.ts"), "export const y = 2;\n", "utf8"); // unrecorded, in the derived scope
    const store = aggregateStoreForContext({ projectRoot: root });
    const diags = await unrecordedChangesDiagnostics(await store.read("WP1"), { projectRoot: root });
    expect(diags.some((d) => d.code === "COMPLETION_UNRECORDED_CHANGES")).toBe(true);
  });

  it("§3b behavioral: a command-result evidence ref that did NOT pass blocks completion (resolved, not just present)", async () => {
    await driveToAuthorized(root);
    await recordAttempt(root, ["src/foo.ts"]);
    const store = aggregateStoreForContext({ projectRoot: root });
    const run = await commandRun({ command_spec: { mode: "argv", argv: [process.execPath, "-e", "process.exit(1)"], working_directory: "." } as never, purpose: "test" }, { projectRoot: root });
    expect(run.data.command_result.status).toBe("failed");
    const ref = `command-result:${run.data.command_result.id}`;
    const agg = await store.read("WP1");
    await store.update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((s) => ({ ...s, workflow_state: "review_pending", acceptance_criteria: s.acceptance_criteria.map((ac) => ({ ...ac, bootstrap: false })) })) }));
    await workSpecRecord({ id: "WP1", spec_id: "WP1", record_kind: "review_cycle", record: { producer: reviewer("agent-rev"), verdict: "pass", summary: "ok", evidence_satisfaction: [{ ac_id: "ac1", satisfied: true, mode: "test", evidence_refs: [ref], notes: "ran the test" }] }, next_state: "review_passed" }, { projectRoot: root });
    const diags = await acEvidenceDiagnostics(await store.read("WP1"), { projectRoot: root });
    const notPassed = diags.find((d) => d.code === "COMPLETION_AC_EVIDENCE_NOT_PASSED");
    expect(notPassed).toBeDefined();
    expect(notPassed?.message).toContain("failed"); // proves it RESOLVED the ref (found 'failed', not 'missing')
  });
});

describe("evidence footprint — VCS mode (diff vs the baseline COMMIT, not live HEAD)", () => {
  let root: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sg-vcs-"));
    git("init", "-q"); git("config", "user.email", "t@t.t"); git("config", "user.name", "t");
    await initAction({ project_id: "demo" }, { projectRoot: root });
    git("add", "-A"); git("commit", "-q", "-m", "init"); // clean tree at authorize; this commit is the baseline
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("the backstop catches a change COMMITTED mid-loop — git status would show clean, but the diff vs the baseline commit sees it", async () => {
    await driveToAuthorized(root); // baseline commit = the init commit
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "foo.ts"), "export const x = 1;\n", "utf8");
    git("add", "-A"); git("commit", "-q", "-m", "smuggled"); // committed mid-loop -> `git status` is now CLEAN
    const store = aggregateStoreForContext({ projectRoot: root });
    const diags = await unrecordedChangesDiagnostics(await store.read("WP1"), { projectRoot: root });
    expect(diags.some((d) => d.code === "COMPLETION_UNRECORDED_CHANGES")).toBe(true); // gitDiffSinceCommit still sees it
  });

  it("is CLEAN in vcs mode once the committed change is recorded by an attempt", async () => {
    await driveToAuthorized(root);
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "foo.ts"), "export const x = 1;\n", "utf8");
    await recordAttempt(root, ["src/foo.ts"]); // recorded BEFORE the commit
    git("add", "-A"); git("commit", "-q", "-m", "feature");
    const store = aggregateStoreForContext({ projectRoot: root });
    expect(await unrecordedChangesDiagnostics(await store.read("WP1"), { projectRoot: root })).toEqual([]);
  });
});

describe("authorize on an UNBORN HEAD (fresh greenfield repo, no commits)", () => {
  let root: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sg-unborn-"));
    git("init", "-q"); git("config", "user.email", "t@t.t"); git("config", "user.name", "t");
    await initAction({ project_id: "demo" }, { projectRoot: root });
    // NO commit — HEAD is unborn, the common greenfield case (you authorize BEFORE writing any product code).
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("captures an empty-tree baseline and authorizes WITHOUT a forced initial commit", async () => {
    await driveToAuthorized(root); // previously failed at workAuthorize: `git rev-parse HEAD` on an unborn HEAD
    const spec = (await aggregateStoreForContext({ projectRoot: root }).read("WP1")).specs[0];
    expect(spec?.workflow_state).toBe("implementation_authorized");
    expect(spec?.change_baseline?.mode).toBe("vcs"); // git repo -> vcs baseline (empty-tree, commit null)
  });
});
