import { matchesAnyGlob } from "../paths/glob.ts";
import type { AggregateWorkPacket } from "../schemas/work-packet.ts";
import type { SpecGuardRoleConfig } from "./config.ts";

/**
 * The pre-edit policy: the DECISION half of the host PreToolUse edit gate, kept pure (no fs / host coupling) so it
 * is fully testable; the CLI hook adapter does path extraction + emits the host decision.
 *
 * The hole this closes: "the coordinator/main session edited product code" was prose, so it got bent. Here it
 * becomes a wall — product code under a Spec's allowed_globs may be edited ONLY by an edit-capable Spec Guard
 * subagent (implementer/fixer). Claude's PreToolUse payload carries `agent_type` for subagent calls and OMITS it
 * for the main session, so a coordinator edit (no agent_type) is denied. Edits OUTSIDE any Spec's scope (scaffold,
 * config, governance files) are allowed — the gate governs product code, not everything.
 *
 * Honor-system limit (same as the model-tier + reviewer-independence flags): agent_type is what the host reports.
 * The host hook is the strongest wall available, but it cannot prove the subagent is genuinely separate.
 */
export interface PreEditHookInput {
  tool_name: string;
  /** Subagent name (Claude `agent_type`, e.g. "spec-guard-implementer"); absent/null = the main session. */
  agent_type?: string | null;
  /** Normalized, project-relative paths the edit would touch (the CLI extracts these from tool_input). */
  edited_paths: string[];
}

export interface PreEditDecision {
  decision: "allow" | "deny";
  reason: string;
  governed_paths: string[];
}

const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit", "apply_patch"]);

/** The subagent names that MAY edit product code: `spec-guard-<role>` for every may_edit_code role. */
export function editCapableAgentNames(roleConfig: SpecGuardRoleConfig | null): Set<string> {
  if (roleConfig === null) return new Set(["spec-guard-implementer", "spec-guard-fixer"]);
  return new Set(Object.entries(roleConfig.roles).filter(([, entry]) => entry.may_edit_code).map(([role]) => `spec-guard-${role}`));
}

export function evaluatePreEditHook(input: PreEditHookInput, packets: readonly AggregateWorkPacket[], roleConfig: SpecGuardRoleConfig | null): PreEditDecision {
  if (!EDIT_TOOLS.has(input.tool_name)) return { decision: "allow", reason: `${input.tool_name} is not an edit tool`, governed_paths: [] };
  const allowedGlobs = packets.flatMap((packet) => packet.specs.flatMap((spec) => spec.scope.allowed_globs));
  const governed = input.edited_paths.filter((path) => matchesAnyGlob(path, allowedGlobs));
  if (governed.length === 0) return { decision: "allow", reason: "no edited path falls under a Spec's allowed scope (scaffold/config/governance edits are not gated)", governed_paths: [] };

  const actor = input.agent_type ?? null;
  if (actor === null) {
    return { decision: "deny", reason: `Product code under a Spec's scope (${governed.join(", ")}) may be edited ONLY by a delegated implementer/fixer subagent — not the coordinator/main session. Spawn the spec-guard-implementer agent for this Spec and let it make the edit.`, governed_paths: governed };
  }
  if (editCapableAgentNames(roleConfig).has(actor)) {
    return { decision: "allow", reason: `${actor} is an edit-capable Spec Guard role`, governed_paths: governed };
  }
  return { decision: "deny", reason: `'${actor}' is not an edit-capable Spec Guard role; product code under a Spec's scope must be edited by spec-guard-implementer or spec-guard-fixer.`, governed_paths: governed };
}
