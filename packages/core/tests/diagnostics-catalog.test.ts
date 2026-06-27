import { describe, expect, it } from "vitest";
import { catalogDiagnostic, diagnosticCatalog, requiredDiagnosticCategories } from "../src/index.ts";

describe("diagnostic catalog", () => {
  it("covers required Milestone 12 diagnostic categories with stable codes", () => {
    const categories = new Set(diagnosticCatalog.map((entry) => entry.category));
    for (const category of requiredDiagnosticCategories) expect(categories.has(category)).toBe(true);
    expect(diagnosticCatalog.map((entry) => entry.code)).toEqual([...new Set(diagnosticCatalog.map((entry) => entry.code))]);
  });

  it("creates schema-compatible actionable diagnostics", () => {
    const diagnostic = catalogDiagnostic("MIGRATION_BASELINE_ACCEPTANCE_NOT_FABRICATED");
    expect(diagnostic).toMatchObject({ code: "MIGRATION_BASELINE_ACCEPTANCE_NOT_FABRICATED", severity: "warning" });
    expect(diagnostic.message.length).toBeGreaterThan(20);
  });
});
