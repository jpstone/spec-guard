import type { Diagnostic } from "../schemas/embedded.ts";
import type { ProducerIdentity } from "../role-loop/human-decision.ts";
import type { IdentityAttestation } from "../harness/role-execution.ts";

/** M8: the subagent execution boundary. A `SubagentAdapter` runs one role task and returns its final
 * message + the identity it can actually attest. Concrete adapters spawn `claude -p` / pi; the fixture
 * adapter returns canned output so dispatch is testable offline. This is a NEW subsystem — it does not
 * extend the legacy `verifier/adapters.ts` (which M9.5 removes). */

export interface SubagentRunInput {
  prompt: string;
  permission_mode: "read_only" | "scoped_write";
  model: string | null;
  cwd: string;
  timeout_ms: number;
}

export interface SubagentRunResult {
  ok: boolean;
  final_message: string;
  /** Identity the adapter can attest. Model self-claims are never placed here. */
  observed_identity: ProducerIdentity;
  identity_attestation: IdentityAttestation;
  diagnostics: Diagnostic[];
}

export interface SubagentAdapter {
  /** Provider label: "claude_code" | "pi" | "fixture". */
  kind: string;
  run(input: SubagentRunInput): Promise<SubagentRunResult>;
}
