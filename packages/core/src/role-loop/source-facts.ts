import { z } from "zod";
import {
  HumanDecisionRefV1Schema,
  ProducerIdentitySchema,
  ReviewAttestationRefV1Schema
} from "./human-decision.ts";
import type { EvidenceSourceRefV1 } from "./evidence-source-ref.ts";

// Source facts (Normative implementation appendix). Milestone 1B consumes these as *inputs* to the
// satisfaction predicates; it never runs commands or builds facts from the live runner (that is M4).
//
// `CommandResultFactsV1.status` is the canonical, satisfaction-bearing status. The raw
// command-result record and the review-cycle command summary are presentation/diagnostic
// projections that derive deterministically from the same underlying result via the mapping table
// below; satisfaction predicates evaluate only the canonical status.

export const CommandResultPurposeSchema = z.enum([
  "reproduction_expected_failure",
  "validation_expected_pass",
  "other"
]);
export type CommandResultPurpose = z.infer<typeof CommandResultPurposeSchema>;

export const CommandResultCanonicalStatusSchema = z.enum([
  "passed",
  "failed",
  "expected_failure",
  "errored"
]);
export type CommandResultCanonicalStatus = z.infer<typeof CommandResultCanonicalStatusSchema>;

export const CommandResultFactsV1Schema = z.object({
  id: z.string(),
  command_result_hash: z.string(),
  purpose: CommandResultPurposeSchema,
  status: CommandResultCanonicalStatusSchema,
  expected_failure_matched: z.boolean().nullable(),
  expected_failure_signature_hash: z.string().nullable(),
  accepted_by_review_ref: ReviewAttestationRefV1Schema.nullable(),
  bound_requirement_ids: z.array(z.string()),
  bound_ac_ids: z.array(z.string())
}).strict();
export type CommandResultFactsV1 = z.infer<typeof CommandResultFactsV1Schema>;

export const ManualEvidenceFactsV1Schema = z.object({
  id: z.string(),
  manual_evidence_hash: z.string(),
  accepted: z.boolean(),
  accepted_by: z.union([ProducerIdentitySchema, HumanDecisionRefV1Schema]).nullable(),
  bound_ac_ids: z.array(z.string())
}).strict();
export type ManualEvidenceFactsV1 = z.infer<typeof ManualEvidenceFactsV1Schema>;

export const ReviewAttestationFactsV1Schema = z.object({
  review_id: z.string(),
  review_hash: z.string(),
  sealed: z.boolean(),
  attested_requirement_ids: z.array(z.string()),
  attested_ac_ids: z.array(z.string())
}).strict();
export type ReviewAttestationFactsV1 = z.infer<typeof ReviewAttestationFactsV1Schema>;

// A collection of provided source facts, keyed by kind. Inputs to satisfaction/readiness.
export const SourceFactsV1Schema = z.object({
  command_results: z.array(CommandResultFactsV1Schema).default([]),
  manual_evidence: z.array(ManualEvidenceFactsV1Schema).default([]),
  review_attestations: z.array(ReviewAttestationFactsV1Schema).default([])
}).strict();
export type SourceFactsV1 = z.infer<typeof SourceFactsV1Schema>;

export const EMPTY_SOURCE_FACTS_V1: SourceFactsV1 = {
  command_results: [],
  manual_evidence: [],
  review_attestations: []
};

// --- Canonical command-result status mapping (appendix table) ---------------------------------

export const RawCommandResultStatusSchema = z.enum(["passed", "failed", "timed_out", "not_run"]);
export type RawCommandResultStatus = z.infer<typeof RawCommandResultStatusSchema>;

export interface RawCommandResultRecordV1 {
  status: RawCommandResultStatus;
  purpose: CommandResultPurpose;
  // Whether the raw record matched its declared `expected_failure` criteria. Only meaningful for a
  // `reproduction_expected_failure` failure; ignored otherwise.
  expected_failure_criteria_matched: boolean;
  // True when the harness could not run the command to a clean pass/fail (execution/harness error).
  execution_error?: boolean;
}

