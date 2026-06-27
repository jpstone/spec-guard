import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildDefaultRoleConfig,
  SpecGuardRoleConfigSchema,
  evaluateSelfReviewViability,
  commandExistsOnPath,
  resolveProviderAvailability,
  initAction,
  configCheck
} from "../src/index.ts";

function diag(result: { diagnostics: Array<{ code: string }> }, code: string): boolean {
  return result.diagnostics.some((d) => d.code === code);
}

describe("M2 role-config schema + defaults", () => {
  it("default config is valid, with distinct edit/review identities and correct edit capability", () => {
    const cfg = buildDefaultRoleConfig();
    expect(SpecGuardRoleConfigSchema.safeParse(cfg).success).toBe(true);
    expect(cfg.roles.implementer.agent_instance_id).not.toBe(cfg.roles.reviewer.agent_instance_id);
    expect(cfg.roles.implementer.may_edit_code).toBe(true);
    expect(cfg.roles.fixer.may_edit_code).toBe(true);
    expect(cfg.roles.reviewer.may_edit_code).toBe(false);
    expect(cfg.roles.validator.may_edit_code).toBe(false);
    expect(cfg.roles.validator.provider).toBe("deterministic");
    expect(cfg.workflow.prevent_self_review_by_default).toBeUndefined(); // deprecated knob dropped from the default
    expect(cfg.self_review_identity_mode).toBe("strict_provider_identity_required");
    // #10d: explicit lifetime/firewall axis — only the coordinator runs inline; mechanical/judgment roles are subagents.
    expect(cfg.roles.coordinator.execution).toBe("inline");
    expect(cfg.roles.implementer.execution).toBe("subagent");
    expect(cfg.roles.fixer.execution).toBe("subagent");
    expect(cfg.roles.reviewer.execution).toBe("subagent");
    expect(cfg.roles.validator.execution).toBe("subagent");
  });

  it("schema rejects an unknown provider and unknown keys", () => {
    const cfg = buildDefaultRoleConfig();
    const badProvider = { ...cfg, roles: { ...cfg.roles, implementer: { ...cfg.roles.implementer, provider: "bogus" } } };
    expect(SpecGuardRoleConfigSchema.safeParse(badProvider).success).toBe(false);
    expect(SpecGuardRoleConfigSchema.safeParse({ ...cfg, extra: true }).success).toBe(false);
  });

  it("accepts the deprecated provider 'local' alias and a lingering prevent_self_review_by_default", () => {
    const cfg = buildDefaultRoleConfig();
    const legacy = { ...cfg, roles: { ...cfg.roles, validator: { ...cfg.roles.validator, provider: "local" as const } }, workflow: { ...cfg.workflow, prevent_self_review_by_default: true } };
    expect(SpecGuardRoleConfigSchema.safeParse(legacy).success).toBe(true); // existing configs stay valid
  });
});

