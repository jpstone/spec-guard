import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initAction, aggregateApprovalProjection, AggregateWorkPacketSchema, sealImplementationAttempt, ImplementationAttemptSchema, sealReviewCycle, ReviewCycleSchema, executeActionForAgent, type LineageProducer, type ImplementationAttempt } from "../src/index.ts";
import { aggregateStoreForContext } from "../src/actions/config.ts";
import { DecisionLog } from "../src/decisions/decision-log.ts";
import { workCreate, workApprove, workAuthorize, workSpecAdvance, workComplete, workSpecRecord, workDecompose, workSpecMockup, workSpecAcs, workReview, workChoicePrepare, workChoice, workChoices, workGet, workList, workSpecPlan, workParallelismPlan, workIntent, workRevise, workSpecRevise, workNext, workApprovalReady } from "../src/actions/work.ts";
import { workArchitectureWaive } from "../src/actions/architecture.ts";
import { normalizeAcceptanceCriteria, sourceEvidenceHash } from "../src/work/source-evidence.ts";
import type { AcceptanceCriterion } from "../src/schemas/embedded.ts";
import { buildAggregate } from "./helpers/aggregate-fixture.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "sg-v2-"));
  await initAction({ project_id: "demo" }, { projectRoot: root });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

// The approval gate now requires ONE passing whole-WP independent review (over all Specs); record it right before
// an approve so it binds to the current whole-WP content.
const reviewProducer: LineageProducer = { role: "reviewer", principal_id: null, agent_instance_id: "agent-reviewer", provider: "claude_code", model: null, run_id: "rR" };
const recordParallelismPlan = async () => {
  const agg = await aggregateStoreForContext({ projectRoot: root }).read("WP1");
  await workParallelismPlan({
    id: "WP1",
    strategy: "sequential",
    reasoning: "Test fixture uses a conservative sequential implementation plan.",
    execution_groups: agg.specs.map((spec, index) => ({ id: `wave-${index + 1}`, spec_ids: [spec.id], rationale: "Run this Spec in fixture order." })),
    constraints: [],
    risks: []
  }, { projectRoot: root });
};
const recordReviews = async () => {
  await workReview({ id: "WP1", producer: reviewProducer, verdict: "pass", blockers: [], summary: "ok" }, { projectRoot: root });
};
const waiveArchitectureGovernanceIfNeeded = async (id = "WP1") => {
  const store = aggregateStoreForContext({ projectRoot: root });
  const aggregate = await store.read(id);
  if (aggregate.architecture_governance.mode !== "pending") return;
  if (aggregate.origination === "modify_existing") return;
  if (aggregate.architecture.required !== true && aggregate.stack.required !== true) return;
  const waived = await workArchitectureWaive({
    id,
    reason: "Test fixture explicitly waives project-level Architecture Charter ordinances.",
    selected_number: 1,
    raw_response: "waive",
    decision_prompt: "Waive architecture ordinances for this fixture?",
    human_confirmed: true
  }, { projectRoot: root });
  expect(waived.ok).toBe(true);
};
// Greenfield Specs (new_entirely + a required architecture/stack) must carry a bootstrap AC at approval; seed one
// on every Spec of WP1 right after creation/decomposition (before the hash is computed, so it isn't staled).
const seedBootstrapAcs = async () => {
  const store = aggregateStoreForContext({ projectRoot: root });
  const agg = await store.read("WP1");
  await store.update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((spec) => ({ ...spec, acceptance_criteria: [{ id: "bac", text: "bootstrap the repo", source: "human" as const, source_evidence: null, bootstrap: true }] })) }));
  // The approval gate also requires an implementation plan per Spec; seed one (after the ACs, before the hash).
  for (const spec of (await store.read("WP1")).specs) {
    await workSpecPlan({ id: "WP1", spec_id: spec.id, plan: { kind: "standard_plan", template_id: "t", template_version: 1, summary: "plan", approach: ["build it"], expected_files: [{ path: "src/index.ts", purpose: "impl", change_type: "create" }, { path: "src/index.test.ts", purpose: "tests", change_type: "create" }, { path: "docs/api.md", purpose: "docs", change_type: "create" }], tests: [] }, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] }, contract_surface: { ops: ["x"] } }, { projectRoot: root });
  }
  await recordParallelismPlan();
  // The approval gate requires a COMPLETE whole-WP intent (all six sections); seed one (before the hash).
  await workIntent({ id: "WP1", desired_outcomes: ["delivered"], in_scope: ["the feature"], out_of_scope: ["unrelated work"], users_actors: ["end user"], edge_cases: ["empty input"], open_questions: ["none"] }, { projectRoot: root });
  await waiveArchitectureGovernanceIfNeeded();
};

describe("workCreate (v2 cutover: create)", () => {
  it("creates an undecomposed aggregate Work Packet persisted as one document", async () => {
    const result = await workCreate({ id: "WP1", title: "My WP", goal: "do the thing", classification: "reusable_api" }, { projectRoot: root });
    expect(result.ok).toBe(true);
    // it is persisted + readable as a one-Spec v2 aggregate at the same root the v1 store uses
    const stored = await aggregateStoreForContext({ projectRoot: root }).read("WP1");
    expect(stored.schema_version).toBe(2);
    expect(stored.title).toBe("My WP");
    expect(stored.specs.map((s) => s.id)).toEqual(["WP1"]);
    expect(stored.specs[0]?.classification).toBe("reusable_api");
  });

  it("rejects a duplicate id (the store create guard surfaces as a failed action)", async () => {
    await workCreate({ id: "WP1", title: "a", goal: "g", classification: "reusable_api" }, { projectRoot: root });
    const dup = await workCreate({ id: "WP1", title: "b", goal: "g", classification: "reusable_api" }, { projectRoot: root });
    expect(dup.ok).toBe(false);
  });
});

