import { RuntimeBaselineSchema, type WorkPacket, type RuntimeBaseline } from "../schemas/artifacts.ts";
import type { Diagnostic } from "../schemas/embedded.ts";
import { diagnostic, storeForContext } from "./config.ts";
import type { ActionExecutionContext } from "./context.ts";
import { bootstrapAcsRequired } from "../work/bootstrap-acs.ts";
import { runCommandDeterministically } from "../commands/runner.ts";
import { readRuntimeBaselineCurrent } from "../baseline/target-store.ts";
import { DEFAULT_TARGET_ID } from "../schemas/enums.ts";
import { activeArchitectureOrdinanceDiagnostics } from "./architecture.ts";

async function acceptedRuntimeBaseline(context: ActionExecutionContext, targetId: string = DEFAULT_TARGET_ID): Promise<RuntimeBaseline | null> {
  try {
    const baseline = RuntimeBaselineSchema.parse((await readRuntimeBaselineCurrent<RuntimeBaseline>(storeForContext(context), targetId)).artifact);
    return baseline.status === "accepted" ? baseline : null;
  } catch { return null; }
}

// Deterministic completion readiness: a greenfield app/API packet (one that required bootstrap ACs) cannot
// complete until its TARGET's accepted (proven) runtime baseline exists — re-attaching the dev-runtime proof at
// completion. Runtime-less work (target_id null) has no baseline requirement. (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §10.)
export async function completionReadinessDiagnostics(work: WorkPacket, context: ActionExecutionContext): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  if (work.target_id !== null && bootstrapAcsRequired(work) && (await acceptedRuntimeBaseline(context, work.target_id)) === null) {
    diagnostics.push(diagnostic("COMPLETION_RUNTIME_BASELINE_REQUIRED", `This greenfield work establishes target '${work.target_id}' runtime baseline; it cannot complete until an accepted (proven) runtime baseline exists for that target. Establish it, prove the dev runtime (baseline.dev_runtime.run), and accept it as part of the bootstrap.`, "error", "/runtime_baseline_ref"));
  }
  return diagnostics;
}

/**
 * End-state validation (the validator restore): RUN the project's declared BUILD command from the accepted runtime
 * baseline against the FINAL working tree, and gate completion on it passing. THIS is where contract conformance
 * bites: the build (tsc / compile) checks every consumer against its producer's frozen contract, so a consumer
 * that doesn't conform fails to compile here. Whole-Work-Packet, run ONCE (not per Spec).
 *
 * We deliberately run ONLY `build`, NOT the project's `test` suite: contract conformance is a COMPILE question, and
 * gating completion on the whole test suite would couple one WP's completion to the entire suite's health
 * (integration tests that are slow / flaky / need services / are unrelated to the WP). Per-Spec test EVIDENCE is a
 * separate, narrower mechanism (deferred) — not a global suite run at the gate. A null/undeclared build is skipped.
 */
export async function completionValidationDiagnostics(work: WorkPacket, context: ActionExecutionContext): Promise<Diagnostic[]> {
  const diagnostics = await activeArchitectureOrdinanceDiagnostics(context);
  if (work.target_id === null) return diagnostics; // runtime-less work: no target build, but active ordinances still apply
  const baseline = await acceptedRuntimeBaseline(context, work.target_id);
  if (baseline === null || baseline.commands.build === null) return diagnostics;
  const projectRoot = context.projectRoot ?? process.cwd();
  const result = await runCommandDeterministically({ commandSpec: baseline.commands.build, purpose: "build", projectRoot, artifactRoot: storeForContext(context).root });
  if (result.status === "failed") diagnostics.push(diagnostic("COMPLETION_VALIDATION_FAILED", "End-state validation: the build did not pass. The final code must COMPILE before completion — this is where a consumer that doesn't conform to a producer's contract is caught. (Tests are not run here: the whole suite would couple completion to unrelated/integration failures.)", "error", "/runtime_baseline_ref"));
  return diagnostics;
}
