import { z } from "zod";
import type { ActionResult } from "./result.ts";
import type { ActionExecutionContext } from "./context.ts";
import { configCheck } from "./config.ts";

export const McpQuickstartInputSchema = z.object({ compact: z.boolean().optional() }).strict();
export const McpStatusInputSchema = z.object({ include_full: z.boolean().optional() }).strict();

export async function mcpQuickstart(input: z.infer<typeof McpQuickstartInputSchema> = {}, context: ActionExecutionContext = {}): Promise<ActionResult> {
  McpQuickstartInputSchema.parse(input);
  const check = await configCheck({}, context);
  return {
    ok: check.ok,
    action_id: "mcp.quickstart",
    data: {
      first_steps: [
        "First call spec_guard_mcp_status, spec_guard_mcp_quickstart, or spec_guard_config_check to inspect persisted state before mutating actions.",
        "Use Spec Guard MCP/Pi tools directly; do not substitute CLI workflow commands except bootstrap/init guidance.",
        "Human-confirmed fields require actual human responses: selected_number, raw_response, decision_prompt, and human_confirmed; do not fabricate confirmations.",
        "Discuss is non-mutating. Binary gates remain Yes/No/Discuss after discussion, fixed binary decisions record option 1 or 2 only, and non-binary custom choices require numbered confirmation. NEVER box the human into your generated buttons: every work.choice/work.choices records options_presented and MUST present, as visible numbered options (not the dialog's easy-to-miss 'Other'), BOTH a 'Type your own answer' option AND a 'Discuss' option — e.g. 1. foo, 2. bar, 3. Type your own answer, 4. Discuss. The gate rejects a choice that omits either (WORK_CHOICE_OPTIONS_INCOMPLETE).",
        "Packet approval (work.approve) and implementation authorization (work.authorize) are SEPARATE human decisions — at the approval gate offer: (1) Approve the work packet only, (2) Approve and authorize implementation, (3) Request changes, (4) Discuss. Don't bundle approval+authorization into one 'approve and I'll build' prompt. On (3) Request changes (work.approve decision: 'request_changes'), ALSO ask whether the human wants a re-review of the changes and pass re_review_required (true = re-review before re-approval; false = waive the next approval's stale-review check).",
        "Order: inspect status/config; work.create the packet + choose origination; flesh out the whole-WP intent with work.intent (desired outcomes, in/out of scope, users, edge cases, open questions — create seeds only the goal); (new_entirely) choose high-level platform then architecture then separately the framework/tooling stack BEFORE drafting ACs (record all three the human picked in ONE work.choices call, not three work.choice calls); if the work spans multiple surfaces, work.decompose it into >=2 homogeneous Specs; PER Spec: (UI) the FIRST feature question is whether the HUMAN has a mockup — ASK them; work.spec.mockup is HUMAN-gated (human_confirmed + raw_response, rejects WORK_SPEC_MOCKUP_UNCONFIRMED), you cannot answer it for them — 'present' = the human provides their EXISTING mockup, which you obtain + register, NEVER create one yourself; 'none' = the human confirms you draft from the goal, then draft + validate ACs (work.spec.acs — greenfield Specs need a bootstrap AC), set the implementation plan AND its dependency edges (work.spec.plan REQUIRES `dependencies`, or an explicit empty list); a contract-producing Spec (rest_api/reusable_api/reusable_ui) MUST FREEZE a typed `contract_surface` — a hard JSON-Schema Spec Guard owns + hashes into the committed registry + binds into approval (NOT a path, NOT prose); THEN once EVERY Spec is drafted + planned, the INDEPENDENT pre-approval reviews (work.review): per-Spec (pass spec_id — spawn a reviewer per Spec IN PARALLEL) and/or one whole-WP review (no spec_id), so every Spec is covered; a multi-Spec packet ALSO needs a whole-WP COHERENCE review over ALL Specs (no spec_id, independent of every author, catches cross-Spec issues); reviewers are never a Spec author and must PASS; the ONE bulk whole-WP approval (work.approve — every Spec's ACs + scope + structural decisions together); authorize implementation (work.authorize — write NO product code before this); PER Spec drive the role loop (work.spec.record / work.spec.advance); (new_entirely) establish + prove the runtime baseline as bootstrap work after authorization; then the human completion gate (work.complete).",
        "Architecture and stack are distinct work.choice decisions: architecture is structural (topology/decomposition/repo layout), stack is framework/tooling. Generate context-appropriate options for each; do not assume a fixed list. For a NEW application UI (one_off_application_ui) the stack choice must record option_details.component_library (REJECTED without it).",
        "Tag each AC with its work classification (its surface). A Spec is classification-HOMOGENEOUS — ACs of different classifications belong in SEPARATE Specs (work.decompose), so an API/contract surface and a UI become separate correctly-classified Specs, each with its own docs policy. Never fold an API surface into a UI Spec.",
        "Compute-don't-demand: do not compute, guess, or hand-author values the tool derives (content_hash, evidence_hash, choice option_details) — pass a placeholder or omit them and the tool fills the canonical value, ignoring a wrong one; never re-bind/retry over a hash/shape mismatch. The only hash you supply is the review_snapshot_hash you echo at a whole-WP gate.",
        "The breakdown IS the embedded Specs — no separate Plan artifact, no child packets, no per-child or batch approval. The whole Work Packet is approved/authorized/completed as ONE unit across all its Specs.",
        "Backend roles execute under harness-enforced permissions: coordinator/reviewer/validator cannot edit product code and self-review is blocked by default; the validator decides pass/fail deterministically and the focused reviewer handles semantic judgment. The edit gate (a Claude PreToolUse hook in .claude/settings.json) WALLS this: product code under a Spec's scope may be edited ONLY by a delegated spec-guard-implementer/fixer subagent — a coordinator/main-session edit is DENIED (exit 2). On Codex (whose PreToolUse carries no agent identity) SubagentStart/Stop maintain an edit lease the hook reads, so the same wall holds. Spawn the implementer subagent to make Spec-scoped edits; don't write product code inline.",
        "Delegation + identity are ENFORCED: work.spec.record rejects an implementation_attempt by a non-edit/inline role and a review_cycle whose reviewer identity matches the implementer (work.spec.advance cannot skip these gates). The Work Packet is committed as ONE canonical-JSON document at .spec-guard/packets/<id>.json (the rest of .spec-guard/ is gitignored), so the approved spec + a proof-of-approval stamp travel with the code in git."
      ],
      governance_rules: {
        direct_tools_only: true,
        cli_exception: "bootstrap/init only unless a local runtime command is explicitly documented",
        discuss_non_mutating: true,
        binary_gate_options: ["Yes", "No", "Discuss"],
        fixed_binary_decision_numbers: [1, 2],
        required_human_fields: ["selected_number", "raw_response", "decision_prompt", "human_confirmed"],
        review_bound_refs: ["review_snapshot_hash", "review_snapshot_revision", "source_artifact_refs"],
        workflow_order: ["inspect status/config", "work.create + choose origination", "work.intent: flesh out the whole-WP intent (desired outcomes, in/out of scope, users, edge cases, open questions)", "work.choice: high-level platform / architecture / stack (new_entirely)", "work.decompose into homogeneous Specs (if multi-surface)", "per Spec: resolve mockup (work.spec.mockup, UI)", "per Spec: draft + validate ACs (work.spec.acs; greenfield needs a bootstrap AC)", "per Spec: set implementation plan + dependency edges (work.spec.plan)", "ONE whole-WP independent review (work.review) over ALL Specs — after every Spec is drafted + planned; checks the dependency DAG is acyclic + returns the implementation order; a single separate reviewer must PASS (catches cross-Spec issues)", "bulk whole-WP approval (work.approve) — the ONE human approval over every Spec", "whole-WP authorize (work.authorize)", "per Spec: drive role loop (work.spec.record / work.spec.advance)", "(modify_existing) inherit the target's proven baseline via work.target.attach before approval", "(new_entirely / new_in_existing) establish + prove the target's runtime baseline as bootstrap work after authorization", "whole-WP completion gate (work.complete)"],
        runtime_baseline_before_packet_approval: "Runtime baselines are TARGET-SCOPED (per app), keyed by target_id; pass target_id at work.create so gates scope to that app (omit it in a single-app repo for the default target; baseline.list discovers targets). modify_existing INHERITS the target's already-proven baseline via work.target.attach before approval; new_entirely / new_in_existing ESTABLISH + prove the target's baseline as bootstrap work after authorization, enforced at the work.complete completion gate (and for a new APP target on a real-dev-runtime platform, the app Spec's plan must declare a dev_runtime_proof — command + readiness_assertion — reviewed at the bulk approval: DEV_RUNTIME_PROOF_PLAN_REQUIRED); runtime-less work (target_id null — docs/cross-cutting/tests, NO runnable code) needs none but requires a human-approved runtime_not_relevant_reason unless purely operational_document, and is rejected if its diff ships executable source",
        self_review_blocked_by_default: "Self-review is blocked by default; coordinator/reviewer/validator cannot edit product code.",
        loop_identity_enforced: "work.spec.record rejects inline/non-edit implementation and self-review (reviewer == implementer); work.spec.advance cannot skip the record-gated gates.",
        committable_spec: "The Work Packet is ONE canonical-JSON document at .spec-guard/packets/<id>.json (committable); the rest of .spec-guard/ is gitignored. Gate decisions are also appended to the decision log."
      },
      recommended_tool_calls: ["spec_guard_mcp_status", "spec_guard_config_check", "spec_guard_config_get", "spec_guard_work_create", "spec_guard_validate_parity"],
      status: check.data
    },
    diagnostics: check.diagnostics,
    mutations: [{ artifact: "config", operation: "none", paths: [], summary: "Returned quickstart guidance backed by config.check." }],
    next_actions: [
      { action_id: "mcp.status", cli: "spec-guard mcp status --json", mcp: "spec_guard_mcp_status", reason: "Inspect current Spec Guard status.", suggested_input: null },
      { action_id: "config.get", cli: "spec-guard config get --json", mcp: "spec_guard_config_get", reason: "Read the active config artifact.", suggested_input: null }
    ],
    summary: "Spec Guard quickstart guidance ready."
  };
}