describe("workApprove (v2 cutover: whole-WP approve)", () => {
  const create = async () => { await workCreate({ id: "WP1", title: "My WP", goal: "g", classification: "reusable_api" }, { projectRoot: root }); await seedBootstrapAcs(); };
  const currentHash = async () => aggregateApprovalProjection(await aggregateStoreForContext({ projectRoot: root }).read("WP1")).hash;

  it("binds the whole-WP approval hash and records it on lifecycle.approval", async () => {
    await create();
    const hash = await currentHash();
    await recordReviews();
    const result = await workApprove({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    expect(result.ok).toBe(true);
    const stored = await aggregateStoreForContext({ projectRoot: root }).read("WP1");
    expect(stored.lifecycle.approval).not.toBeNull();
    expect(stored.lifecycle.approval?.decision_type).toBe("aggregate_work_packet_approval");
    expect(stored.lifecycle.approval?.review_snapshot_hash).toBe(hash);
    // the gate decision is also appended to the DecisionLog so decision.get/list see it
    const decisions = await new DecisionLog(aggregateStoreForContext({ projectRoot: root }).root).list();
    expect(decisions.some((d) => d.decision_type === "aggregate_work_packet_approval")).toBe(true);
  });

  it("rejects a stale snapshot hash (content changed since review)", async () => {
    await create();
    const stale = await workApprove({ id: "WP1", review_snapshot_hash: "deadbeef", selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    expect(stale.ok).toBe(false);
  });

  it("requires human_confirmed: true", async () => {
    await create();
    const unconfirmed = await workApprove({ id: "WP1", review_snapshot_hash: await currentHash(), selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: false }, { projectRoot: root });
    expect(unconfirmed.ok).toBe(false);
  });

  it("blocks approval when a Spec has no independent spec review (SPEC_REVIEW_REQUIRED)", async () => {
    await create(); // NOTE: no recordReviews() -> the Spec has no spec review
    const result = await workApprove({ id: "WP1", review_snapshot_hash: await currentHash(), selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "SPEC_REVIEW_REQUIRED")).toBe(true);
  });

  it("blocks approval of a modify_existing packet that has not inherited its target baseline (RUNTIME_BASELINE_REF_REQUIRED)", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior", origination: "modify_existing" }, { projectRoot: root });
    await seedBootstrapAcs(); // ACs + plan + intent (so only the inherit gate is left)
    await recordReviews();
    const result = await workApprove({ id: "WP1", review_snapshot_hash: await currentHash(), selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "RUNTIME_BASELINE_REF_REQUIRED")).toBe(true);
  });

  it("blocks approval when a greenfield Spec has no bootstrap AC (BOOTSTRAP_ACS_MISSING)", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "reusable_api" }, { projectRoot: root }); // greenfield, no bootstrap AC (no seedBootstrapAcs)
    await waiveArchitectureGovernanceIfNeeded();
    await recordReviews();
    const result = await workApprove({ id: "WP1", review_snapshot_hash: await currentHash(), selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "BOOTSTRAP_ACS_MISSING")).toBe(true);
  });

  it("re-approval after a Spec edit re-binds to the new hash, unblocking authorize", async () => {
    await create();
    const h1 = await currentHash();
    await recordReviews();
    await workApprove({ id: "WP1", review_snapshot_hash: h1, selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    // edit a Spec -> the hash changes -> the approval is now stale
    const store = aggregateStoreForContext({ projectRoot: root });
    const agg = await store.read("WP1");
    await store.update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((s) => ({ ...s, scope: { ...s.scope, allowed_globs: ["src/**", "lib/**"] } })) }));
    await recordReviews(); // a Spec edit stales the whole-WP review (it binds to the full content) -> re-review at h2
    const h2 = await currentHash(); // editing scope re-stales the whole-WP approval (and the review, re-run above)
    expect(h2).not.toBe(h1);
    // re-approve at the new hash, then authorize succeeds (the approval is current again)
    expect((await workApprove({ id: "WP1", review_snapshot_hash: h2, selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root })).ok).toBe(true);
    expect((await workAuthorize({ id: "WP1", review_snapshot_hash: h2, selected_number: 1, raw_response: "1", decision_prompt: "Authorize?", human_confirmed: true }, { projectRoot: root })).ok).toBe(true);
  });

  it("blocks approval when a Spec's docs policy is invalid for its classification (per-Spec readiness)", async () => {
    await create(); // reusable_api WP1
    const s = aggregateStoreForContext({ projectRoot: root });
    const agg = await s.read("WP1");
    // a reusable_api Spec is an API contract surface — docs are required, so none_required is invalid
    await s.update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((spec) => ({ ...spec, docs: { policy: "none_required", none_required_reason: "x", not_applicable_reason: null, requirements: [] } })) }));
    const result = await workApprove({ id: "WP1", review_snapshot_hash: await currentHash(), selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "WORK_APPROVE_SPEC_DOCS_INVALID")).toBe(true);
  });

  const editAScope = async () => {
    const store = aggregateStoreForContext({ projectRoot: root });
    const agg = await store.read("WP1");
    await store.update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((s) => ({ ...s, scope: { ...s.scope, allowed_globs: ["src/**", "lib/**"] } })) }));
  };

  it("request_changes requires the human's re-review choice — the prompt is enforced", async () => {
    await create();
    const blocked = await workApprove({ id: "WP1", review_snapshot_hash: "x", selected_number: 2, raw_response: "changes", decision_prompt: "Approve?", human_confirmed: true, decision: "request_changes" }, { projectRoot: root });
    expect(blocked.ok).toBe(false);
    expect(blocked.diagnostics.some((d) => d.code === "WORK_APPROVE_REREVIEW_PROMPT_REQUIRED")).toBe(true);
  });

  it("request_changes with re_review_required:false WAIVES the next approval's stale-review check", async () => {
    await create();
    await recordReviews();
    const rc = await workApprove({ id: "WP1", review_snapshot_hash: await currentHash(), selected_number: 2, raw_response: "tweak", decision_prompt: "Approve?", human_confirmed: true, decision: "request_changes", re_review_required: false }, { projectRoot: root });
    expect(rc.ok).toBe(true);
    const store = aggregateStoreForContext({ projectRoot: root });
    expect((await store.read("WP1")).re_review_waived).toBe(true);
    await editAScope(); // the agent edits a Spec -> the whole-WP review goes stale
    const reapprove = await workApprove({ id: "WP1", review_snapshot_hash: await currentHash(), selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    expect(reapprove.ok).toBe(true); // succeeds despite the stale review (re-review waived)
    expect((await store.read("WP1")).re_review_waived).toBe(false); // waiver cleared on approval
  });

  it("request_changes with re_review_required:true still REQUIRES a fresh review after the change (SPEC_REVIEW_STALE)", async () => {
    await create();
    await recordReviews();
    await workApprove({ id: "WP1", review_snapshot_hash: await currentHash(), selected_number: 2, raw_response: "fix", decision_prompt: "Approve?", human_confirmed: true, decision: "request_changes", re_review_required: true }, { projectRoot: root });
    const store = aggregateStoreForContext({ projectRoot: root });
    expect((await store.read("WP1")).re_review_waived).toBe(false);
    await editAScope();
    const blocked = await workApprove({ id: "WP1", review_snapshot_hash: await currentHash(), selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    expect(blocked.ok).toBe(false);
    expect(blocked.diagnostics.some((d) => d.code === "SPEC_REVIEW_STALE")).toBe(true);
  });
});

describe("workRevise + workSpecRevise (post-approval correction)", () => {
  const store = () => aggregateStoreForContext({ projectRoot: root });
  const currentHash = async () => aggregateApprovalProjection(await store().read("WP1")).hash;
  const createApproveAuthorize = async () => {
    await workCreate({ id: "WP1", title: "My WP", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    await seedBootstrapAcs();
    await recordReviews();
    const hash = await currentHash();
    await workApprove({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    await workAuthorize({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Authorize?", human_confirmed: true }, { projectRoot: root });
  };

  it("reopens an approved + authorized packet back to draft for human-requested revision", async () => {
    await createApproveAuthorize();
    expect((await store().read("WP1")).lifecycle.authorization).not.toBeNull();
    const result = await workRevise({ id: "WP1", selected_number: 1, raw_response: "Wrong classification", decision_prompt: "Reopen?", human_confirmed: true, reason: "Spec was misclassified as direct behavior." }, { projectRoot: root });
    expect(result.ok).toBe(true);
    const stored = await store().read("WP1");
    expect(stored.lifecycle.approval).toBeNull();
    expect(stored.lifecycle.authorization).toBeNull();
    expect(stored.lifecycle.completion).toBeNull();
    expect(stored.specs.every((spec) => spec.workflow_state === "packet_draft")).toBe(true);
    expect(stored.specs.every((spec) => spec.change_baseline === null)).toBe(true);
    expect(stored.decision_history.some((decision) => decision.decision_type === "aggregate_work_packet_revision")).toBe(true);
  });

  it("blocks Spec metadata edits while approved, then allows reclassification after work.revise and requires a new contract plan", async () => {
    await createApproveAuthorize();
    const blocked = await workSpecRevise({ id: "WP1", spec_id: "WP1", classification: "reusable_api" }, { projectRoot: root });
    expect(blocked.ok).toBe(false);
    expect(blocked.diagnostics.some((d) => d.code === "WORK_SPEC_REVISE_APPROVED")).toBe(true);

    await workRevise({ id: "WP1", selected_number: 1, raw_response: "API contract was missed", decision_prompt: "Reopen?", human_confirmed: true, reason: "Spec should be reusable_api so the contract is frozen." }, { projectRoot: root });
    const revised = await workSpecRevise({ id: "WP1", spec_id: "WP1", classification: "reusable_api", allowed_globs: ["src/api/**"] }, { projectRoot: root });
    expect(revised.ok).toBe(true);
    expect(revised.diagnostics.some((d) => d.code === "WORK_SPEC_REVISE_PLAN_RESET")).toBe(true);
    const spec = (await store().read("WP1")).specs[0]!;
    expect(spec.classification).toBe("reusable_api");
    expect(spec.scope.allowed_globs).toEqual(["src/api/**"]);
    expect(spec.implementation_plan).toBeNull();
    expect(spec.contract).toBeNull();
    expect(spec.docs.policy).toBe("required");

    const plan = { kind: "standard_plan" as const, template_id: "t", template_version: 1, summary: "plan", approach: ["build it"], expected_files: [{ path: "src/api/index.ts", purpose: "impl", change_type: "create" as const }, { path: "src/api/index.test.ts", purpose: "tests", change_type: "create" as const }, { path: "docs/api.md", purpose: "docs", change_type: "create" as const }], tests: [] };
    const noContract = await workSpecPlan({ id: "WP1", spec_id: "WP1", plan, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] } }, { projectRoot: root });
    expect(noContract.ok).toBe(false);
    expect(noContract.diagnostics.some((d) => d.code === "CONTRACT_REQUIRED")).toBe(true);
    const withContract = await workSpecPlan({ id: "WP1", spec_id: "WP1", plan, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] }, contract_surface: { operations: [{ name: "doThing", input: { type: "object" }, output: { type: "object" } }] } }, { projectRoot: root });
    expect(withContract.ok).toBe(true);
    expect((await store().read("WP1")).specs[0]?.contract).not.toBeNull();
  });
});

describe("workComplete (v2 cutover: whole-WP completion gate)", () => {
  const store = () => aggregateStoreForContext({ projectRoot: root });
  const approveAuthorize = async () => {
    await waiveArchitectureGovernanceIfNeeded();
    const hash = aggregateApprovalProjection(await store().read("WP1")).hash;
    await recordReviews();
    await workApprove({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    await workAuthorize({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Authorize?", human_confirmed: true }, { projectRoot: root });
    return hash;
  };

  it("blocks completion of greenfield work until an accepted runtime baseline exists (dev-runtime proof)", async () => {
    // a greenfield API surface (reusable_api/rest_api, new_entirely) requires the dev-runtime proof at completion
    await store().create(buildAggregate("WP1", ["reusable_api", "rest_api"]));
    const hash = await approveAuthorize();
    const agg = await store().read("WP1");
    await store().update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((s) => ({ ...s, workflow_state: "review_complete" })) }));
    const result = await workComplete({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Complete?", human_confirmed: true }, { projectRoot: root });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "COMPLETION_RUNTIME_BASELINE_REQUIRED")).toBe(true);
  });

  it("completes the WP when every Spec is review_complete (non-greenfield: no proof needed), marking all complete", async () => {
    await store().create(buildAggregate("WP1", ["direct_behavior", "direct_behavior"]));
    const hash = await approveAuthorize();
    const agg = await store().read("WP1");
    await store().update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((s) => ({ ...s, workflow_state: "review_complete" })) }));
    const result = await workComplete({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Complete?", human_confirmed: true }, { projectRoot: root });
    expect(result.ok).toBe(true);
    const stored = await store().read("WP1");
    expect(stored.lifecycle.completion).not.toBeNull();
    expect(stored.specs.every((s) => s.workflow_state === "complete")).toBe(true);
  });

  it("rejects completion while ANY Spec is not review_complete", async () => {
    await store().create(buildAggregate("WP1", ["reusable_api", "rest_api"]));
    const hash = await approveAuthorize();
    const agg = await store().read("WP1");
    // only the first Spec reaches review_complete
    await store().update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((s, i) => (i === 0 ? { ...s, workflow_state: "review_complete" } : s)) }));
    const result = await workComplete({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Complete?", human_confirmed: true }, { projectRoot: root });
    expect(result.ok).toBe(false);
  });

  it("Discuss (3) is non-mutating: it does NOT complete a completable Work Packet", async () => {
    await store().create(buildAggregate("WP1", ["direct_behavior", "direct_behavior"]));
    const hash = await approveAuthorize();
    const agg = await store().read("WP1");
    await store().update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((s) => ({ ...s, workflow_state: "review_complete" })) }));
    const result = await workComplete({ id: "WP1", review_snapshot_hash: hash, selected_number: 3, raw_response: "3", decision_prompt: "Complete?", human_confirmed: true }, { projectRoot: root });
    expect(result.ok).toBe(true);
    const stored = await store().read("WP1");
    expect(stored.lifecycle.completion).toBeNull();
    expect(stored.specs.every((s) => s.workflow_state === "review_complete")).toBe(true);
  });

  it("decline (No=2) routes Specs to review_blocked AND persists the decline decision in decision_history", async () => {
    await store().create(buildAggregate("WP1", ["direct_behavior", "direct_behavior"]));
    const hash = await approveAuthorize();
    const agg = await store().read("WP1");
    await store().update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((s) => ({ ...s, workflow_state: "review_complete" })) }));
    const before = (await store().read("WP1")).decision_history.length;
    const result = await workComplete({ id: "WP1", review_snapshot_hash: hash, selected_number: 2, raw_response: "2", decision_prompt: "Complete?", human_confirmed: true }, { projectRoot: root });
    expect(result.ok).toBe(true);
    const stored = await store().read("WP1");
    expect(stored.lifecycle.completion).toBeNull();
    expect(stored.specs.every((s) => s.workflow_state === "review_blocked")).toBe(true);
    expect(stored.decision_history.length).toBe(before + 1);
  });
});

