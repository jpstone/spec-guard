import { z } from "zod";
import { sha256HexCanonical } from "../canonical/hashes.ts";
import { JsonValueSchema, SourceArtifactRefSchema } from "../schemas/embedded.ts";
import { DecisionLog } from "../decisions/decision-log.ts";
import { buildHumanDecision, isDeclineLikeDecision, isDiscussDecision } from "../decisions/human-decision.ts";
import { isSpecializedWorkflowDecisionType } from "../decisions/decision-types.ts";
import { storeForContext, diagnostic, failureResult } from "./config.ts";
import type { ActionExecutionContext } from "./context.ts";
import type { ActionResult } from "./result.ts";

const JsonObjectSchema = z.record(z.string(), JsonValueSchema);

const DecisionCreateBaseSchema = z.object({
  decision_type: z.string().min(1),
  selected_number: z.number().int().positive(),
  raw_response: z.string().min(1),
  decision_prompt: z.string().min(1),
  human_confirmed: z.boolean(),
  prompt_id: z.string().min(1).optional(),
  normalized_decision: z.string().min(1).optional(),
  approved_fields: z.array(z.string()).optional(),
  approved_payload: JsonObjectSchema.optional(),
  reviewed_payload: JsonObjectSchema.optional(),
  review_bound: z.boolean().optional(),
  review_snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  review_snapshot_revision: z.string().min(1).optional(),
  source_artifact_refs: z.array(SourceArtifactRefSchema).optional(),
  custom_response: z.string().nullable().optional(),
  source_interface: z.string().min(1).optional()
}).strict();
export const DecisionCreateInputSchema = DecisionCreateBaseSchema;
export type DecisionCreateInput = z.infer<typeof DecisionCreateInputSchema>;

export const DecisionSupersedeInputSchema = DecisionCreateBaseSchema.extend({
  prior_decision_id: z.string().min(1)
}).strict();
export type DecisionSupersedeInput = z.infer<typeof DecisionSupersedeInputSchema>;

export const DecisionGetInputSchema = z.object({ id: z.string().min(1) }).strict();
export const DecisionListInputSchema = z.object({
  decision_type: z.string().min(1).optional(),
  include_superseded: z.boolean().optional()
}).strict();

function defaultNormalizedDecision(input: { selected_number: number; normalized_decision?: string | undefined }): string {
  if (input.normalized_decision !== undefined) return input.normalized_decision;
  if (input.selected_number === 1) return "approved";
  if (input.selected_number === 2) return "declined";
  if (input.selected_number === 3) return "discuss";
  return `option_${input.selected_number}`;
}

function validateHumanGated(actionId: string, input: DecisionCreateInput | DecisionSupersedeInput): string {
  if (input.human_confirmed !== true) throw new Error("human_confirmed must be true");
  if (input.selected_number === undefined) throw new Error("selected_number is required");
  if (!input.raw_response) throw new Error("raw_response is required");
  if (!input.decision_prompt) throw new Error("decision_prompt is required");
  if (isSpecializedWorkflowDecisionType(input.decision_type)) {
    throw new Error(`generic ${actionId} cannot record standard workflow decision type ${input.decision_type}; use the specialized action`);
  }
  const reviewBound = input.review_bound === true || input.review_snapshot_hash !== undefined || input.review_snapshot_revision !== undefined;
  if (reviewBound) {
    if (input.review_snapshot_hash === undefined || input.review_snapshot_revision === undefined || input.source_artifact_refs === undefined) {
      throw new Error("review-bound decisions require review_snapshot_hash, review_snapshot_revision, and source_artifact_refs");
    }
  }
  return defaultNormalizedDecision(input);
}

export async function decisionCreate(input: DecisionCreateInput, context: ActionExecutionContext = {}): Promise<ActionResult> {
  try {
    const parsed = DecisionCreateInputSchema.parse(input);
    const normalized = validateHumanGated("decision.create", parsed);
    if (isDiscussDecision(normalized)) {
      return {
        ok: true,
        action_id: "decision.create",
        data: { decision: null, normalized_decision: "discuss" },
        diagnostics: [],
        mutations: [{ artifact: "decision_log", operation: "none", paths: [], summary: "Discuss selected; no HumanDecision was created." }],
        next_actions: [],
        summary: "Discuss recorded no decision."
      };
    }
    const finalDecision = !isDeclineLikeDecision(normalized);
    const decision = buildHumanDecision({
      action_id: "decision.create",
      decision_type: parsed.decision_type,
      selected_number: parsed.selected_number,
      raw_response: parsed.raw_response,
      decision_prompt: parsed.decision_prompt,
      human_confirmed: true,
      prompt_id: parsed.prompt_id,
      normalized_decision: normalized,
      final_decision: finalDecision,
      approved_fields: parsed.approved_fields,
      approved_payload: finalDecision ? (parsed.approved_payload ?? null) : null,
      reviewed_payload: finalDecision ? null : parsed.reviewed_payload,
      review_snapshot_hash: parsed.review_snapshot_hash ?? null,
      review_snapshot_revision: parsed.review_snapshot_revision ?? null,
      source_artifact_refs: parsed.source_artifact_refs ?? [],
      custom_response: parsed.custom_response ?? null,
      source_interface: parsed.source_interface ?? "core"
    });
    const store = storeForContext(context);
    const log = new DecisionLog(store.root);
    await log.append(decision);
    return {
      ok: true,
      action_id: "decision.create",
      data: { decision, approved_payload_hash: decision.approved_payload_hash, prompt_id: decision.prompt_id },
      diagnostics: [],
      mutations: [{ artifact: "decision_log", operation: "create", paths: [`/decisions/${decision.id}`], summary: "Appended immutable HumanDecision." }],
      next_actions: [],
      summary: "Decision created."
    };
  } catch (error) {
    return failureResult("decision.create", "Decision creation rejected.", [diagnostic("DECISION_CREATE_REJECTED", error instanceof Error ? error.message : String(error), "error", "/decision")]);
  }
}

