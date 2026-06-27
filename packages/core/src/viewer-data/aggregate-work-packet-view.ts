import { AggregateWorkPacketStore } from "../storage/aggregate-work-packet-store.ts";
import { specAsV1WorkPacket } from "../storage/aggregate-mapping.ts";
import type { WorkPacket } from "../schemas/artifacts.ts";
import type { AggregateWorkPacket } from "../schemas/work-packet.ts";
import type { ArtifactListEntry } from "../storage/artifact-store.ts";

// The work flow writes ONE aggregate document per Work Packet (`<root>/packets/<id>.json`), but the viewer's
// render model (CommittableSpec / workLifecycleStage / the dashboard) is written against the v1 WorkPacket shape.
// This module PROJECTS an aggregate onto that shape so every viewer surface sees v2 packets — without rewriting
// the render layer. It is a display projection (cast, not re-parsed): it deliberately carries cross-Spec content
// (every Spec's delivery merged) that a single v1 packet never would.

/** A single representative v1 workflow_state for the whole aggregate — the viewer's stage label reads this. */
function aggregateDisplayWorkflowState(aggregate: AggregateWorkPacket): WorkPacket["workflow_state"] {
  if (aggregate.lifecycle.completion !== null || aggregate.specs.every((spec) => spec.workflow_state === "complete")) return "complete";
  if (aggregate.lifecycle.approval === null) return "packet_draft";
  if (aggregate.lifecycle.authorization === null) return "packet_approved";
  // Authorized + working: surface the least-advanced Spec's state (the bottleneck) so it reads "authorized"
  // fresh, "in_progress" while Specs move, and never "complete" until every Spec is.
  return (aggregate.specs.find((spec) => spec.workflow_state !== "complete") ?? aggregate.specs[0]!).workflow_state;
}

/** Project an aggregate Work Packet onto the v1 WorkPacket shape the viewer renders. The container fields + the
 *  WHOLE-WP lifecycle (approval→packet_approval, authorization) ride on it, and every Spec's delivery is merged so
 *  the detail page shows all the work. */
export function aggregateAsV1WorkPacket(aggregate: AggregateWorkPacket): WorkPacket {
  const base = specAsV1WorkPacket(aggregate, aggregate.specs[0]!);
  return {
    ...base,
    // The whole-WP projection must carry the WORK PACKET's own id/title — `base` is synthesized from specs[0],
    // whose id/title differ from the container's once decomposed. Without this, every self-link on the WP page
    // (Spec links, raw JSON) points at specs[0].id instead of the Work Packet, 404ing the Spec pages.
    id: aggregate.id,
    title: aggregate.title,
    revision: aggregate.revision,
    created_at: aggregate.created_at,
    updated_at: aggregate.updated_at,
    disposition: aggregate.disposition,
    decision_history: aggregate.decision_history,
    // a multi-Spec Work Packet IS a decomposed packet — surface that so the dashboard/list label it.
    decomposed: aggregate.specs.length > 1,
    workflow_state: aggregateDisplayWorkflowState(aggregate),
    implementation_attempts: aggregate.specs.flatMap((spec) => spec.implementation_attempts),
    review_cycles: aggregate.specs.flatMap((spec) => spec.review_cycles),
    focused_fix_instructions: aggregate.specs.flatMap((spec) => spec.focused_fix_instructions),
    spec_review_cycles: aggregate.spec_review_cycles, // the WHOLE-WP review lives on the container (one for all Specs)
    lifecycle: { ...base.lifecycle, ac_approval: aggregate.lifecycle.approval, packet_approval: aggregate.lifecycle.approval, authorization: aggregate.lifecycle.authorization, history: aggregate.lifecycle.history }
  } as WorkPacket;
}

/** Per-Spec summary for the detail page, so a decomposed Work Packet shows its Specs with attribution (the
 *  CommittableSpec's merged delivery is the WP-wide view; this restores the per-Spec breakdown). */
export interface SpecSummary {
  id: string;
  title: string;
  classification: string;
  workflow_state: string;
  attempts: number;
  reviews: number;
  spec_review_verdict: string | null;
}

export function aggregateSpecSummaries(aggregate: AggregateWorkPacket): SpecSummary[] {
  return aggregate.specs.map((spec) => ({
    id: spec.id,
    title: spec.title,
    classification: spec.classification,
    workflow_state: spec.workflow_state,
    attempts: spec.implementation_attempts.length,
    reviews: spec.review_cycles.length,
    // Pre-approval review verdict: the Spec's own per-Spec review if it has one, else the whole-WP coherence review.
    spec_review_verdict: spec.spec_review_cycles.at(-1)?.verdict ?? aggregate.spec_review_cycles.at(-1)?.verdict ?? null
  }));
}

/** Read one aggregate Work Packet and project it (both the raw aggregate and the v1 view); null if not found. */
export async function readAggregateForView(root: string, id: string): Promise<{ aggregate: AggregateWorkPacket; work: WorkPacket } | null> {
  const aggregate = await new AggregateWorkPacketStore(root).tryRead(id);
  return aggregate === null ? null : { aggregate, work: aggregateAsV1WorkPacket(aggregate) };
}

/** Every aggregate Work Packet projected to a `work_packet` ArtifactListEntry, so the dashboard + list see them. */
export async function listAggregateWorkPacketEntries(root: string): Promise<ArtifactListEntry[]> {
  const store = new AggregateWorkPacketStore(root);
  const entries: ArtifactListEntry[] = [];
  for (const id of await store.list()) {
    const aggregate = await store.tryRead(id);
    if (aggregate === null) continue;
    entries.push({ artifact: aggregateAsV1WorkPacket(aggregate), governed_content_hash: "", revision: aggregate.revision, artifact_type: "work_packet", id: aggregate.id });
  }
  return entries;
}
