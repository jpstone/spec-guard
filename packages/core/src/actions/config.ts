import path from "node:path";
import { z } from "zod";
import { ArtifactStore } from "../storage/artifact-store.ts";
import { AggregateWorkPacketStore } from "../storage/aggregate-work-packet-store.ts";
import { ROLE_NAMES, evaluateSelfReviewViability, resolveRoleModel, resolveRoleSummaryModel } from "../role-config/config.ts";
import { loadRoleConfig } from "../role-config/load.ts";
import { resolveProviderAvailability, type ProviderAvailability } from "../role-config/availability.ts";
import { ConfigSchema, type Config } from "../schemas/artifacts.ts";
import type { Diagnostic } from "../schemas/embedded.ts";
import type { ActionResult } from "./result.ts";
import { applyJsonPatch, JsonPatchSchema } from "./json-patch.ts";
import { resolveProjectRoot, type ActionExecutionContext } from "./context.ts";
import { buildDashboardSummary } from "../viewer-data/dashboard-summary.ts";

export const ConfigGetInputSchema = z.object({ include_full: z.boolean().optional() }).strict();
export const ConfigUpdateInputSchema = z.object({ patch: JsonPatchSchema }).strict();
export const ConfigCheckInputSchema = z.object({}).strict();

export type ConfigGetInput = z.infer<typeof ConfigGetInputSchema>;
export type ConfigUpdateInput = z.infer<typeof ConfigUpdateInputSchema>;

export function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, (match) => match) as string;
}

export function diagnostic(code: string, message: string, severity: Diagnostic["severity"] = "error", fieldPath: string | null = null, fix: string | null = null): Diagnostic {
  return { code, severity, message, field_path: fieldPath, gate: null, fix };
}

export function failureResult(actionId: string, summary: string, diagnostics: Diagnostic[], data: Record<string, unknown> = {}): ActionResult {
  return { ok: false, action_id: actionId, data, diagnostics, mutations: [], next_actions: [], summary };
}

export function storeForContext(context: ActionExecutionContext = {}, artifactRootOverride?: string): ArtifactStore {
  const projectRoot = resolveProjectRoot(context);
  const artifactRoot = artifactRootOverride ?? context.artifactRoot ?? ".spec-guard/";
  const root = path.isAbsolute(artifactRoot) ? artifactRoot : path.join(projectRoot, artifactRoot);
  return new ArtifactStore({ root });
}

// The aggregate-document store, rooted at the same `.spec-guard/` root (it writes packets/<id>.json).
export function aggregateStoreForContext(context: ActionExecutionContext = {}, artifactRootOverride?: string): AggregateWorkPacketStore {
  return new AggregateWorkPacketStore(storeForContext(context, artifactRootOverride).root);
}

export function createDefaultConfig(input: { projectRoot: string; projectId?: string; artifactRoot?: string; now?: string }): Config {
  const now = input.now ?? isoNow();
  return ConfigSchema.parse({
    artifact_type: "config",
    schema_version: 1,
    revision: 1,
    created_at: now,
    updated_at: now,
    project_id: input.projectId ?? (path.basename(input.projectRoot) || "spec-guard-project"),
    artifact_root: input.artifactRoot ?? ".spec-guard/",
    project_root: input.projectRoot,
    command_execution: {
      default_mode: "argv",
      configured_shell: null,
      default_timeout_ms: 30000,
      env_policy: "inherit"
    },
    path_policy: {
      spec_guard_artifact_evidence: [".spec-guard/**"],
      docs: ["docs/**", "**/*.md"],
      tests: ["**/*.test.ts", "**/*.spec.ts", "test/**", "tests/**"],
      implementation_source: ["src/**", "packages/**/src/**"],
      runtime_product_configuration: ["package.json", "tsconfig*.json", ".env.example"],
      generated_build_output: ["dist/**", "build/**", "coverage/**"],
      docs_test_manifests: [],
      ignored_paths: ["node_modules/**", ".git/**", ".spec-guard/**"]
    },
    change_baseline_policy: { mode: "auto" },
    cleanup_observers: [],
    diagnostics: []
  });
}

export async function configGet(input: ConfigGetInput = {}, context: ActionExecutionContext = {}): Promise<ActionResult<{ config: Config; governed_content_hash: string }>> {
  ConfigGetInputSchema.parse(input);
  const store = storeForContext(context);
  try {
    const current = await store.readCurrent<Config>("config", null);
    const config = ConfigSchema.parse(current.artifact);
    return {
      ok: true,
      action_id: "config.get",
      data: { config, governed_content_hash: current.governed_content_hash },
      diagnostics: [],
      mutations: [{ artifact: "config", operation: "none", paths: [], summary: "Read persisted Config artifact." }],
      next_actions: [
        { action_id: "config.check", cli: "spec-guard config check --json", mcp: "spec_guard_config_check", reason: "Check persisted artifact health and governance summary.", suggested_input: null }
      ],
      summary: "Config loaded."
    };
  } catch (error) {
    return failureResult("config.get", "Config could not be loaded.", [diagnostic("CONFIG_NOT_FOUND", error instanceof Error ? error.message : String(error), "error", "/config", "Run spec-guard init.")]) as ActionResult<{ config: Config; governed_content_hash: string }>;
  }
}

