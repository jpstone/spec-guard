import { ArtifactStore, type ArtifactListEntry } from "../storage/artifact-store.ts";
import { TopLevelArtifactSchema, WorkPacketSchema, type TopLevelArtifact } from "../schemas/artifacts.ts";
import { isPendingHumanGate, pendingActionForArtifact } from "./dashboard-summary.ts";
import { workLifecycleStage } from "../work/readiness.ts";
import { listAggregateWorkPacketEntries } from "./aggregate-work-packet-view.ts";

export interface ArtifactListFilter {
  type?: string;
  status?: string;
  lifecycle?: string;
  pending?: boolean;
  blocked?: boolean;
  validation_failures?: boolean;
}

export interface ArtifactListRow {
  id: string | null;
  display_id: string;
  display_label: string; // the human title (work packet) if present, else the id — what the link text should render
  artifact_type: string;
  status: string | null;
  lifecycle: string | null;
  pending_action: string | null;
  updated_at: string | null;
  revision: number | null;
  validation_failure_count: number;
  detail_path: string;
  // Always-plan: lets the dashboard render packet-centric. `decomposed` flags a decomposed parent
  // WorkPacket; `breakdown_of` is the source WorkPacket a Plan (Work Breakdown) decomposes (so the Plan
  // can be nested under its packet). (ALWAYS_PLAN_DESIGN.md.)
  decomposed: boolean;
  breakdown_of: string | null;
}

export interface ArtifactListResult {
  filter: ArtifactListFilter;
  total: number;
  rows: ArtifactListRow[];
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

function updatedAtOf(artifact: unknown): string | null {
  if (artifact !== null && typeof artifact === "object" && "updated_at" in artifact) {
    const updatedAt = (artifact as { updated_at?: unknown }).updated_at;
    return typeof updatedAt === "string" ? updatedAt : null;
  }
  return null;
}

function revisionOf(entry: ArtifactListEntry, artifact: unknown): number | null {
  if (artifact !== null && typeof artifact === "object" && "revision" in artifact) {
    const revision = (artifact as { revision?: unknown }).revision;
    return typeof revision === "number" ? revision : entry.revision;
  }
  return entry.revision ?? null;
}

function validationFailureCount(artifact: unknown): number {
  if (artifact !== null && typeof artifact === "object" && Array.isArray((artifact as { diagnostics?: unknown }).diagnostics)) {
    return ((artifact as { diagnostics: Array<{ severity?: unknown }> }).diagnostics).filter((diag) => diag.severity === "error").length;
  }
  return 0;
}

function detailPath(artifactType: string, id: string | null): string {
  return `/artifacts/${encodeURIComponent(artifactType)}/${encodeURIComponent(id ?? "__singleton__")}`;
}

// The human title, if the artifact carries one (work packets do) — used as the clickable link text so the list shows
// "Todo App", not "work:6d38b61d-…". Falls back to the id for artifacts without a title.
function titleOf(artifact: unknown): string | null {
  if (artifact !== null && typeof artifact === "object" && typeof (artifact as { title?: unknown }).title === "string") {
    const title = (artifact as { title: string }).title;
    return title.length > 0 ? title : null;
  }
  return null;
}

function decomposedOf(artifact: unknown): boolean {
  return artifact !== null && typeof artifact === "object" && (artifact as { artifact_type?: unknown }).artifact_type === "work_packet" && (artifact as { decomposed?: unknown }).decomposed === true;
}


function matchesFilter(entry: ArtifactListEntry, artifact: unknown, parsed: TopLevelArtifact | null, filter: ArtifactListFilter): boolean {
  const status = statusOf(artifact);
  if (filter.type !== undefined && entry.artifact_type !== filter.type) return false;
  if (filter.status !== undefined && status !== filter.status) return false;
  if (filter.lifecycle !== undefined && status !== filter.lifecycle) return false;
  if (filter.pending === true && !isPendingHumanGate(entry.artifact_type, artifact)) return false;
  if (filter.blocked === true && !(entry.artifact_type === "work_packet" && status === "blocked")) return false;
  if (filter.validation_failures === true && validationFailureCount(artifact) === 0) return false;
  return true;
}

export function filterFromSearchParams(params: URLSearchParams): ArtifactListFilter {
  const filter: ArtifactListFilter = {};
  const type = params.get("type");
  const status = params.get("status");
  const lifecycle = params.get("lifecycle");
  if (type !== null && type.length > 0) filter.type = type;
  if (status !== null && status.length > 0) filter.status = status;
  if (lifecycle !== null && lifecycle.length > 0) filter.lifecycle = lifecycle;
  if (params.get("pending") === "1") filter.pending = true;
  if (params.get("blocked") === "1") filter.blocked = true;
  if (params.get("validation_failures") === "1") filter.validation_failures = true;
  return filter;
}

export async function buildArtifactList(store: ArtifactStore, filter: ArtifactListFilter = {}): Promise<ArtifactListResult> {
  // Work Packets come from the aggregate store (`packets/`), every other artifact from the v1 ArtifactStore.
  const entries = [...(await store.listCurrent()).filter((entry) => entry.artifact_type !== "work_packet"), ...await listAggregateWorkPacketEntries(store.root)];
  const rows: ArtifactListRow[] = [];
  for (const entry of entries) {
    const parsedResult = TopLevelArtifactSchema.safeParse(entry.artifact);
    const parsed = parsedResult.success ? parsedResult.data : null;
    const artifact = parsed ?? entry.artifact;
    if (!matchesFilter(entry, artifact, parsed, filter)) continue;
    const status = statusOf(artifact);
    rows.push({
      id: entry.id,
      display_id: entry.id ?? "singleton",
      display_label: titleOf(artifact) ?? entry.id ?? "singleton",
      artifact_type: entry.artifact_type,
      status,
      lifecycle: status,
      pending_action: pendingActionForArtifact(entry.artifact_type, artifact),
      updated_at: updatedAtOf(artifact),
      revision: revisionOf(entry, artifact),
      validation_failure_count: validationFailureCount(artifact),
      detail_path: detailPath(entry.artifact_type, entry.id),
      decomposed: decomposedOf(artifact),
      breakdown_of: null
    });
  }
  return { filter, total: rows.length, rows };
}

