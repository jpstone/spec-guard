import { ArtifactStore, buildArtifactDetail, buildArtifactList, buildDashboardSummary, buildWorkPacketSpecView, buildSpecDetailView, buildContractsOverview, buildContractVersionView, filterFromSearchParams, rawWorkPacketJson } from "@spec-guard/core";
import { renderArtifactDetail, renderArtifactList, renderDashboard, renderNotFound, renderRawJson, renderWorkPacketSpec, renderSpecDetail, renderContract } from "./render.ts";

export interface ViewerRouteContext {
  store: ArtifactStore;
}

export interface ViewerResponse {
  status: number;
  contentType: string;
  body: string;
}

function html(status: number, body: string): ViewerResponse {
  return { status, contentType: "text/html; charset=utf-8", body };
}

export async function renderRoute(requestUrl: string, context: ViewerRouteContext): Promise<ViewerResponse> {
  const url = new URL(requestUrl, "http://viewer.local");
  if (url.pathname === "/" || url.pathname === "/dashboard") {
    return html(200, renderDashboard(await buildDashboardSummary(context.store), await buildContractsOverview(context.store.root)));
  }
  if (url.pathname === "/artifacts") {
    return html(200, renderArtifactList(await buildArtifactList(context.store, filterFromSearchParams(url.searchParams))));
  }
  // A single frozen contract version, rendered clean — linked from the WP/Spec contract sections + the dashboard.
  const contractMatch = /^\/contracts\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if (contractMatch !== null) {
    const id = decodeURIComponent(contractMatch[1] ?? "");
    const hash = decodeURIComponent(contractMatch[2] ?? "");
    const view = await buildContractVersionView(context.store.root, id, hash);
    return view === null ? html(404, renderNotFound(`No contract ${id}@${hash} in the registry`)) : html(200, renderContract(view));
  }
  // Raw full-artifact JSON, opened in a new tab from the detail page (work packet, plan, …).
  const rawMatch = /^\/artifacts\/([^/]+)\/([^/]+)\/raw$/.exec(url.pathname);
  if (rawMatch !== null) {
    const artifactType = decodeURIComponent(rawMatch[1] ?? "");
    const id = decodeURIComponent(rawMatch[2] ?? "");
    try {
      if (artifactType === "work_packet") return html(200, renderRawJson(`WorkPacket ${id} — raw`, await rawWorkPacketJson(context.store, id)));
      const detail = await buildArtifactDetail(context.store, artifactType, id === "__singleton__" ? null : id);
      return html(200, renderRawJson(`${artifactType} ${id} — raw`, JSON.stringify(detail.artifact, null, 2)));
    } catch (error) {
      return html(404, renderNotFound(error instanceof Error ? error.message : String(error)));
    }
  }
  // A single embedded Spec's own page (its ACs / implementation plan / scope / review / delivery).
  const specMatch = /^\/artifacts\/work_packet\/([^/]+)\/spec\/([^/]+)$/.exec(url.pathname);
  if (specMatch !== null) {
    const wpId = decodeURIComponent(specMatch[1] ?? "");
    const specId = decodeURIComponent(specMatch[2] ?? "");
    const view = await buildSpecDetailView(context.store, wpId, specId);
    return view === null ? html(404, renderNotFound(`No Spec ${specId} in Work Packet ${wpId}`)) : html(200, renderSpecDetail(view));
  }
  const detailMatch = /^\/artifacts\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if (detailMatch !== null) {
    const artifactType = decodeURIComponent(detailMatch[1] ?? "");
    const rawId = decodeURIComponent(detailMatch[2] ?? "");
    const id = rawId === "__singleton__" ? null : rawId;
    try {
      // Work packets render from the CommittableSpec model (clone-consistent + clean); other types unchanged.
      if (artifactType === "work_packet" && id !== null) {
        return html(200, renderWorkPacketSpec(await buildWorkPacketSpecView(context.store, id)));
      }
      return html(200, renderArtifactDetail(await buildArtifactDetail(context.store, artifactType, id)));
    } catch (error) {
      return html(404, renderNotFound(error instanceof Error ? error.message : String(error)));
    }
  }
  return html(404, renderNotFound(`No viewer route matches ${url.pathname}`));
}
