import { z } from "zod";
import { WorkClassificationSchema, DocsPolicySchema } from "./enums.ts";
import {
  AcceptanceCriterionSchema,
  DiagnosticSchema,
  JsonValueSchema,
  RuntimeBaselineRefSchema,
  Sha256HexSchema,
  SourceArtifactRefSchema,
  TimestampSchema
} from "./embedded.ts";

export const ReviewSnapshotCategorySchema = z.enum(["ephemeral", "persisted"]);

export const BaselineReviewSnapshotPayloadSchema = z.object({
  stack: z.record(z.string(), JsonValueSchema),
  commands: z.record(z.string(), JsonValueSchema),
  configuration: z.record(z.string(), JsonValueSchema),
  dependency_modes: z.record(z.string(), JsonValueSchema),
  diff_policy: z.record(z.string(), JsonValueSchema),
  validation: z.record(z.string(), JsonValueSchema)
}).strict();
export type BaselineReviewSnapshotPayload = z.infer<typeof BaselineReviewSnapshotPayloadSchema>;

export const AcReviewSnapshotPayloadSchema = z.object({
  work_id: z.string().nullable(),
  work_packet_revision: z.number().int().positive().nullable(),
  acceptance_criteria: z.array(AcceptanceCriterionSchema)
}).strict();
export type AcReviewSnapshotPayload = z.infer<typeof AcReviewSnapshotPayloadSchema>;

export const WorkPacketReviewSnapshotPayloadSchema = z.object({
  id: z.string(),
  work_packet_revision: z.number().int().positive(),
  title: z.string(),
  parent_plan_id: z.string().nullable(),
  plan_slice_id: z.string().nullable(),
  intent: z.record(z.string(), JsonValueSchema),
  acceptance_criteria: z.array(AcceptanceCriterionSchema),
  docs: z.object({
    policy: DocsPolicySchema,
    none_required_reason: z.string().nullable(),
    not_applicable_reason: z.string().nullable()
  }).strict(),
  scope: z.object({ allowed_globs: z.array(z.string()) }).strict(),
  platform: z.record(z.string(), JsonValueSchema),
  architecture: z.record(z.string(), JsonValueSchema),
  classification: WorkClassificationSchema,
  runtime_baseline_ref: RuntimeBaselineRefSchema.nullable()
}).strict();
export type WorkPacketReviewSnapshotPayload = z.infer<typeof WorkPacketReviewSnapshotPayloadSchema>;

export const ChangeBaselineCapturePlanSchema = z.object({
  mode: z.enum(["vcs", "manifest"]),
  capture_action: z.enum(["authorize"]),
  work_id: z.string().nullable(),
  proposed_child_id: z.string().nullable(),
  allowed_globs: z.array(z.string()),
  ignored_paths: z.array(z.string()),
  vcs_required: z.boolean(),
  manifest_includes: z.array(z.string()),
  dirty_state_policy: z.literal("block_unapproved_product_changes")
}).strict();
export type ChangeBaselineCapturePlan = z.infer<typeof ChangeBaselineCapturePlanSchema>;

export const ExpectedFileCategoryPolicySchema = z.object({
  path_policy_revision: z.number().int().positive(),
  allowed_globs: z.array(z.string()),
  ignored_paths: z.array(z.string()),
  allowed_preimplementation_categories: z.array(z.string()),
  implementation_categories: z.array(z.string()),
  unexpected_category: z.literal("other_unexpected")
}).strict();
export type ExpectedFileCategoryPolicy = z.infer<typeof ExpectedFileCategoryPolicySchema>;

export const AuthorizationReviewSnapshotPayloadSchema = z.object({
  id: z.string(),
  work_packet_revision: z.number().int().positive(),
  approved_packet_snapshot_hash: Sha256HexSchema,
  approved_packet_snapshot_revision: z.string(),
  authorization_ready_diagnostics: z.array(DiagnosticSchema),
  allowed_globs: z.array(z.string()),
  // Nullable: a greenfield (new_entirely) packet authorizes before its runtime baseline exists (the
  // baseline is established as bootstrap work post-authorization). (RUNTIME_BASELINE_ORIGINATION_DESIGN.md.)
  runtime_baseline_ref: RuntimeBaselineRefSchema.nullable(),
  change_baseline_capture_plan: ChangeBaselineCapturePlanSchema,
  expected_file_category_policy: ExpectedFileCategoryPolicySchema,
  implementation_boundary_summary: z.string()
}).strict();
export type AuthorizationReviewSnapshotPayload = z.infer<typeof AuthorizationReviewSnapshotPayloadSchema>;

export const ReviewSnapshotPayloadSchema = z.union([
  BaselineReviewSnapshotPayloadSchema,
  AcReviewSnapshotPayloadSchema,
  WorkPacketReviewSnapshotPayloadSchema,
  AuthorizationReviewSnapshotPayloadSchema,
  z.record(z.string(), JsonValueSchema)
]);

export const ReviewSnapshotSchema = z.object({
  id: z.string().min(1),
  category: ReviewSnapshotCategorySchema,
  producer_action_id: z.string().min(1),
  snapshot_hash: Sha256HexSchema,
  snapshot_revision: z.string().min(1),
  audit_revision: z.number().int().positive().nullable(),
  source_artifact_refs: z.array(SourceArtifactRefSchema),
  payload: ReviewSnapshotPayloadSchema,
  rendered_summary: z.string(),
  created_at: TimestampSchema
}).strict().superRefine((value, ctx) => {
  if (value.category === "ephemeral" && value.audit_revision !== null) {
    ctx.addIssue({ code: "custom", path: ["audit_revision"], message: "ephemeral snapshots must not have audit_revision" });
  }
  if (value.category === "persisted" && value.audit_revision === null) {
    ctx.addIssue({ code: "custom", path: ["audit_revision"], message: "persisted snapshots require audit_revision" });
  }
});
export type ReviewSnapshot = z.infer<typeof ReviewSnapshotSchema>;
