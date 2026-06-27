import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initAction, detectDependencyCycle, topologicalOrder, aggregateStoreForContext, aggregateApprovalProjection, AggregateWorkPacketSchema } from "../src/index.ts";
import { workCreate, workDecompose, workSpecAcs, workSpecPlan, workReview, workApprove, workAuthorize, workSpecRecord, workGet, workIntent } from "../src/actions/work.ts";
import { ContractStore } from "../src/storage/contract-store.ts";

// --- pure helper unit tests (no fs) ---
type Specs = Parameters<typeof detectDependencyCycle>[0];
function specsWith(edges: Record<string, string[]>): Specs {
  return Object.entries(edges).map(([id, deps]) => ({
    id,
    dependencies: { spec_dependencies: deps.map((spec_id) => ({ spec_id, contract: null, reason: "r" })), external_dependencies: [], contract_dependencies: [] }
  })) as unknown as Specs;
}

describe("cross-Spec dependency graph helpers", () => {
  it("acyclic graph: no cycle, and dependencies come BEFORE dependents in the order", () => {
    const specs = specsWith({ ui: ["api"], api: ["contract"], contract: [] });
    expect(detectDependencyCycle(specs)).toBeNull();
    const order = topologicalOrder(specs);
    expect(order.indexOf("contract")).toBeLessThan(order.indexOf("api"));
    expect(order.indexOf("api")).toBeLessThan(order.indexOf("ui"));
  });

  it("detects a 2-node cycle and returns the closed path", () => {
    const cycle = detectDependencyCycle(specsWith({ a: ["b"], b: ["a"] }));
    expect(cycle).not.toBeNull();
    expect(cycle).toEqual(expect.arrayContaining(["a", "b"]));
    expect(cycle![0]).toBe(cycle![cycle!.length - 1]); // the path closes the loop
  });

  it("detects a self-edge as a cycle", () => {
    expect(detectDependencyCycle(specsWith({ a: ["a"] }))).not.toBeNull();
  });

  it("detects a cycle reachable only from a NON-first node (not just from the first key)", () => {
    expect(detectDependencyCycle(specsWith({ a: [], b: ["c"], c: ["b"] }))).not.toBeNull();
  });

  it("detects a cycle whose ENTRY node is not part of the cycle (a -> b -> c -> b)", () => {
    const cycle = detectDependencyCycle(specsWith({ a: ["b"], b: ["c"], c: ["b"] }));
    expect(cycle).not.toBeNull();
    expect(cycle).not.toContain("a"); // the returned path is the real loop (b,c), not the approach edge
  });

  it("ignores unknown deps (rejected at plan time) without crashing", () => {
    expect(detectDependencyCycle(specsWith({ a: ["ghost"] }))).toBeNull();
    expect(topologicalOrder(specsWith({ a: ["ghost"] }))).toEqual(["a"]);
  });
});

// --- integration: the work.spec.plan resolve gate + the work.review cycle/order gate ---
const PLAN = { kind: "standard_plan" as const, template_id: "t", template_version: 1, summary: "p", approach: ["go"], expected_files: [{ path: "src/index.ts", purpose: "impl", change_type: "create" as const }, { path: "src/index.test.ts", purpose: "tests", change_type: "create" as const }, { path: "docs/api.md", purpose: "docs", change_type: "create" as const }], tests: [] };
const deps = (...ids: string[]) => ({ spec_dependencies: ids.map((spec_id) => ({ spec_id, contract: null, reason: "uses it" })), external_dependencies: [], contract_dependencies: [] });
const reviewer = (agent_instance_id: string) => ({ role: "reviewer" as const, principal_id: null, agent_instance_id, provider: "claude_code" as const, model: null, run_id: "r" });

