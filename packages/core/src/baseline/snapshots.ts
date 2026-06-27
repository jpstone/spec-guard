import { canonicalJson } from "../canonical/canonical-json.ts";
import { normalizeSourceArtifactRefs } from "../canonical/source-refs.ts";
import { BaselineReviewSnapshotPayloadSchema, type BaselineReviewSnapshotPayload } from "../schemas/snapshots.ts";
import type { SourceArtifactRef } from "../schemas/embedded.ts";
import type { RuntimeBaseline } from "../schemas/artifacts.ts";
import { buildEphemeralSnapshotIdentity } from "../snapshots/revisions.ts";
import { validateRuntimeBaseline, type BaselineValidationReport } from "./validation.ts";

export interface BaselineReviewSnapshot {
  payload: BaselineReviewSnapshotPayload;
  snapshot_hash: string;
  snapshot_revision: string;
  source_artifact_refs: SourceArtifactRef[];
  rendered_summary: string;
  validation: BaselineValidationReport;
}

export function baselineReviewPayload(baseline: RuntimeBaseline): BaselineReviewSnapshotPayload {
  return BaselineReviewSnapshotPayloadSchema.parse({
    stack: baseline.stack,
    commands: baseline.commands,
    configuration: baseline.configuration,
    dependency_modes: baseline.dependency_modes,
    diff_policy: baseline.diff_policy,
    validation: baseline.validation
  });
}

export function baselineSourceRefs(baseline: RuntimeBaseline): SourceArtifactRef[] {
  return normalizeSourceArtifactRefs([{ artifact_type: "runtime_baseline", id: null, revision: baseline.revision }]);
}

export function createBaselineReviewSnapshot(baseline: RuntimeBaseline, validationOverride?: BaselineValidationReport): BaselineReviewSnapshot {
  const payload = baselineReviewPayload(baseline);
  const source_artifact_refs = baselineSourceRefs(baseline);
  const identity = buildEphemeralSnapshotIdentity(payload, source_artifact_refs);
  const validation = validationOverride ?? validateRuntimeBaseline(baseline);
  return {
    payload,
    snapshot_hash: identity.snapshot_hash,
    snapshot_revision: identity.snapshot_revision,
    source_artifact_refs,
    rendered_summary: `Runtime baseline revision ${baseline.revision} (${baseline.status}) is ${validation.acceptance_ready ? "ready" : "not ready"} for acceptance.\n${validation.diagnostics.map((d) => `- ${d.code}: ${d.message}`).join("\n")}`.trim(),
    validation
  };
}

export function sourceRefsEqual(a: unknown[], b: unknown[]): boolean {
  return canonicalJson(normalizeSourceArtifactRefs(a)) === canonicalJson(normalizeSourceArtifactRefs(b));
}
