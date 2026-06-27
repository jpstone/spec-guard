import { WorkPacketSchema, type WorkPacket } from "../schemas/artifacts.ts";
import { buildDefaultWorkPacket } from "../work/defaults.ts";
import { SpecSchema, AggregateWorkPacketSchema, type AggregateWorkPacket, type Spec } from "../schemas/work-packet.ts";

/**
 * v1<->v2 mapping (pure, internal). Synthesizes a v1-shaped WorkPacket from a v2 Spec + its container — used by
 * the v2 approval projection / migration / viewer to REUSE the v1 governance machinery, NOT to back the action
 * seam (the actions migrate to v2 directly; emulating v1 for them would reproduce the two-stage approval +
 * separate-children complexity v2 dissolves).
 *
 * The Spec carries its own leaf content; the overall intent + the structural decisions are INHERITED from the
 * container; the v1-only plumbing (revision / lifecycle / parent_plan_id / decomposed / work_breakdown_ref / …)
 * is filled with inert defaults via buildDefaultWorkPacket, because every consumer reads only the approval-bound
 * content off this view — never the v1 lineage.
 */
export function specAsV1WorkPacket(aggregate: AggregateWorkPacket, spec: Spec): WorkPacket {
  return WorkPacketSchema.parse({
    ...buildDefaultWorkPacket({
      id: spec.id,
      title: spec.title,
      goal: aggregate.intent.goal,
      classification: spec.classification,
      origination: spec.origination,
      acceptance_criteria: spec.acceptance_criteria,
      allowed_globs: spec.scope.allowed_globs
    }),
    // The Spec's own approved content:
    intent: aggregate.intent, // overall intent inherited from the container
    docs: spec.docs,
    scope: spec.scope,
    platform: aggregate.platform, // structural decisions inherited from the container
    architecture: aggregate.architecture,
    stack: aggregate.stack,
    runtime_baseline_ref: aggregate.runtime_baseline_ref,
    mockup_decision: spec.mockup_decision,
    work_kind_resolution: spec.work_kind_resolution,
    work_kind_resolution_hash: spec.work_kind_resolution_hash,
    implementation_plan: spec.implementation_plan,
    implementation_plan_hash: spec.implementation_plan_hash,
    evidence_policy_resolution: spec.evidence_policy_resolution,
    evidence_policy_resolution_hash: spec.evidence_policy_resolution_hash,
    change_baseline: spec.change_baseline,
    workflow_state: spec.workflow_state,
    implementation_attempts: spec.implementation_attempts,
    review_cycles: spec.review_cycles,
    focused_fix_instructions: spec.focused_fix_instructions,
    spec_review_cycles: spec.spec_review_cycles,
    spec_author_agent_instance_id: spec.spec_author_agent_instance_id,
    diagnostics: spec.diagnostics
  });
}

/** Extract the Spec (leaf) view of a v1 WorkPacket: its homogeneous content + AGENT implementation lifecycle,
 *  dropping the container-level request/structural fields (intent / platform / architecture / stack / runtime
 *  baseline), which live on the aggregate container, and the v1-only lineage/decomposition plumbing. */
export function specFromWorkPacket(workPacket: WorkPacket): Spec {
  return SpecSchema.parse({
    id: workPacket.id,
    title: workPacket.title,
    classification: workPacket.classification,
    origination: workPacket.origination,
    acceptance_criteria: workPacket.acceptance_criteria,
    docs: workPacket.docs,
    scope: workPacket.scope,
    mockup_decision: workPacket.mockup_decision,
    work_kind_resolution: workPacket.work_kind_resolution,
    work_kind_resolution_hash: workPacket.work_kind_resolution_hash,
    implementation_plan: workPacket.implementation_plan,
    implementation_plan_hash: workPacket.implementation_plan_hash,
    evidence_policy_resolution: workPacket.evidence_policy_resolution,
    evidence_policy_resolution_hash: workPacket.evidence_policy_resolution_hash,
    change_baseline: workPacket.change_baseline,
    workflow_state: workPacket.workflow_state,
    implementation_attempts: workPacket.implementation_attempts,
    review_cycles: workPacket.review_cycles,
    focused_fix_instructions: workPacket.focused_fix_instructions,
    spec_review_cycles: workPacket.spec_review_cycles,
    spec_author_agent_instance_id: workPacket.spec_author_agent_instance_id,
    diagnostics: workPacket.diagnostics
  });
}

/**
 * Fold a v1 work tree into ONE v2 aggregate (the migration direction; counterpart to specAsV1WorkPacket). An
 * undecomposed WorkPacket (no children) becomes its OWN single Spec; a decomposed parent + its children becomes
 * the container (from the parent) + a Spec per child (the parent does no work itself).
 *
 * Lifecycle maps from the container/parent to the three whole-WP gates (§3): the v1 `packet_approval` becomes the
 * one v2 `approval` (collapsing today's separate `ac_approval`), `authorization` carries over, and `completion`
 * starts null (v1 had no completion gate — it tracked completion via `workflow_state`).
 *
 * MIGRATION LOSSES for a DECOMPOSED tree (the design's global-re-approval/-authorization fallback, §7, covers
 * these — a non-pristine tree is re-gated, not silently trusted):
 *  - The children's own v1 approval stamps collapse into the single whole-WP `approval`.
 *  - AUTHORIZATION is taken from the PARENT, which is "never directly authorized" (its `authorization` is null) —
 *    so a tree whose CHILDREN were authorized migrates UN-authorized and needs re-authorization, not just
 *    re-approval.
 *  - Per-child `disposition` (active/blocked/deferred/archived) is NOT preserved — disposition is a whole-WP
 *    container field in v2 (the Work Packet, not the Spec, is the operational unit); a per-child archived/deferred
 *    state is dropped.
 */
export function foldIntoAggregate(workPacket: WorkPacket, children: WorkPacket[] = []): AggregateWorkPacket {
  const specs = children.length === 0 ? [specFromWorkPacket(workPacket)] : children.map(specFromWorkPacket);
  return AggregateWorkPacketSchema.parse({
    artifact_type: "work_packet",
    schema_version: 2,
    id: workPacket.id,
    revision: workPacket.revision,
    created_at: workPacket.created_at,
    updated_at: workPacket.updated_at,
    disposition: workPacket.disposition,
    title: workPacket.title,
    intent: workPacket.intent,
    platform: workPacket.platform,
    architecture: workPacket.architecture,
    stack: workPacket.stack,
    runtime_baseline_ref: workPacket.runtime_baseline_ref,
    decision_history: workPacket.decision_history,
    diagnostics: workPacket.diagnostics,
    lifecycle: {
      approval: workPacket.lifecycle.packet_approval,
      authorization: workPacket.lifecycle.authorization,
      completion: null,
      history: workPacket.lifecycle.history
    },
    specs
  });
}
