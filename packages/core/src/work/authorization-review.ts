import { canonicalJson } from "../canonical/canonical-json.ts";
import type { Config, WorkPacket } from "../schemas/artifacts.ts";
import type { Diagnostic, SourceArtifactRef } from "../schemas/embedded.ts";
import { AuthorizationReviewSnapshotPayloadSchema, type AuthorizationReviewSnapshotPayload } from "../schemas/snapshots.ts";
import { buildEphemeralSnapshotIdentity } from "../snapshots/revisions.ts";
import { normalizeSourceArtifactRefs } from "../canonical/source-refs.ts";
import { diagnostic } from "../actions/config.ts";
import type { ActionExecutionContext } from "../actions/context.ts";
import { workPacketSourceRef } from "./ac-snapshots.ts";
import { resolveSourceArtifactRef } from "../actions/source-artifact.ts";
import { sourceArtifactRefsForAcs } from "./source-evidence.ts";
import { createPacketReviewSnapshot } from "./packet-review.ts";
import { packetApprovalSurfaceStalenessDiagnostics } from "../role-loop/staleness.ts";
import { validateRuntimeBaselineRef, greenfieldBaselineDeferred } from "./runtime-baseline-ref.ts";
import { buildCapturePlan, expectedFileCategoryPolicy } from "../baselines/packet-change-baseline.ts";
import { validateGlobPatterns } from "../paths/glob.ts";
import { gitStatusEntries, locateGitRoot } from "../paths/git.ts";
import { resolveProjectRoot } from "../actions/context.ts";

export interface AuthorizationReview { payload: AuthorizationReviewSnapshotPayload; snapshot_hash: string; snapshot_revision: string; source_artifact_refs: SourceArtifactRef[]; rendered_summary: string; readiness: { authorization_ready: boolean; diagnostics: Diagnostic[] } }

export const IMPLEMENTATION_AUTHORIZATION_APPROVED_FIELDS = ["/id", "/approved_packet_snapshot_hash", "/approved_packet_snapshot_revision", "/allowed_globs", "/runtime_baseline_ref", "/change_baseline_capture_plan"];

function withoutWorkPacketRefs(refs: readonly SourceArtifactRef[]): SourceArtifactRef[] {
  return normalizeSourceArtifactRefs(refs).filter((ref) => ref.artifact_type !== "work_packet");
}

function refsEqualIgnoringWorkPacket(a: readonly SourceArtifactRef[], b: readonly SourceArtifactRef[]): boolean {
  return JSON.stringify(withoutWorkPacketRefs(a)) === JSON.stringify(withoutWorkPacketRefs(b));
}

function diagnosticForUnresolvedPacketApprovalRef(ref: SourceArtifactRef, source: "stored" | "current", error: unknown): Diagnostic {
  const message = error instanceof Error ? error.message : String(error);
  const code = message.toLowerCase().includes("content_hash mismatch") ? "PACKET_APPROVAL_SOURCE_REF_CONTENT_HASH_MISMATCH" : "PACKET_APPROVAL_SOURCE_REF_UNRESOLVED";
  return diagnostic(code, `${source} packet approval source ref ${ref.artifact_type}/${ref.id ?? "__singleton__"}@${ref.revision} could not be verified: ${message}`, "error", "/lifecycle/packet_approval/source_artifact_refs");
}

async function sourceRefResolutionDiagnostics(refs: readonly SourceArtifactRef[], source: "stored" | "current", context: ActionExecutionContext): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  for (const ref of normalizeSourceArtifactRefs(refs)) {
    try {
      await resolveSourceArtifactRef(ref, context);
    } catch (error) {
      diagnostics.push(diagnosticForUnresolvedPacketApprovalRef(ref, source, error));
    }
  }
  return diagnostics;
}

function packetReviewDiagnosticAffectsAuthorizationFreshness(diag: Diagnostic): boolean {
  return diag.severity === "error" && (diag.code.startsWith("SOURCE_") || diag.code === "AC_APPROVAL_STALE");
}

function valueAtPointer(root: unknown, pointer: string): unknown {
  if (pointer === "") return root;
  return pointer.slice(1).split("/").reduce<unknown>((current, rawPart) => {
    if (current === null || typeof current !== "object") return undefined;
    const part = rawPart.replaceAll("~1", "/").replaceAll("~0", "~");
    return (current as Record<string, unknown>)[part];
  }, root);
}