describe("M2 self-review viability", () => {
  it("default (strict mode) is NOT viable by logical labels — a separate reviewer is required", () => {
    const v = evaluateSelfReviewViability(buildDefaultRoleConfig());
    expect(v.viable).toBe(false);
    expect(v.trust_boundary_recorded).toBe(false);
    expect(v.collisions).toEqual([]);
    expect(v.diagnostics.some((d) => d.code === "SELF_REVIEW_STRICT_IDENTITY_UNPROVEN")).toBe(true);
  });

  it("the opt-in trust-boundary mode is viable and records the boundary", () => {
    const cfg = buildDefaultRoleConfig();
    cfg.self_review_identity_mode = "logical_role_identity_allowed_with_visible_trust_boundary";
    const v = evaluateSelfReviewViability(cfg);
    expect(v.viable).toBe(true);
    expect(v.trust_boundary_recorded).toBe(true);
    expect(v.diagnostics.some((d) => d.code === "SELF_REVIEW_LOGICAL_TRUST_BOUNDARY")).toBe(true);
  });

  it("shared implementer/reviewer identity is a blocking collision", () => {
    const cfg = buildDefaultRoleConfig();
    cfg.roles.reviewer.agent_instance_id = cfg.roles.implementer.agent_instance_id;
    const v = evaluateSelfReviewViability(cfg);
    expect(v.viable).toBe(false);
    expect(v.collisions).toContain(cfg.roles.implementer.agent_instance_id);
    expect(v.diagnostics.some((d) => d.code === "SELF_REVIEW_IDENTITY_COLLISION" && d.severity === "error")).toBe(true);
  });

  it("strict mode (the default) reports a warning, not an error, with only logical ids", () => {
    const cfg = buildDefaultRoleConfig();
    cfg.self_review_identity_mode = "strict_provider_identity_required";
    const v = evaluateSelfReviewViability(cfg);
    expect(v.viable).toBe(false);
    expect(v.diagnostics.some((d) => d.code === "SELF_REVIEW_STRICT_IDENTITY_UNPROVEN" && d.severity === "warning")).toBe(true);
  });

  it("override-required mode is viable when ids are distinct", () => {
    const cfg = buildDefaultRoleConfig();
    cfg.self_review_identity_mode = "self_review_or_unknown_identity_override_required";
    const v = evaluateSelfReviewViability(cfg);
    expect(v.viable).toBe(true);
    expect(v.diagnostics.some((d) => d.code === "SELF_REVIEW_DISTINCT_LOGICAL_IDS")).toBe(true);
  });
});

describe("M2 provider availability (PATH scan, no spawn, no silent fallback)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "sg-path-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("local is always available", () => {
    expect(resolveProviderAvailability("local", { PATH: "" })).toBe("available");
  });

  it("a provider binary present on PATH is available, absent is unavailable", async () => {
    await writeFile(path.join(dir, "claude"), "#!/bin/sh\n", "utf8");
    expect(commandExistsOnPath("claude", { PATH: dir })).toBe(true);
    expect(resolveProviderAvailability("claude_code", { PATH: dir })).toBe("available");
    expect(resolveProviderAvailability("claude_code", { PATH: "" })).toBe("unavailable");
  });
});

