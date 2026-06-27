import { randomUUID } from "node:crypto";
import { z } from "zod";
import { SourceArtifactSchema, type SourceArtifact } from "../schemas/artifacts.ts";
import { JsonValueSchema, Sha256HexSchema, SourceArtifactRefSchema, type SourceArtifactRef } from "../schemas/embedded.ts";
import { materializeSourceArtifactContent } from "../source-artifacts/content.ts";
import { diagnostic, failureResult, isoNow, storeForContext } from "./config.ts";
import type { ActionExecutionContext } from "./context.ts";
import type { ActionResult } from "./result.ts";

const DescriptorSchema = z.record(z.string(), JsonValueSchema);

export const SourceArtifactRegisterInputSchema = z.object({
  id: z.string().min(1).optional(),
  kind: z.string().min(1),
  label: z.string().min(1),
  locator: z.string().nullable().optional(),
  content_bytes_base64: z.string().nullable().optional(),
  descriptor: DescriptorSchema.nullable().optional(),
  content_hash: Sha256HexSchema.nullable().optional(),
  source_interface: z.string().min(1).optional()
}).strict();

export const SourceArtifactUpdateInputSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  locator: z.string().nullable().optional(),
  content_bytes_base64: z.string().nullable().optional(),
  descriptor: DescriptorSchema.nullable().optional(),
  content_hash: Sha256HexSchema.nullable().optional(),
  source_interface: z.string().min(1).optional()
}).strict();

export const SourceArtifactGetInputSchema = z.object({
  id: z.string().min(1).optional(),
  revision: z.number().int().positive().optional(),
  content_hash: Sha256HexSchema.optional(),
  ref: SourceArtifactRefSchema.optional(),
  include_full: z.boolean().optional()
}).strict().superRefine((value, ctx) => {
  if (value.id === undefined && value.ref === undefined) ctx.addIssue({ code: "custom", path: ["id"], message: "source_artifact.get requires id or ref" });
});

export const SourceArtifactListInputSchema = z.object({}).strict();

export async function resolveSourceArtifactRef(ref: SourceArtifactRef, context: ActionExecutionContext = {}): Promise<void> {
  const store = storeForContext(context);
  if (ref.artifact_type === "source_artifact") {
    const revision = await store.readRevision<SourceArtifact>("source_artifact", ref.id, ref.revision);
    const artifact = SourceArtifactSchema.parse(revision.governed_projection);
    if (artifact.content_hash !== ref.content_hash) throw new Error(`source_artifact content_hash mismatch for ${ref.id}@${ref.revision}`);
    return;
  }
  await store.readRevision(ref.artifact_type, ref.id, ref.revision);
}