export interface CanonicalCommandStatusV1 {
  status: CommandResultCanonicalStatus;
  expected_failure_matched: boolean | null;
}

// Maps a raw command-result record to the canonical satisfaction-bearing status. Returns `null`
// for `not_run` (no CommandResultFactsV1 is emitted; the requirement stays unsatisfied).
//
// | Raw record                                                              | canonical status    |
// |-------------------------------------------------------------------------|---------------------|
// | status="passed"                                                         | passed              |
// | status="failed" & purpose=reproduction_expected_failure & matched       | expected_failure    |
// | status="failed" (not an expected-failure match)                         | failed              |
// | status="timed_out"                                                      | errored             |
// | execution/harness error (could not run to a clean pass/fail)            | errored             |
// | status="not_run"                                                        | (no fact emitted)   |
//
// `expected_failure_matched` is `true` exactly for the expected-failure-match row, `false` for any
// other `reproduction_expected_failure` outcome, and `null` when purpose is not reproduction.
export function mapCommandResultStatusV1(raw: RawCommandResultRecordV1): CanonicalCommandStatusV1 | null {
  if (raw.status === "not_run") return null;
  const isReproduction = raw.purpose === "reproduction_expected_failure";

  let status: CommandResultCanonicalStatus;
  if (raw.execution_error === true) status = "errored";
  else if (raw.status === "timed_out") status = "errored";
  else if (raw.status === "passed") status = "passed";
  else status = isReproduction && raw.expected_failure_criteria_matched ? "expected_failure" : "failed";

  // true iff the canonical outcome is the expected-failure match; null when purpose is not repro.
  const expected_failure_matched = isReproduction ? status === "expected_failure" : null;
  return { status, expected_failure_matched };
}

// --- Resolution by id + hash ------------------------------------------------------------------

export type SourceFactResolution =
  | { ok: true; kind: "command_result"; fact: CommandResultFactsV1 }
  | { ok: true; kind: "manual_evidence"; fact: ManualEvidenceFactsV1 }
  | { ok: true; kind: "review_attestation"; fact: ReviewAttestationFactsV1 }
  | { ok: false; kind: EvidenceSourceRefV1["kind"]; reason: "not_found" | "hash_mismatch" };

// Resolves the source fact a ref points at, verifying both id and hash. An unavailable
// (`not_found`) or hash-mismatched fact does not satisfy evidence (the satisfaction layer turns
// these into diagnostics).
export function resolveSourceFact(ref: EvidenceSourceRefV1, facts: SourceFactsV1): SourceFactResolution {
  switch (ref.kind) {
    case "command_result": {
      const fact = facts.command_results.find((candidate) => candidate.id === ref.id);
      if (fact === undefined) return { ok: false, kind: "command_result", reason: "not_found" };
      if (fact.command_result_hash !== ref.command_result_hash) return { ok: false, kind: "command_result", reason: "hash_mismatch" };
      return { ok: true, kind: "command_result", fact };
    }
    case "manual_evidence": {
      const fact = facts.manual_evidence.find((candidate) => candidate.id === ref.id);
      if (fact === undefined) return { ok: false, kind: "manual_evidence", reason: "not_found" };
      if (fact.manual_evidence_hash !== ref.manual_evidence_hash) return { ok: false, kind: "manual_evidence", reason: "hash_mismatch" };
      return { ok: true, kind: "manual_evidence", fact };
    }
    case "review_attestation": {
      const fact = facts.review_attestations.find((candidate) => candidate.review_id === ref.review_id);
      if (fact === undefined) return { ok: false, kind: "review_attestation", reason: "not_found" };
      if (fact.review_hash !== ref.review_hash) return { ok: false, kind: "review_attestation", reason: "hash_mismatch" };
      return { ok: true, kind: "review_attestation", fact };
    }
  }
}
