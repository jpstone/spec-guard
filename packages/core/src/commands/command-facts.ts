import { z } from "zod";
import { sha256HexCanonical } from "../canonical/hashes.ts";
import type { CommandResult } from "../schemas/embedded.ts";
import { matchesAnyGlob } from "../paths/glob.ts";
import {
  CommandResultFactsV1Schema,
  type CommandResultFactsV1,
  type CommandResultPurpose,
  mapCommandResultStatusV1,
  type RawCommandResultStatus
} from "../role-loop/source-facts.ts";
import type { ReviewAttestationRefV1 } from "../role-loop/human-decision.ts";

/** M4: turn a real `CommandResult` (from the local validator runner) into the canonical
 * `CommandResultFactsV1` that M1B's satisfaction predicates consume, and classify any file mutation
 * the command caused. The validator stays local/deterministic; a model never decides pass/fail. */

export function rawStatusFromCommandResult(status: CommandResult["status"]): RawCommandResultStatus {
  return status === "skipped" ? "not_run" : status;
}

export interface ExpectedFailureCriteriaV1 {
  exit_code: number | null;
  output_contains: string[];
}

export interface ExpectedFailureEvaluation {
  matched: boolean;
  signature_hash: string | null;
}

/** The runner merges stdout+stderr into one output stream, so expected-failure matching checks
 * exit code + substrings of the captured output excerpt. */
export function evaluateExpectedFailure(result: CommandResult, criteria: ExpectedFailureCriteriaV1): ExpectedFailureEvaluation {
  const output = result.output_excerpt ?? "";
  const exitOk = criteria.exit_code === null || result.exit_code === criteria.exit_code;
  const textOk = criteria.output_contains.every((needle) => output.includes(needle));
  const matched = exitOk && textOk;
  const signature_hash = matched ? sha256HexCanonical({ exit_code: result.exit_code, output_contains: criteria.output_contains }) : null;
  return { matched, signature_hash };
}

export interface BuildCommandResultFactsInput {
  commandResult: CommandResult;
  purpose: CommandResultPurpose;
  expectedFailure?: ExpectedFailureCriteriaV1 | null;
  boundAcIds?: string[];
  boundRequirementIds?: string[];
  acceptedByReviewRef?: ReviewAttestationRefV1 | null;
}

/** Build the canonical facts. Returns `null` for a skipped/not-run command (no fact is emitted; the
 * requirement stays unsatisfied), per the appendix mapping table. */
export function buildCommandResultFactsV1(input: BuildCommandResultFactsInput): CommandResultFactsV1 | null {
  const rawStatus = rawStatusFromCommandResult(input.commandResult.status);
  const isReproduction = input.purpose === "reproduction_expected_failure";
  const expectedEval = isReproduction && input.expectedFailure
    ? evaluateExpectedFailure(input.commandResult, input.expectedFailure)
    : { matched: false, signature_hash: null };
  // A command that could not run to a clean pass/fail (spawn error / killed by signal) carries an
  // error_message without being a timeout; that is an execution error → canonical "errored".
  const executionError = input.commandResult.error_message !== null && input.commandResult.status !== "timed_out";
  const canonical = mapCommandResultStatusV1({
    status: rawStatus,
    purpose: input.purpose,
    expected_failure_criteria_matched: expectedEval.matched,
    execution_error: executionError
  });
  if (canonical === null) return null;

  const boundAcIds = input.boundAcIds ?? [];
  const boundRequirementIds = input.boundRequirementIds ?? [];
  const signatureHash = isReproduction ? expectedEval.signature_hash : null;
  const hashProjection = {
    command_result_id: input.commandResult.id,
    command: input.commandResult.command,
    purpose: input.purpose,
    status: canonical.status,
    exit_code: input.commandResult.exit_code,
    expected_failure_matched: canonical.expected_failure_matched,
    expected_failure_signature_hash: signatureHash,
    bound_requirement_ids: boundRequirementIds,
    bound_ac_ids: boundAcIds
  };
  return CommandResultFactsV1Schema.parse({
    id: input.commandResult.id,
    command_result_hash: sha256HexCanonical(hashProjection),
    purpose: input.purpose,
    status: canonical.status,
    expected_failure_matched: canonical.expected_failure_matched,
    expected_failure_signature_hash: signatureHash,
    accepted_by_review_ref: input.acceptedByReviewRef ?? null,
    bound_requirement_ids: boundRequirementIds,
    bound_ac_ids: boundAcIds
  });
}

export type CommandMutationClassification = "read_only_expected" | "mutation_expected" | "mutation_unexpected" | "unknown";

export interface MutationClassificationV1 {
  classification: CommandMutationClassification;
  pre_command_tree_hash: string | null;
  post_command_tree_hash: string | null;
  observed_changed_files: string[];
  declared_mutation_paths: string[];
  disposition: "none" | "reverted" | "accepted" | "converted_to_governed_change";
}

const FileManifestEntrySchema = z.object({ path: z.string(), size: z.number(), content_hash: z.string() }).passthrough();
const FilesObservationSchema = z.object({
  files: z.object({
    before: z.array(FileManifestEntrySchema),
    after: z.array(FileManifestEntrySchema)
  }).passthrough()
}).passthrough();

function observedChanges(before: Array<{ path: string; content_hash: string }>, after: Array<{ path: string; content_hash: string }>): string[] {
  const beforeMap = new Map(before.map((entry) => [entry.path, entry.content_hash]));
  const afterMap = new Map(after.map((entry) => [entry.path, entry.content_hash]));
  const changed = new Set<string>();
  for (const [p, hash] of afterMap) if (beforeMap.get(p) !== hash) changed.add(p);
  for (const p of beforeMap.keys()) if (!afterMap.has(p)) changed.add(p);
  return [...changed].sort();
}

/** Classify the file mutation a command caused, from the runner's before/after file manifests
 * (captured when the command runs with the "files" resource category). `unknown` when no manifest
 * was captured. Unexpected mutations are blocking by default (the validator wrapper diagnoses them). */
export function classifyCommandMutation(input: { commandResult: CommandResult; declaredMutationPaths?: string[] }): MutationClassificationV1 {
  const declared = input.declaredMutationPaths ?? [];
  const parsed = FilesObservationSchema.safeParse(input.commandResult.cleanup_observations);
  if (!parsed.success) {
    return { classification: "unknown", pre_command_tree_hash: null, post_command_tree_hash: null, observed_changed_files: [], declared_mutation_paths: declared, disposition: "none" };
  }
  const before = parsed.data.files.before;
  const after = parsed.data.files.after;
  const observed = observedChanges(before, after);
  let classification: CommandMutationClassification;
  if (observed.length === 0) classification = "read_only_expected";
  else if (observed.every((p) => matchesAnyGlob(p, declared))) classification = "mutation_expected";
  else classification = "mutation_unexpected";
  return {
    classification,
    pre_command_tree_hash: sha256HexCanonical(before),
    post_command_tree_hash: sha256HexCanonical(after),
    observed_changed_files: observed,
    declared_mutation_paths: declared,
    disposition: "none"
  };
}