describe("workSpecRecord (v2 cutover: per-Spec sealed record + advance)", () => {
  const producer: LineageProducer = { role: "implementer", principal_id: null, agent_instance_id: "sg-role-implementer", provider: "claude_code", model: null, run_id: "r1" };
  const sealedAttempt = (id: string): ImplementationAttempt => {
    const inProgress = ImplementationAttemptSchema.parse({
      schema_version: 1, hash_algorithm: "sha256-canonical-json-v1", id, state: "in_progress", attempt_hash: null,
      kind: "initial_implementation", producer, authorization_id: "auth:1", authorization_type: "implementation_authorization",
      packet_approval_hash: "pah", implementation_plan_hash: "iph", focused_fix_instruction_id: null,
      evidence_preparation_scope_ref: null, source_instruction_id: null, pre_attempt_tree_hash: "pre",
      started_at: "2026-01-01T00:00:00.000Z", completed_at: null, post_attempt_tree_hash: null, diff_hash: null,
      changed_files: ["src/x.ts"], summary: "did it", clarification_request_ids: []
    });
    if (inProgress.state !== "in_progress") throw new Error("expected in_progress");
    return sealImplementationAttempt(inProgress, { completed_at: "2026-01-01T00:05:00.000Z", post_attempt_tree_hash: "post", diff_hash: "diff" });
  };
  const store = () => aggregateStoreForContext({ projectRoot: root });
  const setup = async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "reusable_api" }, { projectRoot: root });
    await seedBootstrapAcs();
    const hash = aggregateApprovalProjection(await store().read("WP1")).hash;
    await recordReviews();
    await workApprove({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    await workAuthorize({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Authorize?", human_confirmed: true }, { projectRoot: root });
  };

  it("appends a sealed implementation_attempt to a Spec and advances it through the record-gated transition", async () => {
    await setup(); // Spec WP1 at implementation_authorized
    // the SIMPLE report — work.spec.record synthesizes + seals the full attempt
    const result = await workSpecRecord({ id: "WP1", spec_id: "WP1", record_kind: "implementation_attempt", record: { producer, summary: "did it", changed_files: ["src/x.ts"] }, next_state: "implementation_attempt_complete" }, { projectRoot: root });
    expect(result.ok).toBe(true);
    const spec = (await store().read("WP1")).specs.find((s) => s.id === "WP1");
    expect(spec?.workflow_state).toBe("implementation_attempt_complete");
    expect(spec?.implementation_attempts.length).toBe(1);
    expect(spec?.implementation_attempts[0]?.state).toBe("sealed"); // sealed by the tool, not the caller
    expect(spec?.implementation_attempts[0]?.attempt_hash).toBeTruthy(); // hash computed for us
  });

  it("rejects an implementation attempt whose producer.model is below the configured implementer tier", async () => {
    await setup();
    const blocked = await workSpecRecord({ id: "WP1", spec_id: "WP1", record_kind: "implementation_attempt", record: { producer: { ...producer, model: "claude-haiku-4-5-20251001" }, summary: "did it", changed_files: ["src/x.ts"] }, next_state: "implementation_attempt_complete" }, { projectRoot: root });
    expect(blocked.ok).toBe(false);
    expect(blocked.diagnostics.some((d) => d.code === "IMPLEMENTATION_MODEL_BELOW_CONFIGURED_TIER")).toBe(true);
  });

  it("rejects an invalid lineage record", async () => {
    await setup();
    const result = await workSpecRecord({ id: "WP1", spec_id: "WP1", record_kind: "implementation_attempt", record: { not: "valid" }, next_state: "implementation_attempt_complete" }, { projectRoot: root });
    expect(result.ok).toBe(false);
  });

  // A review by an agent whose identity matches the implementer of the attempt under review. The identity check
  // runs over the SYNTHESIZED v1 leaf view of the Spec (specAsV1WorkPacket), so this also guards against a
  // regression that drops the Spec's implementation_attempts from that view (which would silently disable it).
  it("rejects a SELF-review: the reviewer identity matches the Spec's implementer (LOOP_SELF_REVIEW_BLOCKED)", async () => {
    await setup();
    const s = store();
    const agg = await s.read("WP1");
    // place the Spec at review_pending with a prior sealed implementation attempt by `producer` (sg-role-implementer)
    await s.update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((spec) => ({ ...spec, workflow_state: "review_pending", implementation_attempts: [sealedAttempt("attempt:1")] })) }));
    // a review by the SAME agent_instance_id as that implementer -> self-review, must be rejected over the synthesized view
    const result = await workSpecRecord({ id: "WP1", spec_id: "WP1", record_kind: "review_cycle", record: { producer: { role: "reviewer", principal_id: null, agent_instance_id: producer.agent_instance_id, provider: "claude_code", model: null, run_id: "r2" }, verdict: "pass", summary: "looks good" }, next_state: "review_passed" }, { projectRoot: root });
    expect(result.ok).toBe(false);
    // specifically the self-review block (not a parse/transition failure) — proves the check saw the Spec's attempt
    expect(result.diagnostics.some((d) => d.code === "LOOP_SELF_REVIEW_BLOCKED")).toBe(true);
  });

  it("synthesizes + seals a PASSING review from a SIMPLE report (independent reviewer)", async () => {
    await setup();
    const s = store();
    const agg = await s.read("WP1");
    await s.update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((spec) => ({ ...spec, workflow_state: "review_pending", implementation_attempts: [sealedAttempt("attempt:1")] })) }));
    const reviewer = { role: "reviewer" as const, principal_id: null, agent_instance_id: "agent-reviewer", provider: "claude_code" as const, model: null, run_id: "r2" };
    const result = await workSpecRecord({ id: "WP1", spec_id: "WP1", record_kind: "review_cycle", record: { producer: reviewer, verdict: "pass", summary: "looks good" }, next_state: "review_passed" }, { projectRoot: root });
    expect(result.ok).toBe(true);
    const spec = (await s.read("WP1")).specs.find((sp) => sp.id === "WP1");
    expect(spec?.review_cycles.length).toBe(1);
    expect(spec?.review_cycles[0]?.state).toBe("sealed"); // sealed by the tool
    expect(spec?.review_cycles[0]?.verdict).toBe("pass");
    expect(spec?.workflow_state).toBe("review_passed");
  });
});

