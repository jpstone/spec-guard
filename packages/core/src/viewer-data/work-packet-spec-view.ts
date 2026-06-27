import { readFile } from "node:fs/promises";
import path from "node:path";
import { ArtifactStore } from "../storage/artifact-store.ts";
import { AggregateWorkPacketStore } from "../storage/aggregate-work-packet-store.ts";
import { buildCommittableSpec, resolveValidation, resolveStructuralDecisions, type CommittableSpec } from "../storage/spec-projection.ts";
import { readAggregateForView, aggregateSpecSummaries, type SpecSummary } from "./aggregate-work-packet-view.ts";
import { specAsV1WorkPacket } from "../storage/aggregate-mapping.ts";
import { ContractStore } from "../storage/contract-store.ts";
import type { WorkPacket } from "../schemas/artifacts.ts";
import type { ContractRef } from "../schemas/work-packet.ts";
import type { SpecReviewCycle } from "../lineage/records.ts";

// A contract a Spec PRODUCES (its frozen surface), for the viewer's created/updated sections.
export interface ContractView { id: string; content_hash: string; surface: unknown; spec_id: string; spec_title: string; }
// One pre-approval review's output, for the viewer's review sections (coherence on the WP, per-Spec on a Spec).
export interface ReviewView { id: string; scope: string; verdict: string | null; summary: string; reviewer: string; reviewed_at: string | null; blockers: { title: string; detail: string }[]; }

// Resolve each producing Spec's contract and split into CREATED vs UPDATED by WHO authored the contract's GENESIS:
// `workId` created it iff this Work Packet froze the first version (so a WP that creates a contract and then revises
// its surface still reads "created", not "updated"). Read from recorded provenance, never guessed from version counts.
async function producedContractViews(root: string, workId: string, specs: { id: string; title: string; contract: ContractRef | null }[]): Promise<{ created: ContractView[]; updated: ContractView[] }> {
  const store = new ContractStore(root);
  const created: ContractView[] = [];
  const updated: ContractView[] = [];
  for (const spec of specs) {
    if (spec.contract === null) continue;
    const artifact = await store.getVersion(spec.contract);
    if (artifact === null) continue;
    const view: ContractView = { id: spec.contract.id, content_hash: spec.contract.content_hash, surface: artifact.surface, spec_id: spec.id, spec_title: spec.title };
    const genesis = await store.genesisProducer(spec.contract.id);
    (genesis?.work_id === workId ? created : updated).push(view);
  }
  return { created, updated };
}

function toReviewViews(cycles: SpecReviewCycle[]): ReviewView[] {
  return cycles.map((cycle) => ({
    id: cycle.id, scope: cycle.review_scope, verdict: cycle.verdict, summary: cycle.summary, reviewed_at: cycle.reviewed_at,
    reviewer: `${cycle.producer.role}${cycle.producer.agent_instance_id ? ` (${cycle.producer.agent_instance_id})` : ""}`,
    blockers: cycle.blockers.map((blocker) => ({ title: blocker.title, detail: blocker.detail }))
  }));
}

// The viewer renders a work packet from its CommittableSpec (the committed render model), so the page is
// CONSISTENT across clones: in the working repo we build the spec from the live artifact (most current,
// in-progress detail); in a fresh clone (where the artifact is gitignored) we read the committed spec/ file.
// For a finished packet the two are identical — the projection is deterministic — so the rendered page matches.
export interface WorkPacketSpecView {
  id: string;
  spec: CommittableSpec;
  // The Work Packet's embedded Specs (the breakdown). One entry for an undecomposed WP; N for a decomposed one.
  specs: SpecSummary[];
  // Contracts this Work Packet produced (across all its Specs), split by provenance, + the whole-WP coherence reviews.
  contracts_created: ContractView[];
  contracts_updated: ContractView[];
  coherence_reviews: ReviewView[];
  source: "live" | "projection";
}

function specPath(store: ArtifactStore, id: string): string {
  return path.join(store.root, "spec", `${encodeURIComponent(id)}.json`);
}

