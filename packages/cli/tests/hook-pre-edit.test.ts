import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runCli } from "../src/index.ts";
import { executeAction, aggregateStoreForContext } from "@spec-guard/core";

describe("CLI hook pre-edit (the PreToolUse edit-gate adapter)", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sg-hook-"));
    await runCli(["init"], { cwd: root, stdout: () => {}, stderr: () => {} });
    await executeAction("work.create", { id: "WP1", title: "App", goal: "build a thing", classification: "one_off_application_ui" }, { projectRoot: root });
    // Scope the Spec to src/** so the gate has product code to govern.
    const store = aggregateStoreForContext({ projectRoot: root });
    const aggregate = await store.read("WP1");
    await store.update({ ...aggregate, specs: aggregate.specs.map((spec, index) => index === 0 ? { ...spec, scope: { ...spec.scope, allowed_globs: ["src/**"] } } : spec) });
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  async function runHook(payload: object): Promise<{ code: number; err: string }> {
    let err = "";
    const code = await runCli(["hook", "pre-edit"], { cwd: root, stdin: JSON.stringify(payload), stdout: () => {}, stderr: (text) => { err += text; } });
    return { code, err };
  }

  it("DENIES (exit 2) a main-session edit to product code under a Spec's scope", async () => {
    const { code, err } = await runHook({ tool_name: "Write", tool_input: { file_path: path.join(root, "src/index.ts") }, cwd: root });
    expect(code).toBe(2);
    expect(err).toMatch(/spec-guard edit gate/);
  });

  it("ALLOWS (exit 0) the spec-guard-implementer subagent to edit the same path", async () => {
    const { code } = await runHook({ tool_name: "Write", tool_input: { file_path: path.join(root, "src/index.ts") }, agent_type: "spec-guard-implementer", cwd: root });
    expect(code).toBe(0);
  });

  it("ALLOWS (exit 0) edits OUTSIDE any Spec's scope (scaffold/config)", async () => {
    const { code } = await runHook({ tool_name: "Write", tool_input: { file_path: path.join(root, "package.json") }, cwd: root });
    expect(code).toBe(0);
  });

  it("ALLOWS (exit 0) on unparseable stdin — a guardrail must never brick the agent", async () => {
    const code = await runCli(["hook", "pre-edit"], { cwd: root, stdin: "not json at all", stdout: () => {}, stderr: () => {} });
    expect(code).toBe(0);
  });

  // Codex has no agent_type in PreToolUse, so SubagentStart/Stop maintain an edit lease the pre-edit hook reads.
  const subagent = (sub: string, payload: object) => runCli(["hook", sub], { cwd: root, stdin: JSON.stringify(payload), stdout: () => {}, stderr: () => {} });
  // An apply_patch edit (Codex) to product code, with NO agent_type — the actor is decided purely by the lease.
  const codexEdit = { tool_name: "apply_patch", tool_input: { command: "*** Update File: src/index.ts\n" } };

  it("Codex flow: SubagentStart(implementer) grants the edit via the lease; SubagentStop revokes it", async () => {
    expect((await runHook(codexEdit)).code).toBe(2); // no lease yet -> looks like the coordinator -> deny
    await subagent("subagent-start", { agent_type: "spec-guard-implementer", agent_id: "a1", cwd: root });
    expect((await runHook(codexEdit)).code).toBe(0); // lease active -> allow
    await subagent("subagent-stop", { agent_id: "a1", cwd: root });
    expect((await runHook(codexEdit)).code).toBe(2); // lease cleared -> deny again
  });

  it("a read-only subagent (reviewer) start writes NO lease — edits stay denied", async () => {
    await subagent("subagent-start", { agent_type: "spec-guard-reviewer", agent_id: "r1", cwd: root });
    expect((await runHook(codexEdit)).code).toBe(2);
  });

  it("a relative ..-reentry path pointing back into the root is gated (not dropped as traversal)", async () => {
    const reentry = `../${path.basename(root)}/src/index.ts`; // resolves back to <root>/src/index.ts
    const { code } = await runHook({ tool_name: "Write", tool_input: { file_path: reentry }, cwd: root });
    expect(code).toBe(2);
  });

  it("a lease with an invalid started_at is ignored (treated as no lease) — edit denied", async () => {
    await writeFile(path.join(root, ".spec-guard", ".edit-lease.json"), JSON.stringify({ agent_type: "spec-guard-implementer", agent_id: "x", started_at: "not-a-date" }), "utf8");
    expect((await runHook(codexEdit)).code).toBe(2);
  });
});
