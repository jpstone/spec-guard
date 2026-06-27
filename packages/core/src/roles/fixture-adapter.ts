import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProducerIdentity } from "../role-loop/human-decision.ts";
import type { SubagentAdapter, SubagentRunInput, SubagentRunResult } from "./adapter.ts";

/** Deterministic adapter for the test suite: returns a canned final message and records the calls it
 * received, so `dispatchBackendTask` can be exercised with no real model calls. Never spawns. */
export interface FixtureResponse {
  final_message: string;
  ok?: boolean;
  /** A planted "observed" identity — used to PROVE dispatch ignores adapter/model-claimed identity
   * under a logical trust boundary. */
  observed_identity?: ProducerIdentity;
  /** Files to write (path → content) into the run's cwd, simulating an edit-role subagent's edits.
   * Used by the worktree-isolation tests. */
  writes?: Record<string, string>;
}

export interface FixtureAdapter extends SubagentAdapter {
  calls: SubagentRunInput[];
}

export function fixtureAdapter(response: FixtureResponse): FixtureAdapter {
  const calls: SubagentRunInput[] = [];
  return {
    kind: "fixture",
    calls,
    async run(input: SubagentRunInput): Promise<SubagentRunResult> {
      calls.push(input);
      if (response.writes !== undefined) {
        for (const [rel, content] of Object.entries(response.writes)) {
          const abs = path.join(input.cwd, rel);
          await mkdir(path.dirname(abs), { recursive: true });
          await writeFile(abs, content, "utf8");
        }
      }
      return {
        ok: response.ok ?? true,
        final_message: response.final_message,
        observed_identity: response.observed_identity ?? { principal_id: null, agent_instance_id: null },
        identity_attestation: "logical_role_trust_boundary",
        diagnostics: []
      };
    }
  };
}
