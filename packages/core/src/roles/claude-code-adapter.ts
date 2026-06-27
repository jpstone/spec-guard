import { spawn } from "node:child_process";
import type { SubagentAdapter, SubagentRunInput, SubagentRunResult } from "./adapter.ts";

/** Real Claude Code headless adapter: spawns `claude -p`. NOT exercised by the deterministic test
 * suite — only via an opt-in env-gated smoke (M8b). Read-only roles run with `--permission-mode plan`;
 * edit roles get scoped write (the real isolation boundary is the M8b worktree, not this flag). The
 * adapter never asserts a distinct provider identity for a same-account subagent. */
export function claudeCodeAdapter(): SubagentAdapter {
  return {
    kind: "claude_code",
    async run(input: SubagentRunInput): Promise<SubagentRunResult> {
      const args = ["-p", input.prompt, "--permission-mode", input.permission_mode === "read_only" ? "plan" : "acceptEdits"];
      if (input.model !== null) args.push("--model", input.model);
      return await new Promise<SubagentRunResult>((resolve) => {
        let out = "";
        const child = spawn("claude", args, { cwd: input.cwd });
        const timer = setTimeout(() => child.kill("SIGTERM"), input.timeout_ms);
        child.stdout?.on("data", (chunk: Buffer) => { out += chunk.toString("utf8"); });
        child.stderr?.on("data", (chunk: Buffer) => { out += chunk.toString("utf8"); });
        child.on("error", (error) => {
          clearTimeout(timer);
          resolve({ ok: false, final_message: out, observed_identity: { principal_id: null, agent_instance_id: null }, identity_attestation: "unknown", diagnostics: [{ code: "SUBAGENT_SPAWN_FAILED", severity: "error", message: error.message, field_path: null, gate: null, fix: "Ensure the `claude` CLI is installed and on PATH." }] });
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve({ ok: code === 0, final_message: out, observed_identity: { principal_id: null, agent_instance_id: null }, identity_attestation: "logical_role_trust_boundary", diagnostics: code === 0 ? [] : [{ code: "SUBAGENT_NONZERO_EXIT", severity: "error", message: `claude -p exited with code ${code}`, field_path: null, gate: null, fix: null }] });
        });
      });
    }
  };
}
