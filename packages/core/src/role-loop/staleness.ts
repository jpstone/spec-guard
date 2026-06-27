import { canonicalJson } from "../canonical/canonical-json.ts";
import type { Diagnostic } from "../schemas/embedded.ts";
import { ROLE_LOOP_DIAGNOSTIC_CODES, roleLoopDiagnostic } from "./diagnostics.ts";
import { ApprovedWorkPacketProjectionV1Schema, type ApprovedWorkPacketProjectionV1 } from "./packet-approval.ts";

// A stored approved_payload is a current V1 approval projection iff it parses against the schema.
export function isApprovedWorkPacketProjectionV1(payload: unknown): payload is ApprovedWorkPacketProjectionV1 {
  return ApprovedWorkPacketProjectionV1Schema.safeParse(payload).success;
}

// `approved_payload_revision` is excluded from the staleness surface comparison so that a bumped
// revision alone never stales approval (it is a constant in M1A but stripped for robustness).
function stripApprovedPayloadRevision(value: Record<string, unknown>): Record<string, unknown> {
  const { approved_payload_revision: _revision, ...rest } = value;
  return rest;
}

export interface PacketApprovalStalenessOptions {
  field_path?: string;
}

// Shared packet-approval freshness check used by every recompute site, so legacy approvals
// surface `approval_refresh_required` consistently and current approvals stale consistently.
export function packetApprovalSurfaceStalenessDiagnostics(
  storedApprovedPayload: Record<string, unknown> | null,
  currentProjection: ApprovedWorkPacketProjectionV1,
  options: PacketApprovalStalenessOptions = {}
): Diagnostic[] {
  const fieldPath = options.field_path ?? "/lifecycle/packet_approval";
  if (storedApprovedPayload === null) {
    return [roleLoopDiagnostic(ROLE_LOOP_DIAGNOSTIC_CODES.PACKET_APPROVAL_REFRESH_REQUIRED, "Stored packet approval predates the implementation-plan/evidence-policy approval projection; approval refresh is required before implementation authorization.", "error", fieldPath, "Re-run work.packet.review and work.approve to bind the current approval projection.")];
  }
  if (!isApprovedWorkPacketProjectionV1(storedApprovedPayload)) {
    return [roleLoopDiagnostic(ROLE_LOOP_DIAGNOSTIC_CODES.PACKET_APPROVAL_REFRESH_REQUIRED, "Stored packet approval payload is not a current ApprovedWorkPacketProjectionV1; approval refresh is required before implementation authorization.", "error", fieldPath, "Re-run work.packet.review and work.approve to bind the current approval projection.")];
  }
  const stored = stripApprovedPayloadRevision(storedApprovedPayload);
  const current = stripApprovedPayloadRevision(currentProjection as unknown as Record<string, unknown>);
  if (canonicalJson(stored) !== canonicalJson(current)) {
    return [roleLoopDiagnostic(ROLE_LOOP_DIAGNOSTIC_CODES.PACKET_APPROVAL_STALE, "Current Work Packet approval projection differs from the stored packet approval payload.", "error", fieldPath)];
  }
  return [];
}
