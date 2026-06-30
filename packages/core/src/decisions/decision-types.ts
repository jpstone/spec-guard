import { assertCanonicalApprovedFields, type ApprovedFieldRoot } from "./approved-fields.ts";

export const STANDARD_DECISION_TYPES = [
  "runtime_baseline_acceptance",
  "platform_choice",
  "architecture_choice",
  "stack_choice",
  "ac_approval",
  "work_packet_approval",
  "implementation_authorization",
  "work_packet_completion",
  // v2 aggregate (whole-Work-Packet) gates — the approved_payload is the {id,title,specs} approval projection,
  // so these carry approved_fields that actually match it (unlike the v1 leaf decision types).
  "aggregate_work_packet_approval",
  "aggregate_implementation_authorization",
  "aggregate_work_packet_completion",
  "aggregate_work_packet_revision",
  "architecture_charter_approval",
  "architecture_charter_revision",
  "architecture_charter_authorization",
  "architecture_charter_activation",
  "architecture_charter_retirement",
  "architecture_governance_waiver"
] as const;

export type StandardDecisionType = typeof STANDARD_DECISION_TYPES[number];

export interface DecisionTypeDefinition {
  decision_type: StandardDecisionType;
  approved_field_root: ApprovedFieldRoot;
  approved_fields: readonly string[];
  requires_specialized_action: boolean;
}

const definitions: DecisionTypeDefinition[] = [
  {
    decision_type: "runtime_baseline_acceptance",
    approved_field_root: "runtime_baseline_artifact",
    approved_fields: ["/stack", "/commands", "/configuration", "/dependency_modes", "/diff_policy", "/validation"],
    requires_specialized_action: true
  },
  {
    decision_type: "platform_choice",
    approved_field_root: "human_decision_approved_payload",
    approved_fields: ["/work_id", "/choice", "/custom_response"],
    requires_specialized_action: true
  },
  {
    decision_type: "architecture_choice",
    approved_field_root: "human_decision_approved_payload",
    approved_fields: ["/work_id", "/choice", "/custom_response", "/option_details"],
    requires_specialized_action: true
  },
  {
    decision_type: "stack_choice",
    approved_field_root: "human_decision_approved_payload",
    approved_fields: ["/work_id", "/choice", "/custom_response", "/option_details"],
    requires_specialized_action: true
  },
  {
    decision_type: "ac_approval",
    approved_field_root: "work_packet_artifact",
    approved_fields: ["/acceptance_criteria"],
    requires_specialized_action: true
  },
  {
    decision_type: "work_packet_approval",
    approved_field_root: "work_packet_artifact",
    approved_fields: ["/title", "/parent_plan_id", "/plan_slice_id", "/intent", "/acceptance_criteria", "/docs/policy", "/docs/none_required_reason", "/docs/not_applicable_reason", "/scope/allowed_globs", "/platform", "/architecture", "/stack", "/classification", "/runtime_baseline_ref", "/work_kind_resolution", "/implementation_plan", "/evidence_policy_resolution"],
    requires_specialized_action: true
  },
  {
    decision_type: "implementation_authorization",
    approved_field_root: "human_decision_approved_payload",
    approved_fields: ["/id", "/approved_packet_snapshot_hash", "/approved_packet_snapshot_revision", "/allowed_globs", "/runtime_baseline_ref", "/change_baseline_capture_plan"],
    requires_specialized_action: true
  },
  {
    decision_type: "work_packet_completion",
    approved_field_root: "human_decision_approved_payload",
    approved_fields: ["/work_id"],
    requires_specialized_action: true
  },
  {
    decision_type: "aggregate_work_packet_approval",
    approved_field_root: "human_decision_approved_payload",
    approved_fields: ["/id", "/title", "/specs", "/implementation_parallelism_plan", "/architecture_governance"],
    requires_specialized_action: true
  },
  {
    decision_type: "aggregate_implementation_authorization",
    approved_field_root: "human_decision_approved_payload",
    approved_fields: ["/id", "/title", "/specs"],
    requires_specialized_action: true
  },
  {
    decision_type: "aggregate_work_packet_completion",
    approved_field_root: "human_decision_approved_payload",
    approved_fields: ["/work_id"],
    requires_specialized_action: true
  },
  {
    decision_type: "aggregate_work_packet_revision",
    approved_field_root: "human_decision_approved_payload",
    approved_fields: ["/work_id", "/reason", "/invalidated_lifecycle", "/re_review_required"],
    requires_specialized_action: true
  },
  {
    decision_type: "architecture_charter_approval",
    approved_field_root: "human_decision_approved_payload",
    approved_fields: ["/charter_id", "/ordinances"],
    requires_specialized_action: true
  },
  {
    decision_type: "architecture_charter_revision",
    approved_field_root: "human_decision_approved_payload",
    approved_fields: ["/charter_id", "/source_ordinance_id", "/replacement_ordinance_id", "/reason", "/replacement"],
    requires_specialized_action: true
  },
  {
    decision_type: "architecture_charter_authorization",
    approved_field_root: "human_decision_approved_payload",
    approved_fields: ["/charter_id", "/approved_ordinance_ids"],
    requires_specialized_action: true
  },
  {
    decision_type: "architecture_charter_activation",
    approved_field_root: "human_decision_approved_payload",
    approved_fields: ["/charter_id", "/active_ordinance_ids", "/retired_ordinance_ids", "/validation_results"],
    requires_specialized_action: true
  },
  {
    decision_type: "architecture_charter_retirement",
    approved_field_root: "human_decision_approved_payload",
    approved_fields: ["/charter_id", "/retired_ordinance_ids", "/reason"],
    requires_specialized_action: true
  },
  {
    decision_type: "architecture_governance_waiver",
    approved_field_root: "human_decision_approved_payload",
    approved_fields: ["/work_id", "/reason", "/charter_status"],
    requires_specialized_action: true
  }
];

export const DECISION_TYPE_REGISTRY = new Map<StandardDecisionType, DecisionTypeDefinition>(
  definitions.map((definition) => [definition.decision_type, { ...definition, approved_fields: assertCanonicalApprovedFields(definition.approved_fields) }])
);

export function isRegisteredDecisionType(decisionType: string): decisionType is StandardDecisionType {
  return DECISION_TYPE_REGISTRY.has(decisionType as StandardDecisionType);
}

export function getDecisionTypeDefinition(decisionType: string): DecisionTypeDefinition | undefined {
  return DECISION_TYPE_REGISTRY.get(decisionType as StandardDecisionType);
}

export function deriveApprovedFields(decisionType: string, finalDecision: boolean): string[] | undefined {
  const definition = getDecisionTypeDefinition(decisionType);
  if (definition === undefined) return undefined;
  return finalDecision ? [...definition.approved_fields] : [];
}

export function isSpecializedWorkflowDecisionType(decisionType: string): boolean {
  return getDecisionTypeDefinition(decisionType)?.requires_specialized_action === true;
}
