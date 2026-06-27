import { canonicalJson } from "../canonical/canonical-json.ts";
import { normalizeSourceArtifactRefs } from "../canonical/source-refs.ts";
import type { WorkPacket } from "../schemas/artifacts.ts";
import { WorkPacketSchema } from "../schemas/artifacts.ts";
import type { Diagnostic, SourceArtifactRef } from "../schemas/embedded.ts";
import { diagnostic, storeForContext } from "../actions/config.ts";
import type { ActionExecutionContext } from "../actions/context.ts";
import { sourceArtifactRefsForAcs } from "./source-evidence.ts";
import { acContentHash } from "./ac-snapshots.ts";

function withoutWorkPacketRefs(refs: readonly SourceArtifactRef[]): SourceArtifactRef[] {
  return normalizeSourceArtifactRefs(refs).filter((ref) => ref.artifact_type !== "work_packet");
}

function sourceRefsEqualIgnoringWorkPacket(a: readonly SourceArtifactRef[], b: readonly SourceArtifactRef[]): boolean {
  return canonicalJson(withoutWorkPacketRefs(a)) === canonicalJson(withoutWorkPacketRefs(b));
}

export async function acApprovalFreshnessDiagnostics(work: WorkPacket, context: ActionExecutionContext = {}): Promise<Diagnostic[]> {
  const approval = work.lifecycle.ac_approval;
  if (approval === null) return [];

  const diagnostics: Diagnostic[] = [];
  if (approval.approved_content_hash !== null) {
    // References-by-hash (Part B): compare the current ACs' revision-independent content hash to the approved
    // one. No revision read — the approved work-packet revision need not be retained.
    if (acContentHash(work.acceptance_criteria) !== approval.approved_content_hash) {
      diagnostics.push(diagnostic("AC_APPROVAL_STALE", "Current acceptance_criteria differ from the content approved by the AC approval decision.", "error", "/lifecycle/ac_approval"));
    }
  } else if (approval.target_artifact_revision === null) {
    diagnostics.push(diagnostic("AC_APPROVAL_TARGET_REVISION_MISSING", "AC approval decision does not record the post-approval WorkPacket revision needed for freshness validation.", "error", "/lifecycle/ac_approval/target_artifact_revision"));
  } else {
    // Legacy fallback for decisions recorded before approved_content_hash existed: re-read the approved revision.
    try {
      const approvedRevision = await storeForContext(context).readRevision<WorkPacket>("work_packet", work.id, approval.target_artifact_revision);
      const approvedWork = WorkPacketSchema.parse(approvedRevision.governed_projection);
      if (canonicalJson(approvedWork.acceptance_criteria) !== canonicalJson(work.acceptance_criteria)) {
        diagnostics.push(diagnostic("AC_APPROVAL_STALE", "Current acceptance_criteria differ from the WorkPacket revision approved by the AC approval decision.", "error", "/lifecycle/ac_approval"));
      }
    } catch (error) {
      diagnostics.push(diagnostic("AC_APPROVAL_REVISION_UNRESOLVED", error instanceof Error ? error.message : String(error), "error", "/lifecycle/ac_approval/target_artifact_revision"));
    }
  }

  const currentSourceRefs = sourceArtifactRefsForAcs(work.acceptance_criteria);
  if (!sourceRefsEqualIgnoringWorkPacket(currentSourceRefs, approval.source_artifact_refs)) {
    diagnostics.push(diagnostic("AC_APPROVAL_SOURCE_REFS_STALE", "Current AC source artifact refs differ from the stored AC approval decision.", "error", "/lifecycle/ac_approval/source_artifact_refs"));
  }

  return diagnostics;
}
