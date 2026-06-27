import { describe, it, expect } from "vitest";
import { evaluatePreEditHook, buildDefaultRoleConfig } from "../src/index.ts";
import { buildAggregate } from "./helpers/aggregate-fixture.ts";

describe("pre-edit gate policy (the wall that stops coordinator-edits-product-code)", () => {
  const packets = [buildAggregate("WP1")]; // one Spec, scope.allowed_globs = ["src/**"]
  const roleConfig = buildDefaultRoleConfig();
  const evalEdit = (tool_name: string, edited_paths: string[], agent_type: string | null) => evaluatePreEditHook({ tool_name, edited_paths, agent_type }, packets, roleConfig);

  it("DENIES the coordinator / main session (no agent_type) editing product code under a Spec's scope", () => {
    const decision = evalEdit("Write", ["src/index.ts"], null);
    expect(decision.decision).toBe("deny");
    expect(decision.governed_paths).toContain("src/index.ts");
  });

  it("ALLOWS the edit-capable implementer/fixer subagents to edit product code", () => {
    expect(evalEdit("Edit", ["src/index.ts"], "spec-guard-implementer").decision).toBe("allow");
    expect(evalEdit("Edit", ["src/index.ts"], "spec-guard-fixer").decision).toBe("allow");
  });

  it("DENIES a read-only subagent (reviewer) editing product code", () => {
    expect(evalEdit("Edit", ["src/index.ts"], "spec-guard-reviewer").decision).toBe("deny");
  });

  it("ALLOWS edits OUTSIDE any Spec's scope regardless of actor (scaffold/config/governance)", () => {
    expect(evalEdit("Write", ["package.json"], null).decision).toBe("allow");
    expect(evalEdit("Write", ["README.md"], "spec-guard-reviewer").decision).toBe("allow");
  });

  it("ALLOWS non-edit tools (Bash, etc.)", () => {
    expect(evalEdit("Bash", ["src/index.ts"], null).decision).toBe("allow");
  });
});
