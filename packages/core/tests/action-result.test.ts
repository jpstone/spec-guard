import { describe, expect, it } from "vitest";
import { ActionResultSchema, okActionResult } from "../src/index.ts";

const validActionResult = {
  ok: true,
  action_id: "config.check",
  data: { status: "ok" },
  diagnostics: [
    {
      code: "CONFIG_OK",
      severity: "info",
      message: "Config is valid.",
      field_path: null,
      gate: null,
      fix: null
    }
  ],
  mutations: [
    {
      artifact: "config",
      operation: "none",
      paths: [],
      summary: "No mutation performed."
    }
  ],
  next_actions: [
    {
      action_id: "config.get",
      cli: "spec-guard config get",
      mcp: "spec_guard_config_get",
      reason: "Inspect the active config.",
      suggested_input: null
    }
  ],
  summary: "Config check completed."
} as const;

describe("Appendix B.1 action result schema", () => {
  it("parses a valid Appendix B.1 action result", () => {
    expect(ActionResultSchema.parse(validActionResult)).toEqual(validActionResult);
  });

  it("requires data", () => {
    const { data: _data, ...withoutData } = validActionResult;
    expect(ActionResultSchema.safeParse(withoutData).success).toBe(false);
  });

  it("rejects non-object data", () => {
    for (const data of [null, "status", 1, true, []]) {
      expect(ActionResultSchema.safeParse({ ...validActionResult, data }).success).toBe(false);
    }
  });

  it("rejects top-level message", () => {
    expect(ActionResultSchema.safeParse({ ...validActionResult, message: "legacy message" }).success).toBe(false);
  });

  it("rejects old mutation fields like artifact_type and description", () => {
    const legacyMutationResult = {
      ...validActionResult,
      mutations: [
        {
          artifact_type: "config",
          id: null,
          before_revision: null,
          after_revision: null,
          governed_content_hash: null,
          audit_revision: null,
          description: "legacy mutation"
        }
      ]
    };

    expect(ActionResultSchema.safeParse(legacyMutationResult).success).toBe(false);
  });

  it("rejects mutation operations outside the Appendix B.1 enum", () => {
    const invalidOperationResult = {
      ...validActionResult,
      mutations: [{ ...validActionResult.mutations[0], operation: "delete" }]
    };

    expect(ActionResultSchema.safeParse(invalidOperationResult).success).toBe(false);
  });

  it("requires cli, mcp, and suggested_input on next actions", () => {
    for (const field of ["cli", "mcp", "suggested_input"] as const) {
      const nextAction = { ...validActionResult.next_actions[0] };
      delete nextAction[field];

      expect(ActionResultSchema.safeParse({ ...validActionResult, next_actions: [nextAction] }).success).toBe(false);
    }
  });

  it("returns an empty data object from okActionResult when no data is supplied", () => {
    expect(okActionResult("config.check", "Config check completed.")).toMatchObject({ data: {} });
  });

  it("uses summary rather than message in okActionResult", () => {
    const result = okActionResult("config.check", "Config check completed.");

    expect(result.summary).toBe("Config check completed.");
    expect(result).not.toHaveProperty("message");
    expect(ActionResultSchema.parse(result)).toEqual(result);
  });
});
