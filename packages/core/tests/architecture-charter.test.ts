import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  architectureActivate,
  architectureApprove,
  architectureDraft,
  architectureGet,
  architecturePlan,
  architectureRecord,
  architectureRetire,
  architectureRevise,
  architectureTemplateProviderImports,
  architectureValidate,
  initAction,
  workArchitectureCheck,
  workArchitectureWaive,
  workCreate,
  workPrepareForReview,
  aggregateStoreForContext,
  activeArchitectureOrdinanceDiagnostics,
  storeForContext
} from "../src/index.ts";

const passCommand = { mode: "argv" as const, argv: [process.execPath, "-e", "process.exit(0)"], working_directory: "." };
const failCommand = { mode: "argv" as const, argv: [process.execPath, "-e", "process.exit(1)"], working_directory: "." };

describe("Architecture Charter ordinances", () => {
  let root: string;
  const ctx = () => ({ projectRoot: root });

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sg-arch-"));
    await initAction({ project_id: "demo" }, ctx());
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function draftProviderOrdinance(command = passCommand) {
    await architectureDraft({
      ordinances: [{
        id: "ORD-001",
        title: "Provider imports stay behind adapters",
        rule: "Provider-specific SDK imports may only appear in adapter modules.",
        rationale: "Keep provider coupling out of app and domain code.",
        applies_to: ["src/**"],
        exceptions: ["src/adapters/**"],
        examples: { allowed: ["src/adapters/openai.ts imports openai"], disallowed: ["src/features/chat.ts imports openai"] }
      }]
    }, ctx());
    await architecturePlan({
      ordinance_plans: [{
        ordinance_id: "ORD-001",
        summary: "Run a static import-boundary check.",
        enforcement_kind: "static_check",
        command,
        expected_files: [{ path: "scripts/check-provider-imports.ts", purpose: "architecture check", change_type: "create" }],
        validation_strategy: "The command fails on provider imports outside adapter paths."
      }]
    }, ctx());
  }

  async function activateProviderOrdinance(command = passCommand) {
    await draftProviderOrdinance(command);
    const approved = await architectureApprove({ decision: "approve_and_authorize", selected_number: 2, raw_response: "approve and authorize", decision_prompt: "Approve and authorize?", human_confirmed: true }, ctx());
    expect(approved.ok).toBe(true);
    const recorded = await architectureRecord({ summary: "Added architecture check.", changed_files: ["scripts/check-provider-imports.ts"] }, ctx());
    expect(recorded.ok).toBe(true);
    const validated = await architectureValidate({}, ctx());
    expect(validated.ok).toBe(command === passCommand);
    if (command !== passCommand) return validated;
    const activated = await architectureActivate({ selected_number: 1, raw_response: "activate", decision_prompt: "Activate?", human_confirmed: true }, ctx());
    expect(activated.ok).toBe(true);
    return activated;
  }

  it("stores one charter artifact containing many ordinances through approve/validate/activate", async () => {
    await activateProviderOrdinance();
    const got = await architectureGet({ view: "summary" }, ctx());
    expect(got.ok).toBe(true);
    const summary = got.data.architecture_charter_summary as { status: string; active_ordinance_ids: string[] };
    expect(summary.status).toBe("active");
    expect(summary.active_ordinance_ids).toEqual(["ORD-001"]);
  });

  it("uses the provider-import template to draft and plan a boundary ordinance", async () => {
    const result = await architectureTemplateProviderImports({
      provider_imports: ["openai", "@anthropic-ai/sdk"],
      adapter_globs: ["src/adapters/**"],
      checker_path: "scripts/check-provider-imports.mjs"
    }, ctx());
    expect(result.ok).toBe(true);
    const got = await architectureGet({ view: "ordinance", ordinance_id: "ORD-PROVIDER-IMPORTS" }, ctx());
    expect(got.ok).toBe(true);
    const ordinance = got.data.ordinance as { state: string; rule: string; exceptions: string[]; enforcement_plan: { command: { argv: string[] } } };
    expect(ordinance.state).toBe("planned");
    expect(ordinance.rule).toContain("openai");
    expect(ordinance.exceptions).toEqual(["src/adapters/**"]);
    expect(ordinance.enforcement_plan.command.argv).toContain("scripts/check-provider-imports.mjs");
  });

  it("blocks greenfield architecture review until the packet binds active ordinances or records a human waiver", async () => {
    await workCreate({ id: "WP1", title: "API", goal: "g", classification: "reusable_api" }, ctx());
    const blocked = await workPrepareForReview({ id: "WP1" }, ctx());
    expect(blocked.diagnostics.some((d) => d.code === "ARCHITECTURE_CHARTER_REQUIRED")).toBe(true);

    const waived = await workArchitectureWaive({ id: "WP1", reason: "Human chose to proceed without project ordinances for this packet.", selected_number: 1, raw_response: "waive", decision_prompt: "Waive architecture ordinances?", human_confirmed: true }, ctx());
    expect(waived.ok).toBe(true);
    expect((await aggregateStoreForContext(ctx()).read("WP1")).architecture_governance.mode).toBe("waived");
  });

  it("binds greenfield work to the active charter revision and ordinance ids", async () => {
    await activateProviderOrdinance();
    await workCreate({ id: "WP1", title: "API", goal: "g", classification: "reusable_api" }, ctx());
    const bound = await workArchitectureCheck({ id: "WP1" }, ctx());
    expect(bound.ok).toBe(true);
    const governance = (await aggregateStoreForContext(ctx()).read("WP1")).architecture_governance;
    expect(governance.mode).toBe("charter_active");
    expect(governance.active_ordinance_ids).toEqual(["ORD-001"]);
    expect(governance.charter_revision).not.toBeNull();
  });

  it("surfaces ordinance validation failures before activation", async () => {
    const validated = await activateProviderOrdinance(failCommand);
    expect(validated.ok).toBe(false);
    expect(validated.diagnostics.some((d) => d.code === "ARCHITECTURE_ORDINANCE_VALIDATION_FAILED")).toBe(true);
  });

  it("active ordinance diagnostics fail when an active enforcement command turns red", async () => {
    await activateProviderOrdinance();
    // Simulate a committed active checker that later starts failing.
    const artifactStore = storeForContext(ctx());
    const charter = await artifactStore.readCurrent("architecture_charter", null);
    const artifact = charter.artifact as { ordinances: Array<{ id: string; enforcement_plan: { command: typeof failCommand } }> };
    artifact.ordinances[0]!.enforcement_plan.command = failCommand;
    await artifactStore.update(artifact as never);
    const diags = await activeArchitectureOrdinanceDiagnostics(ctx());
    expect(diags.some((d) => d.code === "ARCHITECTURE_ORDINANCE_FAILED")).toBe(true);
  });

  it("revises an active ordinance by activating a replacement and retiring the superseded rule", async () => {
    await activateProviderOrdinance();
    const revised = await architectureRevise({
      ordinance_id: "ORD-001",
      reason: "Adapter path convention changed.",
      revision: { exceptions: ["src/providers/**"], rule: "Provider-specific SDK imports may only appear in provider adapter modules." },
      selected_number: 1,
      raw_response: "revise",
      decision_prompt: "Revise this ordinance?",
      human_confirmed: true
    }, ctx());
    expect(revised.ok).toBe(true);
    const replacementId = (revised.data as { replacement_ordinance_id: string }).replacement_ordinance_id;
    await architecturePlan({
      ordinance_plans: [{
        ordinance_id: replacementId,
        summary: "Run the revised import-boundary check.",
        enforcement_kind: "static_check",
        command: passCommand,
        expected_files: [{ path: "scripts/check-provider-imports.ts", purpose: "architecture check", change_type: "modify" }],
        validation_strategy: "The command fails on provider imports outside provider adapter paths."
      }]
    }, ctx());
    expect((await architectureApprove({ decision: "approve_and_authorize", selected_number: 2, raw_response: "approve and authorize", decision_prompt: "Approve revised ordinance?", human_confirmed: true }, ctx())).ok).toBe(true);
    expect((await architectureRecord({ ordinance_id: replacementId, summary: "Updated architecture check.", changed_files: ["scripts/check-provider-imports.ts"] }, ctx())).ok).toBe(true);
    expect((await architectureValidate({ ordinance_ids: [replacementId] }, ctx())).ok).toBe(true);
    expect((await architectureActivate({ ordinance_ids: [replacementId], selected_number: 1, raw_response: "activate", decision_prompt: "Activate revised ordinance?", human_confirmed: true }, ctx())).ok).toBe(true);

    const got = await architectureGet({ view: "all" }, ctx());
    const ordinances = (got.data.architecture_charter as { ordinances: Array<{ id: string; state: string; supersedes: string | null; superseded_by: string | null; retired_reason: string | null }> }).ordinances;
    expect(ordinances.find((ordinance) => ordinance.id === "ORD-001")?.state).toBe("retired");
    expect(ordinances.find((ordinance) => ordinance.id === "ORD-001")?.superseded_by).toBe(replacementId);
    expect(ordinances.find((ordinance) => ordinance.id === replacementId)?.state).toBe("active");
    expect(ordinances.find((ordinance) => ordinance.id === replacementId)?.supersedes).toBe("ORD-001");
  });

  it("retires active ordinances through a human gate", async () => {
    await activateProviderOrdinance();
    const retired = await architectureRetire({
      ordinance_ids: ["ORD-001"],
      reason: "The project no longer uses this provider integration.",
      selected_number: 1,
      raw_response: "retire",
      decision_prompt: "Retire this ordinance?",
      human_confirmed: true
    }, ctx());
    expect(retired.ok).toBe(true);
    const got = await architectureGet({ view: "summary" }, ctx());
    const summary = got.data.architecture_charter_summary as { status: string; active_ordinance_ids: string[]; retired_ordinance_count: number };
    expect(summary.status).toBe("retired");
    expect(summary.active_ordinance_ids).toEqual([]);
    expect(summary.retired_ordinance_count).toBe(1);

    const redefine = await architectureDraft({
      ordinances: [{
        id: "ORD-001",
        title: "Provider imports stay behind adapters",
        rule: "Replacement should use a new ordinance id.",
        rationale: "Retired ordinance ids are immutable history."
      }]
    }, ctx());
    expect(redefine.ok).toBe(false);
    expect(redefine.diagnostics.some((d) => d.code === "ARCHITECTURE_ORDINANCE_IMMUTABLE_REDEFINE")).toBe(true);
  });
});
