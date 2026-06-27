// Migration/backcompat helpers for Milestone 1A WorkPacket fields.
//
// Existing WorkPackets predate the implementation-plan/evidence-policy approval projections.
// Migration adds explicit `null`/empty placeholders for the new fields (never fabricating plans,
// decisions, or waivers); approval-binding is recomputed on demand and legacy approvals surface
// `approval_refresh_required` (see role-loop/staleness.ts).

export interface RoleLoopWorkPacketDefaults {
  work_kind_resolution: null;
  work_kind_resolution_hash: null;
  implementation_plan: null;
  implementation_plan_hash: null;
  evidence_policy_resolution: null;
  evidence_policy_resolution_hash: null;
}

export function roleLoopWorkPacketDefaults(): RoleLoopWorkPacketDefaults {
  return {
    work_kind_resolution: null,
    work_kind_resolution_hash: null,
    implementation_plan: null,
    implementation_plan_hash: null,
    evidence_policy_resolution: null,
    evidence_policy_resolution_hash: null
  };
}

export const ROLE_LOOP_WORK_PACKET_FIELD_NAMES = [
  "work_kind_resolution",
  "work_kind_resolution_hash",
  "implementation_plan",
  "implementation_plan_hash",
  "evidence_policy_resolution",
  "evidence_policy_resolution_hash"
] as const;
