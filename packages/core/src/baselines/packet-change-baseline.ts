import type { Config, WorkPacket } from "../schemas/artifacts.ts";
import { PacketChangeBaselineSchema, type HumanDecision, type PacketChangeBaseline } from "../schemas/embedded.ts";
import type { Diagnostic } from "../schemas/embedded.ts";
import { diagnostic, isoNow } from "../actions/config.ts";
import { governedProjection, compactStoredArtifact } from "../storage/projections.ts";
import { sha256HexCanonical } from "../canonical/hashes.ts";
import { locateGitRoot, captureGitBaseline } from "../paths/git.ts";
import { captureManifest } from "../paths/manifest.ts";
import type { ChangeBaselineCapturePlan, ExpectedFileCategoryPolicy } from "../schemas/snapshots.ts";

export async function selectPacketBaselineMode(projectRoot: string, config: Config): Promise<"vcs" | "manifest"> {
  if (config.change_baseline_policy.mode === "manifest") return "manifest";
  if (config.change_baseline_policy.mode === "vcs") {
    if ((await locateGitRoot(projectRoot)) === null) throw new Error("change_baseline_policy.mode is vcs but no Git repository exists at or above project root");
    return "vcs";
  }
  return (await locateGitRoot(projectRoot)) === null ? "manifest" : "vcs";
}

export async function buildCapturePlan(projectRoot: string, config: Config, work: WorkPacket): Promise<{ plan: ChangeBaselineCapturePlan | null; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  let mode: "vcs" | "manifest";
  try { mode = await selectPacketBaselineMode(projectRoot, config); } catch (error) {
    diagnostics.push(diagnostic("CHANGE_BASELINE_MODE_UNAVAILABLE", error instanceof Error ? error.message : String(error), "error", "/config/change_baseline_policy/mode"));
    return { plan: null, diagnostics };
  }
  return { plan: { mode, capture_action: "authorize", work_id: work.id, proposed_child_id: null, allowed_globs: work.scope.allowed_globs, ignored_paths: config.path_policy.ignored_paths, vcs_required: config.change_baseline_policy.mode === "vcs", manifest_includes: ["project_root"], dirty_state_policy: "block_unapproved_product_changes" }, diagnostics };
}

export function expectedFileCategoryPolicy(config: Config, allowedGlobs: string[]): ExpectedFileCategoryPolicy {
  return { path_policy_revision: config.revision, allowed_globs: allowedGlobs, ignored_paths: config.path_policy.ignored_paths, allowed_preimplementation_categories: ["docs", "tests", "spec_guard_artifact_evidence"], implementation_categories: ["implementation_source", "runtime_product_configuration"], unexpected_category: "other_unexpected" };
}

function projectionForArtifactHash(work: WorkPacket): unknown {
  // Hash the STORED (stripped) form so change_baseline.artifact_hash matches what the store writes to
  // current.json — otherwise stripping decision_history payloads at write would break self-verification.
  const projected = governedProjection(compactStoredArtifact(work)) as Record<string, unknown>;
  const cb = projected.change_baseline as Record<string, unknown> | null;
  if (cb !== null) projected.change_baseline = { ...cb, artifact_hash: null };
  return projected;
}

export function packetArtifactHashExcludingBaselineHash(work: WorkPacket): string {
  return sha256HexCanonical(projectionForArtifactHash(work));
}

export interface CapturePreparedBaselineInput { projectRoot: string; config: Config; work: WorkPacket; reviewSnapshotHash: string; authorizationDecision: HumanDecision }

export async function capturePacketChangeBaseline(input: CapturePreparedBaselineInput): Promise<{ baseline: PacketChangeBaseline | null; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  let mode: "vcs" | "manifest";
  try { mode = await selectPacketBaselineMode(input.projectRoot, input.config); } catch (error) {
    return { baseline: null, diagnostics: [diagnostic("CHANGE_BASELINE_CAPTURE_FAILED", error instanceof Error ? error.message : String(error), "error", "/change_baseline")] };
  }
  let vcs: PacketChangeBaseline["vcs"] = null;
  let manifest: PacketChangeBaseline["manifest"] = null;
  if (mode === "vcs") {
    try {
      const captured = await captureGitBaseline(input.projectRoot, input.config);
      vcs = captured.baseline;
      diagnostics.push(...captured.diagnostics);
    } catch (error) {
      diagnostics.push(diagnostic("CHANGE_BASELINE_GIT_CAPTURE_FAILED", error instanceof Error ? error.message : String(error), "error", "/change_baseline/vcs"));
    }
  } else {
    try { manifest = await captureManifest(input.projectRoot, input.config); } catch (error) {
      diagnostics.push(diagnostic("CHANGE_BASELINE_MANIFEST_CAPTURE_FAILED", error instanceof Error ? error.message : String(error), "error", "/change_baseline/manifest"));
    }
  }
  if (diagnostics.some((d) => d.severity === "error")) return { baseline: null, diagnostics };
  const nextRevision = input.work.revision + 1;
  const capturedAt = isoNow();
  const baselineWithoutHash = { mode, captured_at: capturedAt, work_id: input.work.id, artifact_revision: nextRevision, artifact_hash: "0".repeat(64), review_snapshot_hash: input.reviewSnapshotHash, allowed_globs: input.work.scope.allowed_globs, ignored_paths: input.config.path_policy.ignored_paths, vcs, manifest } satisfies PacketChangeBaseline;
  let projection: WorkPacket = { ...input.work, revision: nextRevision, workflow_state: "implementation_authorized", lifecycle: { ...input.work.lifecycle, authorization: input.authorizationDecision }, decision_history: [...input.work.decision_history, input.authorizationDecision], change_baseline: baselineWithoutHash, updated_at: capturedAt };
  const artifactHash = packetArtifactHashExcludingBaselineHash(projection);
  const baseline = PacketChangeBaselineSchema.parse({ ...baselineWithoutHash, artifact_hash: artifactHash });
  projection = { ...projection, change_baseline: baseline };
  const verify = packetArtifactHashExcludingBaselineHash(projection);
  if (verify !== artifactHash) return { baseline: null, diagnostics: [diagnostic("CHANGE_BASELINE_ARTIFACT_HASH_VERIFY_FAILED", "Prepared PacketChangeBaseline artifact_hash did not verify against post-authorization WorkPacket projection.", "error", "/change_baseline/artifact_hash")] };
  return { baseline, diagnostics: [] };
}

export function verifyStoredPacketChangeBaseline(work: WorkPacket): boolean {
  if (work.change_baseline === null) return false;
  return packetArtifactHashExcludingBaselineHash(work) === work.change_baseline.artifact_hash;
}
