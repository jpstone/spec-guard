import { spawn } from "node:child_process";
import type { SubagentAdapter, SubagentRunInput, SubagentRunResult } from "./adapter.ts";

/** Real Pi/Codex headless adapter (best-effort wrapper around the `pi` CLI). NOT exercised by the
 * deterministic suite — only via the opt-in env-gated smoke (M8b). Like the claude_code adapter, it
 * never asserts a distinct provider identity for a same-account subagent; the real isolation boundary
 * is the worktree, not the permission flag. The exact `pi` invocation is environment-specific and is
 * intended to be adapted to the local Pi headless interface. */
export function piAdapter(): SubagentAdapter {
  return {
    kind: "pi",
    async run(input: SubagentRunInput): Promise<SubagentRunResult> {
      const args = ["--headless", "--prompt", input.prompt];
      if (input.model !== null) args.push("--model", input.model);
      if (input.permission_mode === "read_only") args.push("--read-only");
      return await new Promise<SubagentRunResult>((resolve) => {
        let out = "";
        const child = spawn("pi", args, { cwd: input.cwd });
        const timer = setTimeout(() => child.kill("SIGTERM"), input.timeout_ms);
        child.stdout?.on("data", (chunk: Buffer) => { out += chunk.toString("utf8"); });
        child.stderr?.on("data", (chunk: Buffer) => { out += chunk.toString("utf8"); });
        child.on("error", (error) => {
          clearTimeout(timer);
          resolve({ ok: false, final_message: out, observed_identity: { principal_id: null, agent_instance_id: null }, identity_attestation: "unknown", diagnostics: [{ code: "SUBAGENT_SPAWN_FAILED", severity: "error", message: error.message, field_path: null, gate: null, fix: "Ensure the `pi` CLI is installed and on PATH." }] });
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve({ ok: code === 0, final_message: out, observed_identity: { principal_id: null, agent_instance_id: null }, identity_attestation: "logical_role_trust_boundary", diagnostics: code === 0 ? [] : [{ code: "SUBAGENT_NONZERO_EXIT", severity: "error", message: `pi exited with code ${code}`, field_path: null, gate: null, fix: null }] });
        });
      });
    }
  };
}
