import type { ActionResult } from "./result.ts";
import type { ActionExecutionContext } from "./context.ts";
import { configCheck, configGet, configUpdate, diagnostic, failureResult } from "./config.ts";
import { initAction } from "./init.ts";
import { mcpQuickstart, mcpStatus } from "./quickstart.ts";
import { decisionCreate, decisionGet, decisionList, decisionSupersede } from "./decision.ts";
import { reviewSnapshotPersist } from "./review-snapshot.ts";
import { baselineAccept, baselineBlock, baselineCheck, baselineDevRuntimeRun, baselineEstablish, baselineInit, baselineList, baselineReview, baselineUpdate } from "./baseline.ts";
import { commandRun } from "./command.ts";
import { sourceArtifactGet, sourceArtifactList, sourceArtifactRegister, sourceArtifactUpdate } from "./source-artifact.ts";
import { validateParity } from "./parity.ts";
import { architectureActivate, architectureApprove, architectureAuthorize, architectureDraft, architectureGet, architecturePlan, architectureQuickstart, architectureRecord, architectureRetire, architectureRevise, architectureTemplateProviderImports, architectureValidate, workArchitectureCheck, workArchitectureWaive } from "./architecture.ts";
import { workCreate, workDecompose, workApprove, workAuthorize, workSpecAdvance, workSpecRecord, workSpecMockup, workSpecAcs, workReview, workComplete, workChoicePrepare, workChoice, workChoices, workGet, workList, workSpecPlan, workParallelismPlan, workIntent, workTargetAttach, workRevise, workSpecRevise, workNext, workPrepareForReview, workReviewReady, workApprovalReady, workCompletionReady, summarizeWorkPacket, workApprovalToken } from "./work.ts";
import { aggregateApprovalProjection } from "../role-loop/aggregate-approval.ts";
import type { AggregateWorkPacket } from "../schemas/work-packet.ts";

