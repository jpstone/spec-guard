import { z } from "zod";
import { Sha256HexSchema, type Diagnostic } from "../schemas/embedded.ts";
import { WorkClassificationSchema } from "../schemas/enums.ts";
import type { WorkPacket } from "../schemas/artifacts.ts";
import { sha256CanonicalJson } from "./canonical-hash.ts";
import {
  APPROVAL_PROJECTION_VERSION_V1,
  CONFIG_PROJECTION_V1,
  HASH_ALGORITHM_V1,
  SCHEMA_VERSION_V1,
  type SpecGuardPolicyConfigProjectionV1
} from "./constants.ts";
import {
  AcceptanceCriterionProjectionV1Schema,
  ApprovedArchitectureProjectionV1Schema,
  ApprovedStackProjectionV1Schema,
  ApprovedDocsPolicyProjectionV1Schema,
  ApprovedPlatformProjectionV1Schema,
  RuntimeBaselineRefProjectionV1Schema,
  WorkPacketIntentProjectionV1Schema,
  buildArchitectureProjectionV1,
  buildStackProjectionV1,
  buildDocsPolicyProjectionV1,
  buildIntentProjectionV1,
  buildPlatformProjectionV1,
  buildRuntimeBaselineRefProjectionV1
} from "./nested-projections.ts";
import {
  ApprovedWorkKindResolutionProjectionV1Schema,
  resolveWorkKind,
  workKindResolutionHash
} from "./work-kind.ts";
import {
  ApprovedImplementationPlanProjectionV1Schema,
  implementationPlanHash
} from "./implementation-plan.ts";
import {
  ApprovedEvidencePolicyProjectionV1Schema,
  buildApprovedEvidencePolicyProjectionV1,
  evidencePolicyResolutionHash
} from "./evidence-policy.ts";
import type { DecisionWithRefV1 } from "./human-decision.ts";

export const ApprovedWorkPacketProjectionV1Schema = z.object({
  schema_version: z.number().int(),
  approval_projection_version: z.number().int(),
  hash_algorithm: z.literal(HASH_ALGORITHM_V1),
  id: z.string(),
  approved_payload_revision: z.number().int(),
  title: z.string(),
  classification: WorkClassificationSchema,
  work_kind_resolution: ApprovedWorkKindResolutionProjectionV1Schema,
  work_kind_resolution_hash: Sha256HexSchema,
  parent_plan_id: z.string().nullable(),
  plan_slice_id: z.string().nullable(),
  intent: WorkPacketIntentProjectionV1Schema,
  acceptance_criteria: z.array(AcceptanceCriterionProjectionV1Schema),
  docs: ApprovedDocsPolicyProjectionV1Schema,
  scope: z.object({ allowed_globs: z.array(z.string()) }).strict(),
  platform: ApprovedPlatformProjectionV1Schema,
  architecture: ApprovedArchitectureProjectionV1Schema,
  stack: ApprovedStackProjectionV1Schema,
  // Timestamp-free content projection of the live runtime baseline ref: the approval hash must
  // carry no timestamp or storage/artifact revision (§5 / appendix work_packet_approval_hash
  // exclusion rule), so `accepted_at` and `acceptance_snapshot_revision` are intentionally
  // dropped. Follow-up (identity/decision-binding milestone): adopt the appendix
  // RuntimeBaselineRefV1 field names (`baseline_id`/`governed_baseline_hash`) and dereference
  // `acceptance_decision_ref` to a HumanDecisionRefV1; deferred here per the M1A blocker fix.
  runtime_baseline_ref: RuntimeBaselineRefProjectionV1Schema.nullable(),
  implementation_plan: ApprovedImplementationPlanProjectionV1Schema.nullable(),
  implementation_plan_hash: Sha256HexSchema.nullable(),
  evidence_policy_resolution: ApprovedEvidencePolicyProjectionV1Schema,
  evidence_policy_resolution_hash: Sha256HexSchema
}).strict().superRefine((value, ctx) => {
  // Invariant: implementation_plan_hash === null iff implementation_plan === null.
  if (value.implementation_plan === null && value.implementation_plan_hash !== null) {
    ctx.addIssue({ code: "custom", path: ["implementation_plan_hash"], message: "implementation_plan_hash must be null when implementation_plan is null" });
  }
  if (value.implementation_plan !== null && value.implementation_plan_hash === null) {
    ctx.addIssue({ code: "custom", path: ["implementation_plan_hash"], message: "implementation_plan_hash is required when implementation_plan is present" });
  }
});
export type ApprovedWorkPacketProjectionV1 = z.infer<typeof ApprovedWorkPacketProjectionV1Schema>;

export interface ApprovedWorkPacketProjectionOptions {
  config_projection?: SpecGuardPolicyConfigProjectionV1;
  human_decisions?: DecisionWithRefV1[];
  // M1A does not maintain a separate approval-content revision counter and the approval hash
  // must be invariant to storage/lineage revision; `approved_payload_revision` is therefore a
  // stable constant (1) so it "changes only when approval-bound payload changes" (it never
  // falsely stales) and stays equal across single-packet and batch-child projections.
  approved_payload_revision?: number;
}

