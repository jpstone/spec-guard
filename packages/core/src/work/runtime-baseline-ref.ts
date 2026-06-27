import { canonicalJson } from "../canonical/canonical-json.ts";
import { RuntimeBaselineSchema, type RuntimeBaseline, type WorkPacket } from "../schemas/artifacts.ts";
import type { Diagnostic, RuntimeBaselineRef, SourceArtifactRef } from "../schemas/embedded.ts";
import type { ActionExecutionContext } from "../actions/context.ts";
import { diagnostic, storeForContext } from "../actions/config.ts";
import { relocateLegacyDefaultBaseline } from "../baseline/target-store.ts";

// Does this packet ESTABLISH a new target's runtime baseline (vs inherit an existing one)? new_entirely
// (a brand-new repo's default target) and new_in_existing (a brand-new app/target inside an existing repo)
// both establish; modify_existing inherits an already-proven target. (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §4.)
export function establishesNewTarget(work: Pick<WorkPacket, "origination">): boolean {
  return work.origination === "new_entirely" || work.origination === "new_in_existing";
}

// A packet that ESTABLISHES a new target establishes its runtime baseline as a BOOTSTRAP DELIVERABLE after
// authorization (the dev runtime can only be proven once the scaffold exists), so while none exists yet the
// pre-approval / pre-authorization "accepted baseline required" gate is exempt. modify_existing inherits the
// already-proven target's baseline (via work.target.attach) and still requires it.
// (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §4.2.)
export function greenfieldBaselineDeferred(work: WorkPacket): boolean {
  return work.runtime_baseline_ref === null && establishesNewTarget(work);
}

export interface RuntimeBaselineRefValidation { ok: boolean; diagnostics: Diagnostic[]; baseline: RuntimeBaseline | null; source_ref: SourceArtifactRef | null }

const RUNTIME_BASELINE_ACCEPTED_APPROVED_PATHS = ["stack", "commands", "configuration", "dependency_modes", "diff_policy", "validation"] as const;

type RuntimeBaselineApprovedPath = typeof RUNTIME_BASELINE_ACCEPTED_APPROVED_PATHS[number];

function approvedPathValue(baseline: RuntimeBaseline, path: RuntimeBaselineApprovedPath): unknown {
  return baseline[path];
}

function approvedPathsEqual(a: RuntimeBaseline, b: RuntimeBaseline): boolean {
  return RUNTIME_BASELINE_ACCEPTED_APPROVED_PATHS.every((path) => canonicalJson(approvedPathValue(a, path)) === canonicalJson(approvedPathValue(b, path)));
}

export async function validateRuntimeBaselineRef(ref: RuntimeBaselineRef | null, context: ActionExecutionContext = {}): Promise<RuntimeBaselineRefValidation> {
  const diagnostics: Diagnostic[] = [];
  if (ref === null) {
    diagnostics.push(diagnostic("RUNTIME_BASELINE_REF_REQUIRED", "runtime_baseline_ref is required and must reference an accepted RuntimeBaseline.", "error", "/runtime_baseline_ref"));
    return { ok: false, diagnostics, baseline: null, source_ref: null };
  }
  const store = storeForContext(context);
  await relocateLegacyDefaultBaseline(store, ref.id);
  let baseline: RuntimeBaseline;
  try {
    baseline = RuntimeBaselineSchema.parse((await store.readCurrent<RuntimeBaseline>("runtime_baseline", ref.id)).artifact);
  } catch (error) {
    diagnostics.push(diagnostic("RUNTIME_BASELINE_REF_UNRESOLVED", error instanceof Error ? error.message : String(error), "error", "/runtime_baseline_ref"));
    return { ok: false, diagnostics, baseline: null, source_ref: null };
  }

  let referencedBaseline: RuntimeBaseline | null = null;
  try {
    const revision = await store.readRevision<RuntimeBaseline>("runtime_baseline", ref.id, ref.revision);
    referencedBaseline = RuntimeBaselineSchema.parse(revision.governed_projection);
  } catch (error) {
    diagnostics.push(diagnostic("RUNTIME_BASELINE_REVISION_UNRESOLVED", error instanceof Error ? error.message : String(error), "error", "/runtime_baseline_ref/revision"));
  }

  if (referencedBaseline !== null) {
    if (referencedBaseline.status !== "accepted" || referencedBaseline.acceptance === null) {
      diagnostics.push(diagnostic("RUNTIME_BASELINE_REFERENCED_REVISION_NOT_ACCEPTED", "RuntimeBaselineRef.revision does not resolve to an accepted RuntimeBaseline revision.", "error", "/runtime_baseline_ref/revision"));
    } else {
      if (referencedBaseline.acceptance.id !== ref.acceptance_decision_id) diagnostics.push(diagnostic("RUNTIME_BASELINE_DECISION_MISMATCH", "RuntimeBaselineRef acceptance_decision_id does not match the referenced accepted revision.", "error", "/runtime_baseline_ref/acceptance_decision_id"));
      if (referencedBaseline.acceptance.review_snapshot_hash !== ref.acceptance_snapshot_hash) diagnostics.push(diagnostic("RUNTIME_BASELINE_HASH_MISMATCH", "RuntimeBaselineRef acceptance_snapshot_hash does not match the referenced accepted revision.", "error", "/runtime_baseline_ref/acceptance_snapshot_hash"));
      if (referencedBaseline.acceptance.review_snapshot_revision !== ref.acceptance_snapshot_revision) diagnostics.push(diagnostic("RUNTIME_BASELINE_SNAPSHOT_REVISION_MISMATCH", "RuntimeBaselineRef acceptance_snapshot_revision does not match the referenced accepted revision.", "error", "/runtime_baseline_ref/acceptance_snapshot_revision"));
    }
  }

  if (baseline.status !== "accepted" || baseline.acceptance === null) {
    diagnostics.push(diagnostic("RUNTIME_BASELINE_NOT_ACCEPTED", "Current RuntimeBaseline is not accepted; RuntimeBaselineRef is stale for packet approval/authorization.", "error", "/runtime_baseline_ref"));
  } else if (referencedBaseline !== null && referencedBaseline.status === "accepted" && referencedBaseline.acceptance !== null && !approvedPathsEqual(referencedBaseline, baseline)) {
    diagnostics.push(diagnostic("RUNTIME_BASELINE_REF_STALE", "RuntimeBaseline accepted approved paths changed since the referenced accepted revision.", "error", "/runtime_baseline_ref/revision"));
  }

  return { ok: diagnostics.filter((d) => d.severity === "error").length === 0, diagnostics, baseline, source_ref: { artifact_type: "runtime_baseline", id: ref.id, revision: ref.revision } };
}
