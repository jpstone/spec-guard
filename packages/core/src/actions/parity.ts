import { z } from "zod";
import type { Diagnostic } from "../schemas/embedded.ts";
import type { ActionExecutionContext } from "./context.ts";
import type { ActionResult } from "./result.ts";
import { diagnostic } from "./config.ts";
import { ActionResultSchema } from "./result.ts";
import { foundationalActionRegistry } from "./registry.ts";
import type { ActionRegistryMetadata } from "./registry.ts";
import { buildMcpToolDefinitions, buildPiToolDefinitions, type GeneratedActionToolDefinition } from "../harness/tool-generation.ts";
import { humanConfirmationDescriptionTerms, reviewBoundDescriptionTerms, specGuardToolName } from "../harness/tool-descriptions.ts";

export const ValidateParityInputSchema = z.object({}).strict();

export interface ParityValidationInput {
  actions: ActionRegistryMetadata[];
  mcpTools: GeneratedActionToolDefinition[];
  piTools: GeneratedActionToolDefinition[];
}

export interface ParityValidationReport {
  expected_tools: string[];
  mcp_tools: string[];
  pi_tools: string[];
  missing_mcp_tools: string[];
  extra_mcp_tools: string[];
  missing_pi_tools: string[];
  extra_pi_tools: string[];
  schema_gaps: string[];
  description_gaps: string[];
  human_gated_description_gaps: string[];
  review_bound_description_gaps: string[];
  release_readiness_checks: {
    action_result_schema_compatible: boolean;
    generated_pi_factory_loadable_contract: boolean;
    mcp_tool_names_valid: boolean;
    viewer_serve_action_available: boolean;
    config_check_dashboard_summary_shared: boolean;
  };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function findMissing(expected: string[], actual: string[]): string[] {
  const actualSet = new Set(actual);
  return expected.filter((name) => !actualSet.has(name));
}

function findExtra(expected: string[], actual: string[]): string[] {
  const expectedSet = new Set(expected);
  return actual.filter((name) => !expectedSet.has(name));
}

function hasAllTerms(description: string, terms: string[]): boolean {
  const lower = description.toLowerCase();
  return terms.every((term) => lower.includes(term.toLowerCase()));
}

function toolByName(tools: GeneratedActionToolDefinition[]): Map<string, GeneratedActionToolDefinition> {
  return new Map(tools.map((tool) => [tool.name, tool]));
}

export function validateParityDefinitions(input: ParityValidationInput): ParityValidationReport {
  const actions = input.actions.filter((metadata) => metadata.exposed_via.includes("mcp")).sort((a, b) => a.id.localeCompare(b.id));
  const expectedTools = actions.map((metadata) => specGuardToolName(metadata.id)).sort();
  const mcpTools = input.mcpTools.map((tool) => tool.name).sort();
  const piTools = input.piTools.map((tool) => tool.name).sort();
  const mcpByName = toolByName(input.mcpTools);
  const piByName = toolByName(input.piTools);

  const schemaGaps: string[] = [];
  const descriptionGaps: string[] = [];
  const humanGatedDescriptionGaps: string[] = [];
  const reviewBoundDescriptionGaps: string[] = [];

  const generatedExpected = buildMcpToolDefinitions();
  const expectedByName = toolByName(generatedExpected);
  for (const action of actions) {
    const name = specGuardToolName(action.id);
    for (const [surface, byName] of [["mcp", mcpByName], ["pi", piByName]] as const) {
      const actual = byName.get(name);
      if (!actual) continue;
      const expected = expectedByName.get(name);
      if (!expected || stable(actual.input_schema) !== stable(expected.input_schema)) schemaGaps.push(`${surface}:${name}:input_schema`);
      if (!actual.description || actual.description.trim().length < 20) descriptionGaps.push(`${surface}:${name}:description`);
      if (action.human_gated && !hasAllTerms(actual.description, humanConfirmationDescriptionTerms())) humanGatedDescriptionGaps.push(`${surface}:${name}:human_confirmation_fields`);
      if (action.review_bound && !hasAllTerms(actual.description, reviewBoundDescriptionTerms())) reviewBoundDescriptionGaps.push(`${surface}:${name}:review_snapshot_source_refs`);
    }
  }

  return {
    expected_tools: expectedTools,
    mcp_tools: mcpTools,
    pi_tools: piTools,
    missing_mcp_tools: findMissing(expectedTools, mcpTools),
    extra_mcp_tools: findExtra(expectedTools, mcpTools),
    missing_pi_tools: findMissing(expectedTools, piTools),
    extra_pi_tools: findExtra(expectedTools, piTools),
    schema_gaps: schemaGaps,
    description_gaps: descriptionGaps,
    human_gated_description_gaps: humanGatedDescriptionGaps,
    review_bound_description_gaps: reviewBoundDescriptionGaps,
    release_readiness_checks: {
      action_result_schema_compatible: ActionResultSchema.safeParse({ ok: true, action_id: "validate.parity", data: {}, diagnostics: [], mutations: [], next_actions: [], summary: "schema smoke" }).success,
      generated_pi_factory_loadable_contract: piTools.length === expectedTools.length && piTools.every((name) => name.startsWith("spec_guard_")),
      mcp_tool_names_valid: mcpTools.every((name) => /^spec_guard_[a-z0-9_]+$/.test(name)),
      viewer_serve_action_available: input.actions.some((action) => action.id === "serve.viewer" && action.exposed_via.includes("cli") && !action.exposed_via.includes("mcp")),
      config_check_dashboard_summary_shared: input.actions.some((action) => action.id === "config.check")
    }
  };
}

function diagnosticsForReport(report: ParityValidationReport): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const pushList = (code: string, message: string, values: string[]) => {
    if (values.length > 0) diagnostics.push(diagnostic(code, `${message}: ${values.join(", ")}`, "error"));
  };
  pushList("PARITY_MISSING_MCP_TOOLS", "Missing MCP tools", report.missing_mcp_tools);
  pushList("PARITY_EXTRA_MCP_TOOLS", "Extra MCP tools", report.extra_mcp_tools);
  pushList("PARITY_MISSING_PI_TOOLS", "Missing Pi tools", report.missing_pi_tools);
  pushList("PARITY_EXTRA_PI_TOOLS", "Extra Pi tools", report.extra_pi_tools);
  pushList("PARITY_SCHEMA_GAPS", "Schema exposure gaps", report.schema_gaps);
  pushList("PARITY_DESCRIPTION_GAPS", "Description exposure gaps", report.description_gaps);
  pushList("PARITY_HUMAN_GATED_DESCRIPTION_GAPS", "Human-gated descriptions missing obvious confirmation fields", report.human_gated_description_gaps);
  pushList("PARITY_REVIEW_BOUND_DESCRIPTION_GAPS", "Review-bound descriptions missing snapshot/source refs", report.review_bound_description_gaps);
  for (const [check, passed] of Object.entries(report.release_readiness_checks)) {
    if (!passed) diagnostics.push(diagnostic("RELEASE_READINESS_CHECK_FAILED", `Release readiness check failed: ${check}`, "error"));
  }
  return diagnostics;
}

