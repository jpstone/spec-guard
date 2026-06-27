import { describe, expect, it } from "vitest";
import { foldIntoAggregate, buildDefaultWorkPacket, runtimeRelevanceApprovalDiagnostics, runtimeLessDiffContradiction, createDefaultConfig, devRuntimeProofApprovalDiagnostics, buildStandardImplementationPlanProjectionV1 } from "../src/index.ts";
import type { WorkClassification, WorkOrigination } from "../src/index.ts";

// Layers 1 + 2 of runtime-relevance policing (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §5), unit-tested on the
// pure diagnostic function over a constructed aggregate (the full approval gate is exercised elsewhere).
function aggregate(classification: WorkClassification, target_id: string | null, reason?: string) {
  return foldIntoAggregate(buildDefaultWorkPacket({ title: "t", goal: "g", classification, target_id, runtime_not_relevant_reason: reason }));
}

describe("runtime-relevance policing", () => {
  it("allows operational_document to be runtime-less with no reason", () => {
    expect(runtimeRelevanceApprovalDiagnostics(aggregate("operational_document", null))).toHaveLength(0);
  });

  it("Layer 1: a runtime-relevant classification cannot be runtime-less", () => {
    const diags = runtimeRelevanceApprovalDiagnostics(aggregate("rest_api", null));
    expect(diags[0]?.code).toBe("RUNTIME_TARGET_REQUIRED");
  });

  it("Layer 2: a non-doc runtime-less packet needs a valid reason", () => {
    expect(runtimeRelevanceApprovalDiagnostics(aggregate("direct_behavior", null))[0]?.code).toBe("RUNTIME_NOT_RELEVANT_REASON_REQUIRED");
    expect(runtimeRelevanceApprovalDiagnostics(aggregate("direct_behavior", null, "config-only change, no runnable code touched"))).toHaveLength(0);
  });

  it("a packet that declares a target is not policed as runtime-less", () => {
    expect(runtimeRelevanceApprovalDiagnostics(aggregate("direct_behavior", "default"))).toHaveLength(0);
  });

  describe("Layer 3 — changed-file backstop", () => {
    const config = createDefaultConfig({ projectRoot: "/repo", projectId: "demo" });

    it("blocks a runtime-less packet whose diff touches executable source", () => {
      const diags = runtimeLessDiffContradiction(null, ["src/app.ts", "docs/readme.md"], config);
      expect(diags[0]?.code).toBe("RUNTIME_LESS_CONTRADICTED_BY_DIFF");
    });

    it("allows a runtime-less diff of only docs/tests", () => {
      expect(runtimeLessDiffContradiction(null, ["docs/readme.md", "src/app.test.ts"], config)).toHaveLength(0);
    });

    it("does not police a packet that declares a target", () => {
      expect(runtimeLessDiffContradiction("web", ["src/app.ts"], config)).toHaveLength(0);
    });
  });

  describe("dev-runtime proof design reviewed at approval", () => {
    const plan = (withProof: boolean) => buildStandardImplementationPlanProjectionV1({
      template_id: "t", template_version: 1, summary: "s", approach: ["a"], expected_files: [], tests: [],
      dev_runtime_proof: withProof ? { command: "next dev", readiness_assertion: "loads the Todo UI and a created todo round-trips through the authenticated data path and persists across reload" } : null
    });
    const appAggregate = (origination: WorkOrigination, platformChoice: string | null, withProof: boolean) => {
      const base = foldIntoAggregate(buildDefaultWorkPacket({ title: "t", goal: "g", classification: "one_off_application_ui", origination, target_id: origination === "new_in_existing" ? "todo-app" : undefined }));
      return { ...base, platform: { ...base.platform, choice: platformChoice }, specs: base.specs.map((s) => ({ ...s, implementation_plan: plan(withProof) })) };
    };

    it("requires dev_runtime_proof for a new app target on a dev-runtime platform", () => {
      expect(devRuntimeProofApprovalDiagnostics(appAggregate("new_in_existing", "web_app", false))[0]?.code).toBe("DEV_RUNTIME_PROOF_PLAN_REQUIRED");
    });

    it("is satisfied when a Spec's plan declares the proof", () => {
      expect(devRuntimeProofApprovalDiagnostics(appAggregate("new_in_existing", "web_app", true))).toHaveLength(0);
    });

    it("does not require it for a non-app platform", () => {
      expect(devRuntimeProofApprovalDiagnostics(appAggregate("new_entirely", null, false))).toHaveLength(0);
    });

    it("does not require it for modify_existing (inherits, doesn't establish)", () => {
      expect(devRuntimeProofApprovalDiagnostics(appAggregate("modify_existing", "web_app", false))).toHaveLength(0);
    });
  });
});
