import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildDefaultRoleConfig,
  deriveRoleExecutionContext,
  BackendTaskEnvelopeSchema,
  fixtureAdapter,
  claudeCodeAdapter,
  runEditRoleInWorktree,
  type BackendTaskEnvelope
} from "../src/index.ts";

const execFileAsync = promisify(execFile);
async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

const roleConfig = buildDefaultRoleConfig();
const drift = { expectedFiles: [], allowedGlobs: ["src/**"] };

function implementerEnvelope(): BackendTaskEnvelope {
  const ctx = deriveRoleExecutionContext("implementer", roleConfig.roles.implementer, ["src/**"]);
  return BackendTaskEnvelopeSchema.parse({
    task_id: "t1", role: "implementer", template_id: "implementation_execute_v1", template_version: 1,
    input_refs: [], allowed_capabilities: ctx, expected_output_schema: "implementation_attempt_v1",
    requested_role_identity: { principal_id: null, agent_instance_id: "sg-role-implementer" },
    observed_producer_identity: null, identity_attestation: "logical_role_trust_boundary",
    timeout_ms: 60000, retry_policy: "none"
  });
}

let repo: string;
beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "sg-m8b-"));
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

describe("M8b worktree isolation", () => {
  it("accepts an in-boundary edit made in the worktree into the main tree", async () => {
    const adapter = fixtureAdapter({ final_message: "{\"summary\":\"added feature\"}", writes: { "src/feature.ts": "export const x = 1;\n" } });
    const result = await runEditRoleInWorktree({ repoRoot: repo, adapter, envelope: implementerEnvelope(), model: null, drift });
    expect(result.boundary.blocked).toBe(false);
    expect(result.accepted).toBe(true);
    expect(result.changed_files).toContain("src/feature.ts");
    expect(existsSync(path.join(repo, "src", "feature.ts"))).toBe(true);
  });

  it("rejects an out-of-boundary edit — the real tree is never touched", async () => {
    const adapter = fixtureAdapter({ final_message: "{\"summary\":\"sneaky\"}", writes: { "evil/x.ts": "bad\n" } });
    const result = await runEditRoleInWorktree({ repoRoot: repo, adapter, envelope: implementerEnvelope(), model: null, drift });
    expect(result.boundary.blocked).toBe(true);
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "ATTEMPT_FILE_FORBIDDEN")).toBe(true);
    expect(existsSync(path.join(repo, "evil", "x.ts"))).toBe(false);
  });

  it("cleans up the worktree after running", async () => {
    const adapter = fixtureAdapter({ final_message: "{\"summary\":\"x\"}", writes: { "src/a.ts": "a\n" } });
    await runEditRoleInWorktree({ repoRoot: repo, adapter, envelope: implementerEnvelope(), model: null, drift });
    const { stdout } = await execFileAsync("git", ["worktree", "list"], { cwd: repo });
    expect(stdout.trim().split("\n").filter((line) => line.length > 0).length).toBe(1);
  });

  it.skipIf(!process.env.SPEC_GUARD_SMOKE)("opt-in smoke: real claude_code adapter runs end-to-end", async () => {
    const result = await runEditRoleInWorktree({ repoRoot: repo, adapter: claudeCodeAdapter(), envelope: implementerEnvelope(), model: null, drift });
    expect(result).toBeDefined();
  }, 180000);
});