export async function buildWorkPacketSpecView(store: ArtifactStore, id: string): Promise<WorkPacketSpecView> {
  const aggregate = await readAggregateForView(store.root, id);
  if (aggregate !== null) {
    const validation = await resolveValidation(store.root, id);
    const structural = await resolveStructuralDecisions(store.root, aggregate.work);
    const contracts = await producedContractViews(store.root, id, aggregate.aggregate.specs);
    return { id, spec: buildCommittableSpec(aggregate.work, validation, structural), specs: aggregateSpecSummaries(aggregate.aggregate), contracts_created: contracts.created, contracts_updated: contracts.updated, coherence_reviews: toReviewViews(aggregate.aggregate.spec_review_cycles), source: "live" };
  }
  // No live aggregate (e.g. a fresh clone) — render the committed projection. Default newer fields so a
  // projection committed before they existed (e.g. spec_review) still renders.
  const parsed = JSON.parse(await readFile(specPath(store, id), "utf8")) as CommittableSpec;
  const spec: CommittableSpec = { ...parsed, spec_review: parsed.spec_review ?? { reviewed: false, verdict: null, summary: "", independence: "unverified", blockers: [] }, work_breakdown_ref: parsed.work_breakdown_ref ?? null, structural_decisions: parsed.structural_decisions ?? [] };
  return { id, spec, specs: [], contracts_created: [], contracts_updated: [], coherence_reviews: [], source: "projection" };
}

export interface SpecDetailView {
  work_id: string;
  work_title: string; // the parent Work Packet's human title (for the back-link, so it isn't the cryptic id)
  spec_id: string;
  spec: CommittableSpec;
  // Contracts THIS Spec produced (split by provenance) + this Spec's own pre-approval reviews.
  contracts_created: ContractView[];
  contracts_updated: ContractView[];
  spec_reviews: ReviewView[];
  source: "live" | "projection";
}

/** Build ONE embedded Spec's detail view — its OWN ACs / implementation plan / scope / spec review / delivery —
 *  with the whole-WP lifecycle stamped on so the proof-of-approval shows. null if the WP or Spec isn't found. */
export async function buildSpecDetailView(store: ArtifactStore, workId: string, specId: string): Promise<SpecDetailView | null> {
  const aggregate = await new AggregateWorkPacketStore(store.root).tryRead(workId);
  if (aggregate === null) return null;
  const spec = aggregate.specs.find((candidate) => candidate.id === specId);
  if (spec === undefined) return null;
  const base = specAsV1WorkPacket(aggregate, spec);
  // Pre-approval reviews shown on the Spec page: the whole-WP coherence review(s) on the container PLUS this Spec's
  // own per-Spec review(s) — the Spec's own review is last so it's the one summarized as "latest". Plus the lifecycle.
  const specWork = { ...base, spec_review_cycles: [...aggregate.spec_review_cycles, ...spec.spec_review_cycles], lifecycle: { ...base.lifecycle, ac_approval: aggregate.lifecycle.approval, packet_approval: aggregate.lifecycle.approval, authorization: aggregate.lifecycle.authorization, history: aggregate.lifecycle.history } } as WorkPacket;
  const validation = await resolveValidation(store.root, specId);
  const structural = await resolveStructuralDecisions(store.root, specWork);
  const contracts = await producedContractViews(store.root, workId, [{ id: spec.id, title: spec.title, contract: spec.contract }]);
  return { work_id: workId, work_title: aggregate.title, spec_id: specId, spec: buildCommittableSpec(specWork, validation, structural, { dependencies: spec.dependencies, contract: spec.contract }), contracts_created: contracts.created, contracts_updated: contracts.updated, spec_reviews: toReviewViews(spec.spec_review_cycles), source: "live" };
}

/** The full raw packet JSON (formatted), for the "View raw JSON" tab. Falls back to the committed spec in a clone. */
export async function rawWorkPacketJson(store: ArtifactStore, id: string): Promise<string> {
  const aggregate = await new AggregateWorkPacketStore(store.root).tryRead(id);
  if (aggregate !== null) return JSON.stringify(aggregate, null, 2);
  return readFile(specPath(store, id), "utf8");
}
