import { describe, expect, it } from "vitest";
import {
  classifyDrift,
  evaluateAttemptBoundary,
  evaluateEvidencePreparationScope,
  evaluateAuthorizationGate,
  ApprovedEvidencePolicyProjectionV1Schema,
  evidencePolicyResolutionHash,
  createDefaultConfig,
  type SourceFactsV1,
  type ApprovedEvidencePolicyProjectionV1
} from "../src/index.ts";

const config = createDefaultConfig({ projectRoot: "/proj" });

function policy(perAcOver: Record<string, unknown>): ApprovedEvidencePolicyProjectionV1 {
  return ApprovedEvidencePolicyProjectionV1Schema.parse({
    schema_version: 1, approval_projection_version: 1, hash_algorithm: "sha256-canonical-json-v1",
    identity_binding_policy: "content_only", policy_id: "spec-guard-default-evidence-policy", policy_version: 1,
    config_hash: "cfg", resolver_version: 1,
    per_ac: [{ ac_id: "ac1", ac_content_hash: "ach", appropriate_evidence_rationale_code: null, validation_requirements: [], ...perAcOver }],
    approval_bound_resolver_ref: null
  });
}

const reproductionPolicy = policy({
  mode: "reproduction_evidence_required", classification: "bug_regression", rationale_code: "bug",
  required_evidence: ["reproduction", "passing_command"],
  required_before_authorization: [{ requirement: { kind: "evidence", evidence: "reproduction" }, waiver_authority: "human", requires_reviewer_attestation: false }],
  required_before_completion: [{ requirement: { kind: "evidence", evidence: "passing_command" }, waiver_authority: "human_and_reviewer", requires_reviewer_attestation: false }]
});

const automatedPolicy = policy({
  mode: "automated_tests_required", classification: "behavior_change", rationale_code: "beh",
  required_evidence: ["automated_test", "passing_command"],
  required_before_authorization: [],
  required_before_completion: [{ requirement: { kind: "evidence", evidence: "automated_test" }, waiver_authority: "human", requires_reviewer_attestation: false }]
});

describe("M6 classifyDrift", () => {
  it("classifies against the approved boundary", () => {
    const ctx = { expectedFiles: ["src/feature.ts"], allowedGlobs: ["src/**", "package.json"] };
    expect(classifyDrift("src/feature.ts", ctx)).toBe("planned_files");
    expect(classifyDrift("src/other.ts", ctx)).toBe("review_justifiable_drift");
    expect(classifyDrift("package.json", ctx)).toBe("approval_required_drift");
    expect(classifyDrift("evil/x.ts", ctx)).toBe("forbidden");
  });
});

describe("M6 evaluateAttemptBoundary", () => {
  it("blocks forbidden and approval-required drift, allows planned/review-justifiable", () => {
    const ctx = { expectedFiles: ["src/feature.ts"], allowedGlobs: ["src/**", "package.json"] };
    const clean = evaluateAttemptBoundary(["src/feature.ts", "src/helper.ts"], ctx);
    expect(clean.blocked).toBe(false);
    const approval = evaluateAttemptBoundary(["src/feature.ts", "package.json"], ctx);
    expect(approval.blocked).toBe(true);
    expect(approval.diagnostics[0]?.code).toBe("ATTEMPT_FILE_APPROVAL_REQUIRED");
    const forbidden = evaluateAttemptBoundary(["evil/x.ts"], ctx);
    expect(forbidden.blocked).toBe(true);
    expect(forbidden.diagnostics[0]?.code).toBe("ATTEMPT_FILE_FORBIDDEN");
  });
});

describe("M6 evaluateEvidencePreparationScope", () => {
  it("allows test/evidence paths and blocks product source", () => {
    expect(evaluateEvidencePreparationScope(["tests/repro.test.ts"], config).blocked).toBe(false);
    const blocked = evaluateEvidencePreparationScope(["src/feature.ts"], config);
    expect(blocked.blocked).toBe(true);
    expect(blocked.diagnostics[0]?.code).toBe("EVIDENCE_PREP_PRODUCT_CHANGE");
    // allow-list: an unexpected/uncategorized product path is also blocked, not silently allowed
    expect(evaluateEvidencePreparationScope(["weird/thing.bin"], config).blocked).toBe(true);
  });
});

describe("M6 evaluateAuthorizationGate", () => {
  it("blocks product authorization for a reproduction-required AC until reproduction evidence exists", () => {
    const denied = evaluateAuthorizationGate({ kind: "implementation", packet_approval_current: true, packet_approval_hash: "pah", evidence_policy: reproductionPolicy });
    expect(denied.authorized).toBe(false);
    expect(denied.evidence_ready).toBe(false);

    const facts: SourceFactsV1 = {
      command_results: [{ id: "cr1", command_result_hash: "crh1", purpose: "reproduction_expected_failure", status: "expected_failure", expected_failure_matched: true, expected_failure_signature_hash: "sig", accepted_by_review_ref: null, bound_requirement_ids: [], bound_ac_ids: ["ac1"] }],
      manual_evidence: [], review_attestations: []
    };
    const ref = {
      schema_version: 1, id: "er1", packet_approval_hash: "pah", evidence_policy_resolution_hash: evidencePolicyResolutionHash(reproductionPolicy),
      ac_id: "ac1", ac_content_hash: "ach", evidence_type: "reproduction" as const, requirement_id: null, gate: "authorization" as const,
      source_ref: { kind: "command_result" as const, id: "cr1", command_result_hash: "crh1" }
    };
    const authorized = evaluateAuthorizationGate({ kind: "implementation", packet_approval_current: true, packet_approval_hash: "pah", evidence_policy: reproductionPolicy, refs: [ref], facts });
    expect(authorized.authorized).toBe(true);
    expect(authorized.evidence_ready).toBe(true);
  });

  it("denies authorization when packet approval is stale", () => {
    const result = evaluateAuthorizationGate({ kind: "implementation", packet_approval_current: false, packet_approval_hash: "pah", evidence_policy: automatedPolicy });
    expect(result.authorized).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "PACKET_APPROVAL_STALE")).toBe(true);
  });

  it("denies fix authorization when allowed_files escape the boundary", () => {
    const result = evaluateAuthorizationGate({ kind: "fix", packet_approval_current: true, packet_approval_hash: "pah", evidence_policy: automatedPolicy, fix_allowed_files: ["src/x.ts", "evil/y.ts"], allowed_globs: ["src/**"] });
    expect(result.authorized).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "FIX_ALLOWED_FILE_OUTSIDE_BOUNDARY")).toBe(true);
  });

  it("authorizes a fix with in-boundary allowed_files and no outstanding authorization evidence", () => {
    const result = evaluateAuthorizationGate({ kind: "fix", packet_approval_current: true, packet_approval_hash: "pah", evidence_policy: automatedPolicy, fix_allowed_files: ["src/x.ts"], allowed_globs: ["src/**"] });
    expect(result.authorized).toBe(true);
  });
});
