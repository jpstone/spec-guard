import { buildDefaultWorkPacket, WorkPacketSchema, AggregateWorkPacketSchema, buildStandardImplementationPlanProjectionV1, implementationPlanHash, buildApprovedWorkPacketProjectionV1, type AcceptanceCriterion, type AggregateWorkPacket } from "../../src/index.ts";

// Shared v2-aggregate test fixture: a valid AggregateWorkPacket assembled from fully-defaulted v1 leaves (whose
// field defs the v2 schemas reuse), so the container/Spec subsets of a valid leaf are valid v2 inputs.
const AC: AcceptanceCriterion = { id: "ac1", text: "do x", source: "human", source_evidence: null, bootstrap: true };
const PLAN = buildStandardImplementationPlanProjectionV1({ identity_binding_policy: "content_only", template_id: "t", template_version: 1, source_refs: [], summary: "plan", approach: ["build it"], expected_files: [{ path: "src/index.ts", purpose: "impl", change_type: "create" }], tests: [], risks: [], out_of_scope_reminders: [], approval_bound_producer_ref: null });
// A fully-ready leaf: defaults + a baked implementation plan (the v2 approval gate requires one per Spec), with
// the work-kind/evidence-policy resolutions recomputed from the plan so the approval projection stays consistent.
const fullLeaf = (id: string, classification: string): Record<string, unknown> => {
  const base = WorkPacketSchema.parse(buildDefaultWorkPacket({ id, title: id, goal: "g", classification: classification as never, desired_outcomes: ["delivered"], in_scope: ["the feature"], out_of_scope: ["unrelated work"], users_actors: ["end user"], edge_cases: ["empty input"], open_questions: ["none"], acceptance_criteria: [AC], allowed_globs: ["src/**"] }));
  const withPlan = WorkPacketSchema.parse({ ...base, implementation_plan: PLAN, implementation_plan_hash: implementationPlanHash(PLAN) });
  const proj = buildApprovedWorkPacketProjectionV1(withPlan).projection;
  return WorkPacketSchema.parse({ ...withPlan, work_kind_resolution: proj.work_kind_resolution, work_kind_resolution_hash: proj.work_kind_resolution_hash, evidence_policy_resolution: proj.evidence_policy_resolution, evidence_policy_resolution_hash: proj.evidence_policy_resolution_hash }) as unknown as Record<string, unknown>;
};
const pick = (o: Record<string, unknown>, keys: string[]): Record<string, unknown> => Object.fromEntries(keys.map((k) => [k, o[k]]));

export const SPEC_KEYS = ["id", "title", "classification", "origination", "acceptance_criteria", "docs", "scope", "mockup_decision", "work_kind_resolution", "work_kind_resolution_hash", "implementation_plan", "implementation_plan_hash", "evidence_policy_resolution", "evidence_policy_resolution_hash", "change_baseline", "workflow_state", "implementation_attempts", "review_cycles", "focused_fix_instructions", "spec_review_cycles", "spec_author_agent_instance_id", "diagnostics"];
export const CONTAINER_KEYS = ["id", "revision", "created_at", "updated_at", "disposition", "title", "intent", "platform", "architecture", "stack", "runtime_baseline_ref", "decision_history", "diagnostics"];

export const specInput = (id: string, classification: string): Record<string, unknown> => pick(fullLeaf(id, classification), SPEC_KEYS);

/** A valid AggregateWorkPacket with one Spec per classification (default: a single `reusable_api` Spec). */
export const buildAggregate = (id: string, classifications: string[] = ["reusable_api"]): AggregateWorkPacket =>
  AggregateWorkPacketSchema.parse({
    ...pick(fullLeaf(id, classifications[0] ?? "reusable_api"), CONTAINER_KEYS),
    artifact_type: "work_packet",
    schema_version: 2,
    lifecycle: { approval: null, authorization: null, completion: null, history: [] },
    specs: classifications.map((c, i) => specInput(`${id}-s${i + 1}`, c))
  });
