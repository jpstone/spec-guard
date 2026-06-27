import { ArtifactStore } from "../storage/artifact-store.ts";
import { TopLevelArtifactSchema, WorkPacketSchema, type TopLevelArtifact } from "../schemas/artifacts.ts";
import { pendingActionForArtifact } from "./dashboard-summary.ts";
import { workLifecycleStage } from "../work/readiness.ts";

export interface ArtifactDetailBase {
  artifact_type: string;
  id: string | null;
  governed_content_hash: string;
  revision: number;
  status: string | null;
  pending_action: string | null;
  artifact: TopLevelArtifact | unknown;
}

export type ArtifactDetailData = ArtifactDetailBase;

function statusOf(artifact: unknown): string | null {
  if (artifact !== null && typeof artifact === "object") {
    if ((artifact as { artifact_type?: unknown }).artifact_type === "work_packet") {
      const parsed = WorkPacketSchema.safeParse(artifact);
      return parsed.success ? workLifecycleStage(parsed.data) : null;
    }
    if ("status" in artifact) {
      const status = (artifact as { status?: unknown }).status;
      return typeof status === "string" ? status : null;
    }
  }
  return null;
}

function base(artifactType: string, id: string | null, stored: Awaited<ReturnType<ArtifactStore["readCurrent"]>>, artifact: unknown): ArtifactDetailBase {
  return {
    artifact_type: artifactType,
    id,
    governed_content_hash: stored.governed_content_hash,
    revision: stored.revision,
    status: statusOf(artifact),
    pending_action: pendingActionForArtifact(artifactType, artifact),
    artifact
  };
}

export async function buildArtifactDetail(store: ArtifactStore, artifactType: string, id: string | null): Promise<ArtifactDetailData> {
  const stored = await store.readCurrent(artifactType, id);
  const parsed = TopLevelArtifactSchema.safeParse(stored.artifact);
  const artifact = parsed.success ? parsed.data : stored.artifact;
  const detailBase = base(artifactType, id, stored, artifact);

  // Work packets render through buildWorkPacketSpecView -> renderWorkPacketSpec (the committable spec render
  // model — clone-consistent); buildArtifactDetail handles the other artifact types.
  return detailBase;
}
