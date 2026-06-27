import type { CommandResult } from "../schemas/embedded.ts";
import type { Diagnostic } from "../schemas/embedded.ts";
import type { CommandResultFactsV1, CommandResultPurpose } from "../role-loop/source-facts.ts";
import { runCommandDeterministically, type RunCommandOptions } from "./runner.ts";
import {
  buildCommandResultFactsV1,
  classifyCommandMutation,
  type ExpectedFailureCriteriaV1,
  type MutationClassificationV1
} from "./command-facts.ts";

/** M4 validator role: run a local command deterministically, classify any file mutation it caused,
 * and emit the canonical CommandResultFactsV1 that drives evidence satisfaction. The validator is the
 * authoritative command runner; deterministic command results decide pass/fail, never a model. */

export interface RunValidatorCommandOptions extends RunCommandOptions {
  /** Canonical facts purpose (distinct from the runner's CommandResult.purpose axis). */
  factsPurpose: CommandResultPurpose;
  expectedFailure?: ExpectedFailureCriteriaV1 | null;
  boundAcIds?: string[];
  boundRequirementIds?: string[];
  declaredMutationPaths?: string[];
}

export interface ValidatorRunResult {
  command_result: CommandResult;
  facts: CommandResultFactsV1 | null;
  mutation: MutationClassificationV1;
  diagnostics: Diagnostic[];
}

export async function runValidatorCommand(options: RunValidatorCommandOptions): Promise<ValidatorRunResult> {
  // Force file-state capture so mutation classification has before/after manifests.
  const resourceCategories = [...new Set([...(options.resourceCategories ?? []), "files"])];
  const command_result = await runCommandDeterministically({ ...options, resourceCategories });

  const mutation = classifyCommandMutation({ commandResult: command_result, declaredMutationPaths: options.declaredMutationPaths ?? [] });
  const facts = buildCommandResultFactsV1({
    commandResult: command_result,
    purpose: options.factsPurpose,
    expectedFailure: options.expectedFailure ?? null,
    boundAcIds: options.boundAcIds ?? [],
    boundRequirementIds: options.boundRequirementIds ?? []
  });

  const diagnostics: Diagnostic[] = [];
  if (mutation.classification === "mutation_unexpected") {
    diagnostics.push({
      code: "COMMAND_UNEXPECTED_MUTATION",
      severity: "error",
      message: `Command mutated files outside declared paths: ${mutation.observed_changed_files.join(", ")}`,
      field_path: null,
      gate: null,
      fix: "Revert the change, declare the mutation path, or record an approved mutation waiver."
    });
  }
  return { command_result, facts, mutation, diagnostics };
}
