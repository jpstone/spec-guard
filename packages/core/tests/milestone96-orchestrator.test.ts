import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildDefaultRoleConfig,
  fixtureAdapter,
  runImplementerStep,
  runReviewStep,
  canTransition,
  nextStep,
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

const reviewedRefs: ReviewCycle["reviewed_refs"] = {
  work_packet_revision: 1, packet_approval_hash: "pah", implementation_plan_hash: "iph", evidence_policy_resolution_hash: "eph",
  attempt_hash: "ath", reviewed_diff_hash: "diff", post_attempt_tree_hash: "post", focused_fix_instruction_id: null,
  focused_fix_instruction_hash: null, changed_files_hash: "cfh", evidence_refs: [], waiver_refs: []
};
const cleanGate: ReviewGateInput = { packet_approval_current: true, plan_hash_matches: true, runtime_baseline_ready: true, evidence_ready: true, command_statuses: ["passed"], attempt_boundary_blocked: false };

function implInput(repo: string, writes: Record<string, string>) {
  return {
    repoRoot: repo, roleConfig, allowedGlobs: ["src/**"], expectedFiles: [], inputRefs: [], model: null,
    adapter: fixtureAdapter({ final_message: "{\"summary\":\"did it\"}", writes }), producer: implementer,
    requestedIdentity: { principal_id: null, agent_instance_id: "sg-role-implementer" },
    authorizationId: "auth:1", packetApprovalHash: "pah", planHash: "iph", attemptId: "attempt:1", at: "2026-01-01T00:00:00.000Z"
  };
}

function reviewInput(adapterMessage: string, gate: ReviewGateInput) {
  return {
    roleConfig, adapter: fixtureAdapter({ final_message: adapterMessage }), model: null, cwd: ".",
    reviewer, requestedIdentity: { principal_id: null, agent_instance_id: "sg-role-reviewer" },
    reviewId: "review:1", attemptId: "attempt:1", inputRefs: ["ref:1"], reviewedRefs, gateInput: gate, at: "2026-01-01T00:10:00.000Z"
  };
}

let repo: string;
beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "sg-m96-"));
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

describe("M9.6 implementer step", () => {
  it("accepts an in-boundary worktree edit, seals the attempt, advances state", async () => {
    const result = await runImplementerStep(implInput(repo, { "src/feature.ts": "export const x = 1;\n" }));
    expect(result.accepted).toBe(true);
    expect(result.next_state).toBe("implementation_attempt_complete");
    expect(result.attempt.state).toBe("sealed");
    expect(result.attempt.changed_files).toContain("src/feature.ts");
    expect(existsSync(path.join(repo, "src", "feature.ts"))).toBe(true);
  });

  it("rejects an out-of-boundary edit (state stays authorized) but still seals the attempt for audit", async () => {
    const result = await runImplementerStep(implInput(repo, { "evil/x.ts": "bad\n" }));
    expect(result.accepted).toBe(false);
    expect(result.next_state).toBe("implementation_authorized");
    expect(result.attempt.state).toBe("sealed");
    expect(existsSync(path.join(repo, "evil", "x.ts"))).toBe(false);
  });
});

describe("M9.6 review step", () => {
  it("a clean review with passing gates resolves to pass -> review_passed", async () => {
    const result = await runReviewStep(reviewInput("{\"summary\":\"looks good\"}", cleanGate));
    expect(result.verdict).toBe("pass");
    expect(result.next_state).toBe("review_passed");
    expect(result.review_cycle.state).toBe("sealed");
  });

  it("reviewer blockers force blocked -> review_blocked", async () => {
    const message = "{\"summary\":\"issues\",\"blockers\":[{\"title\":\"null deref\",\"paths\":[\"src/x.ts\"],\"rationale\":\"x may be null\",\"suggested_focus\":\"guard\"}]}";
    const result = await runReviewStep(reviewInput(message, cleanGate));
    expect(result.verdict).toBe("blocked");
    expect(result.next_state).toBe("review_blocked");
    expect(result.review_cycle.blockers).toHaveLength(1);
    expect(result.review_cycle.blockers[0]?.blocker_text_hash.length).toBeGreaterThan(0);
  });

  it("a failed deterministic gate forces blocked even with no reviewer blockers", async () => {
    const result = await runReviewStep(reviewInput("{\"summary\":\"ok\"}", { ...cleanGate, evidence_ready: false }));
    expect(result.verdict).toBe("blocked");
    expect(result.next_state).toBe("review_blocked");
  });
});

describe("M9.6 composed loop", () => {
  it("implementer -> (engine validation hops) -> review pass -> review_complete -> complete is a valid walk", async () => {
    const impl = await runImplementerStep(implInput(repo, { "src/feature.ts": "export const x = 1;\n" }));
    expect(impl.next_state).toBe("implementation_attempt_complete");
    // engine-only deterministic hops through validation (validator step is a thin wrapper, M9.7)
    const hops: Array<[string, string]> = [
      ["implementation_attempt_complete", "validation_pending"],
      ["validation_pending", "validation_recorded"],
      ["validation_recorded", "validation_satisfied"],
      ["validation_satisfied", "review_pending"]
    ];
    for (const [from, to] of hops) expect(canTransition(from as never, to as never)).toBe(true);

    const review = await runReviewStep(reviewInput("{\"summary\":\"ok\"}", cleanGate));
    expect(review.next_state).toBe("review_passed");
    expect(canTransition("review_passed", "review_complete")).toBe(true);
    expect(canTransition("review_complete", "complete")).toBe(true);
    expect(nextStep("complete").actor).toBeNull();
  });
});