describe("workDecompose (v2 cutover: work breakdown -> multi-Spec)", () => {
  const store = () => aggregateStoreForContext({ projectRoot: root });
  const create = async () => { await workCreate({ id: "WP1", title: "App", goal: "build the app", classification: "one_off_application_ui" }, { projectRoot: root }); await seedBootstrapAcs(); };

  it("replaces the single self-Spec with the breakdown Specs (each its own classification)", async () => {
    await create();
    const result = await workDecompose({ id: "WP1", slices: [{ title: "API", classification: "reusable_api" }, { title: "UI", classification: "one_off_application_ui" }] }, { projectRoot: root });
    expect(result.ok).toBe(true);
    const stored = await store().read("WP1");
    expect(stored.specs.map((s) => s.id)).toEqual(["WP1-s1", "WP1-s2"]);
    expect(stored.specs.map((s) => s.classification)).toEqual(["reusable_api", "one_off_application_ui"]);
  });

  it("rejects a decomposition into fewer than 2 Specs", async () => {
    await create();
    const result = await workDecompose({ id: "WP1", slices: [{ title: "Only", classification: "reusable_api" }] }, { projectRoot: root });
    expect(result.ok).toBe(false);
  });

  it("rejects decomposition after approval (the breakdown defines what is approved)", async () => {
    await workCreate({ id: "WP1", title: "App", goal: "g", classification: "reusable_api" }, { projectRoot: root });
    await seedBootstrapAcs();
    const hash = aggregateApprovalProjection(await store().read("WP1")).hash;
    await recordReviews();
    await workApprove({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    const result = await workDecompose({ id: "WP1", slices: [{ title: "A", classification: "reusable_api" }, { title: "B", classification: "reusable_api" }] }, { projectRoot: root });
    expect(result.ok).toBe(false);
  });

  it("a UI Spec blocks bulk approval until its mockup is resolved, then approves as ONE whole-WP approval", async () => {
    await create();
    await workDecompose({ id: "WP1", slices: [{ title: "API", classification: "reusable_api" }, { title: "UI", classification: "one_off_application_ui" }] }, { projectRoot: root });
    // the UI Spec's mockup is pending -> the whole-WP approval is blocked
    const blocked = await workApprove({ id: "WP1", review_snapshot_hash: aggregateApprovalProjection(await store().read("WP1")).hash, selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    expect(blocked.ok).toBe(false);
    // resolve the UI Spec's mockup, then the bulk approval succeeds
    await workSpecMockup({ id: "WP1", spec_id: "WP1-s2", mockup_decision: "none", human_confirmed: true, raw_response: "no mockup — draft it", decision_prompt: "Do you have a mockup/design?" }, { projectRoot: root });
    await seedBootstrapAcs(); // the decomposed slices are greenfield -> each needs a bootstrap AC
    await recordReviews();
    const approve = await workApprove({ id: "WP1", review_snapshot_hash: aggregateApprovalProjection(await store().read("WP1")).hash, selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    expect(approve.ok).toBe(true);
    expect((await store().read("WP1")).lifecycle.approval).not.toBeNull();
  });
});

describe("workSpecAcs (v2 cutover: per-Spec AC drafting)", () => {
  const store = () => aggregateStoreForContext({ projectRoot: root });

  it("drafts ACs onto a Spec (pre-approval); they enter the whole-WP approval hash", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "reusable_api" }, { projectRoot: root });
    const before = aggregateApprovalProjection(await store().read("WP1")).hash;
    const result = await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [{ id: "ac1", text: "does the thing", source: "human", source_evidence: null }] }, { projectRoot: root });
    expect(result.ok).toBe(true);
    expect((await store().read("WP1")).specs.find((s) => s.id === "WP1")?.acceptance_criteria.length).toBe(1);
    expect(aggregateApprovalProjection(await store().read("WP1")).hash).not.toBe(before); // ACs are in the approval hash
  });

  it("blocks drafting ACs on a UI Spec until its mockup is resolved (mockup is the FIRST feature step)", async () => {
    await workCreate({ id: "WP1", title: "App", goal: "g", classification: "one_off_application_ui" }, { projectRoot: root });
    const blocked = await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [{ id: "ac1", text: "a feature", source: "human", source_evidence: null }] }, { projectRoot: root });
    expect(blocked.ok).toBe(false);
    expect(blocked.diagnostics.some((d) => d.code === "MOCKUP_DECISION_REQUIRED")).toBe(true);
    await workSpecMockup({ id: "WP1", spec_id: "WP1", mockup_decision: "none", human_confirmed: true, raw_response: "no mockup — draft it", decision_prompt: "Do you have a mockup/design?" }, { projectRoot: root });
    const ok = await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [{ id: "ac1", text: "a feature", source: "human", source_evidence: null }] }, { projectRoot: root });
    expect(ok.ok).toBe(true);
  });

  it("the mockup decision is a HUMAN gate: setting it WITHOUT human confirmation is rejected (WORK_SPEC_MOCKUP_UNCONFIRMED)", async () => {
    await workCreate({ id: "WP1", title: "App", goal: "g", classification: "one_off_application_ui" }, { projectRoot: root });
    // The exact ../todos failure: an agent sets mockup 'none' on the human's behalf. Now blocked without confirmation.
    const unconfirmed = await workSpecMockup({ id: "WP1", spec_id: "WP1", mockup_decision: "none", human_confirmed: false, raw_response: "(agent never asked)", decision_prompt: "Do you have a mockup/design?" }, { projectRoot: root });
    expect(unconfirmed.ok).toBe(false);
    expect(unconfirmed.diagnostics.some((d) => d.code === "WORK_SPEC_MOCKUP_UNCONFIRMED")).toBe(true);
  });

  it("rejects drafting ACs after approval (a re-draft would re-stale; re-approve instead)", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "reusable_api" }, { projectRoot: root });
    await seedBootstrapAcs();
    const hash = aggregateApprovalProjection(await store().read("WP1")).hash;
    await recordReviews();
    await workApprove({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    const result = await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [{ id: "ac1", text: "x", source: "human", source_evidence: null }] }, { projectRoot: root });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid ACs at draft time (duplicate AC ids) — the validation actually fires", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "reusable_api" }, { projectRoot: root });
    const result = await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [
      { id: "ac1", text: "a", source: "human", source_evidence: null },
      { id: "ac1", text: "b", source: "human", source_evidence: null }
    ] }, { projectRoot: root });
    expect(result.ok).toBe(false);
  });
});

