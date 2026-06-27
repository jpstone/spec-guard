import { workLifecycleStage } from "../src/index.ts";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArtifactStore, migrateLoadedArtifact, RuntimeBaselineSchema, SourceArtifactSchema, WorkPacketSchema } from "../src/index.ts";
import { buildHumanDecision } from "../src/decisions/human-decision.ts";

let root: string;
const now = "2026-06-22T00:00:00.000Z";
const hash = "a".repeat(64);

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "spec-guard-migration-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeCurrent(artifactType: string, id: string | null, artifact: unknown): Promise<void> {
  const dir = path.join(root, "artifacts", encodeURIComponent(artifactType), id === null ? "__singleton__" : encodeURIComponent(id));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "current.json"), `${JSON.stringify(artifact)}\n`, "utf8");
}

function approvingDecision(id: string, decisionType = "work_packet_approval") {
  const approvedPayload = decisionType === "implementation_authorization"
    ? { id: "work-1", approved_packet_snapshot_hash: hash, approved_packet_snapshot_revision: "snapshot:1", allowed_globs: [], runtime_baseline_ref: null, change_baseline_capture_plan: {} }
    : undefined;
  return buildHumanDecision({
    action_id: id,
    decision_type: decisionType,
    selected_number: 1,
    raw_response: "Yes",
    decision_prompt: "Approve?",
    human_confirmed: true,
    normalized_decision: "yes",
    final_decision: true,
    approved_payload: approvedPayload,
    review_snapshot_hash: hash,
    review_snapshot_revision: "snapshot:1",
    source_artifact_refs: [],
    source_interface: "test",
    target_artifact_revision: 1
  });
}

function legacyWork(overrides: Record<string, unknown> = {}) {
  const packet = {
    artifact_type: "work_packet",
    schema_version: 1,
    id: "work-1",
    revision: 1,
    created_at: now,
    updated_at: now,
    status: "draft",
    title: "Legacy work",
    classification: "direct_behavior",
    goal: "legacy goal",
    acs: ["does the thing"],
    allowedFiles: ["**/*"],
    docsPolicy: "none_required",
    platformDecisionId: "decision-platform",
    architectureDecisionIds: ["decision-arch"],
    baselineRef: null,
    changeBaseline: null,
    parent_plan_id: null,
    plan_slice_id: null,
    lifecycle: { ac_approval: null, packet_approval: null, authorization: null, history: [] },
    decision_history: [],
    evidence: [],
    claims: [],
    backend_verifications: [],
    review: { implementation_files: [], test_files: [], changed_files: [], ac_verification: {}, claims: [], complete: false },
    diagnostics: [],
    ...overrides
  };
  return packet;
}


function commandResult(overrides: Record<string, unknown> = {}) {
  return {
    id: "command-1",
    storage_ref: "command_result/command-1/1",
    command: "npm test",
    command_spec: { mode: "argv", argv: ["npm", "test"], working_directory: ".", timeout_ms: null, env_mode: "inherit", env_overrides_ref: null },
    purpose: "test",
    working_directory: ".",
    timeout_ms: null,
    env_mode: "inherit",
    related_work_id: null,
    related_runtime_baseline_ref: null,
    related_runtime_baseline_draft_revision: 1,
    exit_code: 0,
    started_at: now,
    finished_at: now,
    duration_ms: 1,
    status: "passed",
    skip_reason: null,
    skip_precondition: null,
    error_message: null,
    output_ref: null,
    output_excerpt: null,
    resource_categories: [],
    cleanup_observations: null,
    source_interface: "test",
    ...overrides
  };
}

