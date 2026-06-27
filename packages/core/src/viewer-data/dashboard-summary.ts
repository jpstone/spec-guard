import { ArtifactStore } from "../storage/artifact-store.ts";
import { TopLevelArtifactSchema, WorkPacketSchema } from "../schemas/artifacts.ts";
import { workLifecycleStage } from "../work/readiness.ts";
import { listAggregateWorkPacketEntries } from "./aggregate-work-packet-view.ts";

export interface DashboardSummary {
  total_artifact_count: number;
  artifact_counts_by_type: Record<string, number>;
  artifact_counts_by_type_status: Record<string, Record<string, number>>;
  lifecycle_distribution: Record<string, number>;
  workflow_stage_distribution: Record<string, number>;
  pending_gates_count: number;
  pending_gates_by_action: Record<string, number>;
  blocked_packet_count: number;
  /** Last-seen runtime baseline status (back-compat; single-app repos have exactly one). */
  baseline_status: string | null;
  /** Per-target runtime baseline status, keyed by target_id — multi-app repos have one per app. */
  baseline_targets: Record<string, string>;
  validation_failures_count: number;
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

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

function countDiagnostics(artifact: unknown): number {
  if (artifact !== null && typeof artifact === "object" && Array.isArray((artifact as { diagnostics?: unknown }).diagnostics)) {
    return ((artifact as { diagnostics: Array<{ severity?: unknown }> }).diagnostics).filter((diag) => diag.severity === "error").length;
  }
  return 0;
}

export function pendingActionForArtifact(artifactType: string, artifact: unknown): string | null {
  const status = statusOf(artifact);
  if (artifactType === "work_packet") {
    if (status === "pending_ac_approval") return "work.spec.acs -> work.spec.plan -> work.review -> work.approve";
    if (status === "pending_packet_approval") return "work.review -> work.approve";
    if (status === "approved") return "work.authorize";
    if (status === "authorized") return "work.spec.record / work.spec.advance";
    if (status === "in_progress") return "work.spec.record / work.spec.advance";
    if (status === "blocked") return "Resolve blocker";
  }
  if (artifactType === "runtime_baseline") {
    if (status === "draft") return "baseline.review / baseline.accept";
    if (status === "blocked") return "Resolve baseline blocker";
  }
  return null;
}

export function isPendingHumanGate(artifactType: string, artifact: unknown): boolean {
  const status = statusOf(artifact);
  if (artifactType === "work_packet") return status === "pending_ac_approval" || status === "pending_packet_approval" || status === "approved";
  if (artifactType === "runtime_baseline") return status === "draft";
  return false;
}

export async function buildDashboardSummary(store: ArtifactStore): Promise<DashboardSummary> {
  // Work Packets live in the aggregate store (`packets/`); every other artifact in the v1 ArtifactStore. Merge
  // both so the dashboard counts each one (filter any stray v1 work_packet so packets are never double-counted).
  const entries = [...(await store.listCurrent()).filter((entry) => entry.artifact_type !== "work_packet"), ...await listAggregateWorkPacketEntries(store.root)];
  const summary: DashboardSummary = {
    total_artifact_count: entries.length,
    artifact_counts_by_type: {},
    artifact_counts_by_type_status: {},
    lifecycle_distribution: {},
    workflow_stage_distribution: {},
    pending_gates_count: 0,
    pending_gates_by_action: {},
    blocked_packet_count: 0,
    baseline_status: null,
    baseline_targets: {},
    validation_failures_count: 0
  };

  for (const entry of entries) {
    const parsed = TopLevelArtifactSchema.safeParse(entry.artifact);
    const artifact = parsed.success ? parsed.data : entry.artifact;
    const artifactType = entry.artifact_type;
    increment(summary.artifact_counts_by_type, artifactType);
    if (countDiagnostics(artifact) > 0) summary.validation_failures_count += 1;

    const status = statusOf(artifact);
    if (status !== null) {
      summary.artifact_counts_by_type_status[artifactType] ??= {};
      increment(summary.artifact_counts_by_type_status[artifactType], status);
      increment(summary.lifecycle_distribution, status);
      increment(summary.workflow_stage_distribution, status);
      if (isPendingHumanGate(artifactType, artifact)) {
        const pendingAction = pendingActionForArtifact(artifactType, artifact);
        summary.pending_gates_count += 1;
        increment(summary.pending_gates_by_action, pendingAction ?? status);
      }
      if (artifactType === "work_packet" && status === "blocked") summary.blocked_packet_count += 1;
      if (artifactType === "runtime_baseline") {
        summary.baseline_status = status;
        const targetId = (artifact as { id?: unknown }).id;
        if (typeof targetId === "string") summary.baseline_targets[targetId] = status;
      }
    }
  }

  return summary;
}
