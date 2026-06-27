import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildDefaultRoleConfig,
  fixtureAdapter,
  runImplementerStep,
  runValidatorStep,
  runReviewStep,
  runFixerStep,
  buildFocusedFixInstruction,
  canTransition,
  type CommandSpec,
  type LineageProducer,
  type ReviewCycle,
  type ReviewGateInput
} from "../src/index.ts";

const execFileAsync = promisify(execFile);
async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

const roleConfig = buildDefaultRoleConfig();
const implementer: LineageProducer = { role: "implementer", principal_id: null, agent_instance_id: "sg-role-implementer", provider: "claude_code", model: null, run_id: "r1" };
const reviewer: LineageProducer = { role: "reviewer", principal_id: null, agent_instance_id: "sg-role-reviewer", provider: "claude_code", model: null, run_id: "r2" };
const fixer: LineageProducer = { role: "fixer", principal_id: null, agent_instance_id: "sg-role-fixer", provider: "claude_code", model: null, run_id: "r3" };
const coordinator: LineageProducer = { role: "coordinator", principal_id: null, agent_instance_id: "sg-role-coordinator", provider: "claude_code", model: null, run_id: "r4" };

const reviewedRefs: ReviewCycle["reviewed_refs"] = {
  work_packet_revision: 1, packet_approval_hash: "pah", implementation_plan_hash: "iph", evidence_policy_resolution_hash: "eph",
  attempt_hash: "ath", reviewed_diff_hash: "diff", post_attempt_tree_hash: "post", focused_fix_instruction_id: null,
  focused_fix_instruction_hash: null, changed_files_hash: "cfh", evidence_refs: [], waiver_refs: []
};
const cleanGate: ReviewGateInput = { packet_approval_current: true, plan_hash_matches: true, runtime_baseline_ready: true, evidence_ready: true, command_statuses: ["passed"], attempt_boundary_blocked: false };
const passCmd: CommandSpec = { mode: "argv", argv: ["node", "-e", "process.exit(0)"], working_directory: ".", timeout_ms: 30000, env_mode: "inherit", env_overrides_ref: null };
const failCmd: CommandSpec = { mode: "argv", argv: ["node", "-e", "process.exit(1)"], working_directory: ".", timeout_ms: 30000, env_mode: "inherit", env_overrides_ref: null };

let repo: string;
beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "sg-m97-"));
  await git(["init"], repo);
  await git(["config", "user.email", "t@example.com"], repo);
  await git(["config", "user.name", "t"], repo);
  await writeFile(path.join(repo, "README.md"), "base\n", "utf8");
  await git(["add", "."], repo);
  await git(["commit", "-m", "base"], repo);
});
afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("M9.7 validator step", () => {
  it("a passing command satisfies validation; a failing command fails it", async () => {
    const ok = await runValidatorStep({ projectRoot: repo, artifactRoot: path.join(repo, ".spec-guard"), commandSpec: passCmd, factsPurpose: "validation_expected_pass", boundAcIds: ["ac1"] });
    expect(ok.satisfied).toBe(true);
    expect(ok.next_state).toBe("validation_satisfied");
    expect(ok.facts?.status).toBe("passed");

    const bad = await runValidatorStep({ projectRoot: repo, artifactRoot: path.join(repo, ".spec-guard"), commandSpec: failCmd, factsPurpose: "validation_expected_pass", boundAcIds: ["ac1"] });
    expect(bad.satisfied).toBe(false);
    expect(bad.next_state).toBe("validation_failed");
  });
});

