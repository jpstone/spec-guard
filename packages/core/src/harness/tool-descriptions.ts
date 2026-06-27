import type { ActionRegistryMetadata } from "../actions/registry.ts";

const HUMAN_CONFIRMATION_GUIDANCE =
  "Human-gated action: requires actual human confirmation fields selected_number, raw_response, decision_prompt, and human_confirmed from a real human response; do not fabricate or infer them. Discuss/non-final options are non-mutating where specified.";

const REVIEW_BOUND_GUIDANCE =
  "Review-bound action: pass back the review snapshot hash and review snapshot revision (review_snapshot_hash / review_snapshot_revision, plus batch snapshot hash/revision when applicable) EXACTLY as the matching review action returned them — the ephemeral snapshot is meant to be passed straight back, not persisted. source_artifact_refs are OPTIONAL for work.approve/work.authorize (they recompute the refs internally; the revision already pins them); where an action still requires source_artifact_refs/source refs, pass them exactly as shown.";

const FIRST_CALL_GUIDANCE =
  "Recommended first calls are spec_guard_mcp_status, spec_guard_mcp_quickstart, and spec_guard_config_check. Then work.create the packet and choose origination, choose platform/architecture/stack via work.choice (new_entirely), work.decompose into homogeneous Specs if multi-surface, and PER Spec resolve the mockup (UI, work.spec.mockup), draft + validate ACs (work.spec.acs), set the implementation plan (work.spec.plan); then the INDEPENDENT pre-approval reviews (work.review): per-Spec (spec_id, runnable in parallel) and/or a whole-WP review (no spec_id), plus a whole-WP coherence review over all Specs for a multi-Spec packet; then the ONE bulk whole-WP approval (work.approve), whole-WP authorize (work.authorize; greenfield establishes the runtime baseline as bootstrap work after authorization), drive the per-Spec role loop (work.spec.record / work.spec.advance), and the work.complete completion gate. Edit files only after authorization. Use Spec Guard MCP/Pi tools directly; do not substitute CLI except bootstrap/init guidance. When an action asks for human-confirmed fields, they require actual human responses.";

export function specGuardToolName(actionId: string): string {
  return `spec_guard_${actionId.replaceAll(".", "_")}`;
}

export function buildToolDescription(metadata: ActionRegistryMetadata): string {
  const parts = [metadata.description.trim(), FIRST_CALL_GUIDANCE];
  if (metadata.human_gated) parts.push(HUMAN_CONFIRMATION_GUIDANCE);
  if (metadata.review_bound) parts.push(REVIEW_BOUND_GUIDANCE);
  if (metadata.id === "mcp.quickstart") {
    parts.push("Obvious first-call tool that explains governance rules, numbered human gates, Plan/batch constraints, backend verification, and direct MCP/Pi usage.");
  }
  if (metadata.id === "mcp.status") {
    parts.push("Obvious first-call status tool backed by persisted artifacts: config, runtime baseline, verifier health, pending gates, blocked packets, stale approvals where detectable, validation failures, and next actions.");
  }
  return parts.join(" ");
}

export function humanConfirmationDescriptionTerms(): string[] {
  return ["selected_number", "raw_response", "decision_prompt", "human_confirmed"];
}

export function reviewBoundDescriptionTerms(): string[] {
  return ["snapshot hash", "snapshot revision", "source_artifact_refs"];
}