describe("M2 init scaffolding + config.check reporting", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), "sg-m2-"));
    await initAction({ project_id: "demo" }, { projectRoot });
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("init writes the named subagent files for both hosts and preserves them on re-run", async () => {
    const reviewerMd = path.join(projectRoot, ".claude", "agents", "spec-guard-reviewer.md");
    const reviewerToml = path.join(projectRoot, ".codex", "agents", "spec-guard-reviewer.toml");
    expect(await readFile(reviewerMd, "utf8")).toContain("name: spec-guard-reviewer");
    expect(await readFile(reviewerToml, "utf8")).toContain("spec-guard-reviewer");
    // non-clobbering: a second init preserves a user-edited file
    await writeFile(reviewerMd, `${(await readFile(reviewerMd, "utf8")).trimEnd()}\n<!-- touched -->\n`, "utf8");
    const second = await initAction({ project_id: "demo" }, { projectRoot });
    expect(second.data.generated_files.find((f) => f.path === ".claude/agents/spec-guard-reviewer.md")?.status).toBe("preserved");
    expect(await readFile(reviewerMd, "utf8")).toContain("<!-- touched -->");
  });

  it("init emits the Claude PreToolUse hook + the Codex PreToolUse/SubagentStart/SubagentStop hooks, no dupes on re-run", async () => {
    const claude = JSON.parse(await readFile(path.join(projectRoot, ".claude", "settings.json"), "utf8"));
    expect(claude.hooks.PreToolUse[0].matcher).toMatch(/Edit/);
    const codex = JSON.parse(await readFile(path.join(projectRoot, ".codex", "hooks.json"), "utf8"));
    expect(Object.keys(codex.hooks)).toEqual(expect.arrayContaining(["PreToolUse", "SubagentStart", "SubagentStop"]));
    expect(JSON.stringify(codex)).toContain("spec-guard hook subagent-start");
    expect(JSON.stringify(codex)).toContain("spec-guard hook subagent-stop");
    await initAction({ project_id: "demo" }, { projectRoot });
    const afterClaude = JSON.parse(await readFile(path.join(projectRoot, ".claude", "settings.json"), "utf8"));
    const afterCodex = JSON.parse(await readFile(path.join(projectRoot, ".codex", "hooks.json"), "utf8"));
    expect((afterClaude.hooks.PreToolUse as unknown[]).filter((entry) => JSON.stringify(entry).includes("spec-guard hook pre-edit")).length).toBe(1);
    expect((afterCodex.hooks.SubagentStart as unknown[]).length).toBe(1);
  });

  it("init MERGES the edit-gate hook into a pre-existing settings.json without clobbering other content", async () => {
    await writeFile(path.join(projectRoot, ".claude", "settings.json"), `${JSON.stringify({ model: "opus", hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] }] } }, null, 2)}\n`, "utf8");
    await initAction({ project_id: "demo" }, { projectRoot });
    const merged = JSON.parse(await readFile(path.join(projectRoot, ".claude", "settings.json"), "utf8"));
    expect(merged.model).toBe("opus"); // unrelated content preserved
    expect((merged.hooks.PreToolUse as unknown[]).length).toBe(2); // their Bash hook + our edit gate
    expect(JSON.stringify(merged)).toContain("spec-guard hook pre-edit");
  });

  it("config.check reports a valid role config and stays ok (self-review not viable by default)", async () => {
    const result = await configCheck({}, { projectRoot });
    expect(result.ok).toBe(true);
    expect(result.data.role_config_exists).toBe(true);
    expect(result.data.role_config_valid).toBe(true);
    // Strict by default: structurally valid + ok, but self-review is not viable by labels (needs a separate reviewer).
    expect((result.data.role_config as { self_review_viable: boolean }).self_review_viable).toBe(false);
  });

  it("init writes a .gitignore that ignores the artifact root but keeps the committable spec/", async () => {
    const gitignore = await readFile(path.join(projectRoot, ".gitignore"), "utf8");
    expect(gitignore).toContain(".spec-guard/*"); // ignore the working store
    expect(gitignore).toContain("!.spec-guard/spec/"); // except the committable spec projections
    // Idempotent + non-clobbering: a second init preserves it (keep-line present), doesn't duplicate, keeps others.
    await writeFile(path.join(projectRoot, ".gitignore"), `${gitignore}node_modules/\n`, "utf8");
    await initAction({ project_id: "demo" }, { projectRoot });
    const after = await readFile(path.join(projectRoot, ".gitignore"), "utf8");
    expect(after.split("\n").filter((line) => line.trim() === "!.spec-guard/spec/").length).toBe(1);
    expect(after).toContain("node_modules/");
  });

  it("init migrates a pre-existing bare .spec-guard/ ignore so spec/ becomes trackable", async () => {
    // A bare dir-ignore makes the `!.spec-guard/spec/` re-include impossible; init must neutralize it.
    await writeFile(path.join(projectRoot, ".gitignore"), "node_modules/\n.spec-guard/\n", "utf8");
    await initAction({ project_id: "demo" }, { projectRoot });
    const after = await readFile(path.join(projectRoot, ".gitignore"), "utf8");
    expect(after.split("\n").map((line) => line.trim())).not.toContain(".spec-guard/"); // bare line removed
    expect(after).toContain(".spec-guard/*");
    expect(after).toContain("!.spec-guard/spec/");
    expect(after).toContain("node_modules/");
  });

  it("missing role config (no agent files) is a non-blocking warning", async () => {
    await rm(path.join(projectRoot, ".claude", "agents"), { recursive: true, force: true });
    await rm(path.join(projectRoot, ".codex", "agents"), { recursive: true, force: true });
    const result = await configCheck({}, { projectRoot });
    expect(diag(result, "ROLE_CONFIG_MISSING")).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("a malformed agent file is tolerated — falls back to defaults, no blocking error", async () => {
    await writeFile(path.join(projectRoot, ".claude", "agents", "spec-guard-reviewer.md"), "garbage, no frontmatter", "utf8");
    const result = await configCheck({}, { projectRoot });
    expect(result.diagnostics.some((d) => d.code === "ROLE_CONFIG_INVALID")).toBe(false); // no such failure mode now
    expect(result.ok).toBe(true);
  });
});