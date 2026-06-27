import { describe, expect, it } from "vitest";
import { assertCanonicalApprovedFields, deriveApprovedFields, getDecisionTypeDefinition, isCanonicalJsonPointer, STANDARD_DECISION_TYPES } from "../src/index.ts";

describe("decision type registry and approved fields", () => {
  it("contains all standard decision types and exact approved-field sets", () => {
    expect(STANDARD_DECISION_TYPES).toContain("runtime_baseline_acceptance");
    expect(deriveApprovedFields("runtime_baseline_acceptance", true)).toEqual(["/stack", "/commands", "/configuration", "/dependency_modes", "/diff_policy", "/validation"]);
    expect(deriveApprovedFields("work_packet_approval", true)).toEqual(["/title", "/parent_plan_id", "/plan_slice_id", "/intent", "/acceptance_criteria", "/docs/policy", "/docs/none_required_reason", "/docs/not_applicable_reason", "/scope/allowed_globs", "/platform", "/architecture", "/stack", "/classification", "/runtime_baseline_ref", "/work_kind_resolution", "/implementation_plan", "/evidence_policy_resolution"]);
    expect(getDecisionTypeDefinition("platform_choice")?.approved_field_root).toBe("human_decision_approved_payload");
  });

  it("decline decisions use empty approved field derivation", () => {
    expect(deriveApprovedFields("ac_approval", false)).toEqual([]);
  });

  it("validates canonical JSON pointer strings for custom approved fields", () => {
    expect(isCanonicalJsonPointer("/a/b~1c/~0d")).toBe(true);
    expect(isCanonicalJsonPointer("a/b")).toBe(false);
    expect(isCanonicalJsonPointer("/a/*")).toBe(false);
    expect(() => assertCanonicalApprovedFields(["/ok", "/bad~2"])).toThrow(/canonical JSON pointer/);
  });
});
