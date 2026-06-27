import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CommandResultSchema,
  type CommandResult,
  buildCommandResultFactsV1,
  evaluateExpectedFailure,
  classifyCommandMutation,
  runValidatorCommand,
  EvidenceRefV1Schema,
  evidenceRefSatisfies,
  type SourceFactsV1
} from "../src/index.ts";

function makeResult(over: Partial<CommandResult> = {}): CommandResult {
  return CommandResultSchema.parse({
    id: over.id ?? "command-result:test",
    storage_ref: "ref:test",
    command: over.command ?? "cmd",
    command_spec: { mode: "argv", argv: ["x"], working_directory: ".", timeout_ms: null, env_mode: "inherit", env_overrides_ref: null },
    purpose: "test",
    working_directory: ".",
    timeout_ms: null,
    env_mode: "inherit",
    related_work_id: null,
    related_runtime_baseline_ref: null,
    related_runtime_baseline_draft_revision: null,
    exit_code: over.exit_code ?? 0,
    started_at: "2026-01-01T00:00:00.000Z",
    finished_at: "2026-01-01T00:00:00.000Z",
    duration_ms: 0,
    status: over.status ?? "passed",
    skip_reason: over.status === "skipped" ? "skip" : null,
    skip_precondition: null,
    error_message: over.error_message ?? null,
    output_ref: null,
    output_excerpt: over.output_excerpt ?? null,
    resource_categories: [],
    cleanup_observations: over.cleanup_observations ?? null,
    source_interface: "core"
  });
}

describe("M4 buildCommandResultFactsV1 status mapping", () => {
  it("maps the appendix table rows", () => {
    expect(buildCommandResultFactsV1({ commandResult: makeResult({ status: "passed", exit_code: 0 }), purpose: "validation_expected_pass" })?.status).toBe("passed");
    expect(buildCommandResultFactsV1({ commandResult: makeResult({ status: "failed", exit_code: 1 }), purpose: "validation_expected_pass" })?.status).toBe("failed");
    expect(buildCommandResultFactsV1({ commandResult: makeResult({ status: "timed_out", exit_code: null, error_message: "timed out" }), purpose: "validation_expected_pass" })?.status).toBe("errored");
    // skipped -> not_run -> no fact
    expect(buildCommandResultFactsV1({ commandResult: makeResult({ status: "skipped" }), purpose: "validation_expected_pass" })).toBeNull();
    // spawn error (error_message, not timeout) -> errored
    expect(buildCommandResultFactsV1({ commandResult: makeResult({ status: "failed", exit_code: null, error_message: "ENOENT" }), purpose: "validation_expected_pass" })?.status).toBe("errored");
  });

  it("reproduction failure maps to expected_failure only on a criteria match", () => {
    const matched = buildCommandResultFactsV1({ commandResult: makeResult({ status: "failed", exit_code: 1, output_excerpt: "boom" }), purpose: "reproduction_expected_failure", expectedFailure: { exit_code: 1, output_contains: ["boom"] } });
    expect(matched?.status).toBe("expected_failure");
    expect(matched?.expected_failure_matched).toBe(true);
    const noMatch = buildCommandResultFactsV1({ commandResult: makeResult({ status: "failed", exit_code: 2, output_excerpt: "other" }), purpose: "reproduction_expected_failure", expectedFailure: { exit_code: 1, output_contains: ["boom"] } });
    expect(noMatch?.status).toBe("failed");
    expect(noMatch?.expected_failure_matched).toBe(false);
  });

  it("command_result_hash is deterministic and sensitive to result content", () => {
    const a = buildCommandResultFactsV1({ commandResult: makeResult({ exit_code: 0 }), purpose: "validation_expected_pass", boundAcIds: ["ac1"] });
    const b = buildCommandResultFactsV1({ commandResult: makeResult({ exit_code: 0 }), purpose: "validation_expected_pass", boundAcIds: ["ac1"] });
    const c = buildCommandResultFactsV1({ commandResult: makeResult({ status: "failed", exit_code: 1 }), purpose: "validation_expected_pass", boundAcIds: ["ac1"] });
    expect(a?.command_result_hash).toBe(b?.command_result_hash);
    expect(a?.command_result_hash).not.toBe(c?.command_result_hash);
  });
});

describe("M4 evaluateExpectedFailure", () => {
  it("matches on exit code and output substrings", () => {
    const r = makeResult({ status: "failed", exit_code: 3, output_excerpt: "TypeError: x is undefined" });
    expect(evaluateExpectedFailure(r, { exit_code: 3, output_contains: ["TypeError"] }).matched).toBe(true);
    expect(evaluateExpectedFailure(r, { exit_code: 9, output_contains: ["TypeError"] }).matched).toBe(false);
    expect(evaluateExpectedFailure(r, { exit_code: null, output_contains: ["missing"] }).matched).toBe(false);
  });
});