function authorizationApprovedPayloadStalenessDiagnostics(stored: Record<string, unknown> | null, current: AuthorizationReviewSnapshotPayload): Diagnostic[] {
  if (stored === null) return [diagnostic("AUTHORIZATION_APPROVED_PAYLOAD_MISSING", "Stored implementation authorization decision is missing its approved AuthorizationReviewSnapshotPayload.", "error", "/lifecycle/authorization/approved_payload")];
  const changed = IMPLEMENTATION_AUTHORIZATION_APPROVED_FIELDS.filter((pointer) => canonicalJson(valueAtPointer(stored, pointer)) !== canonicalJson(valueAtPointer(current, pointer)));
  if (changed.length === 0) return [];
  return [diagnostic("AUTHORIZATION_APPROVED_PAYLOAD_STALE", `Current authorization approved-field payload differs from stored authorization decision at: ${changed.join(", ")}.`, "error", "/lifecycle/authorization/approved_payload")];
}

export async function authorizationFreshnessDiagnostics(work: WorkPacket, config: Config, context: ActionExecutionContext = {}): Promise<Diagnostic[]> {
  if (work.lifecycle.authorization === null) return [];
  try {
    const current = await authorizationReviewPayload(work, config, context);
    return authorizationApprovedPayloadStalenessDiagnostics(work.lifecycle.authorization.approved_payload, current);
  } catch (error) {
    return [diagnostic("AUTHORIZATION_APPROVED_PAYLOAD_UNAVAILABLE", error instanceof Error ? error.message : String(error), "error", "/lifecycle/authorization")];
  }
}

export async function packetApprovalFreshnessDiagnostics(work: WorkPacket, config: Config, context: ActionExecutionContext = {}): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const approval = work.lifecycle.packet_approval;
  if (approval === null) {
    diagnostics.push(diagnostic("PACKET_APPROVAL_REQUIRED", "Current Work Packet approval is required before implementation authorization.", "error", "/lifecycle/packet_approval"));
    return diagnostics;
  }
  if (work.disposition !== "active") {
    diagnostics.push(diagnostic("PACKET_APPROVAL_STATUS_STALE", `WorkPacket disposition ${work.disposition} is not an active approved packet.`, "error", "/disposition"));
  }
  const snapshot = await createPacketReviewSnapshot(work, config, context);
  diagnostics.push(...snapshot.readiness.diagnostics.filter(packetReviewDiagnosticAffectsAuthorizationFreshness));
  diagnostics.push(...await sourceRefResolutionDiagnostics(approval.source_artifact_refs, "stored", context));
  diagnostics.push(...await sourceRefResolutionDiagnostics(snapshot.source_artifact_refs, "current", context));
  diagnostics.push(...packetApprovalSurfaceStalenessDiagnostics(approval.approved_payload, snapshot.payload));
  if (!refsEqualIgnoringWorkPacket(snapshot.source_artifact_refs, approval.source_artifact_refs)) {
    diagnostics.push(diagnostic("PACKET_APPROVAL_SOURCE_REFS_STALE", "Current packet approval source artifact refs differ from the stored approval decision.", "error", "/lifecycle/packet_approval/source_artifact_refs"));
  }
  return diagnostics;
}