export async function validateParity(input: z.infer<typeof ValidateParityInputSchema> = {}, _context: ActionExecutionContext = {}): Promise<ActionResult> {
  ValidateParityInputSchema.parse(input);
  const report = validateParityDefinitions({
    actions: foundationalActionRegistry.list(),
    mcpTools: buildMcpToolDefinitions(),
    piTools: buildPiToolDefinitions()
  });
  const diagnostics = diagnosticsForReport(report);
  return {
    ok: diagnostics.length === 0,
    action_id: "validate.parity",
    data: report as unknown as Record<string, unknown>,
    diagnostics,
    mutations: [{ artifact: "registry", operation: "none", paths: [], summary: "Compared action registry with generated MCP and Pi tool definitions without mutation." }],
    next_actions: diagnostics.length === 0 ? [
      { action_id: "mcp.status", cli: "spec-guard mcp status --json", mcp: "spec_guard_mcp_status", reason: "Inspect persisted project status before workflow actions.", suggested_input: null }
    ] : [
      { action_id: "validate.parity", cli: "spec-guard validate parity --json", mcp: "spec_guard_validate_parity", reason: "Re-run after fixing tool generation parity gaps.", suggested_input: null }
    ],
    summary: diagnostics.length === 0 ? "MCP/Pi registry parity validated." : "MCP/Pi registry parity gaps found."
  };
}