describe("M4 classifyCommandMutation", () => {
  const obs = (before: Array<[string, string]>, after: Array<[string, string]>) => ({
    files: {
      before: before.map(([p, h]) => ({ path: p, size: 1, content_hash: h })),
      after: after.map(([p, h]) => ({ path: p, size: 1, content_hash: h })),
      comparison_rule: "no_new_resources",
      passed: true
    }
  });

  it("no change is read_only_expected", () => {
    const r = makeResult({ cleanup_observations: obs([["a.ts", "h1"]], [["a.ts", "h1"]]) });
    expect(classifyCommandMutation({ commandResult: r }).classification).toBe("read_only_expected");
  });

  it("an undeclared change is mutation_unexpected", () => {
    const r = makeResult({ cleanup_observations: obs([["a.ts", "h1"]], [["a.ts", "h2"]]) });
    const m = classifyCommandMutation({ commandResult: r, declaredMutationPaths: ["dist/**"] });
    expect(m.classification).toBe("mutation_unexpected");
    expect(m.observed_changed_files).toEqual(["a.ts"]);
  });

  it("a declared change is mutation_expected", () => {
    const r = makeResult({ cleanup_observations: obs([["dist/x.js", "h1"]], [["dist/x.js", "h2"]]) });
    expect(classifyCommandMutation({ commandResult: r, declaredMutationPaths: ["dist/**"] }).classification).toBe("mutation_expected");
  });

  it("no manifest is unknown", () => {
    expect(classifyCommandMutation({ commandResult: makeResult({ cleanup_observations: null }) }).classification).toBe("unknown");
  });
});

describe("M4 end-to-end: real validator output drives M1B satisfaction", () => {
  let root: string;
  let artifactRoot: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sg-m4-"));
    artifactRoot = path.join(root, ".spec-guard");
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("a passing command yields passing_command evidence that satisfies", async () => {
    const result = await runValidatorCommand({
      commandSpec: { mode: "argv", argv: ["node", "-e", "process.exit(0)"], working_directory: ".", timeout_ms: 30000, env_mode: "inherit", env_overrides_ref: null },
      purpose: "test",
      factsPurpose: "validation_expected_pass",
      projectRoot: root,
      artifactRoot,
      boundAcIds: ["ac1"]
    });
    expect(result.command_result.status).toBe("passed");
    expect(result.mutation.classification).toBe("read_only_expected");
    expect(result.diagnostics).toHaveLength(0);
    const facts = result.facts;
    expect(facts).not.toBeNull();
    const sourceFacts: SourceFactsV1 = { command_results: [facts!], manual_evidence: [], review_attestations: [] };
    const ref = EvidenceRefV1Schema.parse({
      schema_version: 1, id: "er1", packet_approval_hash: "pah", evidence_policy_resolution_hash: "eph",
      ac_id: "ac1", ac_content_hash: "ach", evidence_type: "passing_command", requirement_id: null, gate: "completion",
      source_ref: { kind: "command_result", id: facts!.id, command_result_hash: facts!.command_result_hash }
    });
    const sat = evidenceRefSatisfies(ref, { effectiveEvidenceType: "passing_command", requirementId: null, requiresReviewerAttestation: false, acId: "ac1", facts: sourceFacts });
    expect(sat.status).toBe("satisfied");
  });

  it("a failing reproduction command yields reproduction evidence that satisfies", async () => {
    const result = await runValidatorCommand({
      commandSpec: { mode: "argv", argv: ["node", "-e", "process.exit(1)"], working_directory: ".", timeout_ms: 30000, env_mode: "inherit", env_overrides_ref: null },
      purpose: "test",
      factsPurpose: "reproduction_expected_failure",
      expectedFailure: { exit_code: 1, output_contains: [] },
      projectRoot: root,
      artifactRoot,
      boundAcIds: ["ac1"]
    });
    const facts = result.facts;
    expect(facts?.status).toBe("expected_failure");
    expect(facts?.expected_failure_matched).toBe(true);
    const sourceFacts: SourceFactsV1 = { command_results: [facts!], manual_evidence: [], review_attestations: [] };
    const ref = EvidenceRefV1Schema.parse({
      schema_version: 1, id: "er2", packet_approval_hash: "pah", evidence_policy_resolution_hash: "eph",
      ac_id: "ac1", ac_content_hash: "ach", evidence_type: "reproduction", requirement_id: null, gate: "authorization",
      source_ref: { kind: "command_result", id: facts!.id, command_result_hash: facts!.command_result_hash }
    });
    const sat = evidenceRefSatisfies(ref, { effectiveEvidenceType: "reproduction", requirementId: null, requiresReviewerAttestation: false, acId: "ac1", facts: sourceFacts });
    expect(sat.status).toBe("satisfied");
  });
});
