import type { ActionRegistryMetadata } from "../actions/registry.ts";

const HUMAN_CONFIRMATION_GUIDANCE =
  "Human-gated action: requires actual human confirmation fields selected_number, raw_response, decision_prompt, and human_confirmed from a real human response; do not fabricate or infer them. Discuss/non-final options are non-mutating where specified.";

const REVIEW_BOUND_GUIDANCE =
  "Review-bound action: for work.approve/work.authorize/work.complete prefer approval_token from work.next/work.approval.ready/work.get; legacy review_snapshot_hash remains accepted. For other review-bound actions, pass back the review snapshot hash and review snapshot revision (review_snapshot_hash / review_snapshot_revision, plus batch snapshot hash/revision when applicable) EXACTLY as the matching review action returned them — the ephemeral snapshot is meant to be passed straight back, not persisted. source_artifact_refs are OPTIONAL for work.approve/work.authorize (they recompute the refs internally; the revision already pins them); where an action still requires source_artifact_refs/source refs, pass them exactly as shown.";

const FIRST_CALL_GUIDANCE =
  "Recommended first calls are spec_guard_mcp_status, spec_guard_mcp_quickstart, and spec_guard_config_check. After a packet exists, call spec_guard_work_next and follow its exact next_actions instead of memorizing workflow policy. Do not request, retain, or send back a full Work Packet through MCP/Pi; use spec_guard_work_get slice views (summary, intent, spec, review, coherence), and for whole-WP coherence review follow review_slice_inputs: read coherence first, then each spec slice one at a time. Then work.create the packet and choose origination; choose platform/architecture/stack one at a time via spec_guard_work_choice_prepare followed by spec_guard_work_choice, optionally marking one concrete option recommended with rationale. Do not use work.choices; it rejects batches to prevent mega-prompts. For greenfield/new-target architecture call spec_guard_work_architecture_check to bind active Architecture Charter ordinances, or if none exist ask the human to start spec_guard_architecture_quickstart and only use spec_guard_work_architecture_waive when the human declines ordinances. Architecture Charter helpers include spec_guard_architecture_template_provider_imports for provider-SDK-through-adapters rules, spec_guard_architecture_revise for active-rule replacements, and spec_guard_architecture_retire for human-confirmed removal without replacement. Then work.decompose into homogeneous Specs if multi-surface, and PER Spec resolve the mockup (UI, work.spec.mockup), draft + validate ACs (work.spec.acs), set the implementation plan (work.spec.plan); after every Spec is planned, record the packet-level implementation parallelism plan (work.parallelism.plan) with ordered execution groups and reasoning (sequential is valid when justified); then run the INDEPENDENT pre-approval reviews (work.review), including whole-WP coherence over the parallelism plan; then the ONE bulk whole-WP approval (work.approve), whole-WP authorize (work.authorize; greenfield establishes the runtime baseline as bootstrap work after authorization), drive the per-Spec role loop (work.spec.record / work.spec.advance), and the work.complete completion gate. If the human later catches wrong approved Specs/classification, call work.revise, then work.spec.revise/work.spec.acs/work.spec.plan/work.parallelism.plan as needed, then review/approve/authorize again. Edit files only after authorization. Use Spec Guard MCP/Pi tools directly; do not substitute CLI except bootstrap/init guidance. When an action asks for human-confirmed fields, they require actual human responses.";

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