export interface ApprovedWorkPacketProjectionResult {
  projection: ApprovedWorkPacketProjectionV1;
  hash: string;
  diagnostics: Diagnostic[];
}

export const APPROVED_PAYLOAD_REVISION_V1 = 1;

export function buildApprovedWorkPacketProjectionV1(work: WorkPacket, options: ApprovedWorkPacketProjectionOptions = {}): ApprovedWorkPacketProjectionResult {
  const config = options.config_projection ?? CONFIG_PROJECTION_V1;
  const humanDecisions = options.human_decisions ?? [];
  const diagnostics: Diagnostic[] = [];

  const workKind = resolveWorkKind({
    packet_classification: work.classification,
    explicit_work_kind: null,
    docs_impact: null,
    workspace_edit_intent: null,
    human_exception_ref: null,
    human_exception_payload: null,
    config_projection: config
  });
  diagnostics.push(...workKind.diagnostics);
  const workKindHash = workKindResolutionHash(workKind.projection);

  const plan = work.implementation_plan === null ? null : ApprovedImplementationPlanProjectionV1Schema.parse(work.implementation_plan);
  const planHash = plan === null ? null : implementationPlanHash(plan);

  const evidence = buildApprovedEvidencePolicyProjectionV1({
    work_packet_id: work.id,
    packet_classification: work.classification,
    work_kind_resolution: workKind.projection,
    implementation_plan: plan,
    acceptance_criteria: work.acceptance_criteria,
    human_decisions: humanDecisions,
    config_projection: config
  });
  diagnostics.push(...evidence.diagnostics);
  const evidenceHash = evidencePolicyResolutionHash(evidence.projection);

  const projection = ApprovedWorkPacketProjectionV1Schema.parse({
    schema_version: SCHEMA_VERSION_V1,
    approval_projection_version: APPROVAL_PROJECTION_VERSION_V1,
    hash_algorithm: HASH_ALGORITHM_V1,
    id: work.id,
    approved_payload_revision: options.approved_payload_revision ?? APPROVED_PAYLOAD_REVISION_V1,
    title: work.title,
    classification: work.classification,
    work_kind_resolution: workKind.projection,
    work_kind_resolution_hash: workKindHash,
    parent_plan_id: work.parent_plan_id,
    plan_slice_id: work.plan_slice_id,
    intent: buildIntentProjectionV1(work.intent),
    acceptance_criteria: work.acceptance_criteria.map((ac) => AcceptanceCriterionProjectionV1Schema.parse(ac)),
    docs: buildDocsPolicyProjectionV1(work.docs),
    scope: { allowed_globs: work.scope.allowed_globs },
    platform: buildPlatformProjectionV1(work.platform),
    architecture: buildArchitectureProjectionV1(work.architecture),
    stack: buildStackProjectionV1(work.stack),
    runtime_baseline_ref: buildRuntimeBaselineRefProjectionV1(work.runtime_baseline_ref),
    implementation_plan: plan,
    implementation_plan_hash: planHash,
    evidence_policy_resolution: evidence.projection,
    evidence_policy_resolution_hash: evidenceHash
  });
  return { projection, hash: workPacketApprovalHash(projection), diagnostics };
}

// work_packet_approval_hash = hash(ApprovedWorkPacketProjectionV1). Includes embedded child
// projections and child hash fields exactly as defined; excludes lifecycle/lineage/diagnostics/
// timestamps/storage metadata and storage/artifact revision (none of which are projected).
export function workPacketApprovalHash(projection: ApprovedWorkPacketProjectionV1): string {
  return sha256CanonicalJson(ApprovedWorkPacketProjectionV1Schema.parse(projection));
}

// Recompute child hashes from child projections (must not trust stored hash strings blindly).
// Mismatch is a corrupt/invalid approval diagnostic.
export function validateApprovedWorkPacketChildHashes(projection: ApprovedWorkPacketProjectionV1): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (workKindResolutionHash(projection.work_kind_resolution) !== projection.work_kind_resolution_hash) {
    diagnostics.push({ code: "WORK_KIND_RESOLUTION_HASH_MISMATCH", severity: "error", message: "work_kind_resolution_hash does not match recomputed child hash.", field_path: "/work_kind_resolution_hash", gate: null, fix: null });
  }
  const expectedPlanHash = projection.implementation_plan === null ? null : implementationPlanHash(projection.implementation_plan);
  if (expectedPlanHash !== projection.implementation_plan_hash) {
    diagnostics.push({ code: "IMPLEMENTATION_PLAN_HASH_MISMATCH", severity: "error", message: "implementation_plan_hash does not match recomputed child hash.", field_path: "/implementation_plan_hash", gate: null, fix: null });
  }
  if (evidencePolicyResolutionHash(projection.evidence_policy_resolution) !== projection.evidence_policy_resolution_hash) {
    diagnostics.push({ code: "EVIDENCE_POLICY_HASH_MISMATCH", severity: "error", message: "evidence_policy_resolution_hash does not match recomputed child hash.", field_path: "/evidence_policy_resolution_hash", gate: null, fix: null });
  }
  return diagnostics;
}
