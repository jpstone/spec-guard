import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initAction, aggregateStoreForContext, aggregateApprovalProjection, AggregateWorkPacketSchema } from "../src/index.ts";
import { workCreate, workIntent, workDecompose, workSpecAcs, workSpecPlan, workReview, workApprove } from "../src/actions/work.ts";

const PLAN = { kind: "standard_plan" as const, template_id: "t", template_version: 1, summary: "p", approach: ["go"], expected_files: [{ path: "src/index.ts", purpose: "impl", change_type: "create" as const }, { path: "src/index.test.ts", purpose: "tests", change_type: "create" as const }, { path: "docs/api.md", purpose: "docs", change_type: "create" as const }], tests: [] };
const reviewer = (id: string) => ({ role: "reviewer" as const, principal_id: null, agent_instance_id: id, provider: "claude_code" as const, model: null, run_id: "r" });
const EMPTY_DEPS = { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] };

describe("parallel pre-approval spec reviews", () => {
  let root: string;
  const ctx = () => ({ projectRoot: root });
  const store = () => aggregateStoreForContext(ctx());
  beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), "sg-pr-")); await initAction({ project_id: "demo" }, ctx()); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  // A 2-Spec WP, drafted+planned with distinct authors + bootstrap ACs + complete intent — approvable EXCEPT review.
  async function twoSpecs(): Promise<[string, string]> {
    await workCreate({ id: "WP1", title: "App", goal: "g", classification: "direct_behavior" }, ctx());
    await workIntent({ id: "WP1", desired_outcomes: ["o"], in_scope: ["i"], out_of_scope: ["x"], users_actors: ["u"], edge_cases: ["e"], open_questions: ["q"] }, ctx());
    await workDecompose({ id: "WP1", slices: [{ title: "S1", classification: "direct_behavior" }, { title: "S2", classification: "direct_behavior" }] }, ctx());
    const ids = (await store().read("WP1")).specs.map((s) => s.id);
    for (const [i, id] of ids.entries()) {
      await workSpecAcs({ id: "WP1", spec_id: id, acceptance_criteria: [{ id: "ac1", text: "do", source: "human", source_evidence: null }], author_agent_instance_id: `author-${i}` }, ctx());
      await workSpecPlan({ id: "WP1", spec_id: id, plan: PLAN, dependencies: EMPTY_DEPS }, ctx());
    }
    const agg = await store().read("WP1");
    await store().update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((s) => ({ ...s, acceptance_criteria: s.acceptance_criteria.map((ac) => ({ ...ac, bootstrap: true })) })) }));
    return [ids[0]!, ids[1]!];
  }
  const approve = async () => { const hash = aggregateApprovalProjection(await store().read("WP1")).hash; return workApprove({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, ctx()); };
  const wholeReview = (id: string) => workReview({ id: "WP1", producer: reviewer(id), verdict: "pass", blockers: [], summary: "coherent" }, ctx());
  const specReview = (spec_id: string, id: string) => workReview({ id: "WP1", spec_id, producer: reviewer(id), verdict: "pass", blockers: [], summary: "ok" }, ctx());

  it("a multi-Spec WP needs a whole-WP COHERENCE review even when every Spec has a per-Spec review (B1)", async () => {
    const [s1, s2] = await twoSpecs();
    await specReview(s1, "rev1");
    await specReview(s2, "rev2"); // both Specs covered per-Spec, in parallel
    const res = await approve();
    expect(res.ok).toBe(false);
    expect(res.diagnostics.some((d) => d.code === "SPEC_REVIEW_REQUIRED")).toBe(false); // each Spec IS covered
    expect(res.diagnostics.some((d) => d.code === "SPEC_REVIEW_COHERENCE_REQUIRED")).toBe(true); // ...but coherence isn't
  });

  it("approves via per-Spec reviews + a whole-WP coherence review", async () => {
    const [s1, s2] = await twoSpecs();
    await specReview(s1, "rev1");
    await specReview(s2, "rev2");
    await wholeReview("rev3"); // the coherence pass (independent of both authors)
    expect((await approve()).ok).toBe(true);
  });

  it("editing ONE Spec stales only that Spec's coverage — the others stay covered (B3, the parallel win)", async () => {
    const [s1, s2] = await twoSpecs();
    await wholeReview("rev"); // one whole-WP review covers BOTH Specs at their local hashes
    const agg = await store().read("WP1");
    await store().update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((s) => s.id === s1 ? { ...s, acceptance_criteria: [...s.acceptance_criteria, { id: "ac2", text: "more", source: "human" as const, source_evidence: null, bootstrap: true }] } : s) }));
    const res = await approve();
    const stale = res.diagnostics.filter((d) => d.code === "SPEC_REVIEW_STALE");
    expect(stale.some((d) => d.message.includes(s1))).toBe(true);  // S1 re-review needed
    expect(stale.some((d) => d.message.includes(s2))).toBe(false); // S2 still covered — NOT re-reviewed
  });

  it("a CONTAINER edit (intent) stales only COHERENCE, not per-Spec coverage (B2: the per-Spec hash is Spec-local)", async () => {
    await twoSpecs();
    await wholeReview("rev");
    await workIntent({ id: "WP1", desired_outcomes: ["o", "expanded"], in_scope: ["i"], out_of_scope: ["x"], users_actors: ["u"], edge_cases: ["e"], open_questions: ["q"] }, ctx());
    const res = await approve();
    expect(res.diagnostics.some((d) => d.code === "SPEC_REVIEW_COHERENCE_REQUIRED")).toBe(true); // whole hash moved
    expect(res.diagnostics.some((d) => d.code === "SPEC_REVIEW_STALE" || d.code === "SPEC_REVIEW_REQUIRED")).toBe(false); // Spec-local hashes did NOT move
  });

  it("legacy fallback: a whole-WP review with EMPTY per-Spec hashes still covers all Specs while the whole hash is current", async () => {
    await twoSpecs();
    await wholeReview("rev");
    const agg = await store().read("WP1"); // simulate a pre-feature record: strip the per-Spec hashes
    await store().update(AggregateWorkPacketSchema.parse({ ...agg, spec_review_cycles: agg.spec_review_cycles.map((c) => ({ ...c, reviewed_spec_content_hashes: [] })) }));
    expect((await approve()).ok).toBe(true); // covered via the whole-hash fallback + coherence
  });

  it("re_review_waived waives staleness under the two-requirement gate", async () => {
    const [s1] = await twoSpecs();
    await wholeReview("rev");
    let agg = await store().read("WP1");
    await store().update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((s) => s.id === s1 ? { ...s, acceptance_criteria: [...s.acceptance_criteria, { id: "ac2", text: "more", source: "human" as const, source_evidence: null, bootstrap: true }] } : s) }));
    expect((await approve()).ok).toBe(false); // the edit stales -> blocked
    agg = await store().read("WP1");
    await store().update(AggregateWorkPacketSchema.parse({ ...agg, re_review_waived: true }));
    expect((await approve()).ok).toBe(true); // the human waived re-review
  });
});
