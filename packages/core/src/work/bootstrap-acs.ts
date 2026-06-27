import type { WorkPacket } from "../schemas/artifacts.ts";
import { architectureRequirementState } from "./architecture-requirement.ts";

// Bootstrap-AC coverage (WORK_ORIGINATION_DESIGN.md §5): a packet that ESTABLISHES real scaffolding
// (new_entirely + a required architecture or stack — i.e. a greenfield app or API surface) must include
// at least one AC covering repo bootstrap, not only leaf-feature ACs. The trigger is architecture/stack
// (the scaffolding signal), not platform (which nearly everything requires). modify_existing inherits its
// structure, so it requires none. The marker is the AcceptanceCriterion.bootstrap flag (deterministic).
export function bootstrapAcsRequired(work: WorkPacket): boolean {
  if (work.origination !== "new_entirely") return false;
  return architectureRequirementState(work).required || work.stack.required;
}

export function hasBootstrapAc(work: WorkPacket): boolean {
  return work.acceptance_criteria.some((ac) => ac.bootstrap === true);
}

export function bootstrapAcsMissing(work: WorkPacket): boolean {
  return bootstrapAcsRequired(work) && !hasBootstrapAc(work);
}
