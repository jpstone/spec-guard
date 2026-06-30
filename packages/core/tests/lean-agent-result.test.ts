import { describe, it, expect } from "vitest";
import { buildMcpToolDefinitions, leanAgentResult } from "../src/index.ts";
import { buildAggregate } from "./helpers/aggregate-fixture.ts";

describe("leanAgentResult (#1: lean agent-facing mutation responses)", () => {
  const make = (action_id: string, wp: unknown) => ({ ok: true, action_id, data: { work_packet: wp, decision: { foo: 1 } }, diagnostics: [], mutations: [], next_actions: [], summary: "x" });

  it("trims work_packet to a summary + the fresh approval_hash on a mutation, preserving other data fields", () => {
    const wp = buildAggregate("WP1", ["direct_behavior", "direct_behavior"]);
    const lean = leanAgentResult(make("work.approve", wp) as never);
    const data = lean.data as Record<string, unknown>;
    expect(data.work_packet).toBeUndefined(); // the heavy echo (+ the change_baseline manifests in it) is gone
    expect((data.work_packet_summary as { id: string }).id).toBe("WP1");
    expect((data.work_packet_summary as { specs: unknown[] }).specs).toHaveLength(2);
    expect(typeof data.approval_hash).toBe("string"); // the fresh hash -> chain approve->authorize with no work.get
    expect(data.decision).toEqual({ foo: 1 }); // other data fields preserved
  });

  it("trims work_packet on work.get too; agents never receive the full aggregate document", () => {
    const wp = buildAggregate("WP1");
    const lean = leanAgentResult(make("work.get", wp) as never);
    const data = lean.data as Record<string, unknown>;
    expect(data.work_packet).toBeUndefined();
    expect((data.work_packet_summary as { id: string }).id).toBe("WP1");
    expect(typeof data.approval_token).toBe("string");
  });

  it("does not advertise full work.get reads through MCP/Pi", () => {
    const workGet = buildMcpToolDefinitions().find((tool) => tool.action_id === "work.get");
    const schema = workGet?.input_schema as { properties?: { view?: { enum?: unknown[] } } } | undefined;
    expect(schema?.properties?.view?.enum).toEqual(["summary", "intent", "spec", "review", "coherence"]);
  });

  it("leaves a result with no work_packet untouched (e.g. a baseline/command action)", () => {
    const result = { ok: true, action_id: "command.run", data: { command_result: { status: "passed" } }, diagnostics: [], mutations: [], next_actions: [], summary: "x" };
    expect(leanAgentResult(result as never)).toEqual(result);
  });
});
