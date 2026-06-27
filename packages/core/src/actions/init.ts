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

/** Additively merge one hook entry (event + matcher + command) into a host config (Claude settings.json / Codex
 *  hooks.json). Never clobbers an existing config or a pre-existing entry for the same command; only rewrites the
 *  file when adding ours. Deduped per command, so distinct events (pre-edit / subagent-start / subagent-stop) coexist. */
async function ensureHookEntry(absPath: string, event: string, matcher: string, command: string): Promise<"created" | "preserved"> {
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
    generatedFiles.push({ path: ".claude/settings.json", status: await ensureHookEntry(claudeSettings, "PreToolUse", "Write|Edit|MultiEdit|NotebookEdit", "npx spec-guard hook pre-edit") });

    const codexHooks = path.join(projectRoot, ".codex", "hooks.json");
    const editCapableMatcher = "spec-guard-(implementer|fixer)";
    let codexStatus: "created" | "preserved" = "preserved";
    for (const [event, matcher, command] of [
      ["PreToolUse", "apply_patch", "npx spec-guard hook pre-edit"],
      ["SubagentStart", editCapableMatcher, "npx spec-guard hook subagent-start"],
      ["SubagentStop", editCapableMatcher, "npx spec-guard hook subagent-stop"]
    ] as const) {
      if (await ensureHookEntry(codexHooks, event, matcher, command) === "created") codexStatus = "created";
    }
    generatedFiles.push({ path: ".codex/hooks.json", status: codexStatus });

    const gitignoreStatus = await ensureArtifactRootGitignored(projectRoot, artifactRoot);
    generatedFiles.push({ path: ".gitignore", status: gitignoreStatus });

    const nextSteps = [
      "Reload or restart Pi so .pi/extensions/spec-guard.ts is discovered.",
      "Reload MCP clients after reviewing generated MCP/client config files.",
      "Review the named subagent files in .claude/agents/ and .codex/agents/ (each role's model + read-only), then run spec_guard_config_check.",
      "Edit gate: review the PreToolUse hook merged into .claude/settings.json + .codex/hooks.json (runs `npx spec-guard hook pre-edit`). It denies coordinator/main-session edits to product code under a Spec's scope — confirm the spec-guard CLI is invocable in this project so the hook engages.",
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