export async function executeAction(actionId: string, input: Record<string, unknown> = {}, context: ActionExecutionContext = {}): Promise<ActionResult> {
  switch (actionId) {
    // The work flow: one aggregate document per Work Packet (container + embedded specs[]), three whole-WP human
    // gates (approve/authorize/complete) with per-Spec agent work between them.
    case "work.create":
      return workCreate(input as never, context);
    case "work.intent":
      return workIntent(input as never, context);
    case "work.target.attach":
      return workTargetAttach(input as never, context);
    case "work.architecture.check":
      return workArchitectureCheck(input as never, context);
    case "work.architecture.waive":
      return workArchitectureWaive(input as never, context);
    case "work.get":
      return workGet(input as never, context);
    case "work.list":
      return workList(input as never, context);
    case "work.next":
      return workNext(input as never, context);
    case "work.prepare_for_review":
      return workPrepareForReview(input as never, context);
    case "work.review.ready":
      return workReviewReady(input as never, context);
    case "work.approval.ready":
      return workApprovalReady(input as never, context);
    case "work.completion.ready":
      return workCompletionReady(input as never, context);
    case "work.decompose":
      return workDecompose(input as never, context);
    case "work.revise":
      return workRevise(input as never, context);
    case "work.choice.prepare":
      return workChoicePrepare(input as never, context);
    case "work.choice":
      return workChoice(input as never, context);
    case "work.choices":
      return workChoices(input as never, context);
    case "work.spec.revise":
      return workSpecRevise(input as never, context);
    case "work.spec.acs":
      return workSpecAcs(input as never, context);
    case "work.spec.plan":
      return workSpecPlan(input as never, context);
    case "work.parallelism.plan":
      return workParallelismPlan(input as never, context);
    case "work.spec.mockup":
      return workSpecMockup(input as never, context);
    case "work.review":
      return workReview(input as never, context);
    case "work.approve":
      return workApprove(input as never, context);
    case "work.authorize":
      return workAuthorize(input as never, context);
    case "work.spec.record":
      return workSpecRecord(input as never, context);
    case "work.spec.advance":
      return workSpecAdvance(input as never, context);
    case "work.complete":
      return workComplete(input as never, context);
    case "init":
      return initAction(input, context) as unknown as Promise<ActionResult>;
    case "config.get":
      return configGet(input, context) as Promise<ActionResult>;
    case "config.update":
      return configUpdate(input as { patch: never }, context) as Promise<ActionResult>;
    case "config.check":
      return configCheck(input as Record<string, never>, context);
    case "mcp.quickstart":
      return mcpQuickstart(input, context);
    case "mcp.status":
      return mcpStatus(input, context);
    case "architecture.quickstart":
      return architectureQuickstart(input as never, context);
    case "architecture.get":
      return architectureGet(input as never, context);
    case "architecture.draft":
      return architectureDraft(input as never, context);
    case "architecture.template.provider_imports":
      return architectureTemplateProviderImports(input as never, context);
    case "architecture.plan":
      return architecturePlan(input as never, context);
    case "architecture.approve":
      return architectureApprove(input as never, context);
    case "architecture.revise":
      return architectureRevise(input as never, context);
    case "architecture.authorize":
      return architectureAuthorize(input as never, context);
    case "architecture.record":
      return architectureRecord(input as never, context);
    case "architecture.validate":
      return architectureValidate(input as never, context);
    case "architecture.activate":
      return architectureActivate(input as never, context);
    case "architecture.retire":
      return architectureRetire(input as never, context);
    case "serve.viewer":
      return failureResult("serve.viewer", "serve.viewer is a CLI-only local runtime action; use @spec-guard/viewer serveViewer or the CLI.", [diagnostic("VIEWER_CLI_ONLY", "The shared core registry exposes serve.viewer metadata, but the HTTP server is started by the viewer/CLI runtime layer.", "error", "/serve.viewer")]);
    case "decision.create":
      return decisionCreate(input as never, context);
    case "decision.supersede":
      return decisionSupersede(input as never, context);
    case "decision.list":
      return decisionList(input as never, context);
    case "decision.get":
      return decisionGet(input as never, context);
    case "review_snapshot.persist":
      return reviewSnapshotPersist(input as never, context);
    case "baseline.init":
      return baselineInit(input as never, context) as Promise<ActionResult>;
    case "baseline.update":
      return baselineUpdate(input as never, context) as Promise<ActionResult>;
    case "baseline.review":
      return baselineReview(input as never, context);
    case "baseline.accept":
      return baselineAccept(input as never, context);
    case "baseline.establish":
      return baselineEstablish(input as never, context) as Promise<ActionResult>;
    case "baseline.dev_runtime.run":
      return baselineDevRuntimeRun(input as never, context) as Promise<ActionResult>;
    case "baseline.block":
      return baselineBlock(input as never, context) as Promise<ActionResult>;
    case "baseline.check":
      return baselineCheck(input as never, context);
    case "baseline.list":
      return baselineList(input as never, context) as Promise<ActionResult>;
    case "command.run":
      return commandRun(input as never, context);
    case "source_artifact.register":
      return sourceArtifactRegister(input as never, context) as Promise<ActionResult>;
    case "source_artifact.update":
      return sourceArtifactUpdate(input as never, context) as Promise<ActionResult>;
    case "source_artifact.get":
      return sourceArtifactGet(input as never, context) as Promise<ActionResult>;
    case "source_artifact.list":
      return sourceArtifactList(input as never, context) as Promise<ActionResult>;
    case "validate.parity":
      return validateParity(input as never, context) as Promise<ActionResult>;
    default:
      return failureResult(actionId, `Unknown action: ${actionId}`, [diagnostic("UNKNOWN_ACTION", `No shared core action is registered for ${actionId}.`)]);
  }
}

/**
 * Agent-facing projection: never expose a full aggregate `work_packet` at the MCP/Pi boundary. Replace it with a
 * compact summary plus the fresh approval token/hash so agents chain gates and inspect slices without carrying the
 * heavy aggregate document or its change_baseline manifests.
 */
export function leanAgentResult(result: ActionResult): ActionResult {
  const data = result.data as Record<string, unknown> | undefined;
  const workPacket = data?.work_packet as AggregateWorkPacket | undefined;
  if (data === undefined || workPacket === undefined || workPacket === null) return result;
  const { work_packet: _dropped, ...rest } = data;
  const work_packet_summary = summarizeWorkPacket(workPacket);
  const approval_hash = aggregateApprovalProjection(workPacket).hash;
  return { ...result, data: { ...rest, work_packet_summary, approval_hash, approval_token: workApprovalToken(workPacket.id, approval_hash) } };
}

/** executeAction for the agent-facing boundaries (MCP server, Pi extension): the lean-projected result. */
export async function executeActionForAgent(actionId: string, input: Record<string, unknown> = {}, context: ActionExecutionContext = {}): Promise<ActionResult> {
  const agentInput = actionId === "work.get"
    ? { ...input, view: typeof input.view === "string" && input.view !== "full" ? input.view : "summary" }
    : input;
  const result = leanAgentResult(await executeAction(actionId, agentInput, context));
  if (result.next_actions.length === 0 && actionId.startsWith("work.") && typeof agentInput.id === "string" && actionId !== "work.next") {
    return { ...result, next_actions: [{ action_id: "work.next", cli: null, mcp: "spec_guard_work_next", reason: "Ask Spec Guard for the exact next valid workflow action.", suggested_input: { id: agentInput.id } }] };
  }
  return result;
}
