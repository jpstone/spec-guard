import { describe, expect, it } from "vitest";
import {
  buildDefaultRoleConfig,
  createDefaultConfig,
  deriveRoleExecutionContext,
  subagentPermissionMode,
  validateReadOnlyRoleCapabilities,
  detectRoleWriteViolations,
  BackendTaskEnvelopeSchema,
  type RoleExecutionContext
} from "../src/index.ts";

const config = createDefaultConfig({ projectRoot: "/proj" });
const roleConfig = buildDefaultRoleConfig();

function ctx(role: Parameters<typeof deriveRoleExecutionContext>[0], allowedGlobs: string[]): RoleExecutionContext {
  return deriveRoleExecutionContext(role, roleConfig.roles[role], allowedGlobs);
}

describe("M3 deriveRoleExecutionContext", () => {
  it("edit roles get scoped product write bound to allowed_globs", () => {
    const c = ctx("implementer", ["src/**"]);
    expect(c.product_workspace_access).toBe("write");
    expect(c.allowed_product_paths).toEqual(["src/**"]);
    expect(subagentPermissionMode(c)).toBe("scoped_write");
  });

  it("read-only roles never get product write and carry no product paths", () => {
    for (const role of ["reviewer", "rereviewer", "validator", "coordinator", "evidence_recorder"] as const) {
      const c = ctx(role, ["src/**"]);
      expect(c.product_workspace_access).not.toBe("write");
      expect(c.allowed_product_paths).toEqual([]);
      expect(subagentPermissionMode(c)).toBe("read_only");
    }
  });

  it("validator runs mutating commands; reviewer only read-only commands", () => {
    expect(ctx("validator", []).command_policy).toBe("mutating_with_snapshots");
    expect(ctx("reviewer", []).command_policy).toBe("read_only");
    expect(ctx("implementer", []).command_policy).toBe("none");
  });

  it("derives per-role governed record kinds and append capability", () => {
    expect(ctx("reviewer", []).allowed_governed_record_kinds).toContain("review_cycle");
    expect(ctx("validator", []).allowed_governed_record_kinds).toContain("command_result");
    expect(ctx("implementer", []).governed_state_access).toBe("append");
  });

  it("config may_edit_code cannot widen a harness read-only role to write", () => {
    const widened = buildDefaultRoleConfig();
    widened.roles.reviewer.may_edit_code = true;
    const c = deriveRoleExecutionContext("reviewer", widened.roles.reviewer, ["src/**"]);
    expect(c.product_workspace_access).not.toBe("write");
  });

  it("validateReadOnlyRoleCapabilities flags a read-only role granted edit capability", () => {
    const ok = validateReadOnlyRoleCapabilities(buildDefaultRoleConfig());
    expect(ok).toEqual([]);
    const bad = buildDefaultRoleConfig();
    bad.roles.validator.may_edit_code = true;
    const diags = validateReadOnlyRoleCapabilities(bad);
    expect(diags.some((d) => d.code === "ROLE_EDIT_CAPABILITY_NOT_PERMITTED" && d.severity === "error")).toBe(true);
  });
});

describe("M3 detectRoleWriteViolations", () => {
  it("a read-only role writing product code is an unauthorized_product_write violation", () => {
    const result = detectRoleWriteViolations({ context: ctx("reviewer", ["src/**"]), changedFiles: ["src/feature.ts"], allowedGlobs: ["src/**"], config });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.disposition).toBe("unauthorized_product_write");
    expect(result.recommended_disposition).toBe("revert_or_convert");
    expect(result.diagnostics[0]?.code).toBe("ROLE_WRITE_VIOLATION");
  });

  it("an edit role writing inside the boundary is allowed", () => {
    const result = detectRoleWriteViolations({ context: ctx("implementer", ["src/**"]), changedFiles: ["src/feature.ts"], allowedGlobs: ["src/**"], config });
    expect(result.violations).toHaveLength(0);
    expect(result.recommended_disposition).toBe("none");
  });

  it("an edit role writing outside the boundary is out_of_boundary_product_write", () => {
    const result = detectRoleWriteViolations({ context: ctx("implementer", ["src/feature/**"]), changedFiles: ["src/other.ts"], allowedGlobs: ["src/feature/**"], config });
    expect(result.violations[0]?.disposition).toBe("out_of_boundary_product_write");
  });

  it("ignored paths are not violations", () => {
    const result = detectRoleWriteViolations({ context: ctx("reviewer", ["src/**"]), changedFiles: ["node_modules/x/index.js"], allowedGlobs: ["src/**"], config });
    expect(result.violations).toHaveLength(0);
  });

  it("an unexpected path is flagged", () => {
    const result = detectRoleWriteViolations({ context: ctx("implementer", ["src/**"]), changedFiles: ["weird/thing.bin"], allowedGlobs: ["src/**"], config });
    expect(result.violations[0]?.disposition).toBe("unexpected_path");
  });

  it("ignored governed paths are not product-write violations", () => {
    const result = detectRoleWriteViolations({ context: ctx("reviewer", ["src/**"]), changedFiles: [".spec-guard/work/x.json"], allowedGlobs: ["src/**"], config });
    expect(result.violations).toHaveLength(0);
    expect(result.classifications[0]?.category).toBeNull(); // default config ignores .spec-guard
  });

  it("governed-evidence paths are not product violations even when not ignored (governed branch)", () => {
    // Diverge the path policy so .spec-guard classifies as spec_guard_artifact_evidence, not ignored.
    const divergent = { ...config, path_policy: { ...config.path_policy, ignored_paths: ["node_modules/**", ".git/**"] } };
    const result = detectRoleWriteViolations({ context: ctx("reviewer", ["src/**"]), changedFiles: [".spec-guard/work/x.json"], allowedGlobs: ["src/**"], config: divergent });
    expect(result.violations).toHaveLength(0);
    expect(result.classifications[0]?.category).toBe("spec_guard_artifact_evidence");
  });
});

describe("M3 BackendTaskEnvelope", () => {
  it("parses a valid envelope and rejects unknown keys", () => {
    const envelope = {
      task_id: "t1",
      role: "reviewer",
      template_id: "focused_implementation_review_v1",
      template_version: 1,
      input_refs: ["ref:1"],
      allowed_capabilities: ctx("reviewer", []),
      expected_output_schema: "review_cycle_v1",
      requested_role_identity: { principal_id: null, agent_instance_id: "sg-role-reviewer" },
      observed_producer_identity: null,
      identity_attestation: "logical_role_trust_boundary",
      timeout_ms: 60000,
      retry_policy: "none"
    };
    expect(BackendTaskEnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(BackendTaskEnvelopeSchema.safeParse({ ...envelope, extra: true }).success).toBe(false);
  });
});
