import type { Diagnostic } from "../schemas/embedded.ts";
import type { ProducerIdentity } from "../role-loop/human-decision.ts";
import { subagentPermissionMode, type BackendTaskEnvelope, type IdentityAttestation } from "../harness/role-execution.ts";
import { getTemplate, TEMPLATE_IDS, type TemplateId } from "../templates/registry.ts";
import type { SubagentAdapter } from "./adapter.ts";

/** M8: dispatch one BackendTaskEnvelope to a subagent adapter. Renders the envelope into a prompt via
 * the M5 template, runs the adapter under the M3 permission mode, parses the final message into the
 * role's compact record, and records the authoritative producer identity (never the model's claim). */

export function renderEnvelopePrompt(envelope: BackendTaskEnvelope): string {
  const template = getTemplate(envelope.template_id as TemplateId, envelope.template_version);
  return [
    `# Role: ${envelope.role}`,
    `# Template: ${template.template_id} v${template.template_version} — ${template.title}`,
    ...template.sections,
    `# Inputs (resolve by ref): ${envelope.input_refs.join(", ")}`,
    `# Expected output: ${envelope.expected_output_schema}. Emit exactly one JSON object as your final message.`
  ].join("\n");
}

/** Extract the role's compact record from the subagent's free-form final message: a fenced ```json
 * block if present, else the outermost {...}. Returns null if no JSON object is found. */
export function extractJsonObject(message: string): Record<string, unknown> | null {
  const fence = message.match(/```json\s*([\s\S]*?)```/i);
  let candidate: string | null = fence?.[1] ?? null;
  if (candidate === null) {
    const start = message.indexOf("{");
    const end = message.lastIndexOf("}");
    candidate = start >= 0 && end > start ? message.slice(start, end + 1) : null;
  }
  if (candidate === null) return null;
  try {
    const value: unknown = JSON.parse(candidate);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface DispatchResult {
  ok: boolean;
  parsed_output: Record<string, unknown> | null;
  observed_producer_identity: ProducerIdentity;
  identity_attestation: IdentityAttestation;
  diagnostics: Diagnostic[];
}

export async function dispatchBackendTask(input: { envelope: BackendTaskEnvelope; adapter: SubagentAdapter; cwd: string; model: string | null }): Promise<DispatchResult> {
  if (!(TEMPLATE_IDS as readonly string[]).includes(input.envelope.template_id)) {
    return { ok: false, parsed_output: null, observed_producer_identity: input.envelope.requested_role_identity, identity_attestation: "unknown", diagnostics: [{ code: "BACKEND_TEMPLATE_UNKNOWN", severity: "error", message: `Unknown template id: ${input.envelope.template_id}`, field_path: null, gate: null, fix: "Reference a registered prompt template." }] };
  }
  const prompt = renderEnvelopePrompt(input.envelope);
  const permission_mode = subagentPermissionMode(input.envelope.allowed_capabilities);
  const run = await input.adapter.run({ prompt, permission_mode, model: input.model, cwd: input.cwd, timeout_ms: input.envelope.timeout_ms });

  const diagnostics: Diagnostic[] = [...run.diagnostics];
  const parsed = extractJsonObject(run.final_message);
  if (parsed === null) diagnostics.push({ code: "BACKEND_OUTPUT_UNPARSEABLE", severity: "error", message: "Subagent final message did not contain a parseable JSON record.", field_path: null, gate: null, fix: "Have the role emit exactly one JSON object as its final message." });

  // Governed records use the harness/provider-attested identity, never the model's self-claim. Under a
  // logical trust boundary (same-account subagent), record the requested role identity (the stable
  // logical instance), NOT whatever the adapter/model reported.
  const observed = run.identity_attestation === "harness_captured" || run.identity_attestation === "provider_attested"
    ? run.observed_identity
    : input.envelope.requested_role_identity;

  return { ok: run.ok && parsed !== null, parsed_output: parsed, observed_producer_identity: observed, identity_attestation: run.identity_attestation, diagnostics };
}