describe("workReview (v2: ONE whole-WP independent review over all Specs)", () => {
  const store = () => aggregateStoreForContext({ projectRoot: root });
  const reviewer = (agentId: string): LineageProducer => ({ role: "reviewer", principal_id: null, agent_instance_id: agentId, provider: "claude_code", model: null, run_id: "r1" });
  const setupWithAuthor = async (authorId: string) => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "reusable_api" }, { projectRoot: root });
    await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [{ id: "ac1", text: "do x", source: "human", source_evidence: null }], author_agent_instance_id: authorId }, { projectRoot: root });
    await workSpecPlan({ id: "WP1", spec_id: "WP1", plan: { kind: "standard_plan", template_id: "t", template_version: 1, summary: "plan", approach: ["build it"], expected_files: [{ path: "src/index.ts", purpose: "impl", change_type: "create" }, { path: "src/index.test.ts", purpose: "tests", change_type: "create" }, { path: "docs/api.md", purpose: "docs", change_type: "create" }], tests: [] }, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] }, contract_surface: { ops: ["x"] } }, { projectRoot: root });
    await recordParallelismPlan();
  };

  it("records the whole-WP review ON THE CONTAINER (reviewer != every Spec author)", async () => {
    await setupWithAuthor("agent-author");
    const result = await workReview({ id: "WP1", producer: reviewer("agent-reviewer"), verdict: "pass", blockers: [], summary: "looks good" }, { projectRoot: root });
    expect(result.ok).toBe(true);
    expect((await store().read("WP1")).spec_review_cycles.length).toBe(1);
    expect((await store().read("WP1")).specs[0]?.spec_review_cycles.length).toBe(0); // NOT recorded per-Spec
  });

  it("rejects a SELF-review (reviewer identity == ANY Spec author)", async () => {
    await setupWithAuthor("agent-author");
    const result = await workReview({ id: "WP1", producer: reviewer("agent-author"), verdict: "pass", blockers: [], summary: "self" }, { projectRoot: root });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "SPEC_SELF_REVIEW_BLOCKED")).toBe(true);
  });

  it("blocks when the reviewer authored ONE Spec even though the OTHER Specs are clean (decomposed WP)", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    await workDecompose({ id: "WP1", slices: [{ title: "S1", classification: "direct_behavior" }, { title: "S2", classification: "direct_behavior" }] }, { projectRoot: root });
    const specs = (await store().read("WP1")).specs;
    await workSpecAcs({ id: "WP1", spec_id: specs[0]!.id, acceptance_criteria: [{ id: "ac1", text: "do x", source: "human", source_evidence: null }], author_agent_instance_id: "agent-A" }, { projectRoot: root });
    await workSpecAcs({ id: "WP1", spec_id: specs[1]!.id, acceptance_criteria: [{ id: "ac1", text: "do y", source: "human", source_evidence: null }], author_agent_instance_id: "agent-B" }, { projectRoot: root });
    for (const s of specs) await workSpecPlan({ id: "WP1", spec_id: s.id, plan: { kind: "standard_plan", template_id: "t", template_version: 1, summary: "p", approach: ["go"], expected_files: [{ path: "src/index.ts", purpose: "impl", change_type: "create" }, { path: "src/index.test.ts", purpose: "tests", change_type: "create" }, { path: "docs/api.md", purpose: "docs", change_type: "create" }], tests: [] }, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] }, contract_surface: { ops: ["x"] } }, { projectRoot: root });
    await recordParallelismPlan();
    // reviewer == the SECOND Spec's author -> still blocked even though the first Spec is clean (dedupe must NOT mask it)
    const blocked = await workReview({ id: "WP1", producer: reviewer("agent-B"), verdict: "pass", blockers: [], summary: "x" }, { projectRoot: root });
    expect(blocked.ok).toBe(false);
    expect(blocked.diagnostics.some((d) => d.code === "SPEC_SELF_REVIEW_BLOCKED")).toBe(true);
    // a reviewer independent of EVERY author passes
    expect((await workReview({ id: "WP1", producer: reviewer("agent-C"), verdict: "pass", blockers: [], summary: "ok" }, { projectRoot: root })).ok).toBe(true);
  });

  it("requires EVERY Spec to be drafted (>=1 AC) before the whole-WP review", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    const blocked = await workReview({ id: "WP1", producer: reviewer("agent-reviewer"), verdict: "pass", blockers: [], summary: "ok" }, { projectRoot: root });
    expect(blocked.ok).toBe(false);
    expect(blocked.diagnostics.some((d) => d.code === "SPEC_REVIEW_DRAFT_INCOMPLETE")).toBe(true);
  });

  it("rejects a review whose producer.model is below the configured reviewer tier; accepts the configured model", async () => {
    await setupWithAuthor("agent-author");
    // declared a cheaper model than the configured reviewer tier (high_judgment = claude-opus-4-8) -> blocked
    const blocked = await workReview({ id: "WP1", producer: { ...reviewer("agent-reviewer"), model: "claude-haiku-4-5-20251001" }, verdict: "pass", blockers: [], summary: "x" }, { projectRoot: root });
    expect(blocked.ok).toBe(false);
    expect(blocked.diagnostics.some((d) => d.code === "REVIEWER_MODEL_BELOW_CONFIGURED_TIER")).toBe(true);
    // declared the configured tier model -> accepted, and the response surfaces the expected model
    const ok = await workReview({ id: "WP1", producer: { ...reviewer("agent-reviewer"), model: "claude-opus-4-8" }, verdict: "pass", blockers: [], summary: "ok" }, { projectRoot: root });
    expect(ok.ok).toBe(true);
    expect((ok.data as { expected_reviewer_model: string }).expected_reviewer_model).toBe("claude-opus-4-8");
  });
});