export async function configUpdate(input: ConfigUpdateInput, context: ActionExecutionContext = {}): Promise<ActionResult<{ config: Config; revision: number; affected_paths: string[] }>> {
  const store = storeForContext(context);
  try {
    const parsed = ConfigUpdateInputSchema.parse(input);
    const current = await store.readCurrent<Config>("config", null);
    const config = ConfigSchema.parse(current.artifact);
    const patched = applyJsonPatch(config, parsed.patch, { protectedPrefixes: ["/artifact_type", "/schema_version", "/revision", "/created_at"] });
    const candidate = { ...patched.value, updated_at: isoNow() };
    const validated = ConfigSchema.parse(candidate);
    const updated = await store.update(validated);
    return {
      ok: true,
      action_id: "config.update",
      data: { config: updated.artifact, revision: updated.revision, affected_paths: patched.affectedPaths },
      diagnostics: [],
      mutations: [{ artifact: "config", operation: "update", paths: patched.affectedPaths, summary: `Updated Config to revision ${updated.revision}.` }],
      next_actions: [
        { action_id: "config.check", cli: "spec-guard config check --json", mcp: "spec_guard_config_check", reason: "Validate the updated config and artifact store summary.", suggested_input: null }
      ],
      summary: "Config updated."
    };
  } catch (error) {
    return failureResult("config.update", "Config update rejected.", [diagnostic("CONFIG_UPDATE_REJECTED", error instanceof Error ? error.message : String(error), "error", "/patch")]) as ActionResult<{ config: Config; revision: number; affected_paths: string[] }>;
  }
}

export async function configCheck(_input: z.infer<typeof ConfigCheckInputSchema> = {}, context: ActionExecutionContext = {}): Promise<ActionResult> {
  ConfigCheckInputSchema.parse(_input);
  const store = storeForContext(context);
  const artifactRoot = store.root;
  const diagnostics: Diagnostic[] = [];
  let configExists = false;
  let configValid = false;
  let configRevision: number | null = null;

  try {
    const current = await store.readCurrent<Config>("config", null);
    configExists = true;
    const parsed = ConfigSchema.safeParse(current.artifact);
    configValid = parsed.success;
    configRevision = current.revision;
    if (!parsed.success) diagnostics.push(diagnostic("CONFIG_INVALID", z.prettifyError(parsed.error), "error", "/config"));
  } catch {
    diagnostics.push(diagnostic("CONFIG_MISSING", "No persisted Config artifact found.", "warning", "/config", "Run spec-guard init."));
  }

  // Role config lives in the named subagent files (.claude/agents/*.md, .codex/agents/*.toml) — loaded via the
  // built-in structure + per-role model/read-only overrides from those files. Reported only — Spec Guard never
  // silently falls back to a different provider.
  const projectRoot = resolveProjectRoot(context);
  let roleConfigExists = false;
  let roleConfigValid = false;
  let roleConfigSummary: Record<string, unknown> | null = null;
  const cfg = await loadRoleConfig(projectRoot);
  if (cfg === null) {
    diagnostics.push(diagnostic("ROLE_CONFIG_MISSING", "No named subagent files found (.claude/agents/ or .codex/agents/).", "warning", "/.claude/agents", "Run spec-guard init."));
  } else {
    roleConfigExists = true;
    roleConfigValid = true;
    const providerAvailability: Record<string, ProviderAvailability> = {};
    for (const provider of new Set(Object.values(cfg.roles).map((role) => role.provider))) {
      const availability = resolveProviderAvailability(provider);
      providerAvailability[provider] = availability;
      if (availability === "unavailable") {
        diagnostics.push(diagnostic("ROLE_PROVIDER_UNAVAILABLE", `Configured provider '${provider}' was not found on PATH. Spec Guard will not silently fall back to another provider; install it.`, "warning", "/.claude/agents"));
      }
    }
    const viability = evaluateSelfReviewViability(cfg);
    for (const item of viability.diagnostics) {
      diagnostics.push(diagnostic(item.code, item.message, item.severity, "/.claude/agents"));
    }
    // Resolve each role's model + summary_model alias; warn (no silent fallback) if unavailable.
    for (const role of ROLE_NAMES) {
      for (const resolution of [resolveRoleModel(cfg, role), resolveRoleSummaryModel(cfg, role)]) {
        diagnostics.push(...resolution.diagnostics);
      }
    }
    roleConfigSummary = {
      self_review_identity_mode: cfg.self_review_identity_mode,
      provider_availability: providerAvailability,
      self_review_viable: viability.viable,
      trust_boundary_recorded: viability.trust_boundary_recorded,
      identity_collisions: viability.collisions
    };
  }

  const governanceSummary = await buildDashboardSummary(store);
  const ok = configExists && configValid && diagnostics.every((diag) => diag.severity !== "error");
  return {
    ok,
    action_id: "config.check",
    data: {
      artifact_root: artifactRoot,
      config_exists: configExists,
      config_valid: configValid,
      config_revision: configRevision,
      role_config_exists: roleConfigExists,
      role_config_valid: roleConfigValid,
      role_config: roleConfigSummary,
      governance_summary: governanceSummary
    },
    diagnostics,
    mutations: [{ artifact: "config", operation: "none", paths: [], summary: "Read artifact store and computed real governance summary." }],
    next_actions: [
      { action_id: "mcp.quickstart", cli: "spec-guard mcp quickstart --json", mcp: "spec_guard_mcp_quickstart", reason: "Review first steps for agents and MCP/Pi usage.", suggested_input: null },
      { action_id: "config.get", cli: "spec-guard config get --json", mcp: "spec_guard_config_get", reason: "Inspect persisted config.", suggested_input: null }
    ],
    summary: ok ? "Config check completed." : "Config check found issues."
  };
}