export async function mcpStatus(input: z.infer<typeof McpStatusInputSchema> = {}, context: ActionExecutionContext = {}): Promise<ActionResult> {
  McpStatusInputSchema.parse(input);
  const check = await configCheck({}, context);
  const governanceSummary = (check.data as { governance_summary?: Record<string, unknown> }).governance_summary ?? {};
  return {
    ok: check.ok,
    action_id: "mcp.status",
    data: {
      config: {
        artifact_root: (check.data as { artifact_root?: unknown }).artifact_root,
        exists: (check.data as { config_exists?: unknown }).config_exists,
        valid: (check.data as { config_valid?: unknown }).config_valid,
        revision: (check.data as { config_revision?: unknown }).config_revision
      },
      runtime_baseline: { status: governanceSummary.baseline_status ?? null },
      pending_gates: { count: governanceSummary.pending_gates_count ?? 0 },
      blocked_packets: { count: governanceSummary.blocked_packet_count ?? 0 },
      stale_approvals: { count: null, source: "No stale approval projection is persisted before viewer/migration milestones." },
      validation_failures: { count: governanceSummary.validation_failures_count ?? 0 },
      governance_summary: governanceSummary,
      recommended_next_actions: check.next_actions
    },
    diagnostics: check.diagnostics,
    mutations: [{ artifact: "config", operation: "none", paths: [], summary: "Returned MCP status backed by persisted config.check/dashboard summary." }],
    next_actions: check.next_actions,
    summary: check.ok ? "Spec Guard status loaded from persisted artifacts." : "Spec Guard status has issues."
  };
}
