import { randomUUID } from "node:crypto";
import { WorkPacketSchema, type WorkPacket } from "../schemas/artifacts.ts";
import type { AcceptanceCriterion } from "../schemas/embedded.ts";
import { DEFAULT_TARGET_ID, type DocsPolicy, type WorkClassification, type WorkOrigination } from "../schemas/enums.ts";
import { isoNow } from "../actions/config.ts";
import { defaultDocsPolicy } from "./docs-policy.ts";
import { architectureRequirementDefaults, stackRequirementDefaults } from "./architecture-requirement.ts";

export interface WorkPacketDefaultsInput {
  id?: string | undefined;
  title: string;
  goal: string;
  classification: WorkClassification;
  origination?: WorkOrigination | undefined;
  docs_policy?: DocsPolicy | undefined;
  docs_none_required_reason?: string | null | undefined;
  docs_not_applicable_reason?: string | null | undefined;
  desired_outcomes?: string[] | undefined;
  in_scope?: string[] | undefined;
  out_of_scope?: string[] | undefined;
  users_actors?: string[] | undefined;
  edge_cases?: string[] | undefined;
  open_questions?: string[] | undefined;
  acceptance_criteria?: AcceptanceCriterion[] | undefined;
  allowed_globs?: string[] | undefined;
  scope_deviations?: string[] | undefined;
  target_id?: string | null | undefined;
  runtime_not_relevant_reason?: string | null | undefined;
}

// The default target when none is supplied: operational_document is docs-only → runtime-less (null);
// every other classification defaults to the single-app DEFAULT_TARGET_ID. Mirrors platformDefaults'
// classification-awareness. work.create overrides with the agent's explicit target_id. (§3/§5.)
export function defaultTargetId(classification: WorkClassification): string | null {
  return classification === "operational_document" ? null : DEFAULT_TARGET_ID;
}

export function platformDefaults(classification: WorkClassification): WorkPacket["platform"] {
  if (classification === "operational_document") return { required: false, choice: null, decision_id: null, not_required_reason: "operational_document_docs_only" };
  return { required: true, choice: null, decision_id: null, not_required_reason: null };
}

export function architectureDefaults(classification: WorkClassification): WorkPacket["architecture"] {
  return { ...architectureRequirementDefaults(classification), decision_ids: [] };
}

// The stack (framework/tooling) required-ness uses its own predicate (decoupled from architecture) so
// origination can require a stack while inheriting architecture (v2). v1 behavior is unchanged: stack is
// required under the same classification condition as architecture.
export function stackDefaults(classification: WorkClassification): WorkPacket["stack"] {
  return { ...stackRequirementDefaults(classification), decision_ids: [] };
}

// modify_existing inherits the established project's structural decisions, so none are required. The
// reasons document the inheritance and satisfy the architecture not-required exception check
// (isValidArchitectureNotRequiredReason: >=12 chars, not boilerplate). (WORK_ORIGINATION_DESIGN.md §2.)
const INHERITED_PLATFORM_REASON = "platform inherited from the existing project (modify_existing origination)";
const INHERITED_ARCHITECTURE_REASON = "architecture inherited from the existing project (modify_existing origination)";
const INHERITED_STACK_REASON = "stack inherited from the existing project (modify_existing origination)";

export function inheritedPlatform(): WorkPacket["platform"] {
  return { required: false, choice: null, decision_id: null, not_required_reason: INHERITED_PLATFORM_REASON };
}
export function inheritedArchitecture(): WorkPacket["architecture"] {
  return { required: false, required_reason: null, not_required_reason: INHERITED_ARCHITECTURE_REASON, decision_ids: [] };
}
export function inheritedStack(): WorkPacket["stack"] {
  return { required: false, required_reason: null, not_required_reason: INHERITED_STACK_REASON, decision_ids: [] };
}

export function buildDefaultWorkPacket(input: WorkPacketDefaultsInput): WorkPacket {
  const now = isoNow();
  const policy = input.docs_policy ?? defaultDocsPolicy(input.classification);
  // Origination derives per-dimension establish-vs-inherit. new_entirely (default) establishes via the
  // classification defaults (today's behavior); modify_existing inherits all structural dimensions.
  const origination = input.origination ?? "new_entirely";
  const inherits = origination === "modify_existing";
  return WorkPacketSchema.parse({
    artifact_type: "work_packet",
    schema_version: 1,
    id: input.id ?? `work:${randomUUID()}`,
    revision: 1,
    created_at: now,
    updated_at: now,
    disposition: "active",
    workflow_state: "packet_draft",
    title: input.title,
    classification: input.classification,
    origination,
    parent_plan_id: null,
    plan_slice_id: null,
    intent: {
      goal: input.goal,
      desired_outcomes: input.desired_outcomes ?? [],
      in_scope: input.in_scope ?? [],
      out_of_scope: input.out_of_scope ?? [],
      users_actors: input.users_actors ?? [],
      edge_cases: input.edge_cases ?? [],
      open_questions: input.open_questions ?? []
    },
    acceptance_criteria: input.acceptance_criteria ?? [],
    docs: {
      policy,
      none_required_reason: policy === "none_required" ? input.docs_none_required_reason ?? "classification_default_none_required" : null,
      not_applicable_reason: policy === "not_applicable" ? input.docs_not_applicable_reason ?? null : null,
      requirements: []
    },
    scope: { allowed_globs: input.allowed_globs ?? [], deviations: input.scope_deviations ?? [] },
    platform: inherits ? inheritedPlatform() : platformDefaults(input.classification),
    architecture: inherits ? inheritedArchitecture() : architectureDefaults(input.classification),
    stack: inherits ? inheritedStack() : stackDefaults(input.classification),
    runtime_baseline_ref: null,
    target_id: input.target_id === undefined ? defaultTargetId(input.classification) : input.target_id,
    runtime_not_relevant_reason: input.runtime_not_relevant_reason ?? null,
    change_baseline: null,
    lifecycle: { ac_approval: null, packet_approval: null, authorization: null, history: [] },
    decision_history: [],
    diagnostics: []
  });
}