describe("v2 parity: structural choice + origination", () => {
  const store = () => aggregateStoreForContext({ projectRoot: root });
  const prepareChoice = async (choice_type: "platform_choice" | "architecture_choice" | "stack_choice", prompt_text: string, labels: string[], recommendedIndex = 0) => {
    const result = await workChoicePrepare({
      id: "WP1",
      choice_type,
      prompt_text,
      options: labels.map((label, index) => ({
        label,
        ...(index === recommendedIndex ? { recommended: true, recommendation_rationale: "Best fit for this fixture." } : {})
      }))
    }, { projectRoot: root });
    expect(result.ok).toBe(true);
    return result.data as { human_gate_token: string; decision_prompt: string; options_presented: string[] };
  };

  it("records a platform structural choice on the container", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "one_off_application_ui" }, { projectRoot: root });
    const gate = await prepareChoice("platform_choice", "Platform?", ["web", "Type your own answer", "Discuss"]);
    const result = await workChoice({ id: "WP1", human_gate_token: gate.human_gate_token, choice_type: "platform_choice", choice: "web", custom_response: null, option_details: null, options_presented: gate.options_presented, selected_number: 1, raw_response: "web", decision_prompt: gate.decision_prompt, human_confirmed: true }, { projectRoot: root });
    expect(result.ok).toBe(true);
    const stored = await store().read("WP1");
    expect(stored.platform.choice).toBe("web");
    expect(stored.platform.decision_id).not.toBeNull();
  });

  it("rejects work.choice without a prepared human gate token", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "one_off_application_ui" }, { projectRoot: root });
    const result = await workChoice({ id: "WP1", choice_type: "platform_choice", choice: "web", custom_response: null, option_details: null, options_presented: ["web", "Type your own answer", "Discuss"], selected_number: 1, raw_response: "web", decision_prompt: "Platform?", human_confirmed: true } as never, { projectRoot: root });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "HUMAN_GATE_TOKEN_REQUIRED")).toBe(true);
  });

  it("allows only one active prepared structural-choice gate at a time", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "one_off_application_ui" }, { projectRoot: root });
    await prepareChoice("platform_choice", "Platform?", ["web", "Type your own answer", "Discuss"]);
    const second = await workChoicePrepare({ id: "WP1", choice_type: "stack_choice", prompt_text: "Stack?", options: [{ label: "react", recommended: true, recommendation_rationale: "Best fit." }, { label: "Type your own answer" }, { label: "Discuss" }] }, { projectRoot: root });
    expect(second.ok).toBe(false);
    expect(second.diagnostics.some((d) => d.code === "HUMAN_GATE_ALREADY_PENDING")).toBe(true);
  });

  it("rejects prepared structural-choice mega-prompts that include other human gates", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "one_off_application_ui" }, { projectRoot: root });
    const result = await workChoicePrepare({ id: "WP1", choice_type: "platform_choice", prompt_text: "Platform?\n\nMockup: Do you have an existing mockup?\nStack: Which framework?", options: [{ label: "web", recommended: true, recommendation_rationale: "Best fit." }, { label: "Type your own answer" }, { label: "Discuss" }] }, { projectRoot: root });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "HUMAN_GATE_MEGA_PROMPT_REJECTED")).toBe(true);
  });

  it("rejects answers whose prompt/options do not match the prepared gate", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "one_off_application_ui" }, { projectRoot: root });
    const gate = await prepareChoice("platform_choice", "Platform?", ["web", "Type your own answer", "Discuss"]);
    const result = await workChoice({ id: "WP1", human_gate_token: gate.human_gate_token, choice_type: "platform_choice", choice: "web", custom_response: null, option_details: null, options_presented: ["web", "desktop", "Type your own answer", "Discuss"], selected_number: 1, raw_response: "web", decision_prompt: gate.decision_prompt, human_confirmed: true }, { projectRoot: root });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "HUMAN_GATE_OPTIONS_MISMATCH")).toBe(true);
  });

  it("a UI stack choice must record its component library (WORK_CHOICE_UI_STACK_COMPONENT_LIBRARY_REQUIRED)", async () => {
    await workCreate({ id: "WP1", title: "App", goal: "g", classification: "one_off_application_ui" }, { projectRoot: root });
    const gate = await prepareChoice("stack_choice", "Stack?", ["react+vite", "Type your own answer", "Discuss"]);
    const blocked = await workChoice({ id: "WP1", human_gate_token: gate.human_gate_token, choice_type: "stack_choice", choice: "react+vite", custom_response: null, option_details: null, options_presented: gate.options_presented, selected_number: 1, raw_response: "react", decision_prompt: gate.decision_prompt, human_confirmed: true }, { projectRoot: root });
    expect(blocked.ok).toBe(false);
    expect(blocked.diagnostics.some((d) => d.code === "WORK_CHOICE_UI_STACK_COMPONENT_LIBRARY_REQUIRED")).toBe(true);
    const ok = await workChoice({ id: "WP1", human_gate_token: gate.human_gate_token, choice_type: "stack_choice", choice: "react+vite", custom_response: null, option_details: { component_library: "shadcn/ui" }, options_presented: gate.options_presented, selected_number: 1, raw_response: "react", decision_prompt: gate.decision_prompt, human_confirmed: true }, { projectRoot: root });
    expect(ok.ok).toBe(true);
  });

  it("a reusable_ui (not a standalone app) stack choice does NOT require a component library", async () => {
    await workCreate({ id: "WP1", title: "Lib", goal: "g", classification: "reusable_ui" }, { projectRoot: root });
    const gate = await prepareChoice("stack_choice", "Stack?", ["ts", "Type your own answer", "Discuss"]);
    const ok = await workChoice({ id: "WP1", human_gate_token: gate.human_gate_token, choice_type: "stack_choice", choice: "ts", custom_response: null, option_details: null, options_presented: gate.options_presented, selected_number: 1, raw_response: "ts", decision_prompt: gate.decision_prompt, human_confirmed: true }, { projectRoot: root });
    expect(ok.ok).toBe(true);
  });

  it("work.choices rejects batched platform + architecture + stack choices", async () => {
    await workCreate({ id: "WP1", title: "App", goal: "g", classification: "one_off_application_ui" }, { projectRoot: root });
    const result = await workChoices({ id: "WP1", human_confirmed: true, choices: [
      { choice_type: "platform_choice", choice: "web", selected_number: 1, raw_response: "web", decision_prompt: "Platform?", options_presented: ["web", "Type your own answer", "Discuss"] },
      { choice_type: "architecture_choice", choice: "monorepo", selected_number: 1, raw_response: "monorepo", decision_prompt: "Architecture?", options_presented: ["monorepo", "Type your own answer", "Discuss"] },
      { choice_type: "stack_choice", choice: "react+vite", option_details: { component_library: "mantine" }, selected_number: 1, raw_response: "react", decision_prompt: "Stack?", options_presented: ["react+vite", "Type your own answer", "Discuss"] }
    ] }, { projectRoot: root });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "WORK_CHOICES_SINGLE_GATE_REQUIRED")).toBe(true);
    const stored = await store().read("WP1");
    expect(stored.platform.choice).toBeNull();
    expect(stored.architecture.decision_ids.length).toBe(0);
    expect(stored.stack.decision_ids.length).toBe(0);
  });

  it("work.choices rejects batches before mutating any structural choice", async () => {
    await workCreate({ id: "WP1", title: "App", goal: "g", classification: "one_off_application_ui" }, { projectRoot: root });
    const blocked = await workChoices({ id: "WP1", human_confirmed: true, choices: [
      { choice_type: "platform_choice", choice: "web", selected_number: 1, raw_response: "web", decision_prompt: "Platform?", options_presented: ["web", "Type your own answer", "Discuss"] },
      { choice_type: "stack_choice", choice: "react", selected_number: 1, raw_response: "react", decision_prompt: "Stack?", options_presented: ["react", "Type your own answer", "Discuss"] } // no component_library
    ] }, { projectRoot: root });
    expect(blocked.ok).toBe(false);
    expect(blocked.diagnostics.some((d) => d.code === "WORK_CHOICES_SINGLE_GATE_REQUIRED")).toBe(true);
    expect((await store().read("WP1")).platform.choice).toBeNull(); // batch rejected -> nothing recorded
  });

  it("rejects a choice that omits the 'type your own' or 'Discuss' option (WORK_CHOICE_OPTIONS_INCOMPLETE)", async () => {
    await workCreate({ id: "WP1", title: "App", goal: "g", classification: "one_off_application_ui" }, { projectRoot: root });
    const noDiscuss = await workChoicePrepare({ id: "WP1", choice_type: "architecture_choice", prompt_text: "Architecture?", options: [{ label: "monorepo", recommended: true, recommendation_rationale: "Best fit." }, { label: "separate" }, { label: "Type your own answer" }] }, { projectRoot: root });
    expect(noDiscuss.ok).toBe(false);
    expect(noDiscuss.diagnostics.some((d) => d.code === "WORK_CHOICE_OPTIONS_INCOMPLETE")).toBe(true);
    const gate = await prepareChoice("architecture_choice", "Architecture?", ["monorepo", "separate", "Type your own answer", "Discuss"]);
    const ok = await workChoice({ id: "WP1", human_gate_token: gate.human_gate_token, human_confirmed: true, choice_type: "architecture_choice", choice: "monorepo", selected_number: 1, raw_response: "monorepo", decision_prompt: gate.decision_prompt, options_presented: gate.options_presented }, { projectRoot: root });
    expect(ok.ok).toBe(true);
  });

  it("the options gate ignores COINCIDENTAL wording — 'Type A' / 'Discussion-driven' don't satisfy it", async () => {
    await workCreate({ id: "WP1", title: "App", goal: "g", classification: "one_off_application_ui" }, { projectRoot: root });
    const sneaky = await workChoicePrepare({ id: "WP1", choice_type: "architecture_choice", prompt_text: "Architecture?", options: [{ label: "Type A", recommended: true, recommendation_rationale: "Best fit." }, { label: "Type B" }, { label: "Discussion-driven design" }] }, { projectRoot: root });
    expect(sneaky.ok).toBe(false); // neither a real "type your own" nor a real "Discuss" option
    expect(sneaky.diagnostics.some((d) => d.code === "WORK_CHOICE_OPTIONS_INCOMPLETE")).toBe(true);
  });

  it("create with modify_existing origination inherits structural decisions (platform not required)", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "one_off_application_ui", origination: "modify_existing" }, { projectRoot: root });
    const stored = await store().read("WP1");
    expect(stored.specs[0]?.origination).toBe("modify_existing");
    expect(stored.platform.required).toBe(false);
  });

  it("work.intent can set runtime_not_relevant_reason so a runtime-less packet isn't an un-approvable orphan", async () => {
    await workCreate({ id: "WP1", title: "Comment cleanup", goal: "g", classification: "direct_behavior", target_id: null }, { projectRoot: root });
    expect((await store().read("WP1")).target_id).toBeNull();
    await workIntent({ id: "WP1", runtime_not_relevant_reason: "pure comment/refactor pass, ships no runnable code" }, { projectRoot: root });
    expect((await store().read("WP1")).runtime_not_relevant_reason).toContain("pure comment/refactor");
  });
});

