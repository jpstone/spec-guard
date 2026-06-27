import { describe, it, expect } from "vitest";
import { AggregateWorkPacketSchema } from "../src/index.ts";
import { aggregateApprovalProjection } from "../src/role-loop/aggregate-approval.ts";
import { specAsV1WorkPacket } from "../src/storage/aggregate-mapping.ts";
import { buildAggregate } from "./helpers/aggregate-fixture.ts";

describe("aggregateApprovalProjection (v2 whole-WP approval hash)", () => {
  it("is deterministic and produces one faithful sub-projection per Spec", () => {
    const agg = buildAggregate("WP1", ["reusable_api", "one_off_application_ui"]);
    expect(aggregateApprovalProjection(agg).hash).toBe(aggregateApprovalProjection(agg).hash);
    const { specs } = aggregateApprovalProjection(agg);
    expect(specs.map((s) => s.id)).toEqual(["WP1-s1", "WP1-s2"]);
    expect(specs.map((s) => s.classification)).toEqual(["reusable_api", "one_off_application_ui"]);
  });

  it("editing ANY Spec changes the one hash (whole-WP binding)", () => {
    const base = buildAggregate("WP1", ["reusable_api", "one_off_application_ui"]);
    const baseHash = aggregateApprovalProjection(base).hash;
    // change ONLY the second Spec's ACs
    const edited = AggregateWorkPacketSchema.parse({ ...base, specs: base.specs.map((s, i) => (i === 1 ? { ...s, acceptance_criteria: [{ id: "ac2", text: "changed", source: "human", source_evidence: null }] } : s)) });
    expect(aggregateApprovalProjection(edited).hash).not.toBe(baseHash);
  });

  it("editing the container's inherited intent changes the hash", () => {
    const base = buildAggregate("WP1", ["reusable_api"]);
    const baseHash = aggregateApprovalProjection(base).hash;
    const edited = AggregateWorkPacketSchema.parse({ ...base, intent: { ...base.intent, goal: "a different overall goal" } });
    expect(aggregateApprovalProjection(edited).hash).not.toBe(baseHash);
  });

  it("adding a Spec changes the hash", () => {
    expect(aggregateApprovalProjection(buildAggregate("WP1", ["reusable_api"])).hash)
      .not.toBe(aggregateApprovalProjection(buildAggregate("WP1", ["reusable_api", "rest_api"])).hash);
  });
});

describe("specAsV1WorkPacket (v2->v1 synthesis)", () => {
  it("synthesizes a valid v1 WorkPacket: Spec content + container-inherited structural fields", () => {
    const agg = buildAggregate("WP1", ["one_off_application_ui"]);
    const spec = agg.specs[0];
    if (spec === undefined) throw new Error("fixture must have a Spec");
    const wp = specAsV1WorkPacket(agg, spec);
    expect(wp.id).toBe("WP1-s1");
    expect(wp.classification).toBe("one_off_application_ui"); // the Spec's own classification
    expect(wp.intent).toEqual(agg.intent); // overall intent inherited from the container
    expect(wp.platform).toEqual(agg.platform); // structural decisions inherited from the container
    expect(wp.acceptance_criteria).toEqual(spec.acceptance_criteria);
  });
});
