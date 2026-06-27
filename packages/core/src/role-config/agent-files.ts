import { resolveRoleModel, type SpecGuardRoleConfig, type RoleConfigEntry, type RoleName, type SubagentAdapterKind } from "./config.ts";

/**
 * Generate the host-native NAMED SUBAGENT files from Spec Guard's role config — one per spawned role, for both
 * supported hosts:
 *   - Claude Code: `.claude/agents/spec-guard-<role>.md` (Markdown + YAML frontmatter; `model`, `effort`,
 *     `disallowedTools` for read-only roles).
 *   - Codex:       `.codex/agents/spec-guard-<role>.toml` (`model`, `model_reasoning_effort`, `sandbox_mode`,
 *     `developer_instructions`).
 *
 * Pinning model + effort + read-only in the agent DEFINITION is what makes "the reviewer runs on high judgment,
 * read-only" a property the host honors at spawn — not something the coordinator must remember per spawn, and not
 * something Spec Guard can only flag after the fact. These files are the source of truth (see the read-back loader).
 *
 * The INLINE coordinator (the main session, not a subagent) and the DETERMINISTIC validator (runs commands, no
 * LLM) get no agent file.
 */
export interface GeneratedAgentFile {
  path: string;
  content: string;
}

// Reasoning effort tracks the model tier: premium judgment work also gets premium reasoning effort.
const EFFORT_BY_TIER: Record<string, string> = { high_judgment: "high", standard: "medium", low_cost: "low" };

interface RolePresentation {
  description: string;
  prompt: string;
}

// Concise, role-scoped system prompts (the markdown body / developer_instructions). They state the role's job
// and its hard constraints; the full governed workflow + the live Spec come in through the spec-guard MCP tools.
const ROLE_PRESENTATION: Partial<Record<RoleName, RolePresentation>> = {
  implementation_planner: {
    description: "Spec Guard implementation planner: draft a concrete implementation plan for an approved-pending Spec.",
    prompt: "You are the Spec Guard implementation planner. Draft a concrete implementation plan for the Spec you are given: a summary, the approach, the expected files (implementation, tests, AND docs when the Spec requires them), and the tests that cover its acceptance criteria. Plan only within the Spec's scope. You do not write product code."
  },
  implementer: {
    description: "Spec Guard implementer: implement one approved + authorized Spec within its allowed file scope.",
    prompt: "You are the Spec Guard implementer. Implement ONLY the approved, authorized Spec you are given — its acceptance criteria, following its implementation plan — and write production-quality code plus the tests the plan calls for. Stay strictly inside the Spec's allowed file globs; do NOT expand scope or touch other files. Report exactly which files you changed and a short summary of the work."
  },
  fixer: {
    description: "Spec Guard fixer: resolve specific reviewer blockers within the allowed files, no scope expansion.",
    prompt: "You are the Spec Guard fixer. Address ONLY the specific reviewer blockers in the focused fix instruction you are given, editing ONLY the files it allows. Do not expand scope, refactor unrelated code, or change behavior the blockers did not call out. Report which files you changed."
  },
  reviewer: {
    description: "Spec Guard independent reviewer: review an implementation against its approved Spec. Read-only.",
    prompt: "You are the Spec Guard independent reviewer. Review the implementation against the approved Spec's acceptance criteria, classification, scope, and implementation plan — and judge whether the work is correct, complete, and within scope. You are READ-ONLY: never edit code. Return a verdict (pass or blocked) with specific, actionable, file-scoped blockers; raise non-blocking issues separately."
  },
  rereviewer: {
    description: "Spec Guard re-reviewer: re-review a fix against the original blockers. Read-only.",
    prompt: "You are the Spec Guard re-reviewer. Re-review the fix against the SPECIFIC blockers from the prior review — confirm each is resolved and that nothing outside the fix instruction changed. You are READ-ONLY: never edit code. Return a verdict with any remaining blockers."
  },
  evidence_recorder: {
    description: "Spec Guard evidence recorder: format + link evidence references. No product-code edits.",
    prompt: "You are the Spec Guard evidence recorder. Format the validation/evidence outputs and link the evidence references for the Spec. You do not edit product code or make pass/fail judgments."
  },
  clarification_handler: {
    description: "Spec Guard clarification handler: triage a clarification and route it to the human. No code edits.",
    prompt: "You are the Spec Guard clarification handler. Triage the clarification request, frame the options crisply, and route the decision to the human. You do not edit product code or decide the clarification yourself."
  }
};

function isDeterministic(provider: SubagentAdapterKind): boolean {
  return provider === "deterministic" || provider === "local";
}

/** A role's concrete model for a SPECIFIC host provider: resolve the tier alias against that provider (so the
 *  Claude file gets the claude model and the Codex file gets the pi/codex model from the same `high_judgment` tier),
 *  or pass a concrete model id through. null = the provider's default (no explicit pin). */
function modelForProvider(config: SpecGuardRoleConfig, entry: RoleConfigEntry, provider: SubagentAdapterKind): string | null {
  if (entry.model === null) return null;
  const alias = config.model_aliases[entry.model];
  return alias !== undefined ? alias[provider] ?? null : entry.model;
}

function claudeAgentMarkdown(role: RoleName, entry: RoleConfigEntry, model: string | null, effort: string, presentation: RolePresentation): string {
  const front = ["---", `name: spec-guard-${role}`, `description: ${presentation.description}`];
  if (model !== null) front.push(`model: ${model}`);
  front.push(`effort: ${effort}`);
  if (!entry.may_edit_code) front.push("disallowedTools: Write, Edit"); // read-only roles cannot edit product code
  front.push("---", "", presentation.prompt, "");
  return front.join("\n");
}

function codexAgentToml(role: RoleName, entry: RoleConfigEntry, model: string | null, effort: string, presentation: RolePresentation): string {
  const lines = [`name = "spec-guard-${role}"`, `description = ${JSON.stringify(presentation.description)}`];
  if (model !== null) lines.push(`model = ${JSON.stringify(model)}`);
  lines.push(`model_reasoning_effort = ${JSON.stringify(effort)}`);
  if (!entry.may_edit_code) lines.push('sandbox_mode = "read-only"');
  // Codex idiom: a triple-quoted multi-line TOML string (our prompts contain no `"""`).
  lines.push('developer_instructions = """', presentation.prompt, '"""', "");
  return lines.join("\n");
}

/** Generate every named-subagent file (both hosts) from the role config. Roles without a presentation, the inline
 *  coordinator, and the deterministic validator are skipped. */
export function generateAgentFiles(config: SpecGuardRoleConfig): GeneratedAgentFile[] {
  const files: GeneratedAgentFile[] = [];
  for (const role of Object.keys(config.roles) as RoleName[]) {
    const entry = config.roles[role];
    if (entry.execution !== "subagent" || isDeterministic(entry.provider)) continue;
    const presentation = ROLE_PRESENTATION[role];
    if (presentation === undefined) continue;
    const effort = (entry.model !== null ? EFFORT_BY_TIER[entry.model] : undefined) ?? "medium";
    const claudeModel = modelForProvider(config, entry, "claude_code");
    const codexModel = modelForProvider(config, entry, "pi");
    files.push({ path: `.claude/agents/spec-guard-${role}.md`, content: claudeAgentMarkdown(role, entry, claudeModel, effort, presentation) });
    files.push({ path: `.codex/agents/spec-guard-${role}.toml`, content: codexAgentToml(role, entry, codexModel, effort, presentation) });
  }
  return files;
}
