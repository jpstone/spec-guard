import { describe, it, expect } from "vitest";
import { AcceptanceCriterionSchema, type AcceptanceCriterion } from "../src/schemas/embedded.ts";
import { acContentHash } from "../src/work/ac-snapshots.ts";

// Part A: per-AC classification. Back-compat (absent => unchanged hash) + it's part of the content (adding it
// re-anchors, as designed).
describe("per-AC classification", () => {
  const base = { id: "AC1", text: "do x", source: "frontend_agent" as const, source_evidence: null };

  it("accepts an AC with or without a classification, rejects an invalid one", () => {
    expect(AcceptanceCriterionSchema.safeParse(base).success).toBe(true);
    expect(AcceptanceCriterionSchema.safeParse({ ...base, classification: "reusable_api" }).success).toBe(true);
    expect(AcceptanceCriterionSchema.safeParse({ ...base, classification: "not_a_classification" }).success).toBe(false);
  });

  it("an absent classification hashes identically to a legacy AC (no spurious re-anchor)", () => {
    const parsed = AcceptanceCriterionSchema.parse(base) as AcceptanceCriterion; // classification: undefined
    const legacy = { ...base } as AcceptanceCriterion; // never had the field
    expect(acContentHash([parsed])).toBe(acContentHash([legacy]));
  });

  it("adding a classification changes the content hash (re-anchor is expected)", () => {
    const plain = AcceptanceCriterionSchema.parse(base) as AcceptanceCriterion;
    const tagged = AcceptanceCriterionSchema.parse({ ...base, classification: "reusable_api" }) as AcceptanceCriterion;
    expect(acContentHash([plain])).not.toBe(acContentHash([tagged]));
  });
});
