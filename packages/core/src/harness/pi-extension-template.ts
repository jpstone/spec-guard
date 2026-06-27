import { buildPiToolDefinitions, PI_EXTENSION_TOOL_NAMES } from "./tool-generation.ts";

export { PI_EXTENSION_TOOL_NAMES };

export interface PiExtensionTemplateOptions {
  projectRoot: string;
  artifactRoot: string;
  coreModuleFallbackSpecifier?: string;
}

function defaultCoreModuleFallbackSpecifier(): string {
  return new URL("../index.ts", import.meta.url).href;
}

export function renderPiExtension(options: PiExtensionTemplateOptions): string {
  const coreModuleFallbackSpecifier = options.coreModuleFallbackSpecifier ?? defaultCoreModuleFallbackSpecifier();
  const tools = buildPiToolDefinitions().map((tool) => ({
    name: tool.name,
    label: tool.title,
    actionId: tool.action_id,
    description: tool.description,
    parameters: tool.input_schema
  }));
  return `type ExtensionAPILike = { registerTool(definition: unknown): void };
type ExtensionContextLike = { cwd?: string } | undefined;

const tools = ${JSON.stringify(tools, null, 2)} as const;

const generatedProjectRoot = ${JSON.stringify(options.projectRoot)};
const generatedArtifactRoot = ${JSON.stringify(options.artifactRoot)};
const coreModuleSpecifiers = ["@spec-guard/core", ${JSON.stringify(coreModuleFallbackSpecifier)}] as const;

async function loadSpecGuardCore() {
  let lastError: unknown;
  for (const specifier of coreModuleSpecifiers) {
    try {
      return await import(specifier);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function runSpecGuardAction(actionId: string, input: unknown, _ctx: ExtensionContextLike) {
  const core = await loadSpecGuardCore();
  return core.executeActionForAgent(actionId, input && typeof input === "object" ? input as Record<string, unknown> : {}, {
    projectRoot: generatedProjectRoot,
    artifactRoot: generatedArtifactRoot
  });
}

export default function (pi: ExtensionAPILike) {
  for (const tool of tools) {
    pi.registerTool({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      promptSnippet: tool.description,
      promptGuidelines: [
        "Use Spec Guard tools directly; call spec_guard_mcp_status or spec_guard_mcp_quickstart first.",
        "Do not substitute CLI workflow commands for MCP/Pi tools except bootstrap/init.",
        "Human-gated fields require actual human responses: selected_number, raw_response, decision_prompt, human_confirmed.",
        "Preserve Discuss semantics and fixed numbered gates; Discuss is non-mutating unless a specific action says otherwise.",
        "Review-bound gates must preserve snapshot hash/revision and source_artifact_refs/source refs exactly."
      ],
      parameters: tool.parameters,
      inputSchema: tool.parameters,
      async execute(_toolCallId: string, params: unknown, _signal?: AbortSignal, _onUpdate?: unknown, ctx?: ExtensionContextLike) {
        const result = await runSpecGuardAction(tool.actionId, params, ctx);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: { result }
        };
      }
    });
  }
}
`;
}