describe("artifact migration", () => {
  it("migrates legacy WorkPacket synonyms to canonical fields and preserves raw legacy context in diagnostics", async () => {
    await writeCurrent("work_packet", "work-1", legacyWork());
    const current = await new ArtifactStore({ root }).readCurrent("work_packet", "work-1");
    const packet = WorkPacketSchema.parse(current.artifact);
    expect(packet.intent.goal).toBe("legacy goal");
    expect(packet.acceptance_criteria[0]).toMatchObject({ id: "ac-1", text: "does the thing", source: "human" });
    expect(packet.scope.allowed_globs).toEqual(["**/*"]);
    expect(packet.docs.policy).toBe("none_required");
    expect(packet.platform.decision_id).toBe("decision-platform");
    expect(packet.architecture.decision_ids).toEqual(["decision-arch"]);
    expect(packet.diagnostics.map((diag) => diag.code)).toEqual(expect.arrayContaining(["MIGRATION_WORK_GOAL", "MIGRATION_WORK_AC", "MIGRATION_BOILERPLATE_SCOPE"]));
  });

  it("invalidates WorkPacket approvals when migration changes approved semantics", async () => {
    const acDecision = approvingDecision("ac", "ac_approval");
    const packetDecision = approvingDecision("packet");
    const authDecision = approvingDecision("auth", "implementation_authorization");
    await writeCurrent("work_packet", "work-1", legacyWork({ status: "authorized", lifecycle: { ac_approval: acDecision, packet_approval: packetDecision, authorization: authDecision, history: [] }, decision_history: [acDecision, packetDecision, authDecision], change_baseline: { legacy: true } }));
    const packet = WorkPacketSchema.parse((await new ArtifactStore({ root }).readCurrent("work_packet", "work-1")).artifact);
    expect(packet.lifecycle.ac_approval).toBeNull();
    expect(packet.lifecycle.packet_approval).toBeNull();
    expect(packet.lifecycle.authorization).toBeNull();
    expect(packet.change_baseline).toBeNull();
    expect(workLifecycleStage(packet)).toBe("pending_ac_approval");
    expect(packet.decision_history.map((decision) => decision.id)).toEqual([acDecision.id, packetDecision.id, authDecision.id]);
    expect(packet.diagnostics.some((diag) => diag.code === "MIGRATION_AC_APPROVAL_INVALIDATED" && diag.message.includes(acDecision.id) && diag.message.includes(packetDecision.id) && diag.message.includes(authDecision.id))).toBe(true);
  });

  it("invalidates AC approval and downstream decisions for ac, acs, and acceptanceCriteria legacy fields without fabricating decisions", async () => {
    for (const legacyKey of ["ac", "acs", "acceptanceCriteria"] as const) {
      const id = `work-${legacyKey}`;
      const acDecision = approvingDecision(`${id}-ac`, "ac_approval");
      const packetDecision = approvingDecision(`${id}-packet`);
      const authDecision = approvingDecision(`${id}-auth`, "implementation_authorization");
      await writeCurrent("work_packet", id, legacyWork({ id, acs: undefined, [legacyKey]: ["legacy AC"], status: "authorized", lifecycle: { ac_approval: acDecision, packet_approval: packetDecision, authorization: authDecision, history: [] }, decision_history: [acDecision, packetDecision, authDecision], change_baseline: { legacy: true } }));
      const packet = WorkPacketSchema.parse((await new ArtifactStore({ root }).readCurrent("work_packet", id)).artifact);
      expect(packet.lifecycle).toMatchObject({ ac_approval: null, packet_approval: null, authorization: null });
      expect(workLifecycleStage(packet)).toBe("pending_ac_approval");
      expect(packet.change_baseline).toBeNull();
      expect(packet.decision_history).toHaveLength(3);
      expect(packet.decision_history.map((decision) => decision.id)).toEqual([acDecision.id, packetDecision.id, authDecision.id]);
      expect(packet.diagnostics.find((diag) => diag.code === "MIGRATION_AC_APPROVAL_INVALIDATED")?.message).toContain(acDecision.id);
    }
  });

  it("invalidates active approvals when legacy string ACs are canonicalized under acceptance_criteria", () => {
    const acDecision = approvingDecision("canonical-field-ac", "ac_approval");
    const packetDecision = approvingDecision("canonical-field-packet");
    const authDecision = approvingDecision("canonical-field-auth", "implementation_authorization");
    const migration = migrateLoadedArtifact(legacyWork({
      status: "approved",
      goal: undefined,
      intent: { goal: "canonical goal", desired_outcomes: [], in_scope: [], out_of_scope: [], users_actors: [], edge_cases: [], open_questions: [] },
      acs: undefined,
      acceptance_criteria: ["legacy string"],
      allowedFiles: undefined,
      docsPolicy: undefined,
      platformDecisionId: undefined,
      architectureDecisionIds: undefined,
      baselineRef: undefined,
      changeBaseline: undefined,
      lifecycle: { ac_approval: acDecision, packet_approval: packetDecision, authorization: authDecision, history: [] },
      decision_history: [acDecision, packetDecision, authDecision],
      change_baseline: { legacy: true }
    }));
    const packet = WorkPacketSchema.parse(migration.artifact);
    expect(packet.acceptance_criteria[0]).toMatchObject({ id: "ac-1", text: "legacy string", source: "human" });
    expect(packet.lifecycle).toMatchObject({ ac_approval: null, packet_approval: null, authorization: null });
    expect(packet.change_baseline).toBeNull();
    expect(workLifecycleStage(packet)).toBe("pending_ac_approval");
    expect(packet.decision_history.map((decision) => decision.id)).toEqual([acDecision.id, packetDecision.id, authDecision.id]);
    expect(migration.invalidated_decision_ids).toEqual([acDecision.id, packetDecision.id, authDecision.id]);
    expect(packet.diagnostics.find((diag) => diag.code === "MIGRATION_AC_APPROVAL_INVALIDATED")?.message).toContain(acDecision.id);

    const secondMigration = migrateLoadedArtifact(packet);
    expect(secondMigration.changed).toBe(false);
    expect(secondMigration.invalidated_decision_ids).toEqual([]);
    expect(secondMigration.artifact).toEqual(packet);
  });

  it("does not fabricate RuntimeBaseline acceptance HumanDecision from legacy accepted markers", async () => {
    await writeCurrent("runtime_baseline", null, {
      artifact_type: "runtime_baseline",
      schema_version: 1,
      revision: 1,
      created_at: now,
      updated_at: now,
      accepted: true,
      stack: { product_platform: null, runtime: null, language: null, package_manager: null, framework: null, build_tool: null, architecture: null },
      commands: { test: null, test_not_applicable_reason: null, build: null, build_not_applicable_reason: null, runtime_production: null, runtime_production_not_applicable_reason: null, runtime_development: null, runtime_development_not_applicable_reason: null },
      configuration: { environment_strategy: null, required_env_vars: [], greenfield_scaffold: false },
      dependency_modes: { install_mode: null, external_services: null },
      diff_policy: { dependency_changes_require_approval: true, include_untracked: true },
      diagnostics: []
    });
    const baseline = RuntimeBaselineSchema.parse((await new ArtifactStore({ root }).readCurrent("runtime_baseline", null)).artifact);
    expect(baseline.status).toBe("draft");
    expect(baseline.acceptance).toBeNull();
    expect(baseline.decision_history).toEqual([]);
    expect(baseline.diagnostics.some((diag) => diag.code === "MIGRATION_BASELINE_ACCEPTANCE_NOT_FABRICATED")).toBe(true);
  });

  it("invalidates accepted RuntimeBaseline when legacy validationResults changes accepted validation semantics", async () => {
    const acceptance = approvingDecision("baseline-accept", "runtime_baseline_acceptance");
    await writeCurrent("runtime_baseline", null, {
      artifact_type: "runtime_baseline",
      schema_version: 1,
      revision: 1,
      created_at: now,
      updated_at: now,
      status: "accepted",
      stack: { product_platform: null, runtime: null, language: null, package_manager: null, framework: null, build_tool: null, architecture: null },
      commands: { test: null, test_not_applicable_reason: null, build: null, build_not_applicable_reason: null, runtime_production: null, runtime_production_not_applicable_reason: null, runtime_development: null, runtime_development_not_applicable_reason: null },
      configuration: { environment_strategy: null, required_env_vars: [], greenfield_scaffold: false },
      dependency_modes: { install_mode: null, external_services: null },
      diff_policy: { dependency_changes_require_approval: true, include_untracked: true },
      validationResults: [commandResult()],
      acceptance,
      decision_history: [acceptance],
      blocker: null,
      diagnostics: []
    });
    const baseline = RuntimeBaselineSchema.parse((await new ArtifactStore({ root }).readCurrent("runtime_baseline", null)).artifact);
    expect(baseline.validation.command_results).toHaveLength(1);
    expect(baseline.status).toBe("draft");
    expect(baseline.acceptance).toBeNull();
    expect(baseline.decision_history.map((decision) => decision.id)).toEqual([acceptance.id]);
    expect(baseline.diagnostics.some((diag) => diag.code === "MIGRATION_BASELINE_ACCEPTANCE_INVALIDATED" && diag.message.includes(acceptance.id))).toBe(true);
  });

  it("does not trust invalid legacy RuntimeBaseline validationResults as kernel CommandResults", async () => {
    await writeCurrent("runtime_baseline", null, {
      artifact_type: "runtime_baseline",
      schema_version: 1,
      revision: 1,
      created_at: now,
      updated_at: now,
      status: "draft",
      validationResults: [{ id: "not-a-command-result", status: "passed" }],
      diagnostics: []
    });
    const baseline = RuntimeBaselineSchema.parse((await new ArtifactStore({ root }).readCurrent("runtime_baseline", null)).artifact);
    expect(baseline.validation.command_results).toEqual([]);
    expect(baseline.diagnostics.some((diag) => diag.code === "MIGRATION_BASELINE_VALIDATION_RESULTS_PARTIAL")).toBe(true);
  });

  it("strips the superseded verifier/claims/evidence/review fields from legacy WorkPackets", async () => {
    await writeCurrent("work_packet", "work-1", legacyWork({ verifierResults: [{ status: "passed", says: "looks good" }] }));
    const packet = WorkPacketSchema.parse((await new ArtifactStore({ root }).readCurrent("work_packet", "work-1")).artifact);
    expect(packet).not.toHaveProperty("backend_verifications");
    expect(packet).not.toHaveProperty("claims");
    expect(packet).not.toHaveProperty("evidence");
    expect(packet).not.toHaveProperty("review");
    // The role-loop lineage fields take their place, defaulted.
    expect(packet.workflow_state).toBe("packet_draft");
    expect(packet.implementation_attempts).toEqual([]);
  });

  it("is idempotent after writing a migrated canonical artifact", async () => {
    await writeCurrent("work_packet", "work-1", legacyWork());
    const store = new ArtifactStore({ root });
    const first = WorkPacketSchema.parse((await store.readCurrent("work_packet", "work-1")).artifact);
    const updated = await store.update(first);
    const second = WorkPacketSchema.parse((await store.readCurrent("work_packet", "work-1")).artifact);
    expect(second).toEqual(updated.artifact);
  });

  it("is idempotent after approval invalidation migration is written canonically", async () => {
    const acDecision = approvingDecision("idempotent-ac", "ac_approval");
    const packetDecision = approvingDecision("idempotent-packet");
    await writeCurrent("work_packet", "work-1", legacyWork({ status: "approved", lifecycle: { ac_approval: acDecision, packet_approval: packetDecision, authorization: null, history: [] }, decision_history: [acDecision, packetDecision] }));
    const store = new ArtifactStore({ root });
    const first = WorkPacketSchema.parse((await store.readCurrent("work_packet", "work-1")).artifact);
    const updated = await store.update(first);
    const second = WorkPacketSchema.parse((await store.readCurrent("work_packet", "work-1")).artifact);
    expect(second).toEqual(updated.artifact);
    expect(second.diagnostics.filter((diag) => diag.code === "MIGRATION_AC_APPROVAL_INVALIDATED")).toHaveLength(1);
  });

  it("migrates SourceArtifact hash and locator synonyms", async () => {
    await writeCurrent("source_artifact", "src-1", {
      artifact_type: "source_artifact",
      schema_version: 1,
      id: "src-1",
      revision: 1,
      created_at: now,
      updated_at: now,
      kind: "file",
      label: "Spec",
      path: "docs/spec.md",
      content_ref: "blob:1",
      hash,
      descriptor: null,
      captured_at: now,
      source_interface: "test",
      diagnostics: []
    });
    const source = SourceArtifactSchema.parse((await new ArtifactStore({ root }).readCurrent("source_artifact", "src-1")).artifact);
    expect(source.locator).toBe("docs/spec.md");
    expect(source.content_hash).toBe(hash);
  });
});
