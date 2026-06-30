import { mkdir, access, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ActionResult } from "./result.ts";
import type { Config } from "../schemas/artifacts.ts";
import { ConfigSchema } from "../schemas/artifacts.ts";
import type { ActionExecutionContext } from "./context.ts";
import { resolveProjectRoot } from "./context.ts";
import { createDefaultConfig, diagnostic, failureResult, storeForContext } from "./config.ts";

export const InitInputSchema = z.object({
  project_id: z.string().min(1).optional(),
  artifact_root: z.string().min(1).optional(),
  json: z.boolean().optional()
}).strict();
export type InitInput = z.infer<typeof InitInputSchema>;

export interface InitData {
  artifact_root: string;
  project_id: string;
  config: Config;
  config_created: boolean;
  config_revision: number;
  generated_files: Array<{ path: string; status: "created" | "unchanged" | "preserved" }>;
  next_steps: string[];
  recommended_tool_calls: string[];
}

// Ensure the project's .gitignore ignores the Spec Guard artifact root, EXCEPT the committable spec/
// projections. The governed store is a local working store (command logs, every artifact revision, blobs) and
// must not be committed — but `<root>/spec/` holds the clean, diffable approved spec projections (Part D),
// which ARE worth committing. Pattern is `<root>/*` + `!<root>/spec/` (a bare `<root>/` dir-ignore can't
// re-include a subdir). Idempotent + non-clobbering.
async function ensureArtifactRootGitignored(projectRoot: string, artifactRoot: string): Promise<"created" | "preserved"> {
  if (path.isAbsolute(artifactRoot)) return "preserved"; // can't express an out-of-project path as a gitignore entry
  const root = artifactRoot.replace(/\\/g, "/").replace(/\/+$/, ""); // ".spec-guard"
  const ignoreLine = `${root}/*`;            // ".spec-guard/*"
  const keepPackets = `!${root}/packets/`;   // the canonical committable Work Packet document(s) — MUST be committed
  const keepContracts = `!${root}/contracts/`; // the authoritative contract registry — MUST be committed (travels)
  const keepSpec = `!${root}/spec/`;         // the committable spec projections
  const gitignorePath = path.join(projectRoot, ".gitignore");
  let existing = "";
  try { existing = await readFile(gitignorePath, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const lines = existing.split(/\r?\n/);
  const trimmedLines = lines.map((line) => line.trim());
  // Detect on the contracts keep (the NEWEST required line): an older .gitignore (pre-contracts, or pre-packets) is
  // missing it, so it gets the corrective rewrite rather than "preserved" — idempotent once all keeps are present.
  if (trimmedLines.includes(keepContracts)) return "preserved";
  // Drop any pre-existing bare `<root>/`|`<root>` dir-ignore (it makes re-include impossible) + any prior governed
  // block lines, then re-emit the canonical block ending with ALL re-includes.
  const filtered = lines.filter((line) => { const t = line.trim(); return t !== `${root}/` && t !== root && t !== ignoreLine && t !== keepSpec && t !== keepPackets && t !== keepContracts; });
  const body = filtered.join("\n");
  const prefix = body.length > 0 && !body.endsWith("\n") ? "\n" : "";
  // Common project hygiene (only if absent) — init's .gitignore was otherwise too sparse to be useful out of the box.
  const common = trimmedLines.includes("node_modules/") ? "" : "# Dependencies, build output, logs\nnode_modules/\ndist/\nbuild/\n*.log\n\n";
  await writeFile(gitignorePath, `${body}${prefix}${common}# Spec Guard governed state — local working store (do not commit), except the committable Work Packet, contract registry + spec projections.\n${ignoreLine}\n${keepPackets}\n${keepContracts}\n${keepSpec}\n`, "utf8");
  return "created";
}

/** Additively merge one hook entry (event + matcher + command) into a host JSON config (Claude settings.json).
 *  Never clobbers an existing config or a pre-existing entry for the same command; only rewrites the file when
 *  adding ours. Deduped per command, so distinct events coexist. */
async function ensureJsonHookEntry(absPath: string, event: string, matcher: string, command: string): Promise<"created" | "preserved"> {
  let config: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(await readFile(absPath, "utf8")) as unknown;
    if (parsed !== null && typeof parsed === "object") config = parsed as Record<string, unknown>;
  } catch { /* missing or unreadable -> start a fresh config */ }
  const hooks = (config.hooks !== null && typeof config.hooks === "object" ? config.hooks : {}) as Record<string, unknown>;
  const entries = Array.isArray(hooks[event]) ? [...(hooks[event] as unknown[])] : [];
  if (entries.some((entry) => JSON.stringify(entry).includes(command))) return "preserved";
  entries.push({ matcher, hooks: [{ type: "command", command }] });
  hooks[event] = entries;
  config.hooks = hooks;
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return "created";
}

interface CodexHookEntry {
  event: string;
  matcher: string;
  command: string;
  statusMessage: string;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function renderCodexInlineHook(entry: CodexHookEntry): string {
  return [
    `[[hooks.${entry.event}]]`,
    `matcher = ${tomlString(entry.matcher)}`,
    "",
    `[[hooks.${entry.event}.hooks]]`,
    'type = "command"',
    `command = ${tomlString(entry.command)}`,
    `statusMessage = ${tomlString(entry.statusMessage)}`,
    ""
  ].join("\n");
}

function appendTomlBlock(existing: string, block: string): string {
  const prefix = existing.length === 0 ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  return `${existing}${prefix}${block.endsWith("\n") ? block : `${block}\n`}`;
}

/** Additively append a Codex inline hook into .codex/config.toml. Codex supports hooks.json too, but inline
 *  project config keeps the hooks beside .codex/agents/*.toml and avoids a parallel Codex-specific hook file. */
async function ensureCodexInlineHookEntry(absPath: string, entry: CodexHookEntry): Promise<"created" | "preserved"> {
  let existing = "";
  try {
    existing = await readFile(absPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (existing.includes(entry.command)) return "preserved";
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, appendTomlBlock(existing, renderCodexInlineHook(entry)), "utf8");
  return "created";
}

function hasCodexSpecGuardMcpServer(existing: string): boolean {
  return existing.split(/\r?\n/).some((line) => /^\[mcp_servers\.(?:"spec-guard"|'spec-guard'|spec-guard)\]\s*$/.test(line.trim()));
}

function renderCodexMcpServerEntry(): string {
  return [
    '[mcp_servers."spec-guard"]',
    'command = "npx"',
    'args = ["spec-guard-mcp"]',
    "startup_timeout_sec = 20",
    "tool_timeout_sec = 120",
    ""
  ].join("\n");
}

function removeStaleGeneratedCodexMcpCwd(existing: string): { text: string; changed: boolean } {
  const lines = existing.split(/\r?\n/);
  let inSpecGuardMcp = false;
  let blockStart = -1;
  let hasGeneratedCommand = false;
  let hasGeneratedArgs = false;
  let staleCwdIndex = -1;
  const staleCwdIndexes = new Set<number>();

  const finishBlock = (): void => {
    if (blockStart !== -1 && hasGeneratedCommand && hasGeneratedArgs && staleCwdIndex !== -1) staleCwdIndexes.add(staleCwdIndex);
    inSpecGuardMcp = false;
    blockStart = -1;
    hasGeneratedCommand = false;
    hasGeneratedArgs = false;
    staleCwdIndex = -1;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? "";
    if (/^\[.+\]\s*$/.test(trimmed)) {
      finishBlock();
      inSpecGuardMcp = /^\[mcp_servers\.(?:"spec-guard"|'spec-guard'|spec-guard)\]\s*$/.test(trimmed);
      if (inSpecGuardMcp) blockStart = index;
      continue;
    }
    if (!inSpecGuardMcp) continue;
    if (/^command\s*=\s*"npx"\s*$/.test(trimmed)) hasGeneratedCommand = true;
    if (/^args\s*=\s*\[\s*"spec-guard-mcp"\s*\]\s*$/.test(trimmed)) hasGeneratedArgs = true;
    if (/^cwd\s*=\s*"\.\."\s*$/.test(trimmed)) staleCwdIndex = index;
  }
  finishBlock();

  if (staleCwdIndexes.size === 0) return { text: existing, changed: false };
  return { text: lines.filter((_, index) => !staleCwdIndexes.has(index)).join("\n"), changed: true };
}

async function ensureCodexMcpServerEntry(absPath: string): Promise<"created" | "preserved"> {
  let existing = "";
  try {
    existing = await readFile(absPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const repaired = removeStaleGeneratedCodexMcpCwd(existing);
  if (repaired.changed) {
    await writeFile(absPath, repaired.text, "utf8");
    existing = repaired.text;
  }
  if (hasCodexSpecGuardMcpServer(existing)) return repaired.changed ? "created" : "preserved";
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, appendTomlBlock(existing, renderCodexMcpServerEntry()), "utf8");
  return "created";
}

async function fileExists(absPath: string): Promise<boolean> {
  try {
    await access(absPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function initAction(input: InitInput = {}, context: ActionExecutionContext = {}): Promise<ActionResult<InitData>> {
  const parsed = InitInputSchema.parse(input);
  const projectRoot = resolveProjectRoot(context);
  const artifactRoot = parsed.artifact_root ?? ".spec-guard/";
  const artifactRootAbs = path.isAbsolute(artifactRoot) ? artifactRoot : path.join(projectRoot, artifactRoot);
  const store = storeForContext({ projectRoot, artifactRoot });

  try {
    await mkdir(artifactRootAbs, { recursive: true });

    let config: Config;
    let configCreated = false;
    let configRevision = 1;
    try {
      const current = await store.readCurrent<Config>("config", null);
      config = ConfigSchema.parse(current.artifact);
      configRevision = current.revision;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const defaultConfigInput = parsed.project_id === undefined ? { projectRoot, artifactRoot } : { projectRoot, projectId: parsed.project_id, artifactRoot };
      const created = await store.create(createDefaultConfig(defaultConfigInput));
      config = created.artifact;
      configCreated = true;
      configRevision = created.revision;
    }

    const { generateHarnessFiles } = await import("../harness/generate.ts");
    const generatedFiles = await generateHarnessFiles(projectRoot, artifactRoot);

    // Role config lives in the host-native NAMED SUBAGENT files (the source of truth for each role's model +
    // read-only), not a separate spec-guard.config.json. Emit one per spawnable role for both hosts.
    const { buildDefaultRoleConfig } = await import("../role-config/config.ts");
    const { generateAgentFiles } = await import("../role-config/agent-files.ts");
    for (const file of generateAgentFiles(buildDefaultRoleConfig())) {
      const abs = path.join(projectRoot, file.path);
      await mkdir(path.dirname(abs), { recursive: true });
      let status: "created" | "preserved" = "preserved";
      try {
        await access(abs); // don't clobber a user-edited agent file
      } catch {
        await writeFile(abs, file.content, "utf8");
        status = "created";
      }
      generatedFiles.push({ path: file.path, status });
    }

    // The PreToolUse edit gate: PreToolUse DENIES product-code edits by default; an edit is allowed only when the
    // actor is an edit-capable subagent. Claude's PreToolUse payload carries `agent_type` directly. Codex's does
    // NOT, so SubagentStart/SubagentStop maintain an edit lease (written for implementer/fixer, cleared on stop)
    // that PreToolUse reads to identify the actor. Either way a coordinator/main-session edit (no agent_type AND no
    // lease) is denied. One CLI (`spec-guard hook ...`) serves both hosts.
    const claudeSettings = path.join(projectRoot, ".claude", "settings.json");
    generatedFiles.push({ path: ".claude/settings.json", status: await ensureJsonHookEntry(claudeSettings, "PreToolUse", "Write|Edit|MultiEdit|NotebookEdit", "npx spec-guard hook pre-edit") });

    const codexConfig = path.join(projectRoot, ".codex", "config.toml");
    const codexLegacyHooks = path.join(projectRoot, ".codex", "hooks.json");
    const editCapableMatcher = "spec-guard-(implementer|fixer)";
    let codexConfigStatus: "created" | "preserved" = await ensureCodexMcpServerEntry(codexConfig);
    let codexStatus: "created" | "preserved" = "preserved";
    const codexHookEntries = [
      { event: "PreToolUse", matcher: "^apply_patch$", command: "npx spec-guard hook pre-edit", statusMessage: "Spec Guard edit gate" },
      { event: "SubagentStart", matcher: `^${editCapableMatcher}$`, command: "npx spec-guard hook subagent-start", statusMessage: "Spec Guard edit lease start" },
      { event: "SubagentStop", matcher: `^${editCapableMatcher}$`, command: "npx spec-guard hook subagent-stop", statusMessage: "Spec Guard edit lease stop" }
    ] satisfies CodexHookEntry[];
    if (await fileExists(codexLegacyHooks)) {
      for (const entry of codexHookEntries) if (await ensureJsonHookEntry(codexLegacyHooks, entry.event, entry.matcher, entry.command) === "created") codexStatus = "created";
      generatedFiles.push({ path: ".codex/hooks.json", status: codexStatus });
      generatedFiles.push({ path: ".codex/config.toml", status: codexConfigStatus });
    } else {
      for (const entry of codexHookEntries) if (await ensureCodexInlineHookEntry(codexConfig, entry) === "created") codexConfigStatus = "created";
      generatedFiles.push({ path: ".codex/config.toml", status: codexConfigStatus });
    }

    const gitignoreStatus = await ensureArtifactRootGitignored(projectRoot, artifactRoot);
    generatedFiles.push({ path: ".gitignore", status: gitignoreStatus });

    const nextSteps = [
      "Reload or restart Pi so .pi/extensions/spec-guard.ts is discovered.",
      "Reload MCP clients after reviewing generated MCP/client config files.",
      "For Codex, start a new session or restart after init so .codex/config.toml is loaded; `/mcp` should list the spec-guard MCP server once the project config is trusted.",
      "Review the named subagent files in .claude/agents/ and .codex/agents/ (each role's model + read-only), then run spec_guard_config_check.",
      "Edit gate: review the PreToolUse hook merged into .claude/settings.json and the Codex hooks merged into .codex/config.toml (or an existing .codex/hooks.json) (runs `npx spec-guard hook pre-edit`). In Codex, use `/hooks` to review/trust the new project hooks. The gate denies coordinator/main-session edits to product code under a Spec's scope - confirm the spec-guard CLI is invocable in this project so the hook engages.",
      "First call spec_guard_mcp_status or spec_guard_mcp_quickstart.",
      "Use CLI for bootstrap/init; use Spec Guard tools directly for workflow actions."
    ];
    const recommendedToolCalls = ["spec_guard_mcp_status", "spec_guard_mcp_quickstart", "spec_guard_config_check"];

    return {
      ok: true,
      action_id: "init",
      data: {
        artifact_root: artifactRoot,
        project_id: config.project_id,
        config,
        config_created: configCreated,
        config_revision: configRevision,
        generated_files: generatedFiles,
        next_steps: nextSteps,
        recommended_tool_calls: recommendedToolCalls
      },
      diagnostics: [],
      mutations: [
        { artifact: "config", operation: configCreated ? "create" : "none", paths: configCreated ? ["/"] : [], summary: configCreated ? "Created Config artifact revision 1." : `Preserved existing Config artifact revision ${configRevision}.` },
        { artifact: "harness", operation: "update", paths: generatedFiles.map((file) => file.path), summary: "Generated or preserved project-visible MCP/Pi/client guidance files." }
      ],
      next_actions: [
        { action_id: "mcp.status", cli: "spec-guard mcp status --json", mcp: "spec_guard_mcp_status", reason: "Inspect initialized Spec Guard status.", suggested_input: null },
        { action_id: "mcp.quickstart", cli: "spec-guard mcp quickstart --json", mcp: "spec_guard_mcp_quickstart", reason: "Review first agent steps.", suggested_input: null }
      ],
      summary: "Spec Guard initialized successfully."
    };
  } catch (error) {
    return failureResult("init", "Spec Guard initialization failed.", [diagnostic("INIT_FAILED", error instanceof Error ? error.message : String(error), "error", null)]) as unknown as ActionResult<InitData>;
  }
}
