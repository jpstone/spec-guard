import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildDefaultRoleConfig, SpecGuardRoleConfigSchema, type SpecGuardRoleConfig, type RoleName } from "./config.ts";

// The named-subagent files (.claude/agents/*.md, .codex/agents/*.toml) are the SOURCE OF TRUTH for each spawnable
// role's editable knobs — model + read-only. Spec Guard keeps the structure (which roles exist, the inline
// coordinator, the deterministic validator, identities, the alias table) in code. loadRoleConfig merges the two:
// built-in structural defaults, with each spawnable role's model + may_edit_code OVERRIDDEN by its agent file.
//
// These are minimal readers for the CONSTRAINED shape Spec Guard itself emits (agent-files.ts) — not general
// YAML/TOML parsers, so no new dependency. A field absent from the file falls back to the code default.

function parseClaudeAgent(markdown: string): { model: string | null; mayEdit: boolean } {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1] ?? "";
  const model = /^model:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim() ?? null;
  const disallowed = /^disallowedTools:\s*(.+)$/m.exec(frontmatter)?.[1] ?? "";
  return { model, mayEdit: !/\b(Write|Edit)\b/.test(disallowed) };
}

function parseCodexAgent(toml: string): { model: string | null; mayEdit: boolean } {
  const model = /^model\s*=\s*"(.+?)"/m.exec(toml)?.[1] ?? null;
  return { model, mayEdit: !/^sandbox_mode\s*=\s*"read-only"/m.test(toml) };
}

async function readRoleAgentOverride(projectRoot: string, role: RoleName, provider: string): Promise<{ model: string | null; mayEdit: boolean } | null> {
  try {
    if (provider === "pi") {
      return parseCodexAgent(await readFile(path.join(projectRoot, ".codex", "agents", `spec-guard-${role}.toml`), "utf8"));
    }
    return parseClaudeAgent(await readFile(path.join(projectRoot, ".claude", "agents", `spec-guard-${role}.md`), "utf8"));
  } catch {
    return null; // no file for this role (coordinator/validator have none) — keep the code default
  }
}

/**
 * Load the project's role config: the built-in structural defaults with each spawnable role's model + read-only
 * overridden by its agent file. Returns null when NO agent files are present (project not init'd) so enforcement
 * stays opt-in — callers that enforce identity/model skip enforcement on null.
 */
export async function loadRoleConfig(projectRoot: string): Promise<SpecGuardRoleConfig | null> {
  const defaults = buildDefaultRoleConfig();
  const roles = { ...defaults.roles };
  let foundAny = false;
  for (const role of Object.keys(defaults.roles) as RoleName[]) {
    const entry = defaults.roles[role];
    const override = await readRoleAgentOverride(projectRoot, role, entry.provider);
    if (override === null) continue; // no file for this role -> keep the code default
    foundAny = true; // a file exists (the project is init'd)
    // Only apply when the file clearly specifies a model — a malformed/empty file keeps the code default rather
    // than e.g. silently flipping a read-only reviewer to editable.
    if (override.model !== null) roles[role] = { ...entry, model: override.model, may_edit_code: override.mayEdit };
  }
  if (!foundAny) return null;
  const merged = SpecGuardRoleConfigSchema.safeParse({ ...defaults, roles });
  return merged.success ? merged.data : defaults;
}
