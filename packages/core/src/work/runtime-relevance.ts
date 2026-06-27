import type { AggregateWorkPacket } from "../schemas/work-packet.ts";
import type { WorkClassification } from "../schemas/enums.ts";
import type { Config } from "../schemas/artifacts.ts";
import type { Diagnostic } from "../schemas/embedded.ts";
import { diagnostic } from "../actions/config.ts";
import { DEV_RUNTIME_REQUIRED_PLATFORMS } from "../baseline/validation.ts";
import { isValidArchitectureNotRequiredReason } from "./architecture-requirement.ts";
import { establishesNewTarget } from "./runtime-baseline-ref.ts";
import { classifyPath } from "../paths/classify.ts";

/**
 * Three-layer policing of runtime-relevance (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §5). A packet with
 * target_id === null is "runtime-less" (no baseline, no dev-runtime/build gates). Relevance is DERIVED +
 * BACKSTOPPED, never freely asserted. Unlike architecture-requirement.ts / mockup-gate.ts (single leaf), Layer 1
 * reads the WHOLE aggregate (classification is per-Spec), so this module takes the aggregate.
 */

// Classifications whose deliverable IS executable code → runtime-relevant (a target is required).
const RUNTIME_RELEVANT_CLASSIFICATIONS: ReadonlySet<WorkClassification> = new Set(["reusable_api", "rest_api", "reusable_ui", "one_off_application_ui"]);

export function classificationIsRuntimeRelevant(classification: WorkClassification): boolean {
  return RUNTIME_RELEVANT_CLASSIFICATIONS.has(classification);
}

/** Layer 1: does this packet REQUIRE a target (null target_id disallowed)? True when ANY Spec is a
 *  runtime-relevant classification OR the packet declares an app platform (the dev-runtime Floor set). */
export function aggregateRequiresTarget(aggregate: AggregateWorkPacket): boolean {
  if (aggregate.specs.some((spec) => classificationIsRuntimeRelevant(spec.classification))) return true;
  return aggregate.platform.choice !== null && DEV_RUNTIME_REQUIRED_PLATFORMS.has(aggregate.platform.choice);
}

/**
 * Layers 1 + 2 — approval-time policing of a runtime-less (target_id === null) claim.
 *  - Layer 1: a runtime-relevant classification or an app platform CANNOT be runtime-less (closes the Floor-dodge).
 *  - Layer 2: a runtime-less packet that isn't purely operational_document needs a documented, human-approved
 *    runtime_not_relevant_reason (bound into the approval hash at the aggregate top level). The reason is validated
 *    with the SAME rigor as the architecture exception (isValidArchitectureNotRequiredReason: real length + no
 *    boilerplate/filler) — it is the human escape hatch for the entire runtime Floor.
 */
export function runtimeRelevanceApprovalDiagnostics(aggregate: AggregateWorkPacket): Diagnostic[] {
  if (aggregate.target_id !== null) return []; // has a target → runtime gates apply; not a runtime-less claim
  if (aggregateRequiresTarget(aggregate)) {
    return [diagnostic("RUNTIME_TARGET_REQUIRED", "This work is runtime-relevant (a runtime-producing classification or an app platform), so it MUST declare a target_id (the app it runs in) — it cannot be runtime-less. Set target_id and inherit (work.target.attach) or establish that target's runtime baseline.", "error", "/target_id")];
  }
  const allDocs = aggregate.specs.every((spec) => spec.classification === "operational_document");
  if (allDocs) return [];
  if (!isValidArchitectureNotRequiredReason(aggregate.runtime_not_relevant_reason)) {
    return [diagnostic("RUNTIME_NOT_RELEVANT_REASON_REQUIRED", "This packet is declared runtime-less (no target_id) but is not purely operational_document, so it requires a documented, specific runtime_not_relevant_reason (>= 12 chars, no boilerplate) — the human approves the runtime-less claim at the approval gate.", "error", "/runtime_not_relevant_reason")];
  }
  return [];
}

/**
 * Approval-time review of the dev-runtime PROOF design (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §11). A packet
 * that ESTABLISHES a new app target on a dev-runtime-required platform must declare, on at least one Spec's plan,
 * a dev_runtime_proof (the run command + what the readiness probe asserts). The proof RUNS post-authorization
 * (the scaffold must exist first), but its DESIGN is human-reviewed at the bulk approval — so a hollow probe is
 * caught here rather than waved through the deterministic completion gate. Bound to approval via the plan hash.
 * (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §4.3.)
 */
export function devRuntimeProofApprovalDiagnostics(aggregate: AggregateWorkPacket): Diagnostic[] {
  if (!establishesNewTarget(aggregate)) return [];
  if (aggregate.platform.choice === null || !DEV_RUNTIME_REQUIRED_PLATFORMS.has(aggregate.platform.choice)) return [];
  const hasProof = aggregate.specs.some((spec) => spec.implementation_plan?.kind === "standard_plan" && spec.implementation_plan.dev_runtime_proof !== null);
  if (hasProof) return [];
  return [diagnostic("DEV_RUNTIME_PROOF_PLAN_REQUIRED", `This packet establishes a new app target ('${aggregate.target_id}', platform ${aggregate.platform.choice}) that requires a real dev runtime, so at least one Spec's implementation plan must declare a dev_runtime_proof — the dev-runtime command + what the readiness probe asserts on success (the meaning of "the runtime works"). Set it via work.spec.plan on the app Spec. The proof itself runs as bootstrap work after authorization; its DESIGN is approved here.`, "error", "/specs")];
}

/**
 * Layer 3 — the changed-file backstop: a runtime-less packet whose changed files include executable source
 * contradicts the runtime-less claim. Wired at completion over the packet's RECORDED footprint (the implementers'
 * declared changed_files); under-reporting of that footprint is caught separately by the completion
 * unrecorded-changes gate (which diffs against the real change baseline). Docs/tests are fine for runtime-less
 * work; only `implementation_source` trips it.
 */
export function runtimeLessDiffContradiction(targetId: string | null, changedFiles: readonly string[], config: Config): Diagnostic[] {
  if (targetId !== null) return [];
  const offending = changedFiles.filter((file) => classifyPath(file, config).category === "implementation_source");
  if (offending.length === 0) return [];
  return [diagnostic("RUNTIME_LESS_CONTRADICTED_BY_DIFF", `This packet is declared runtime-less (no target_id) but changed executable source: ${offending.slice(0, 5).join(", ")}${offending.length > 5 ? ` (+${offending.length - 5} more)` : ""}. Runtime-less work must not ship code — declare a target_id (the app these files belong to) and inherit/establish its runtime baseline.`, "error", "/target_id")];
}
