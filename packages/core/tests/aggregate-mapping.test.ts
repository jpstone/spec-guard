import { describe, it, expect } from "vitest";
import { buildDefaultWorkPacket, WorkPacketSchema, type AcceptanceCriterion } from "../src/index.ts";
import { buildApprovedWorkPacketProjectionV1 } from "../src/role-loop/packet-approval.ts";
import { aggregateApprovalProjection } from "../src/role-loop/aggregate-approval.ts";
import { foldIntoAggregate } from "../src/storage/aggregate-mapping.ts";

const AC: AcceptanceCriterion = { id: "ac1", text: "do x", source: "human", source_evidence: null };
const leaf = (id: string, classification: string, extra: Record<string, unknown> = {}) =>
  WorkPacketSchema.parse({ ...buildDefaultWorkPacket({ id, title: id, goal: "g", classification: classification as never, acceptance_criteria: [AC], allowed_globs: ["src/**"] }), ...extra });

describe("foldIntoAggregate (v1 -> v2 migration mapping)", () => {
  it("an undecomposed WorkPacket becomes its own single Spec", () => {
    const agg = foldIntoAggregate(leaf("WP1", "reusable_api"));
    expect(agg.id).toBe("WP1");
    expect(agg.specs.map((s) => s.id)).toEqual(["WP1"]);
    expect(agg.specs[0]?.classification).toBe("reusable_api");
  });

  it("a decomposed parent + children becomes the container (from the parent) + a Spec per child", () => {
    const parent = leaf("WP1", "one_off_application_ui", { decomposed: true });
    const children = [leaf("WP1-c1", "reusable_api"), leaf("WP1-c2", "one_off_application_ui")];
    const agg = foldIntoAggregate(parent, children);
    expect(agg.id).toBe("WP1"); // container identity from the parent
    expect(agg.specs.map((s) => s.id)).toEqual(["WP1-c1", "WP1-c2"]); // Specs from the children, NOT the parent
    expect(agg.specs.map((s) => s.classification)).toEqual(["reusable_api", "one_off_application_ui"]);
  });

  it("maps the v1 lifecycle to the three whole-WP gates (completion starts null)", () => {
    const agg = foldIntoAggregate(leaf("WP1", "reusable_api"));
    expect(agg.lifecycle).toEqual({ approval: null, authorization: null, completion: null, history: [] });
  });

  it("ROUND-TRIP (undecomposed): the v2 per-Spec projection equals the v1 projection MINUS the dropped lineage", () => {
    // Fold v1 -> v2, take the v2 whole-WP approval's per-Spec sub-projection: it equals the direct v1 approval
    // projection except the v1-only lineage fields, which v2 drops (a v2 Spec has no plan). For an undecomposed
    // WP that lineage is already null, so re-attaching it reconstructs the v1 projection exactly. Across
    // classifications so the fidelity isn't just the trivial default case.
    for (const classification of ["reusable_api", "one_off_application_ui", "operational_document"]) {
      const wp = leaf(`WP-${classification}`, classification);
      const v1 = buildApprovedWorkPacketProjectionV1(wp).projection;
      const v2 = aggregateApprovalProjection(foldIntoAggregate(wp)).specs[0];
      if (v2 === undefined) throw new Error("expected exactly one Spec projection");
      expect(v2).not.toHaveProperty("parent_plan_id");
      expect({ ...v2, parent_plan_id: v1.parent_plan_id, plan_slice_id: v1.plan_slice_id }).toEqual(v1);
    }
  });

  it("ROUND-TRIP (decomposed): a child that carried v1 plan lineage projects WITHOUT it (lineage-independent)", () => {
    // The case the undecomposed test cannot reach: a real decomposed child has non-null parent_plan_id/
    // plan_slice_id in v1, and those ARE in the v1 approval hash. v2 must drop them (a Spec has no plan lineage),
    // so the migrated approval is lineage-independent — NOT byte-identical to the v1 child hash (expected; §3
    // re-baselines, and a decomposed tree is globally re-gated on migration).
    const parent = leaf("WP1", "one_off_application_ui", { decomposed: true });
    const child = leaf("WP1-c1", "reusable_api", { parent_plan_id: "plan:P1", plan_slice_id: "slice-1" });
    const v1 = buildApprovedWorkPacketProjectionV1(child).projection;
    expect(v1.parent_plan_id).toBe("plan:P1"); // sanity: the v1 child projection DID carry lineage
    const v2 = aggregateApprovalProjection(foldIntoAggregate(parent, [child])).specs[0];
    if (v2 === undefined) throw new Error("expected exactly one Spec projection");
    expect(v2).not.toHaveProperty("parent_plan_id");
    expect(v2).not.toHaveProperty("plan_slice_id");
    expect(v2.id).toBe("WP1-c1"); // content preserved, lineage gone
    expect(v2.classification).toBe("reusable_api");
  });
});
