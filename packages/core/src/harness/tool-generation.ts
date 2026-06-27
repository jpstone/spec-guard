import { z } from "zod";
import { foundationalActionRegistry, type ActionRegistryMetadata } from "../actions/registry.ts";
import { buildToolDescription, specGuardToolName } from "./tool-descriptions.ts";

export interface GeneratedActionToolDefinition {
  action_id: string;
  name: string;
  title: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  mutability: ActionRegistryMetadata["mutability"];
  human_gated: boolean;
  review_bound: boolean;
}

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
}

export function implementedMcpActionMetadata(registry = foundationalActionRegistry): ActionRegistryMetadata[] {
  return registry.list().filter((metadata) => metadata.exposed_via.includes("mcp"));
}

export function buildActionToolDefinition(metadata: ActionRegistryMetadata): GeneratedActionToolDefinition {
  return {
    action_id: metadata.id,
    name: specGuardToolName(metadata.id),
    title: metadata.title,
    description: buildToolDescription(metadata),
    input_schema: toJsonSchema(metadata.input_schema),
    output_schema: toJsonSchema(metadata.output_schema),
    mutability: metadata.mutability,
    human_gated: metadata.human_gated,
    review_bound: metadata.review_bound
  };
}

export function buildMcpToolDefinitions(registry = foundationalActionRegistry): GeneratedActionToolDefinition[] {
  return implementedMcpActionMetadata(registry).map(buildActionToolDefinition).sort((a, b) => a.name.localeCompare(b.name));
}

export function buildPiToolDefinitions(registry = foundationalActionRegistry): GeneratedActionToolDefinition[] {
  return buildMcpToolDefinitions(registry);
}

export const PI_EXTENSION_TOOL_NAMES = buildPiToolDefinitions().map((tool) => tool.name);