describe("workSpecPlan + plan-required gates", () => {
  const store = () => aggregateStoreForContext({ projectRoot: root });
  const planInput = { kind: "standard_plan" as const, template_id: "t", template_version: 1, summary: "plan", approach: ["build it"], expected_files: [{ path: "src/index.ts", purpose: "impl", change_type: "create" as const }, { path: "src/index.test.ts", purpose: "tests", change_type: "create" as const }, { path: "docs/api.md", purpose: "docs", change_type: "create" as const }], tests: [] };

  it("sets a Spec's implementation plan + recomputes its resolutions", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    expect((await store().read("WP1")).specs[0]?.implementation_plan).toBeNull();
    const result = await workSpecPlan({ id: "WP1", spec_id: "WP1", plan: planInput, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] }, contract_surface: { ops: ["x"] } }, { projectRoot: root });
    expect(result.ok).toBe(true);
    expect((await store().read("WP1")).specs[0]?.implementation_plan).not.toBeNull();
  });

  it("blocks the whole-WP review until EVERY Spec has an implementation plan (plan BEFORE review)", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [{ id: "ac1", text: "do x", source: "human", source_evidence: null }] }, { projectRoot: root });
    const blocked = await workReview({ id: "WP1", producer: reviewProducer, verdict: "pass", blockers: [], summary: "ok" }, { projectRoot: root });
    expect(blocked.ok).toBe(false);
    expect(blocked.diagnostics.some((d) => d.code === "IMPLEMENTATION_PLAN_REQUIRED")).toBe(true);
  });

  it("blocks review after Spec plans until the packet-level parallelism plan is recorded", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [{ id: "ac1", text: "do x", source: "human", source_evidence: null }] }, { projectRoot: root });
    await workSpecPlan({ id: "WP1", spec_id: "WP1", plan: planInput, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] }, contract_surface: { ops: ["x"] } }, { projectRoot: root });
    const blocked = await workReview({ id: "WP1", producer: reviewProducer, verdict: "pass", blockers: [], summary: "ok" }, { projectRoot: root });
    expect(blocked.ok).toBe(false);
    expect(blocked.diagnostics.some((d) => d.code === "IMPLEMENTATION_PARALLELISM_PLAN_REQUIRED")).toBe(true);

    const planned = await workParallelismPlan({ id: "WP1", strategy: "sequential", reasoning: "One Spec, so no parallel execution is useful.", execution_groups: [{ id: "wave-1", spec_ids: ["WP1"], rationale: "Only Spec." }] }, { projectRoot: root });
    expect(planned.ok).toBe(true);
    expect((await store().read("WP1")).implementation_parallelism_plan?.strategy).toBe("sequential");
    expect((await workReview({ id: "WP1", producer: reviewProducer, verdict: "pass", blockers: [], summary: "ok" }, { projectRoot: root })).ok).toBe(true);
  });

  it("stales the packet-level parallelism plan when a Spec implementation plan changes", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    await workSpecAcs({ id: "WP1", spec_id: "WP1", acceptance_criteria: [{ id: "ac1", text: "do x", source: "human", source_evidence: null }] }, { projectRoot: root });
    await workSpecPlan({ id: "WP1", spec_id: "WP1", plan: planInput, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] }, contract_surface: { ops: ["x"] } }, { projectRoot: root });
    await workParallelismPlan({ id: "WP1", strategy: "sequential", reasoning: "One Spec, so no parallel execution is useful.", execution_groups: [{ id: "wave-1", spec_ids: ["WP1"], rationale: "Only Spec." }] }, { projectRoot: root });

    await workSpecPlan({ id: "WP1", spec_id: "WP1", plan: { ...planInput, summary: "changed plan" }, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] }, contract_surface: { ops: ["x"] } }, { projectRoot: root });
    const result = await workReview({ id: "WP1", producer: reviewProducer, verdict: "pass", blockers: [], summary: "ok" }, { projectRoot: root });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "IMPLEMENTATION_PARALLELISM_PLAN_STALE")).toBe(true);
  });

  it("rejects a plan whose expected_files omits the TEST file(s)", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    const blocked = await workSpecPlan({ id: "WP1", spec_id: "WP1", plan: { ...planInput, expected_files: [{ path: "src/index.ts", purpose: "impl", change_type: "create" as const }] }, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] }, contract_surface: { ops: ["x"] } }, { projectRoot: root });
    expect(blocked.ok).toBe(false);
    expect(blocked.diagnostics.some((d) => d.code === "PLAN_EXPECTED_TEST_FILE_MISSING")).toBe(true);
  });

  it("requires a DOC file in expected_files when the Spec requires docs (reusable_api)", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "reusable_api" }, { projectRoot: root });
    // has a test file but no doc file -> blocked for an API surface whose docs.policy requires docs
    const blocked = await workSpecPlan({ id: "WP1", spec_id: "WP1", plan: { ...planInput, expected_files: [{ path: "src/index.ts", purpose: "impl", change_type: "create" as const }, { path: "src/index.test.ts", purpose: "tests", change_type: "create" as const }] }, dependencies: { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] }, contract_surface: { ops: ["x"] } }, { projectRoot: root });
    expect(blocked.ok).toBe(false);
    expect(blocked.diagnostics.some((d) => d.code === "PLAN_EXPECTED_DOC_FILE_MISSING")).toBe(true);
  });
});

describe("source-derived AC evidence_hash (compute-don't-demand)", () => {
  it("normalizeAcceptanceCriteria fills the CANONICAL evidence_hash, ignoring a placeholder", () => {
    const evidence = { kind: "mockup", reference: "./todo-app-mockup.png", description: "the header row", source_artifact_refs: [{ artifact_type: "source_artifact", id: "sa1", revision: 1, content_hash: "a".repeat(64) }], evidence_hash: "0".repeat(64) };
    const ac: AcceptanceCriterion = { id: "ac1", text: "header reads 'Todo List'", source: "source_derived", source_evidence: evidence };
    const normalized = normalizeAcceptanceCriteria([ac]);
    expect(normalized[0]!.source_evidence!.evidence_hash).toBe(sourceEvidenceHash(evidence)); // canonical, not the placeholder
    expect(normalized[0]!.source_evidence!.evidence_hash).not.toBe("0".repeat(64));
    // a human AC (no evidence) is untouched
    const human: AcceptanceCriterion = { id: "ac2", text: "x", source: "human", source_evidence: null };
    expect(normalizeAcceptanceCriteria([human])[0]).toEqual(human);
  });
});

describe("workIntent + intent gate", () => {
  const store = () => aggregateStoreForContext({ projectRoot: root });

  it("fleshes out the whole-WP intent (work.create seeds only the goal); omitted fields are unchanged", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    expect((await store().read("WP1")).intent.desired_outcomes).toEqual([]);
    const result = await workIntent({ id: "WP1", desired_outcomes: ["users can do X"], in_scope: ["the X flow"], open_questions: ["which auth?"] }, { projectRoot: root });
    expect(result.ok).toBe(true);
    const intent = (await store().read("WP1")).intent;
    expect(intent.desired_outcomes).toEqual(["users can do X"]);
    expect(intent.in_scope).toEqual(["the X flow"]);
    expect(intent.goal).toBe("g"); // omitted -> unchanged
  });

  it("blocks approval until ALL SIX intent sections are populated (INTENT_INCOMPLETE names the gaps)", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    await workIntent({ id: "WP1", desired_outcomes: ["users can do X"] }, { projectRoot: root }); // only one of six set
    const hash = aggregateApprovalProjection(await store().read("WP1")).hash;
    const result = await workApprove({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    expect(result.ok).toBe(false);
    const intentDiag = result.diagnostics.find((d) => d.code === "INTENT_INCOMPLETE");
    expect(intentDiag).toBeDefined();
    expect(intentDiag?.message).toContain("in_scope"); // lists the still-empty sections
    expect(intentDiag?.message).not.toContain("desired_outcomes"); // the one that IS set isn't listed
  });
});

