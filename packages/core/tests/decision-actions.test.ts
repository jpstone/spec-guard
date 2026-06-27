import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decisionCreate, decisionGet, decisionList, decisionSupersede, generatedPromptId, initAction, sha256HexCanonical } from "../src/index.ts";

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), "spec-guard-decisions-"));
  await initAction({ project_id: "demo" }, { projectRoot });
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe("generic decision actions", () => {
  it("rejects missing or false human confirmation and required human fields", async () => {
    const base = { decision_type: "custom_choice", selected_number: 1, raw_response: "yes", decision_prompt: "Approve?", approved_fields: ["/payload"], approved_payload: { payload: "x" } };
    expect((await decisionCreate({ ...base, human_confirmed: false }, { projectRoot })).ok).toBe(false);
    expect((await decisionCreate({ ...base, human_confirmed: true, raw_response: "" }, { projectRoot })).ok).toBe(false);
    expect((await decisionCreate({ ...base, human_confirmed: true, decision_prompt: "" }, { projectRoot })).ok).toBe(false);
  });

  it("generates deterministic prompt ids and stores custom approved payload hash/revision", async () => {
    const result = await decisionCreate({ decision_type: "custom_approval", selected_number: 1, raw_response: "1", decision_prompt: "Use payload?", human_confirmed: true, approved_fields: ["/choice"], approved_payload: { choice: "A" } }, { projectRoot });
    expect(result.ok).toBe(true);
    const decision = result.data.decision as { prompt_id: string; approved_payload_hash: string; approved_payload_revision: string; approved_fields: string[] };
    expect(decision.prompt_id).toBe(generatedPromptId("decision.create", "Use payload?"));
    const hash = sha256HexCanonical({ choice: "A" });
    expect(decision.approved_payload_hash).toBe(hash);
    expect(decision.approved_payload_revision).toBe(`payload:${hash}`);
    expect(decision.approved_fields).toEqual(["/choice"]);
  });

  it("records No with empty approved fields and no approved payload", async () => {
    const result = await decisionCreate({ decision_type: "custom_approval", selected_number: 2, raw_response: "2", decision_prompt: "Use payload?", human_confirmed: true, normalized_decision: "no" }, { projectRoot });
    expect(result.ok).toBe(true);
    const decision = result.data.decision as { approved_fields: string[]; approved_payload: unknown; approved_payload_hash: unknown };
    expect(decision.approved_fields).toEqual([]);
    expect(decision.approved_payload).toBeNull();
    expect(decision.approved_payload_hash).toBeNull();
  });

  it("creates no HumanDecision for Discuss", async () => {
    const result = await decisionCreate({ decision_type: "custom_approval", selected_number: 3, raw_response: "3", decision_prompt: "Use payload?", human_confirmed: true, normalized_decision: "discuss" }, { projectRoot });
    expect(result.ok).toBe(true);
    expect(result.data.decision).toBeNull();
    expect((await decisionList({}, { projectRoot })).data.count).toBe(0);
  });

  it("rejects standard side-effect types and invalid custom approved pointers", async () => {
    const standard = await decisionCreate({ decision_type: "platform_choice", selected_number: 1, raw_response: "1", decision_prompt: "Choose", human_confirmed: true, approved_fields: ["/fake"], approved_payload: { work_id: "w1", choice: "web", custom_response: null } }, { projectRoot });
    expect(standard.ok).toBe(false);
    expect(standard.diagnostics[0]?.message).toMatch(/specialized action/);

    const invalid = await decisionCreate({ decision_type: "custom_approval", selected_number: 1, raw_response: "1", decision_prompt: "Use?", human_confirmed: true, approved_fields: ["/missing"], approved_payload: { choice: "A" } }, { projectRoot });
    expect(invalid.ok).toBe(false);
  });

  it("supersession creates a new decision and only backlinks metadata on the prior one", async () => {
    const first = await decisionCreate({ decision_type: "custom_approval", selected_number: 1, raw_response: "1", decision_prompt: "Use A?", human_confirmed: true, approved_fields: ["/choice"], approved_payload: { choice: "A" } }, { projectRoot });
    const firstDecision = first.data.decision as { id: string; prompt_text: string };
    const supersede = await decisionSupersede({ prior_decision_id: firstDecision.id, decision_type: "custom_approval", selected_number: 1, raw_response: "1", decision_prompt: "Use B?", human_confirmed: true, approved_fields: ["/choice"], approved_payload: { choice: "B" } }, { projectRoot });
    expect(supersede.ok).toBe(true);
    const prior = (await decisionGet({ id: firstDecision.id }, { projectRoot })).data.decision as { prompt_text: string; superseded_by_decision_id: string };
    const next = supersede.data.decision as { id: string; supersedes_decision_id: string };
    expect(prior.prompt_text).toBe("Use A?");
    expect(prior.superseded_by_decision_id).toBe(next.id);
    expect(next.supersedes_decision_id).toBe(firstDecision.id);
  });
});
