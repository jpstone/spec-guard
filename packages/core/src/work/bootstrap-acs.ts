import type { WorkPacket } from "../schemas/artifacts.ts";
import { architectureRequirementState } from "./architecture-requirement.ts";
import { establishesNewTarget } from "./runtime-baseline-ref.ts";

// Bootstrap-AC coverage (WORK_ORIGINATION_DESIGN.md §5): a packet that ESTABLISHES real scaffolding
// (a new target — new_entirely or new_in_existing — with a required architecture or stack, i.e. a greenfield
// app or API surface) must include at least one AC covering repo/app bootstrap, not only leaf-feature ACs.
// The trigger is architecture/stack (the scaffolding signal), not platform (which nearly everything requires).
// modify_existing inherits its structure, so it requires none. The marker is the AcceptanceCriterion.bootstrap
// flag (deterministic). (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §4.2.)
export function bootstrapAcsRequired(work: WorkPacket): boolean {
  if (!establishesNewTarget(work)) return false;
  return architectureRequirementState(work).required || work.stack.required;
}

export function hasBootstrapAc(work: WorkPacket): boolean {
  return work.acceptance_criteria.some((ac) => ac.bootstrap === true);
}

export function bootstrapAcsMissing(work: WorkPacket): boolean {
  return bootstrapAcsRequired(work) && !hasBootstrapAc(work);
}
