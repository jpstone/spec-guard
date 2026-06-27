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
import { workCreate, workDecompose, workApprove, workAuthorize, workSpecAdvance, workSpecRecord, workSpecMockup, workSpecAcs, workReview, workComplete, workChoice, workChoices, workGet, workList, workSpecPlan, workIntent, workTargetAttach } from "./work.ts";
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
    case "work.get":
      return workGet(input as never, context);
    case "work.list":
      return workList(input as never, context);
    case "work.decompose":
      return workDecompose(input as never, context);
    case "work.choice":
      return workChoice(input as never, context);
    case "work.choices":
      return workChoices(input as never, context);
    case "work.spec.acs":
      return workSpecAcs(input as never, context);
    case "work.spec.plan":
      return workSpecPlan(input as never, context);
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

// Read calls return the full document on purpose (work.get is the explicit "give me the packet" call); work.list
// returns a different shape (work_packets) and is left alone. Everything else is a MUTATION whose full work_packet
// echo — and the change_baseline manifests inside it — just bloats the agent's context.
const AGENT_FULL_PACKET_ACTIONS = new Set(["work.get"]);

/**
 * Agent-facing projection (#1): on a MUTATION response, replace the full `work_packet` echo with a compact summary
 * plus the FRESH approval_hash — so the agent chains gates (approve -> authorize -> complete) without an interstitial
 * work.get, and the heavy change_baseline manifests don't ride along. The CORE ActionResult is untouched; this is
 * applied ONLY at the agent boundary (MCP server + Pi extension), so tests and internal consumers see the full result.
 */
export function leanAgentResult(result: ActionResult): ActionResult {
  if (AGENT_FULL_PACKET_ACTIONS.has(result.action_id)) return result;
  const data = result.data as Record<string, unknown> | undefined;
  const workPacket = data?.work_packet as AggregateWorkPacket | undefined;
  if (data === undefined || workPacket === undefined || workPacket === null) return result;
  const { work_packet: _dropped, ...rest } = data;
  const work_packet_summary = {
    id: workPacket.id,
    revision: workPacket.revision,
    specs: workPacket.specs.map((spec) => ({ id: spec.id, workflow_state: spec.workflow_state })),
    lifecycle: { approved: workPacket.lifecycle.approval !== null, authorized: workPacket.lifecycle.authorization !== null, completed: workPacket.lifecycle.completion !== null }
  };
  return { ...result, data: { ...rest, work_packet_summary, approval_hash: aggregateApprovalProjection(workPacket).hash } };
}

/** executeAction for the agent-facing boundaries (MCP server, Pi extension): the lean-projected result. */
export async function executeActionForAgent(actionId: string, input: Record<string, unknown> = {}, context: ActionExecutionContext = {}): Promise<ActionResult> {
  return leanAgentResult(await executeAction(actionId, input, context));
}