export async function decisionSupersede(input: DecisionSupersedeInput, context: ActionExecutionContext = {}): Promise<ActionResult> {
  try {
    const parsed = DecisionSupersedeInputSchema.parse(input);
    const normalized = validateHumanGated("decision.supersede", parsed);
    if (isDiscussDecision(normalized)) {
      return {
        ok: true,
        action_id: "decision.supersede",
        data: { decision: null, normalized_decision: "discuss" },
        diagnostics: [],
        mutations: [{ artifact: "decision_log", operation: "none", paths: [], summary: "Discuss selected; no supersession was created." }],
        next_actions: [],
        summary: "Discuss recorded no decision."
      };
    }
    const store = storeForContext(context);
    const log = new DecisionLog(store.root);
    await log.get(parsed.prior_decision_id);
    const finalDecision = !isDeclineLikeDecision(normalized);
    const decision = buildHumanDecision({
      action_id: "decision.supersede",
      decision_type: parsed.decision_type,
      selected_number: parsed.selected_number,
      raw_response: parsed.raw_response,
      decision_prompt: parsed.decision_prompt,
      human_confirmed: true,
      prompt_id: parsed.prompt_id,
      normalized_decision: normalized,
      final_decision: finalDecision,
      approved_fields: parsed.approved_fields,
      approved_payload: finalDecision ? (parsed.approved_payload ?? null) : null,
      reviewed_payload: finalDecision ? null : parsed.reviewed_payload,
      review_snapshot_hash: parsed.review_snapshot_hash ?? null,
      review_snapshot_revision: parsed.review_snapshot_revision ?? null,
      source_artifact_refs: parsed.source_artifact_refs ?? [],
      custom_response: parsed.custom_response ?? null,
      source_interface: parsed.source_interface ?? "core",
      supersedes_decision_id: parsed.prior_decision_id
    });
    await log.append(decision);
    const prior = await log.setSupersededBy(parsed.prior_decision_id, decision.id);
    return {
      ok: true,
      action_id: "decision.supersede",
      data: { decision, superseded_decision: prior },
      diagnostics: [],
      mutations: [
        { artifact: "decision_log", operation: "create", paths: [`/decisions/${decision.id}`], summary: "Appended superseding HumanDecision." },
        { artifact: "decision_log", operation: "supersede", paths: [`/decisions/${prior.id}/superseded_by_decision_id`], summary: "Updated only metadata backlink on prior decision." }
      ],
      next_actions: [],
      summary: "Decision superseded."
    };
  } catch (error) {
    return failureResult("decision.supersede", "Decision supersession rejected.", [diagnostic("DECISION_SUPERSEDE_REJECTED", error instanceof Error ? error.message : String(error), "error", "/decision")]);
  }
}

export async function decisionGet(input: z.infer<typeof DecisionGetInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult> {
  try {
    const parsed = DecisionGetInputSchema.parse(input);
    const log = new DecisionLog(storeForContext(context).root);
    const decision = await log.get(parsed.id);
    return { ok: true, action_id: "decision.get", data: { decision }, diagnostics: [], mutations: [{ artifact: "decision_log", operation: "none", paths: [], summary: "Read HumanDecision." }], next_actions: [], summary: "Decision loaded." };
  } catch (error) {
    return failureResult("decision.get", "Decision could not be loaded.", [diagnostic("DECISION_GET_FAILED", error instanceof Error ? error.message : String(error), "error", "/id")]);
  }
}

export async function decisionList(input: z.infer<typeof DecisionListInputSchema> = {}, context: ActionExecutionContext = {}): Promise<ActionResult> {
  try {
    const parsed = DecisionListInputSchema.parse(input);
    const log = new DecisionLog(storeForContext(context).root);
    const decisions = await log.list(parsed);
    return { ok: true, action_id: "decision.list", data: { decisions, count: decisions.length }, diagnostics: [], mutations: [{ artifact: "decision_log", operation: "none", paths: [], summary: "Listed HumanDecisions." }], next_actions: [], summary: "Decisions listed." };
  } catch (error) {
    return failureResult("decision.list", "Decisions could not be listed.", [diagnostic("DECISION_LIST_FAILED", error instanceof Error ? error.message : String(error), "error", "/decision")]);
  }
}

export function expectedApprovedPayloadHash(payload: Record<string, unknown>): string {
  return sha256HexCanonical(payload);
}
