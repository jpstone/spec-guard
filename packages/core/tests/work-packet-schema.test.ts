import { describe, it, expect } from "vitest";
import { buildDefaultWorkPacket, WorkPacketSchema, type AcceptanceCriterion } from "../src/index.ts";
import { SpecSchema, AggregateLifecycleSchema, AggregateWorkPacketSchema } from "../src/schemas/work-packet.ts";

const AC: AcceptanceCriterion = { id: "ac1", text: "do x", source: "human", source_evidence: null };

// A fully-defaulted v1 leaf is the source of valid field values; the v2 schemas reuse the same field defs, so
// the container/Spec subsets of a valid leaf are valid v2 inputs.
const fullLeaf = (id: string, classification: string): Record<string, unknown> =>
  WorkPacketSchema.parse(buildDefaultWorkPacket({ id, title: id, goal: "g", classification: classification as never, acceptance_criteria: [AC], allowed_globs: ["src/**"] })) as unknown as Record<string, unknown>;

const pick = (obj: Record<string, unknown>, keys: string[]): Record<string, unknown> => Object.fromEntries(keys.map((k) => [k, obj[k]]));

const SPEC_KEYS = ["id", "title", "classification", "origination", "acceptance_criteria", "docs", "scope", "mockup_decision", "work_kind_resolution", "work_kind_resolution_hash", "implementation_plan", "implementation_plan_hash", "evidence_policy_resolution", "evidence_policy_resolution_hash", "change_baseline", "workflow_state", "implementation_attempts", "review_cycles", "focused_fix_instructions", "spec_review_cycles", "spec_author_agent_instance_id", "diagnostics"];
const CONTAINER_KEYS = ["id", "revision", "created_at", "updated_at", "disposition", "title", "intent", "platform", "architecture", "stack", "runtime_baseline_ref", "decision_history", "diagnostics"];

const specInput = (id: string, classification: string) => pick(fullLeaf(id, classification), SPEC_KEYS);
const aggregateInput = (id: string): Record<string, unknown> => ({
  ...pick(fullLeaf(id, "reusable_api"), CONTAINER_KEYS),
  artifact_type: "work_packet",
  schema_version: 2,
  lifecycle: { approval: null, authorization: null, completion: null, history: [] },
  specs: [specInput(`${id}-s1`, "reusable_api"), specInput(`${id}-s2`, "one_off_application_ui")]
});

describe("v2 aggregate Work Packet schema", () => {
  it("parses a container with embedded heterogeneous Specs (each its own classification)", () => {
    const agg = AggregateWorkPacketSchema.parse(aggregateInput("WP1"));
    expect(agg.schema_version).toBe(2);
    expect(agg.specs.map((s) => s.id)).toEqual(["WP1-s1", "WP1-s2"]);
    // The whole point of decomposition: heterogeneous Specs, each with its own classification.
    expect(agg.specs.map((s) => s.classification)).toEqual(["reusable_api", "one_off_application_ui"]);
    expect(agg.lifecycle).toEqual({ approval: null, authorization: null, completion: null, history: [] });
  });

  it("is strict: rejects retired/container-only v1 fields on the container (decomposed, work_breakdown_ref, classification, clarification)", () => {
    // These all exist on the v1 leaf but are deliberately gone from the v2 container (§3/§5); strict must reject them.
    for (const stale of ["decomposed", "work_breakdown_ref", "parent_plan_id", "plan_slice_id", "classification", "clarification_requests"]) {
      expect(() => AggregateWorkPacketSchema.parse({ ...aggregateInput("WP1"), [stale]: null })).toThrow();
    }
  });

  it("a Spec is strict: rejects container-only fields leaking onto a leaf (platform/intent/lifecycle/revision)", () => {
    expect(() => SpecSchema.parse(specInput("WP1-s1", "reusable_api"))).not.toThrow();
    const leaf = fullLeaf("WP1-s1", "reusable_api");
    for (const containerOnly of ["platform", "intent", "lifecycle", "revision"]) {
      expect(() => SpecSchema.parse({ ...specInput("WP1-s1", "reusable_api"), [containerOnly]: leaf[containerOnly] })).toThrow();
    }
  });

  it("the three whole-WP gates are each a HumanDecision-or-null and all required", () => {
    expect(() => AggregateLifecycleSchema.parse({ approval: null, authorization: null, completion: null, history: [] })).not.toThrow();
    // dropping any one gate is rejected (the three-gate shape is fixed)
    expect(() => AggregateLifecycleSchema.parse({ approval: null, authorization: null, history: [] })).toThrow();
    // and there is no per-Spec ac_approval/packet_approval anymore (collapsed into the one approval)
    expect(() => AggregateLifecycleSchema.parse({ approval: null, authorization: null, completion: null, ac_approval: null, history: [] })).toThrow();
  });
});