export async function authorizationDiagnostics(work: WorkPacket, config: Config, context: ActionExecutionContext = {}): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  // A decomposed parent is realized through its child WorkPackets and must never be directly authorized
  // (it would capture a change baseline over work it does not do). (ALWAYS_PLAN_DESIGN.md.)
  if (work.decomposed) diagnostics.push(diagnostic("DECOMPOSED_PARENT_NOT_AUTHORIZABLE", "This WorkPacket is decomposed into a Work Breakdown; authorize and implement its child WorkPackets instead. The decomposed parent is approved as the scope but is not directly implemented.", "error", "/decomposed"));
  diagnostics.push(...await packetApprovalFreshnessDiagnostics(work, config, context));
  // Greenfield establishes the baseline as bootstrap work (post-authorization), so it is not required to
  // authorize; modify_existing must reference the accepted (proven) baseline. (Origination-aware.)
  if (!greenfieldBaselineDeferred(work)) diagnostics.push(...(await validateRuntimeBaselineRef(work.runtime_baseline_ref, context)).diagnostics);
  if (work.scope.allowed_globs.length === 0) diagnostics.push(diagnostic("ALLOWED_GLOBS_REQUIRED", "Allowed scope must be known before authorization.", "error", "/scope/allowed_globs"));
  for (const glob of work.scope.allowed_globs) {
    try { validateGlobPatterns([glob]); } catch (error) { diagnostics.push(diagnostic("ALLOWED_GLOB_INVALID", error instanceof Error ? error.message : String(error), "error", "/scope/allowed_globs")); }
  }
  if (work.parent_plan_id !== null) diagnostics.push(diagnostic("PARENT_PLAN_VALIDITY_DEFERRED", "Parent Plan relationship validation is deferred to Plan milestones and is not treated as valid here.", "warning", "/parent_plan_id"));
  const projectRoot = resolveProjectRoot(context);
  const capturePlan = await buildCapturePlan(projectRoot, config, work);
  diagnostics.push(...capturePlan.diagnostics);
  if (capturePlan.plan?.mode === "vcs" || config.change_baseline_policy.mode === "vcs") {
    if ((await locateGitRoot(projectRoot)) === null) diagnostics.push(diagnostic("CHANGE_BASELINE_VCS_UNAVAILABLE", "Git metadata is unavailable for VCS packet change baseline capture.", "error", "/change_baseline"));
    else {
      try {
        const dirty = await gitStatusEntries(projectRoot, config);
        for (const entry of dirty.filter((e) => e.blocking)) diagnostics.push(diagnostic("PREAUTHORIZATION_DIRTY_BLOCKING", `${entry.path} has pre-authorization ${entry.status} state in category ${entry.category}.`, "error", "/change_baseline/vcs/dirty_files"));
      } catch (error) {
        diagnostics.push(diagnostic("CHANGE_BASELINE_STATUS_FAILED", error instanceof Error ? error.message : String(error), "error", "/change_baseline"));
      }
    }
  }
  return diagnostics;
}

export async function authorizationReviewPayload(work: WorkPacket, config: Config, context: ActionExecutionContext = {}): Promise<AuthorizationReviewSnapshotPayload> {
  const projectRoot = resolveProjectRoot(context);
  const capturePlan = await buildCapturePlan(projectRoot, config, work);
  if (work.lifecycle.packet_approval === null) throw new Error("packet approval is required before authorization review");
  if (work.runtime_baseline_ref === null && !greenfieldBaselineDeferred(work)) throw new Error("runtime_baseline_ref is required before authorization review");
  if (capturePlan.plan === null) throw new Error(capturePlan.diagnostics.map((d) => d.message).join("; ") || "change baseline capture plan unavailable");
  const diagnostics = await authorizationDiagnostics(work, config, context);
  return AuthorizationReviewSnapshotPayloadSchema.parse({ id: work.id, work_packet_revision: work.revision, approved_packet_snapshot_hash: work.lifecycle.packet_approval.review_snapshot_hash, approved_packet_snapshot_revision: work.lifecycle.packet_approval.review_snapshot_revision, authorization_ready_diagnostics: diagnostics, allowed_globs: work.scope.allowed_globs, runtime_baseline_ref: work.runtime_baseline_ref, change_baseline_capture_plan: capturePlan.plan, expected_file_category_policy: expectedFileCategoryPolicy(config, work.scope.allowed_globs), implementation_boundary_summary: `Implementation for ${work.id} is constrained to allowed_globs: ${work.scope.allowed_globs.join(", ")}` });
}

export async function createAuthorizationReviewSnapshot(work: WorkPacket, config: Config, context: ActionExecutionContext = {}): Promise<AuthorizationReview> {
  const payload = await authorizationReviewPayload(work, config, context);
  const runtimeRef = work.runtime_baseline_ref === null ? [] : [{ artifact_type: "runtime_baseline", id: work.runtime_baseline_ref.id, revision: work.runtime_baseline_ref.revision }];
  const refs = normalizeSourceArtifactRefs([workPacketSourceRef(work), ...runtimeRef, ...sourceArtifactRefsForAcs(work.acceptance_criteria)]);
  const identity = buildEphemeralSnapshotIdentity(payload, refs);
  const ready = payload.authorization_ready_diagnostics.every((diag) => diag.severity !== "error");
  return { payload, snapshot_hash: identity.snapshot_hash, snapshot_revision: identity.snapshot_revision, source_artifact_refs: identity.source_artifact_refs, rendered_summary: `WorkPacket ${work.id} revision ${work.revision} is ${ready ? "ready" : "not ready"} for implementation authorization.`, readiness: { authorization_ready: ready, diagnostics: payload.authorization_ready_diagnostics } };
}