describe("M9.7 full role-loop walk via step functions", () => {
  it("implementer -> validator -> review(blocked) -> fixer -> validator -> rereview(pass) -> complete", async () => {
    const artifactRoot = path.join(repo, ".spec-guard");
    const baseImpl = { repoRoot: repo, roleConfig, model: null, producer: implementer, requestedIdentity: { principal_id: null, agent_instance_id: "sg-role-implementer" }, authorizationId: "auth:1", packetApprovalHash: "pah", planHash: "iph", at: "2026-01-01T00:00:00.000Z" };

    // 1. implementer (in-boundary) -> implementation_attempt_complete
    const impl = await runImplementerStep({ ...baseImpl, allowedGlobs: ["src/**"], expectedFiles: [], inputRefs: [], attemptId: "attempt:1", adapter: fixtureAdapter({ final_message: "{\"summary\":\"impl\"}", writes: { "src/feature.ts": "export const x = 1;\n" } }) });
    expect(impl.next_state).toBe("implementation_attempt_complete");

    // 2. validator -> validation_satisfied ; engine hop -> review_pending
    const v1 = await runValidatorStep({ projectRoot: repo, artifactRoot, commandSpec: passCmd, factsPurpose: "validation_expected_pass", boundAcIds: ["ac1"] });
    expect(v1.next_state).toBe("validation_satisfied");
    expect(canTransition("validation_satisfied", "review_pending")).toBe(true);

    // 3. review with a blocker -> review_blocked
    const blockedMsg = "{\"summary\":\"issue\",\"blockers\":[{\"title\":\"missing test\",\"paths\":[\"src/feature.ts\"],\"rationale\":\"no test\",\"suggested_focus\":\"add test\"}]}";
    const review = await runReviewStep({ roleConfig, adapter: fixtureAdapter({ final_message: blockedMsg }), model: null, cwd: repo, reviewer, requestedIdentity: { principal_id: null, agent_instance_id: "sg-role-reviewer" }, reviewId: "review:1", attemptId: "attempt:1", inputRefs: ["ref:1"], reviewedRefs, gateInput: cleanGate, at: "2026-01-01T00:10:00.000Z" });
    expect(review.next_state).toBe("review_blocked");
    expect(review.review_cycle.blockers).toHaveLength(1);

    // 4. coordinator builds the focused fix instruction; engine hop review_blocked -> fix_authorized
    const fix = buildFocusedFixInstruction({ id: "fix:1", producer: coordinator, source_review: review.review_cycle, allowed_files: ["src/feature.ts"], allowed_globs: ["src/**"] });
    expect(fix.instruction?.state).toBe("sealed");
    expect(canTransition("review_blocked", "fix_authorized")).toBe(true);

    // 5. fixer (in-boundary) -> fix_attempt_complete
    const fixerStep = await runFixerStep({ repoRoot: repo, roleConfig, fixInstruction: fix.instruction!, inputRefs: [], model: null, adapter: fixtureAdapter({ final_message: "{\"summary\":\"fixed\"}", writes: { "src/feature.ts": "export const x = 2;\n" } }), producer: fixer, requestedIdentity: { principal_id: null, agent_instance_id: "sg-role-fixer" }, authorizationId: "fixauth:1", packetApprovalHash: "pah", planHash: "iph", attemptId: "attempt:2", at: "2026-01-01T00:20:00.000Z" });
    expect(fixerStep.next_state).toBe("fix_attempt_complete");
    expect(fixerStep.attempt.kind).toBe("blocker_fix");
    expect(fixerStep.attempt.source_instruction_id).toBe("fix:1");

    // 6. validator -> validation_satisfied ; engine hop -> rereview_pending
    const v2 = await runValidatorStep({ projectRoot: repo, artifactRoot, commandSpec: passCmd, factsPurpose: "validation_expected_pass", boundAcIds: ["ac1"] });
    expect(v2.next_state).toBe("validation_satisfied");
    expect(canTransition("validation_satisfied", "rereview_pending")).toBe(true);

    // 7. re-review (clean) -> review_passed -> review_complete -> complete
    const rereview = await runReviewStep({ roleConfig, adapter: fixtureAdapter({ final_message: "{\"summary\":\"resolved\"}" }), model: null, cwd: repo, reviewer, requestedIdentity: { principal_id: null, agent_instance_id: "sg-role-reviewer" }, reviewId: "review:2", attemptId: "attempt:2", inputRefs: ["ref:1"], reviewedRefs, gateInput: cleanGate, at: "2026-01-01T00:30:00.000Z", rereview: true });
    expect(rereview.next_state).toBe("review_passed");
    expect(canTransition("review_passed", "review_complete")).toBe(true);
    expect(canTransition("review_complete", "complete")).toBe(true);
  });
});
