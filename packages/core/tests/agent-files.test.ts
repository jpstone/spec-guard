import { describe, it, expect } from "vitest";
import { buildDefaultRoleConfig, generateAgentFiles } from "../src/index.ts";

describe("agent-files generator (named subagents from the role config)", () => {
  const files = generateAgentFiles(buildDefaultRoleConfig());
  const byPath = (p: string): string => files.find((file) => file.path === p)?.content ?? "";

  it("emits a Claude .md + a Codex .toml per spawned role; skips the inline coordinator + deterministic validator", () => {
    const paths = files.map((file) => file.path);
    expect(paths).toContain(".claude/agents/spec-guard-reviewer.md");
    expect(paths).toContain(".codex/agents/spec-guard-reviewer.toml");
    expect(paths).toContain(".claude/agents/spec-guard-implementer.md");
    expect(paths).toContain(".codex/agents/spec-guard-implementer.toml");
    expect(paths.some((p) => p.includes("coordinator"))).toBe(false); // inline — the main session, not a subagent
    expect(paths.some((p) => p.includes("validator"))).toBe(false); // deterministic command runner, no LLM
  });

  it("pins the reviewer at high judgment + read-only in BOTH formats", () => {
    const md = byPath(".claude/agents/spec-guard-reviewer.md");
    expect(md).toContain("name: spec-guard-reviewer");
    expect(md).toContain("model: claude-opus-4-8"); // high_judgment -> claude_code
    expect(md).toContain("effort: high");
    expect(md).toContain("disallowedTools: Write, Edit"); // read-only role cannot edit product code
    const toml = byPath(".codex/agents/spec-guard-reviewer.toml");
    expect(toml).toContain('model = "gpt-5.5"'); // high_judgment -> pi (same tier, codex model)
    expect(toml).toContain('model_reasoning_effort = "high"');
    expect(toml).toContain('sandbox_mode = "read-only"');
  });

  it("the implementer is high judgment but EDIT-capable (no read-only restriction)", () => {
    const md = byPath(".claude/agents/spec-guard-implementer.md");
    expect(md).toContain("model: claude-opus-4-8");
    expect(md).toContain("effort: high");
    expect(md).not.toContain("disallowedTools"); // implementer writes code
    expect(byPath(".codex/agents/spec-guard-implementer.toml")).not.toContain("sandbox_mode");
  });
});