describe("dependency edges — plan + review gates", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sg-deps-"));
    await initAction({ project_id: "demo" }, { projectRoot: root });
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  async function twoSpecs(): Promise<[string, string]> {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    await workDecompose({ id: "WP1", slices: [{ title: "S1", classification: "direct_behavior" }, { title: "S2", classification: "direct_behavior" }] }, { projectRoot: root });
    const specs = (await aggregateStoreForContext({ projectRoot: root }).read("WP1")).specs;
    await workSpecAcs({ id: "WP1", spec_id: specs[0]!.id, acceptance_criteria: [{ id: "ac1", text: "do x", source: "human", source_evidence: null }], author_agent_instance_id: "agent-A" }, { projectRoot: root });
    await workSpecAcs({ id: "WP1", spec_id: specs[1]!.id, acceptance_criteria: [{ id: "ac1", text: "do y", source: "human", source_evidence: null }], author_agent_instance_id: "agent-B" }, { projectRoot: root });
    return [specs[0]!.id, specs[1]!.id];
  }

  // A contract-producing API Spec + a consumer UI Spec, both drafted (distinct authors).
  async function twoSpecsApiUi(): Promise<[string, string]> {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    await workIntent({ id: "WP1", desired_outcomes: ["o"], in_scope: ["i"], out_of_scope: ["x"], users_actors: ["u"], edge_cases: ["e"], open_questions: ["q"] }, { projectRoot: root });
    await workDecompose({ id: "WP1", slices: [{ title: "API", classification: "rest_api" }, { title: "UI", classification: "direct_behavior" }] }, { projectRoot: root });
    const specs = (await aggregateStoreForContext({ projectRoot: root }).read("WP1")).specs;
    await workSpecAcs({ id: "WP1", spec_id: specs[0]!.id, acceptance_criteria: [{ id: "ac1", text: "api", source: "human", source_evidence: null }], author_agent_instance_id: "agent-A" }, { projectRoot: root });
    await workSpecAcs({ id: "WP1", spec_id: specs[1]!.id, acceptance_criteria: [{ id: "ac1", text: "ui", source: "human", source_evidence: null }], author_agent_instance_id: "agent-B" }, { projectRoot: root });
    // greenfield Specs need a bootstrap AC at approval — mark the ACs bootstrap (preserving the distinct authors)
    const store = aggregateStoreForContext({ projectRoot: root });
    const agg = await store.read("WP1");
    await store.update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((spec) => ({ ...spec, acceptance_criteria: spec.acceptance_criteria.map((ac) => ({ ...ac, bootstrap: true })) })) }));
    return [specs[0]!.id, specs[1]!.id];
  }

  it("work.spec.plan rejects a self-dependency", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [{ id: "ac1", text: "x", source: "human", source_evidence: null }] }, { projectRoot: root });
    const result = await workSpecPlan({ id: "WP1", spec_id: "WP1", plan: PLAN, dependencies: deps("WP1") }, { projectRoot: root });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "DEPENDENCY_SELF")).toBe(true);
  });

  it("work.spec.plan rejects a dependency on a non-existent Spec", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [{ id: "ac1", text: "x", source: "human", source_evidence: null }] }, { projectRoot: root });
    const result = await workSpecPlan({ id: "WP1", spec_id: "WP1", plan: PLAN, dependencies: deps("ghost") }, { projectRoot: root });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "DEPENDENCY_SPEC_UNKNOWN")).toBe(true);
  });

  it("work.review rejects a cross-Spec dependency cycle", async () => {
    const [s0, s1] = await twoSpecs();
    await workSpecPlan({ id: "WP1", spec_id: s0, plan: PLAN, dependencies: deps(s1) }, { projectRoot: root });
    await workSpecPlan({ id: "WP1", spec_id: s1, plan: PLAN, dependencies: deps(s0) }, { projectRoot: root });
    const result = await workReview({ id: "WP1", producer: reviewer("agent-C"), verdict: "pass", blockers: [], summary: "x" }, { projectRoot: root });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "DEPENDENCY_CYCLE")).toBe(true);
  });

  it("work.review surfaces the topological implementation order (dependency first)", async () => {
    const [s0, s1] = await twoSpecs();
    await workSpecPlan({ id: "WP1", spec_id: s0, plan: PLAN, dependencies: deps(s1) }, { projectRoot: root }); // s0 depends on s1
    await workSpecPlan({ id: "WP1", spec_id: s1, plan: PLAN, dependencies: deps() }, { projectRoot: root });
    const result = await workReview({ id: "WP1", producer: reviewer("agent-C"), verdict: "pass", blockers: [], summary: "ok" }, { projectRoot: root });
    expect(result.ok).toBe(true);
    const order = (result.data as { implementation_order: string[] }).implementation_order;
    expect(order.indexOf(s1)).toBeLessThan(order.indexOf(s0)); // s1 (the dependency) is implemented first
  });

  it("work.spec.plan REQUIRES a contract for a contract-producing classification, accepts it when declared", async () => {
    await workCreate({ id: "WP1", title: "API", goal: "g", classification: "rest_api" }, { projectRoot: root });
    await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [{ id: "ac1", text: "x", source: "human", source_evidence: null }] }, { projectRoot: root });
    const noContract = await workSpecPlan({ id: "WP1", spec_id: "WP1", plan: PLAN, dependencies: deps() }, { projectRoot: root });
    expect(noContract.ok).toBe(false);
    expect(noContract.diagnostics.some((d) => d.code === "CONTRACT_REQUIRED")).toBe(true);
    const withContract = await workSpecPlan({ id: "WP1", spec_id: "WP1", plan: PLAN, dependencies: deps(), contract_surface: { ops: ["x"] } }, { projectRoot: root });
    expect(withContract.ok).toBe(true);
  });

  it("work.review rejects an edge whose contract PIN disagrees with the producer's frozen contract", async () => {
    const [api, ui] = await twoSpecsApiUi();
    await workSpecPlan({ id: "WP1", spec_id: api, plan: PLAN, dependencies: deps(), contract_surface: { ops: ["a"] } }, { projectRoot: root });
    await workSpecPlan({ id: "WP1", spec_id: ui, plan: PLAN, dependencies: { spec_dependencies: [{ spec_id: api, contract: { id: api, content_hash: "deadbeef" }, reason: "uses it" }], external_dependencies: [], contract_dependencies: [] } }, { projectRoot: root });
    const review = await workReview({ id: "WP1", producer: reviewer("agent-C"), verdict: "pass", blockers: [], summary: "x" }, { projectRoot: root });
    expect(review.ok).toBe(false);
    expect(review.diagnostics.some((d) => d.code === "CONTRACT_EDGE_MISMATCH")).toBe(true);
  });

  it("contract-first: the contract is frozen at PLAN, so the consumer is unblocked + parallel-ready from authorization (no freeze-during-impl dance)", async () => {
    const store = aggregateStoreForContext({ projectRoot: root });
    const [api, ui] = await twoSpecsApiUi();
    await workSpecPlan({ id: "WP1", spec_id: api, plan: PLAN, dependencies: deps(), contract_surface: { ops: ["list", "add"] } }, { projectRoot: root });
    await workSpecPlan({ id: "WP1", spec_id: ui, plan: PLAN, dependencies: deps(api) }, { projectRoot: root }); // UI depends on API
    await workReview({ id: "WP1", producer: reviewer("agent-C"), verdict: "pass", blockers: [], summary: "ok" }, { projectRoot: root });
    const hash = aggregateApprovalProjection(await store.read("WP1")).hash;
    await workApprove({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    await workAuthorize({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Authorize?", human_confirmed: true }, { projectRoot: root });
    const impl = { role: "implementer" as const, principal_id: null, agent_instance_id: "agent-impl", provider: "claude_code" as const, model: "claude-opus-4-8", run_id: "r" };
    const record = () => workSpecRecord({ id: "WP1", spec_id: ui, record_kind: "implementation_attempt", record: { producer: impl, summary: "ui", changed_files: ["src/ui.ts"], kind: "initial_implementation" }, next_state: "implementation_attempt_complete" }, { projectRoot: root });
    // the contract was frozen at plan -> the consumer is NOT blocked, and both are parallel-ready from t=0
    expect((await record()).ok).toBe(true);
    const got = (await workGet({ id: "WP1" }, { projectRoot: root })).data as { ready_in_parallel: string[] };
    expect(got.ready_in_parallel).toEqual(expect.arrayContaining([api, ui]));
  });

  it("Spec Guard OWNS the authoritative contract: frozen in the committed registry + bound into approval", async () => {
    await workCreate({ id: "WP1", title: "API", goal: "g", classification: "rest_api" }, { projectRoot: root });
    await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [{ id: "ac1", text: "x", source: "human", source_evidence: null }] }, { projectRoot: root });
    await workSpecPlan({ id: "WP1", spec_id: "WP1", plan: PLAN, dependencies: deps(), contract_surface: { ops: ["list", "add"] } }, { projectRoot: root });
    const store = aggregateStoreForContext({ projectRoot: root });
    const spec = (await store.read("WP1")).specs[0];
    // Spec.contract is a REF (not a path); the surface is frozen in the committed ContractStore at that hash
    expect(spec?.contract).toEqual({ id: "WP1", content_hash: expect.any(String) });
    const contractStore = new ContractStore(store.root);
    expect(await contractStore.resolves(spec!.contract!)).toBe(true);
    expect((await contractStore.getVersion(spec!.contract!))?.surface).toEqual({ ops: ["list", "add"] });
    // a DIFFERENT surface => a different frozen contract => a different approval hash (the interface is in approval)
    const before = aggregateApprovalProjection(await store.read("WP1")).hash;
    await workSpecPlan({ id: "WP1", spec_id: "WP1", plan: PLAN, dependencies: deps(), contract_surface: { ops: ["list", "add", "remove"] } }, { projectRoot: root });
    expect(aggregateApprovalProjection(await store.read("WP1")).hash).not.toBe(before);
  });

  it("re-versioning a contract KEEPS the old version — a consumer pinned to the old hash still resolves (no clobber)", async () => {
    const store = new ContractStore(aggregateStoreForContext({ projectRoot: root }).root);
    const v1 = await store.put("svc", { ops: ["a"] });
    const v2 = await store.put("svc", { ops: ["a", "b"] }); // re-version
    expect(v1.content_hash).not.toBe(v2.content_hash);
    expect(await store.resolves(v1)).toBe(true); // the OLD version is kept (a pinned consumer is unaffected)
    expect(await store.resolves(v2)).toBe(true);
    expect((await store.getVersion(v1))?.surface).toEqual({ ops: ["a"] });
    expect((await store.getVersion(v2))?.surface).toEqual({ ops: ["a", "b"] });
  });

  it("a NEW Work Packet references an EXISTING contract via a cross-packet contract_dependency (CONTRACT_DEP_UNKNOWN if missing)", async () => {
    const ref = await new ContractStore(aggregateStoreForContext({ projectRoot: root }).root).put("shared-api", { ops: ["list"] }); // produced by an earlier packet
    await workCreate({ id: "WP2", title: "consumer", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    await workSpecAcs({ id: "WP2", spec_id: "WP2", acceptance_criteria: [{ id: "ac1", text: "x", source: "human", source_evidence: null }] }, { projectRoot: root });
    const ok = await workSpecPlan({ id: "WP2", spec_id: "WP2", plan: PLAN, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [{ contract: ref, reason: "consumes the shared API" }] } }, { projectRoot: root });
    expect(ok.ok).toBe(true); // a cross-packet pin to a frozen contract resolves
    const bad = await workSpecPlan({ id: "WP2", spec_id: "WP2", plan: PLAN, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [{ contract: { id: "ghost", content_hash: "nope" }, reason: "r" }] } }, { projectRoot: root });
    expect(bad.ok).toBe(false);
    expect(bad.diagnostics.some((d) => d.code === "CONTRACT_DEP_UNKNOWN")).toBe(true);
  });

  it("a cross-packet contract PIN is bound into approval — changing the pin re-stales", async () => {
    const cstore = new ContractStore(aggregateStoreForContext({ projectRoot: root }).root);
    const r1 = await cstore.put("c1", { ops: ["a"] });
    const r2 = await cstore.put("c2", { ops: ["b"] });
    await workCreate({ id: "WP2", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    await workSpecAcs({ id: "WP2", spec_id: "WP2", acceptance_criteria: [{ id: "ac1", text: "x", source: "human", source_evidence: null }] }, { projectRoot: root });
    const s = aggregateStoreForContext({ projectRoot: root });
    await workSpecPlan({ id: "WP2", spec_id: "WP2", plan: PLAN, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [{ contract: r1, reason: "r" }] } }, { projectRoot: root });
    const before = aggregateApprovalProjection(await s.read("WP2")).hash;
    await workSpecPlan({ id: "WP2", spec_id: "WP2", plan: PLAN, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [{ contract: r2, reason: "r" }] } }, { projectRoot: root });
    expect(aggregateApprovalProjection(await s.read("WP2")).hash).not.toBe(before);
  });

  it("the committed registry is TAMPER-EVIDENT: editing a contract file in place breaks resolution of its pin", async () => {
    const cstore = new ContractStore(aggregateStoreForContext({ projectRoot: root }).root);
    const ref = await cstore.put("c1", { ops: ["a"] });
    expect(await cstore.resolves(ref)).toBe(true);
    const file = path.join(aggregateStoreForContext({ projectRoot: root }).root, "contracts", "c1", `${ref.content_hash}.json`);
    await writeFile(file, JSON.stringify({ schema_version: 1, id: "c1", surface: { ops: ["TAMPERED"] }, content_hash: ref.content_hash }), "utf8"); // surface changed, pin kept
    expect(await cstore.resolves(ref)).toBe(false); // the bytes no longer hash to the pinned ref
  });

  it("contract provenance: the genesis freeze is first_version, a re-version is not, and re-freezing is idempotent", async () => {
    const cstore = new ContractStore(aggregateStoreForContext({ projectRoot: root }).root);
    const v1 = await cstore.put("svc", { ops: ["a"] });
    const v2 = await cstore.put("svc", { ops: ["a", "b"] }); // re-version
    expect((await cstore.getVersion(v1))?.first_version).toBe(true);  // created (the genesis)
    expect((await cstore.getVersion(v2))?.first_version).toBe(false); // updated (a later version)
    await cstore.put("svc", { ops: ["a"] }); // re-freeze v1's surface -> idempotent, provenance preserved
    expect((await cstore.getVersion(v1))?.first_version).toBe(true);
  });

  it("a JSON-Schema surface with NON-integer numbers (minimum: 0.5) freezes + resolves", async () => {
    const cstore = new ContractStore(aggregateStoreForContext({ projectRoot: root }).root);
    const ref = await cstore.put("floaty", { type: "number", minimum: 0.5, multipleOf: 0.1 }); // would throw under integer-only canonical
    expect(await cstore.resolves(ref)).toBe(true);
    expect((await cstore.getVersion(ref))?.surface).toEqual({ type: "number", minimum: 0.5, multipleOf: 0.1 });
  });
});