export async function sourceArtifactRegister(input: z.infer<typeof SourceArtifactRegisterInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult<{ source_artifact: SourceArtifact; ref: SourceArtifactRef }>> {
  const store = storeForContext(context);
  try {
    const parsed = SourceArtifactRegisterInputSchema.parse(input);
    const materialized = await materializeSourceArtifactContent(parsed, store.root);
    const now = isoNow();
    const artifact = SourceArtifactSchema.parse({
      artifact_type: "source_artifact",
      schema_version: 1,
      id: parsed.id ?? `source:${randomUUID()}`,
      revision: 1,
      created_at: now,
      updated_at: now,
      kind: parsed.kind,
      label: parsed.label,
      locator: parsed.locator ?? null,
      content_ref: materialized.content_ref,
      content_hash: materialized.content_hash,
      descriptor: materialized.descriptor,
      captured_at: now,
      source_interface: parsed.source_interface ?? "core",
      diagnostics: []
    });
    const created = await store.create(artifact);
    const ref: SourceArtifactRef = { artifact_type: "source_artifact", id: artifact.id, revision: created.revision, content_hash: artifact.content_hash };
    return { ok: true, action_id: "source_artifact.register", data: { source_artifact: created.artifact, ref }, diagnostics: [], mutations: [{ artifact: "source_artifact", operation: "create", paths: [`/source_artifact/${artifact.id}`], summary: "Registered immutable SourceArtifact revision 1." }], next_actions: [], summary: "Source artifact registered." };
  } catch (error) {
    return failureResult("source_artifact.register", "Source artifact registration rejected.", [diagnostic("SOURCE_ARTIFACT_REGISTER_REJECTED", error instanceof Error ? error.message : String(error), "error", "/source_artifact")]) as ActionResult<{ source_artifact: SourceArtifact; ref: SourceArtifactRef }>;
  }
}

export async function sourceArtifactUpdate(input: z.infer<typeof SourceArtifactUpdateInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult<{ source_artifact: SourceArtifact; ref: SourceArtifactRef }>> {
  const store = storeForContext(context);
  try {
    const parsed = SourceArtifactUpdateInputSchema.parse(input);
    const current = SourceArtifactSchema.parse((await store.readCurrent<SourceArtifact>("source_artifact", parsed.id)).artifact);
    const materialized = await materializeSourceArtifactContent(parsed, store.root);
    const now = isoNow();
    const candidate = SourceArtifactSchema.parse({
      ...current,
      kind: parsed.kind ?? current.kind,
      label: parsed.label ?? current.label,
      locator: Object.prototype.hasOwnProperty.call(parsed, "locator") ? parsed.locator ?? null : current.locator,
      content_ref: materialized.content_ref,
      content_hash: materialized.content_hash,
      descriptor: materialized.descriptor,
      captured_at: now,
      source_interface: parsed.source_interface ?? current.source_interface,
      updated_at: now
    });
    const updated = await store.update(candidate);
    const ref: SourceArtifactRef = { artifact_type: "source_artifact", id: parsed.id, revision: updated.revision, content_hash: candidate.content_hash };
    return { ok: true, action_id: "source_artifact.update", data: { source_artifact: updated.artifact, ref }, diagnostics: [], mutations: [{ artifact: "source_artifact", operation: "update", paths: [`/source_artifact/${parsed.id}`], summary: `Created immutable SourceArtifact revision ${updated.revision}.` }], next_actions: [], summary: "Source artifact updated." };
  } catch (error) {
    return failureResult("source_artifact.update", "Source artifact update rejected.", [diagnostic("SOURCE_ARTIFACT_UPDATE_REJECTED", error instanceof Error ? error.message : String(error), "error", "/source_artifact")]) as ActionResult<{ source_artifact: SourceArtifact; ref: SourceArtifactRef }>;
  }
}

export async function sourceArtifactGet(input: z.infer<typeof SourceArtifactGetInputSchema>, context: ActionExecutionContext = {}): Promise<ActionResult<{ source_artifact: SourceArtifact; ref: SourceArtifactRef }>> {
  const store = storeForContext(context);
  try {
    const parsed = SourceArtifactGetInputSchema.parse(input);
    const id = parsed.ref?.id ?? parsed.id;
    if (id === undefined || id === null) throw new Error("source_artifact.get requires source artifact id");
    const revision = parsed.ref?.revision ?? parsed.revision;
    const expectedHash = parsed.ref?.content_hash ?? parsed.content_hash;
    const artifact = revision === undefined
      ? SourceArtifactSchema.parse((await store.readCurrent<SourceArtifact>("source_artifact", id)).artifact)
      : SourceArtifactSchema.parse((await store.readRevision<SourceArtifact>("source_artifact", id, revision)).governed_projection);
    if (expectedHash !== undefined && artifact.content_hash !== expectedHash) throw new Error("content_hash mismatch");
    const ref: SourceArtifactRef = { artifact_type: "source_artifact", id: artifact.id, revision: artifact.revision, content_hash: artifact.content_hash };
    return { ok: true, action_id: "source_artifact.get", data: { source_artifact: artifact, ref }, diagnostics: [], mutations: [{ artifact: "source_artifact", operation: "none", paths: [], summary: "Resolved SourceArtifact revision." }], next_actions: [], summary: "Source artifact resolved." };
  } catch (error) {
    return failureResult("source_artifact.get", "Source artifact could not be resolved.", [diagnostic("SOURCE_ARTIFACT_GET_REJECTED", error instanceof Error ? error.message : String(error), "error", "/source_artifact")]) as ActionResult<{ source_artifact: SourceArtifact; ref: SourceArtifactRef }>;
  }
}

export async function sourceArtifactList(input: z.infer<typeof SourceArtifactListInputSchema> = {}, context: ActionExecutionContext = {}): Promise<ActionResult<{ source_artifacts: SourceArtifact[] }>> {
  SourceArtifactListInputSchema.parse(input);
  try {
    const entries = await storeForContext(context).listCurrent<SourceArtifact>();
    const source_artifacts = entries.filter((entry) => entry.artifact_type === "source_artifact").map((entry) => SourceArtifactSchema.parse(entry.artifact));
    return { ok: true, action_id: "source_artifact.list", data: { source_artifacts }, diagnostics: [], mutations: [{ artifact: "source_artifact", operation: "none", paths: [], summary: "Listed current SourceArtifacts." }], next_actions: [], summary: "Source artifacts listed." };
  } catch (error) {
    return failureResult("source_artifact.list", "Source artifacts could not be listed.", [diagnostic("SOURCE_ARTIFACT_LIST_REJECTED", error instanceof Error ? error.message : String(error), "error", "/source_artifact")]) as ActionResult<{ source_artifacts: SourceArtifact[] }>;
  }
}
