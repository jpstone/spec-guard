import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { foundationalActionRegistry, specGuardToolName } from "../src/index.ts";

describe("release traceability docs", () => {
  it("include spec traceability references to implementation modules and tests", async () => {
    const doc = await readFile("docs/spec-traceability.md", "utf8");
    for (const required of ["18 Diagnostics", "20 Migration", "Appendix B", "packages/core/src/storage/migration.ts", "packages/core/tests/migration.test.ts"]) {
      expect(doc).toContain(required);
    }
  });

  it("action registry docs include every implemented registry action and generated MCP/Pi tool names", async () => {
    const doc = await readFile("docs/action-registry.md", "utf8");
    for (const action of foundationalActionRegistry.list()) {
      expect(doc).toContain(`\`${action.id}\``);
      if (action.exposed_via.includes("mcp")) {
        const toolName = specGuardToolName(action.id);
        expect(doc).toContain(`\`${toolName}\``);
      } else {
        const row = doc.split("\n").find((line) => line.includes(`\`${action.id}\``));
        expect(row).toContain("not exposed");
      }
    }
  });

  it("release checklist exists with required command checks", async () => {
    const doc = await readFile("docs/release-checklist.md", "utf8");
    expect(doc).toContain("npm test");
    expect(doc).toContain("npm run typecheck");
    expect(doc).toContain("validate.parity");
  });
});
