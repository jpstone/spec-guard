import { z } from "zod";
import { sha256CanonicalJson } from "./canonical-hash.ts";
import { APPROVAL_PROJECTION_VERSION_V1, HASH_ALGORITHM_V1, SCHEMA_VERSION_V1 } from "./constants.ts";
import {
  ChangeTypeSchema,
  EvidenceRequirementSchema,
  PlanIdentityBindingPolicySchema,
  PlanTestEntryKindSchema,
  RequiredForSchema
} from "./enums.ts";
import {
  HumanDecisionRefV1Schema,
  ProducerIdentitySchema,
  SourceArtifactRefV1Schema
} from "./human-decision.ts";

export const PlanExpectedFileV1Schema = z.object({
  path: z.string(),
  purpose: z.string(),
  change_type: ChangeTypeSchema
}).strict();

// The dev-runtime PROOF design (RUNTIME_BASELINE_TARGET_SCOPE_DESIGN.md §4.3): the run command + what the
// readiness probe ASSERTS on success (the meaning of "the dev runtime works"). For establishing app work the
// runtime can only be PROVEN post-authorization (the scaffold must exist first), but its DESIGN is reviewed +
// approved here — so the human signs off on what the proof will check, not just that "a scaffold stands up".
export const DevRuntimeProofPlanV1Schema = z.object({
  command: z.string().min(1),
  readiness_assertion: z.string().min(1)
}).strict();
export type DevRuntimeProofPlanV1 = z.infer<typeof DevRuntimeProofPlanV1Schema>;

export const PlanTestV1Schema = z.object({
  entry_kind: PlanTestEntryKindSchema,
  command_or_path: z.string(),
  purpose: z.string(),
  ac_ids: z.array(z.string()),
  evidence_type: EvidenceRequirementSchema,
  required_for: RequiredForSchema
}).strict();
export type PlanTestV1 = z.infer<typeof PlanTestV1Schema>;

export const StandardImplementationPlanProjectionV1Schema = z.object({
  kind: z.literal("standard_plan"),
  schema_version: z.number().int(),
  approval_projection_version: z.number().int(),
  hash_algorithm: z.literal(HASH_ALGORITHM_V1),
  identity_binding_policy: PlanIdentityBindingPolicySchema,
  template_id: z.string(),
  template_version: z.number().int(),
  source_refs: z.array(SourceArtifactRefV1Schema),
  summary: z.string(),
  approach: z.array(z.string()),
  expected_files: z.array(PlanExpectedFileV1Schema),
  tests: z.array(PlanTestV1Schema),
  risks: z.array(z.string()),
  out_of_scope_reminders: z.array(z.string()),
  // The reviewed dev-runtime proof design (null for non-establishing / non-app Specs that have no dev runtime).
  dev_runtime_proof: DevRuntimeProofPlanV1Schema.nullable().default(null),
  approval_bound_producer_ref: ProducerIdentitySchema.nullable()
}).strict().superRefine((value, ctx) => {
  // Identity-binding normalization invariant (appendix "Identity-binding fields are normalized").
  if (value.identity_binding_policy === "content_only" && value.approval_bound_producer_ref !== null) {
    ctx.addIssue({ code: "custom", path: ["approval_bound_producer_ref"], message: "content_only plans must emit approval_bound_producer_ref as null" });
  }
  if (value.identity_binding_policy === "bind_planner_identity" && value.approval_bound_producer_ref === null) {
    ctx.addIssue({ code: "custom", path: ["approval_bound_producer_ref"], message: "bind_planner_identity plans require approval_bound_producer_ref" });
  }
});
export type StandardImplementationPlanProjectionV1 = z.infer<typeof StandardImplementationPlanProjectionV1Schema>;

export const PlanWaivedNoopProjectionV1Schema = z.object({
  kind: z.literal("plan_waived_noop"),
  schema_version: z.number().int(),
  approval_projection_version: z.number().int(),
  hash_algorithm: z.literal(HASH_ALGORITHM_V1),
  human_exception_ref: HumanDecisionRefV1Schema,
  reason: z.string(),
  authorization_behavior: z.enum(["no_product_code_edits", "non_implementation_only"])
}).strict();
export type PlanWaivedNoopProjectionV1 = z.infer<typeof PlanWaivedNoopProjectionV1Schema>;

export const ApprovedImplementationPlanProjectionV1Schema = z.discriminatedUnion("kind", [
  StandardImplementationPlanProjectionV1Schema,
  PlanWaivedNoopProjectionV1Schema
]);
export type ApprovedImplementationPlanProjectionV1 = z.infer<typeof ApprovedImplementationPlanProjectionV1Schema>;

// Builder input for a standard_plan; identity is normalized by `identity_binding_policy`.
export interface StandardImplementationPlanInput {
  identity_binding_policy?: z.infer<typeof PlanIdentityBindingPolicySchema>;
  template_id: string;
  template_version: number;
  source_refs?: z.infer<typeof SourceArtifactRefV1Schema>[];
  summary: string;
  approach: string[];
  expected_files: z.infer<typeof PlanExpectedFileV1Schema>[];
  tests: PlanTestV1[];
  risks?: string[];
  out_of_scope_reminders?: string[];
  dev_runtime_proof?: DevRuntimeProofPlanV1 | null;
  approval_bound_producer_ref?: z.infer<typeof ProducerIdentitySchema> | null;
}

export function buildStandardImplementationPlanProjectionV1(input: StandardImplementationPlanInput): StandardImplementationPlanProjectionV1 {
  const policy = input.identity_binding_policy ?? "content_only";
  // Identity refs are normalized: content_only forces null; bind_planner_identity keeps the ref.
  const producerRef = policy === "content_only" ? null : (input.approval_bound_producer_ref ?? null);
  return StandardImplementationPlanProjectionV1Schema.parse({
    kind: "standard_plan",
    schema_version: SCHEMA_VERSION_V1,
    approval_projection_version: APPROVAL_PROJECTION_VERSION_V1,
    hash_algorithm: HASH_ALGORITHM_V1,
    identity_binding_policy: policy,
    template_id: input.template_id,
    template_version: input.template_version,
    source_refs: input.source_refs ?? [],
    summary: input.summary,
    approach: input.approach,
    expected_files: input.expected_files,
    tests: input.tests,
    risks: input.risks ?? [],
    out_of_scope_reminders: input.out_of_scope_reminders ?? [],
    dev_runtime_proof: input.dev_runtime_proof ?? null,
    approval_bound_producer_ref: producerRef
  });
}

export interface PlanWaivedNoopInput {
  human_exception_ref: z.infer<typeof HumanDecisionRefV1Schema>;
  reason: string;
  authorization_behavior: "no_product_code_edits" | "non_implementation_only";
}

export function buildPlanWaivedNoopProjectionV1(input: PlanWaivedNoopInput): PlanWaivedNoopProjectionV1 {
  return PlanWaivedNoopProjectionV1Schema.parse({
    kind: "plan_waived_noop",
    schema_version: SCHEMA_VERSION_V1,
    approval_projection_version: APPROVAL_PROJECTION_VERSION_V1,
    hash_algorithm: HASH_ALGORITHM_V1,
    human_exception_ref: input.human_exception_ref,
    reason: input.reason,
    authorization_behavior: input.authorization_behavior
  });
}

// implementation_plan_hash covers the canonical approved-plan projection. The projection
// carries no self-hash field, so the hash is computed over the whole projection.
export function implementationPlanHash(plan: ApprovedImplementationPlanProjectionV1): string {
  return sha256CanonicalJson(ApprovedImplementationPlanProjectionV1Schema.parse(plan));
}
