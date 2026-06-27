import { describe, expect, it } from "vitest";
import {
  buildDefaultRoleConfig,
  SpecGuardRoleConfigSchema,
  resolveRoleModel,
  resolveRoleSummaryModel,
  deriveRoleExecutionContext,
  BackendTaskEnvelopeSchema,
  fixtureAdapter,
  dispatchBackendTask,
  extractJsonObject,
  type BackendTaskEnvelope
} from "../src/index.ts";

const roleConfig = buildDefaultRoleConfig();

describe("M8a model alias resolution", () => {
  it("resolves per-role tier aliases to concrete models", () => {
    expect(resolveRoleModel(roleConfig, "implementer").model).toBe("claude-opus-4-8"); // high_judgment — writing code needs it
    expect(resolveRoleModel(roleConfig, "reviewer").model).toBe("claude-opus-4-8"); // high_judgment — review is premium (catches what cheaper models miss)
    expect(resolveRoleModel(roleConfig, "rereviewer").model).toBe("claude-opus-4-8"); // high_judgment — re-review is premium too
    expect(resolveRoleModel(roleConfig, "coordinator").model).toBe("claude-opus-4-8"); // high_judgment stays premium
    expect(resolveRoleModel(roleConfig, "evidence_recorder").model).toBe("claude-haiku-4-5-20251001");
    expect(resolveRoleModel(roleConfig, "validator").model).toBeNull();
    expect(resolveRoleSummaryModel(roleConfig, "validator").model).toBe("claude-haiku-4-5-20251001");
  });

  it("warns (no silent fallback) when an alias has no model for the role's provider", () => {
    const cfg = SpecGuardRoleConfigSchema.parse({
      ...roleConfig,
      model_aliases: { high_judgment: { claude_code: "x" } },
      roles: { ...roleConfig.roles, implementer: { ...roleConfig.roles.implementer, provider: "pi", model: "high_judgment" } }
    });
    const r = resolveRoleModel(cfg, "implementer");
    expect(r.model).toBeNull();
    expect(r.diagnostics.some((d) => d.code === "ROLE_MODEL_UNAVAILABLE" && d.severity === "warning")).toBe(true);
  });

  it("treats a non-alias model string as a concrete id", () => {
    const cfg = SpecGuardRoleConfigSchema.parse({ ...roleConfig, roles: { ...roleConfig.roles, implementer: { ...roleConfig.roles.implementer, model: "some-concrete-model" } } });
    expect(resolveRoleModel(cfg, "implementer").model).toBe("some-concrete-model");
  });
});

function envelope(over: Record<string, unknown> = {}): BackendTaskEnvelope {
  const ctx = deriveRoleExecutionContext("reviewer", roleConfig.roles.reviewer, []);
  return BackendTaskEnvelopeSchema.parse({
    task_id: "t1", role: "reviewer", template_id: "focused_implementation_review_v1", template_version: 1,
    input_refs: ["ref:1"], allowed_capabilities: ctx, expected_output_schema: "review_cycle_v1",
    requested_role_identity: { principal_id: null, agent_instance_id: "sg-role-reviewer" },
    observed_producer_identity: null, identity_attestation: "logical_role_trust_boundary",
    timeout_ms: 60000, retry_policy: "none",
    ...over
  });
}

describe("M8a dispatch (fixture adapter, deterministic)", () => {
  it("renders the template prompt and parses the JSON record from the final message", async () => {
    const adapter = fixtureAdapter({ final_message: "Here is my review:\n```json\n{\"verdict\":\"pass\"}\n```\nDone." });
    const result = await dispatchBackendTask({ envelope: envelope(), adapter, cwd: ".", model: "claude-opus-4-8" });
    expect(result.ok).toBe(true);
    expect(result.parsed_output).toEqual({ verdict: "pass" });
    expect(adapter.calls[0]?.permission_mode).toBe("read_only");
    expect(adapter.calls[0]?.model).toBe("claude-opus-4-8");
    expect(adapter.calls[0]?.prompt).toContain("focused_implementation_review_v1");
  });

  it("fails when the final message has no JSON record", async () => {
    const result = await dispatchBackendTask({ envelope: envelope(), adapter: fixtureAdapter({ final_message: "no json here" }), cwd: ".", model: null });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "BACKEND_OUTPUT_UNPARSEABLE")).toBe(true);
  });

  it("records the requested role identity, never the adapter/model-claimed identity (trust boundary)", async () => {
    const adapter = fixtureAdapter({ final_message: "{\"x\":1}", observed_identity: { principal_id: "EVIL", agent_instance_id: "EVIL" } });
    const result = await dispatchBackendTask({ envelope: envelope(), adapter, cwd: ".", model: null });
    expect(result.observed_producer_identity.agent_instance_id).toBe("sg-role-reviewer");
    expect(result.observed_producer_identity.agent_instance_id).not.toBe("EVIL");
  });

  it("rejects an unknown template", async () => {
    const result = await dispatchBackendTask({ envelope: envelope({ template_id: "nope_v1" }), adapter: fixtureAdapter({ final_message: "{}" }), cwd: ".", model: null });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "BACKEND_TEMPLATE_UNKNOWN")).toBe(true);
  });

  it("an edit-role context maps to scoped_write", async () => {
    const ctx = deriveRoleExecutionContext("implementer", roleConfig.roles.implementer, ["src/**"]);
    const env = envelope({ role: "implementer", template_id: "implementation_execute_v1", allowed_capabilities: ctx, requested_role_identity: { principal_id: null, agent_instance_id: "sg-role-implementer" } });
    const adapter = fixtureAdapter({ final_message: "{\"summary\":\"done\"}" });
    await dispatchBackendTask({ envelope: env, adapter, cwd: ".", model: null });
    expect(adapter.calls[0]?.permission_mode).toBe("scoped_write");
  });
});

describe("M8a extractJsonObject", () => {
  it("handles fenced and bare objects, rejects non-objects", () => {
    expect(extractJsonObject("```json\n{\"a\":1}\n```")).toEqual({ a: 1 });
    expect(extractJsonObject("prefix {\"b\":2} suffix")).toEqual({ b: 2 });
    expect(extractJsonObject("[1,2,3]")).toBeNull();
    expect(extractJsonObject("no json")).toBeNull();
  });
});
