import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { executeAction } from "../src/index.ts";

describe("release readiness hardening", () => {
  it("root scripts and package metadata are coherent", async () => {
    const rootPackage = JSON.parse(await readFile("package.json", "utf8"));
    expect(rootPackage.workspaces).toContain("packages/*");
    expect(rootPackage.engines.node).toBe(">=24");
    for (const script of ["build", "test", "typecheck", "lint"]) expect(rootPackage.scripts[script]).toBeTypeOf("string");
    expect(rootPackage.bin["spec-guard"]).toBe("packages/cli/dist/index.js");
    expect(rootPackage.bin["spec-guard-mcp"]).toBe("packages/mcp/dist/index.js");

    const corePackage = JSON.parse(await readFile("packages/core/package.json", "utf8"));
    const cliPackage = JSON.parse(await readFile("packages/cli/package.json", "utf8"));
    const mcpPackage = JSON.parse(await readFile("packages/mcp/package.json", "utf8"));
    const viewerPackage = JSON.parse(await readFile("packages/viewer/package.json", "utf8"));
    expect(corePackage.exports["."].import).toBe("./dist/index.js");
    expect(cliPackage.bin["spec-guard"]).toBe("dist/index.js");
    expect(mcpPackage.bin["spec-guard-mcp"]).toBe("dist/index.js");
    expect(viewerPackage.exports["."].import).toBe("./dist/server.js");
  });

  it("validate.parity includes release-readiness checks and passes", async () => {
    const result = await executeAction("validate.parity", {});
    expect(result.ok).toBe(true);
    expect(result.action_id).toBe("validate.parity");
    expect(result.data.release_readiness_checks).toEqual({
      action_result_schema_compatible: true,
      generated_pi_factory_loadable_contract: true,
      mcp_tool_names_valid: true,
      viewer_serve_action_available: true,
      config_check_dashboard_summary_shared: true
    });
  });
});
