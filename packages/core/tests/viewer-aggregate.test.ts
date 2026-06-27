import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ArtifactStore } from "../src/storage/artifact-store.ts";
import { aggregateStoreForContext } from "../src/actions/config.ts";
import { workCreate, workDecompose, workSpecAcs, workSpecPlan, workReview, workIntent, workApprove, workTargetAttach } from "../src/actions/work.ts";
import { initAction } from "../src/actions/init.ts";
import { baselineInit, baselineEstablish } from "../src/actions/baseline.ts";
import { aggregateApprovalProjection } from "../src/role-loop/aggregate-approval.ts";
import type { LineageProducer } from "../src/lineage/records.ts";
import { buildWorkPacketSpecView, buildSpecDetailView, rawWorkPacketJson } from "../src/viewer-data/work-packet-spec-view.ts";
import { buildContractsOverview, buildContractVersionView } from "../src/viewer-data/contract-view.ts";
import { buildDashboardSummary } from "../src/viewer-data/dashboard-summary.ts";
import { buildArtifactList } from "../src/viewer-data/artifact-lists.ts";
import { aggregateRuntimeSummary } from "../src/viewer-data/aggregate-work-packet-view.ts";

let root: string;
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), "viewer-agg-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("viewer reads v2 aggregate Work Packets", () => {
  // The viewer is handed an ArtifactStore rooted at the same artifact root the aggregate store writes to.
  const store = () => new ArtifactStore({ root: aggregateStoreForContext({ projectRoot: root }).root });

  it("the detail view renders an aggregate packet (not a 404) + raw JSON is the aggregate", async () => {
    await workCreate({ id: "WP1", title: "My WP", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    const view = await buildWorkPacketSpecView(store(), "WP1");
    expect(view.id).toBe("WP1");
    expect(view.source).toBe("live");
    expect(view.spec.title).toBe("My WP");
    expect(await rawWorkPacketJson(store(), "WP1")).toContain("\"schema_version\": 2");
  });

  it("a decomposed packet's detail merges every Spec's delivery (multi-Spec is not lost)", async () => {
    await workCreate({ id: "WP1", title: "Parent", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    await workDecompose({ id: "WP1", slices: [{ title: "S1", classification: "direct_behavior" }, { title: "S2", classification: "direct_behavior" }] }, { projectRoot: root });
    const view = await buildWorkPacketSpecView(store(), "WP1");
    expect(view.source).toBe("live");
    // the detail view carries a per-Spec breakdown (attribution for the decomposed packet)
    expect(view.specs.length).toBe(2);
    expect(view.specs.map((s) => s.classification)).toEqual(["direct_behavior", "direct_behavior"]);
    // the raw aggregate the page exposes carries both Specs (multi-Spec is not collapsed away)
    const raw = JSON.parse(await rawWorkPacketJson(store(), "WP1")) as { specs: unknown[] };
    expect(raw.specs.length).toBe(2);
    // and the list labels a multi-Spec packet as decomposed
    const list = await buildArtifactList(store(), { type: "work_packet" });
    expect(list.rows.find((row) => row.id === "WP1")?.decomposed).toBe(true);
  });

  it("the dashboard counts aggregate packets", async () => {
    await workCreate({ id: "WP1", title: "A", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    await workCreate({ id: "WP2", title: "B", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    const summary = await buildDashboardSummary(store());
    expect(summary.artifact_counts_by_type.work_packet).toBe(2);
  });

  it("a per-Spec detail view exposes THAT Spec's own ACs (not the work-packet top level)", async () => {
    await workCreate({ id: "WP1", title: "App", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [{ id: "ac1", text: "a clickable feature", source: "human", source_evidence: null }] }, { projectRoot: root });
    const view = await buildSpecDetailView(store(), "WP1", "WP1");
    expect(view?.spec_id).toBe("WP1");
    expect(JSON.stringify(view?.spec.approved_spec)).toContain("a clickable feature");
    expect(await buildSpecDetailView(store(), "WP1", "nope")).toBeNull();
  });

  it("a decomposed WP's view carries the WP id as work_id, so Spec links target the WP (not specs[0])", async () => {
    await workCreate({ id: "todo-app", title: "Todo App", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    await workDecompose({ id: "todo-app", slices: [{ title: "API", classification: "direct_behavior" }, { title: "UI", classification: "direct_behavior" }] }, { projectRoot: root });
    const view = await buildWorkPacketSpecView(store(), "todo-app");
    expect(view.id).toBe("todo-app");
    expect(view.spec.work_id).toBe("todo-app"); // NOT the first Spec's id — render uses this for the WP URL segment
    expect(view.specs.length).toBe(2);
    for (const s of view.specs) {
      expect(await buildSpecDetailView(store(), "todo-app", s.id)).not.toBeNull(); // every Spec page is reachable
    }
  });

  it("the whole-WP review surfaces on the work-packet view (container-level, not per-Spec)", async () => {
    await workCreate({ id: "WP1", title: "App", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [{ id: "ac1", text: "feature", source: "human", source_evidence: null }] }, { projectRoot: root });
    await workSpecPlan({ id: "WP1", spec_id: "WP1", plan: { kind: "standard_plan", template_id: "t", template_version: 1, summary: "p", approach: ["go"], expected_files: [{ path: "src/index.ts", purpose: "impl", change_type: "create" }, { path: "src/index.test.ts", purpose: "tests", change_type: "create" }, { path: "docs/api.md", purpose: "docs", change_type: "create" }], tests: [] }, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] } }, { projectRoot: root });
    const reviewer: LineageProducer = { role: "reviewer", principal_id: null, agent_instance_id: "rev", provider: "claude_code", model: null, run_id: "r" };
    await workReview({ id: "WP1", producer: reviewer, verdict: "pass", blockers: [], summary: "coherent" }, { projectRoot: root });
    const view = await buildWorkPacketSpecView(store(), "WP1");
    expect(view.spec.spec_review.reviewed).toBe(true);
    expect(view.spec.spec_review.verdict).toBe("pass");
  });

  it("the view surfaces produced contracts (created vs updated) + the coherence + per-Spec review output", async () => {
    await workCreate({ id: "WP1", title: "API", goal: "g", classification: "rest_api" }, { projectRoot: root });
    await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [{ id: "ac1", text: "api", source: "human", source_evidence: null }] }, { projectRoot: root });
    const plan = { kind: "standard_plan" as const, template_id: "t", template_version: 1, summary: "p", approach: ["go"], expected_files: [{ path: "src/index.ts", purpose: "impl", change_type: "create" as const }, { path: "src/index.test.ts", purpose: "tests", change_type: "create" as const }, { path: "docs/api.md", purpose: "docs", change_type: "create" as const }], tests: [] };
    await workSpecPlan({ id: "WP1", spec_id: "WP1", plan, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] }, contract_surface: { ops: ["list", "add"] } }, { projectRoot: root });
    const reviewer: LineageProducer = { role: "reviewer", principal_id: null, agent_instance_id: "rev", provider: "claude_code", model: null, run_id: "r" };
    await workReview({ id: "WP1", producer: reviewer, verdict: "pass", blockers: [], summary: "coherent" }, { projectRoot: root }); // whole-WP coherence
    await workReview({ id: "WP1", producer: reviewer, spec_id: "WP1", verdict: "pass", blockers: [], summary: "spec ok" }, { projectRoot: root }); // per-Spec
    const wpView = await buildWorkPacketSpecView(store(), "WP1");
    expect(wpView.contracts_created.map((c) => c.id)).toContain("WP1");
    expect(wpView.contracts_created[0]?.surface).toEqual({ ops: ["list", "add"] });
    expect(wpView.contracts_updated).toEqual([]);
    expect(wpView.coherence_reviews.map((r) => r.summary)).toContain("coherent");
    const specView = await buildSpecDetailView(store(), "WP1", "WP1");
    expect(specView?.contracts_created.map((c) => c.id)).toContain("WP1");
    expect(specView?.spec_reviews.map((r) => r.summary)).toContain("spec ok");
  });

  it("a contract the WP CREATED then revised still reads 'created' (genesis ownership, not the pinned version)", async () => {
    await workCreate({ id: "WP1", title: "API", goal: "g", classification: "rest_api" }, { projectRoot: root });
    await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [{ id: "ac1", text: "api", source: "human", source_evidence: null }] }, { projectRoot: root });
    const plan = { kind: "standard_plan" as const, template_id: "t", template_version: 1, summary: "p", approach: ["go"], expected_files: [{ path: "src/index.ts", purpose: "impl", change_type: "create" as const }, { path: "src/index.test.ts", purpose: "tests", change_type: "create" as const }, { path: "docs/api.md", purpose: "docs", change_type: "create" as const }], tests: [] };
    const deps = { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] };
    await workSpecPlan({ id: "WP1", spec_id: "WP1", plan, dependencies: deps, contract_surface: { ops: ["list"] } }, { projectRoot: root }); // genesis
    await workSpecPlan({ id: "WP1", spec_id: "WP1", plan, dependencies: deps, contract_surface: { ops: ["list", "add"] } }, { projectRoot: root }); // revise in the SAME WP
    const wpView = await buildWorkPacketSpecView(store(), "WP1");
    expect(wpView.contracts_created.map((c) => c.id)).toContain("WP1"); // still CREATED (this WP authored the genesis)
    expect(wpView.contracts_updated).toEqual([]);
    expect(wpView.contracts_created[0]?.surface).toEqual({ ops: ["list", "add"] }); // ...showing the current (revised) surface
  });

  it("the contract views expose the registry: overview lists each version (named via contract_id), version view renders one", async () => {
    await workCreate({ id: "WP1", title: "API", goal: "g", classification: "rest_api" }, { projectRoot: root });
    await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [{ id: "ac1", text: "api", source: "human", source_evidence: null }] }, { projectRoot: root });
    const plan = { kind: "standard_plan" as const, template_id: "t", template_version: 1, summary: "p", approach: ["go"], expected_files: [{ path: "src/index.ts", purpose: "impl", change_type: "create" as const }, { path: "src/index.test.ts", purpose: "tests", change_type: "create" as const }, { path: "docs/api.md", purpose: "docs", change_type: "create" as const }], tests: [] };
    await workSpecPlan({ id: "WP1", spec_id: "WP1", plan, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] }, contract_id: "todo-api", contract_surface: { ops: ["list"] } }, { projectRoot: root });
    const r = aggregateStoreForContext({ projectRoot: root }).root;
    const overview = await buildContractsOverview(r);
    const version = overview.versions.find((v) => v.id === "todo-api");
    expect(version).toBeDefined();
    expect(version!.first_version).toBe(true);
    expect(version!.produced_by).toEqual({ work_id: "WP1", spec_id: "WP1" });
    const detail = await buildContractVersionView(r, "todo-api", version!.content_hash);
    expect(detail?.surface).toEqual({ ops: ["list"] });
    expect(await buildContractVersionView(r, "todo-api", "nope")).toBeNull(); // a bad hash doesn't resolve
  });

  it("an APPROVED Work Packet still shows its content (intent/ACs/plan/structural NOT blanked by approval)", async () => {
    // modify_existing must inherit its target's accepted baseline before approval — stand one up + attach it.
    await initAction({ project_id: "demo" }, { projectRoot: root });
    await baselineInit({ commands: { test: null, test_not_applicable_reason: "n/a", build: null, build_not_applicable_reason: "n/a", runtime_production: null, runtime_production_not_applicable_reason: "n/a", runtime_development: null, runtime_development_not_applicable_reason: "n/a" } } as never, { projectRoot: root });
    await baselineEstablish({}, { projectRoot: root });
    await workCreate({ id: "WP1", title: "App", goal: "g", classification: "direct_behavior", origination: "modify_existing" }, { projectRoot: root });
    await workTargetAttach({ id: "WP1" }, { projectRoot: root });
    await workIntent({ id: "WP1", desired_outcomes: ["ship it"], in_scope: ["the feature"], out_of_scope: ["x"], users_actors: ["user"], edge_cases: ["empty"], open_questions: ["none"] }, { projectRoot: root });
    await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [{ id: "ac1", text: "a tracked behaviour", source: "human", source_evidence: null }] }, { projectRoot: root });
    await workSpecPlan({ id: "WP1", spec_id: "WP1", plan: { kind: "standard_plan", template_id: "t", template_version: 1, summary: "p", approach: ["go"], expected_files: [{ path: "src/index.ts", purpose: "impl", change_type: "create" }, { path: "src/index.test.ts", purpose: "tests", change_type: "create" }, { path: "docs/api.md", purpose: "docs", change_type: "create" }], tests: [] }, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] } }, { projectRoot: root });
    const reviewer: LineageProducer = { role: "reviewer", principal_id: null, agent_instance_id: "rev", provider: "claude_code", model: "claude-opus-4-8", run_id: "r" };
    await workReview({ id: "WP1", producer: reviewer, verdict: "pass", blockers: [], summary: "ok" }, { projectRoot: root });
    const hash = aggregateApprovalProjection(await aggregateStoreForContext({ projectRoot: root }).read("WP1")).hash;
    const approved = await workApprove({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    expect(approved.ok).toBe(true);
    const view = await buildWorkPacketSpecView(store(), "WP1");
    expect(view.spec.proof_of_approval.approved).toBe(true); // the approval still shows
    const approvedSpec = JSON.stringify(view.spec.approved_spec);
    expect(approvedSpec).toContain("a tracked behaviour"); // ACs survived
    expect(approvedSpec).toContain("desired_outcomes"); // intent survived
    expect(approvedSpec).toContain("implementation_plan"); // plan survived
  });

  it("the runtime summary surfaces target_id + the runtime-less badge for the detail page", async () => {
    await workCreate({ id: "DOCS", title: "Docs", goal: "g", classification: "operational_document" }, { projectRoot: root });
    const docs = aggregateRuntimeSummary(await aggregateStoreForContext({ projectRoot: root }).read("DOCS"));
    expect(docs.runtime_less).toBe(true);
    expect(docs.target_id).toBeNull();

    await workCreate({ id: "APIWP", title: "Api", goal: "g", classification: "rest_api", target_id: "api" }, { projectRoot: root });
    const api = aggregateRuntimeSummary(await aggregateStoreForContext({ projectRoot: root }).read("APIWP"));
    expect(api.runtime_less).toBe(false);
    expect(api.target_id).toBe("api");
  });

  it("the artifact list includes aggregate packets", async () => {
    await workCreate({ id: "WP1", title: "A", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    const list = await buildArtifactList(store(), { type: "work_packet" });
    expect(list.rows.some((row) => row.id === "WP1")).toBe(true);
  });
});