describe("workflow ergonomics", () => {
  it("workNext returns repair templates instead of forcing probe-by-failure", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    const result = await workNext({ id: "WP1" }, { projectRoot: root });
    expect(result.ok).toBe(true);
    const data = result.data as { phase: string; blockers: Array<{ repair_action?: string; repair_input_template?: unknown }> };
    expect(data.phase).toBe("draft");
    expect(data.blockers.some((diag) => diag.repair_action !== undefined && diag.repair_input_template !== undefined)).toBe(true);
    expect(result.next_actions.some((action) => action.suggested_input !== null)).toBe(true);
  });

  it("workApprovalReady returns an approval_token that workApprove accepts", async () => {
    await workCreate({ id: "WP1", title: "My WP", goal: "g", classification: "reusable_api" }, { projectRoot: root });
    await seedBootstrapAcs();
    await recordReviews();
    const ready = await workApprovalReady({ id: "WP1" }, { projectRoot: root });
    expect(ready.ok).toBe(true);
    const token = (ready.data as { approval_token: string }).approval_token;
    expect(token).toContain("work-approval-token:v1:WP1:");
    const approved = await workApprove({ id: "WP1", approval_token: token, selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    expect(approved.ok).toBe(true);
  });
});

describe("workGet + workList (read)", () => {
  const store = () => aggregateStoreForContext({ projectRoot: root });

  it("workGet returns the whole packet + its CURRENT approval hash (to echo at a gate)", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    const result = await workGet({ id: "WP1" }, { projectRoot: root });
    expect(result.ok).toBe(true);
    const data = result.data as { work_packet: { id: string }; approval_hash: string; approval_token: string };
    expect(data.work_packet.id).toBe("WP1");
    expect(data.approval_hash).toBe(aggregateApprovalProjection(await store().read("WP1")).hash);
    expect(data.approval_token).toContain("work-approval-token:v1:WP1:");
  });

  it("workGet can return a compact summary instead of the whole packet", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    const result = await workGet({ id: "WP1", view: "summary" }, { projectRoot: root });
    expect(result.ok).toBe(true);
    const data = result.data as { work_packet?: unknown; work_packet_summary: { id: string; specs: Array<{ classification: string }> }; approval_hash: string; approval_token: string };
    expect(data.work_packet).toBeUndefined();
    expect(data.work_packet_summary.id).toBe("WP1");
    expect(data.work_packet_summary.specs[0]?.classification).toBe("direct_behavior");
    expect(data.approval_hash).toBe(aggregateApprovalProjection(await store().read("WP1")).hash);
    expect(data.approval_token).toContain("work-approval-token:v1:WP1:");
  });

  it("workGet returns compact Spec and coherence slices", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    const specResult = await workGet({ id: "WP1", view: "spec", spec_id: "WP1" }, { projectRoot: root });
    expect(specResult.ok).toBe(true);
    const specData = specResult.data as { work_packet?: unknown; work_packet_slice: { kind: string; spec: { id: string; omitted: string[] } } };
    expect(specData.work_packet).toBeUndefined();
    expect(specData.work_packet_slice.kind).toBe("spec");
    expect(specData.work_packet_slice.spec.id).toBe("WP1");
    expect(specData.work_packet_slice.spec.omitted).toContain("change_baseline");

    const coherenceResult = await workGet({ id: "WP1", view: "coherence" }, { projectRoot: root });
    expect(coherenceResult.ok).toBe(true);
    const coherenceData = coherenceResult.data as { work_packet?: unknown; work_packet_slice: { kind: string; spec_slice_inputs: Array<{ view: string; spec_id: string }> } };
    expect(coherenceData.work_packet).toBeUndefined();
    expect(coherenceData.work_packet_slice.kind).toBe("coherence");
    expect(coherenceData.work_packet_slice.spec_slice_inputs).toEqual([{ id: "WP1", view: "spec", spec_id: "WP1" }]);
  });

  it("agent-facing work.get never returns the full packet, even when view full is requested", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    const result = await executeActionForAgent("work.get", { id: "WP1", view: "full" }, { projectRoot: root });
    expect(result.ok).toBe(true);
    const data = result.data as { work_packet?: unknown; work_packet_summary?: { id: string }; work_packet_slice?: unknown };
    expect(data.work_packet).toBeUndefined();
    expect(data.work_packet_slice).toBeUndefined();
    expect(data.work_packet_summary?.id).toBe("WP1");
  });

  it("workList summarizes every Work Packet", async () => {
    await workCreate({ id: "WP1", title: "A", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    await workCreate({ id: "WP2", title: "B", goal: "g", classification: "direct_behavior" }, { projectRoot: root });
    const result = await workList({}, { projectRoot: root });
    expect(result.ok).toBe(true);
    const data = result.data as { work_packets: Array<{ id: string }> };
    expect(data.work_packets.map((w) => w.id).sort()).toEqual(["WP1", "WP2"]);
  });
});

describe("AggregateWorkPacketSchema invariants", () => {
  it("rejects duplicate Spec ids within a Work Packet", () => {
    const base = buildAggregate("WP1", ["reusable_api", "rest_api"]);
    const duped = base.specs.map((s) => ({ ...s, id: "DUP" })); // both Specs share an id
    expect(() => AggregateWorkPacketSchema.parse({ ...base, specs: duped })).toThrow();
  });
});

describe("workAuthorize (v2 cutover: whole-WP authorize)", () => {
  const currentHash = async () => aggregateApprovalProjection(await aggregateStoreForContext({ projectRoot: root }).read("WP1")).hash;
  const createApprove = async () => {
    await workCreate({ id: "WP1", title: "My WP", goal: "g", classification: "reusable_api" }, { projectRoot: root });
    await seedBootstrapAcs();
    await recordReviews();
    await workApprove({ id: "WP1", review_snapshot_hash: await currentHash(), selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
  };

  it("authorizes an approved + current WP and records lifecycle.authorization", async () => {
    await createApprove();
    const result = await workAuthorize({ id: "WP1", review_snapshot_hash: await currentHash(), selected_number: 1, raw_response: "1", decision_prompt: "Authorize?", human_confirmed: true }, { projectRoot: root });
    expect(result.ok).toBe(true);
    const stored = await aggregateStoreForContext({ projectRoot: root }).read("WP1");
    expect(stored.lifecycle.authorization?.decision_type).toBe("aggregate_implementation_authorization");
    expect(stored.specs[0]?.change_baseline).not.toBeNull(); // change-baseline captured at authorization
  });

  it("rejects authorize before approval", async () => {
    await workCreate({ id: "WP1", title: "My WP", goal: "g", classification: "reusable_api" }, { projectRoot: root });
    const result = await workAuthorize({ id: "WP1", review_snapshot_hash: await currentHash(), selected_number: 1, raw_response: "1", decision_prompt: "Authorize?", human_confirmed: true }, { projectRoot: root });
    expect(result.ok).toBe(false);
  });

  it("rejects authorize when the approval is stale (a Spec changed after approval)", async () => {
    await createApprove();
    const store = aggregateStoreForContext({ projectRoot: root });
    const agg = await store.read("WP1");
    // edit a Spec after approval -> the approval's bound hash no longer matches the live hash
    await store.update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((s) => ({ ...s, acceptance_criteria: [{ id: "ac1", text: "new", source: "human", source_evidence: null }] })) }));
    const result = await workAuthorize({ id: "WP1", review_snapshot_hash: await currentHash(), selected_number: 1, raw_response: "1", decision_prompt: "Authorize?", human_confirmed: true }, { projectRoot: root });
    expect(result.ok).toBe(false);
  });
});

describe("workSpecAdvance (v2 cutover: per-Spec implementation advance)", () => {
  const store = () => aggregateStoreForContext({ projectRoot: root });
  const approveAuthorize = async () => {
    await waiveArchitectureGovernanceIfNeeded();
    const hash = aggregateApprovalProjection(await store().read("WP1")).hash;
    await recordReviews();
    await workApprove({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Approve?", human_confirmed: true }, { projectRoot: root });
    await workAuthorize({ id: "WP1", review_snapshot_hash: hash, selected_number: 1, raw_response: "1", decision_prompt: "Authorize?", human_confirmed: true }, { projectRoot: root });
  };

  it("advances ONE Spec via a non-record-gated transition, leaving siblings untouched (per-Spec lifecycle)", async () => {
    await store().create(buildAggregate("WP1", ["reusable_api", "rest_api"]));
    await approveAuthorize();
    // simulate both Specs having progressed (the record path lands later) to review_passed
    const agg = await store().read("WP1");
    await store().update(AggregateWorkPacketSchema.parse({ ...agg, specs: agg.specs.map((s) => ({ ...s, workflow_state: "review_passed" })) }));
    // review_passed -> review_complete is a non-record-gated routing advance
    const advanced = await workSpecAdvance({ id: "WP1", spec_id: "WP1-s1", next_state: "review_complete" }, { projectRoot: root });
    expect(advanced.ok).toBe(true);
    const stored = await store().read("WP1");
    expect(stored.specs.find((s) => s.id === "WP1-s1")?.workflow_state).toBe("review_complete");
    expect(stored.specs.find((s) => s.id === "WP1-s2")?.workflow_state).toBe("review_passed"); // untouched
  });

  it("rejects a record-gated transition (needs the per-Spec record action, not a bare advance)", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "reusable_api" }, { projectRoot: root });
    await approveAuthorize(); // Spec at implementation_authorized
    // implementation_authorized -> implementation_attempt_complete is record-gated -> blocked (no evidence-free advance)
    const result = await workSpecAdvance({ id: "WP1", spec_id: "WP1", next_state: "implementation_attempt_complete" }, { projectRoot: root });
    expect(result.ok).toBe(false);
  });

  it("rejects advancing a Spec on an unauthorized Work Packet", async () => {
    const base = buildAggregate("WP1", ["reusable_api"]);
    await store().create(AggregateWorkPacketSchema.parse({ ...base, specs: base.specs.map((s) => ({ ...s, workflow_state: "review_passed" })) }));
    const result = await workSpecAdvance({ id: "WP1", spec_id: "WP1-s1", next_state: "review_complete" }, { projectRoot: root });
    expect(result.ok).toBe(false); // not authorized
  });

  it("rejects an invalid transition (implementation_authorized -> review_complete)", async () => {
    await workCreate({ id: "WP1", title: "x", goal: "g", classification: "reusable_api" }, { projectRoot: root });
    await approveAuthorize();
    const result = await workSpecAdvance({ id: "WP1", spec_id: "WP1", next_state: "review_complete" }, { projectRoot: root });
    expect(result.ok).toBe(false);
  });

  it("rejects advancing a Spec to complete (the whole-WP completion gate owns that)", async () => {
    const base = buildAggregate("WP1", ["reusable_api"]);
    await store().create(AggregateWorkPacketSchema.parse({ ...base, specs: base.specs.map((s) => ({ ...s, workflow_state: "review_complete" })) }));
    const result = await workSpecAdvance({ id: "WP1", spec_id: "WP1-s1", next_state: "complete" }, { projectRoot: root });
    expect(result.ok).toBe(false);
  });
});
