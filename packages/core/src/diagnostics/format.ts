import type { Diagnostic } from "../schemas/embedded.ts";

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const field = diagnostic.field_path ? ` field=${diagnostic.field_path}` : "";
  const gate = diagnostic.gate ? ` gate=${diagnostic.gate}` : "";
  const fix = diagnostic.fix ? ` fix=${diagnostic.fix}` : "";
  return `[${diagnostic.severity}] ${diagnostic.code}:${field}${gate} ${diagnostic.message}${fix}`.trim();
}

export function summarizeDiagnostics(diagnostics: Diagnostic[]): { errors: number; warnings: number; infos: number } {
  return {
    errors: diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
    warnings: diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
    infos: diagnostics.filter((diagnostic) => diagnostic.severity === "info").length
  };
}
