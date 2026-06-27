import { z } from "zod";
import { CommandResultSchema, CommandSpecSchema, RuntimeBaselineRefSchema, type CommandResult } from "../schemas/embedded.ts";
import type { RuntimeBaseline } from "../schemas/artifacts.ts";
import { runCommandDeterministically } from "../commands/runner.ts";
import { diagnostic, failureResult, storeForContext } from "./config.ts";
import type { ActionExecutionContext } from "./context.ts";
import type { ActionResult, MutationSummary } from "./result.ts";
import { appendBaselineCommandResult } from "./baseline.ts";

export const CommandRunInputSchema = z.object({
  command_spec: CommandSpecSchema,
  purpose: z.enum(["test", "build", "runtime_production", "runtime_development", "verifier_health", "other"]),
  related_runtime_baseline_draft_revision: z.number().int().positive().nullable().optional(),
  related_runtime_baseline_ref: RuntimeBaselineRefSchema.nullable().optional(),
  related_work_id: z.string().min(1).nullable().optional(),
  source_interface: z.string().min(1).optional(),
  resource_categories: z.array(z.string()).optional(),
  skip_reason: z.string().min(1).optional(),
  skip_precondition: z.string().min(1).optional()
}).strict();

export async function commandRun(input: z.infer<typeof CommandRunInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult<{ command_result: CommandResult; baseline: RuntimeBaseline | null }>> {
  try {
    const parsed = CommandRunInputSchema.parse(input);
    if ((parsed.skip_reason === undefined) !== (parsed.skip_precondition === undefined)) {
      throw new Error("skip_reason and skip_precondition must be supplied together for deterministic skipped results");
    }
    if (parsed.related_runtime_baseline_draft_revision !== undefined && parsed.related_runtime_baseline_draft_revision !== null) {
      const current = await storeForContext(context).readCurrent("runtime_baseline", null) as { artifact: { revision: number; status?: string } };
      if (current.artifact.revision !== parsed.related_runtime_baseline_draft_revision || current.artifact.status !== "draft") {
        throw new Error(`stale runtime baseline draft revision: expected current draft revision ${current.artifact.revision}, got ${parsed.related_runtime_baseline_draft_revision}`);
      }
    }
    const store = storeForContext(context);
    const result = await runCommandDeterministically({
      commandSpec: parsed.command_spec,
      purpose: parsed.purpose,
      projectRoot: context.projectRoot ?? process.cwd(),
      artifactRoot: store.root,
      relatedRuntimeBaselineDraftRevision: parsed.related_runtime_baseline_draft_revision ?? null,
      relatedRuntimeBaselineRef: parsed.related_runtime_baseline_ref ?? null,
      relatedWorkId: parsed.related_work_id ?? null,
      resourceCategories: parsed.resource_categories,
      sourceInterface: parsed.source_interface,
      skipReason: parsed.skip_reason,
      skipPrecondition: parsed.skip_precondition
    });
    let baseline = null;
    const mutations: MutationSummary[] = [{ artifact: "command_result", operation: "create", paths: [result.storage_ref], summary: "Stored durable kernel-created CommandResult." }];
    if (parsed.related_runtime_baseline_draft_revision !== undefined && parsed.related_runtime_baseline_draft_revision !== null) {
      baseline = await appendBaselineCommandResult(context, result, parsed.related_runtime_baseline_draft_revision);
      mutations.push({ artifact: "runtime_baseline", operation: "update", paths: ["/validation/command_results"], summary: `Appended CommandResult to RuntimeBaseline revision ${baseline.revision}.` });
    }
    return { ok: true, action_id: "command.run", data: { command_result: CommandResultSchema.parse(result), baseline }, diagnostics: [], mutations, next_actions: [], summary: `Command completed with status ${result.status}.` };
  } catch (error) {
    return failureResult("command.run", "Command run rejected or failed before execution.", [diagnostic("COMMAND_RUN_REJECTED", error instanceof Error ? error.message : String(error), "error", "/command.run")]) as ActionResult<{ command_result: CommandResult; baseline: RuntimeBaseline | null }>;
  }
}
