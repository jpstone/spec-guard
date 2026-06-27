import { z } from "zod";
import {
  DispositionSchema,
  DocsPolicySchema,
  WorkClassificationSchema,
  WorkOriginationSchema
} from "./enums.ts";
import {
  AcceptanceCriterionSchema,
  CommandResultSchema,
  CommandSpecSchema,
  DevRuntimeSchema,
  DevRuntimeRunResultSchema,
  DiagnosticSchema,
  HumanDecisionSchema,
  JsonValueSchema,
  PacketChangeBaselineSchema,
  RuntimeBaselineRefSchema,
  Sha256HexSchema,
  SourceArtifactRefSchema,
  TimestampSchema,
  WorkBreakdownRefSchema
} from "./embedded.ts";
import { ApprovedWorkKindResolutionProjectionV1Schema } from "../role-loop/work-kind.ts";
import { ApprovedImplementationPlanProjectionV1Schema } from "../role-loop/implementation-plan.ts";
import { ApprovedEvidencePolicyProjectionV1Schema } from "../role-loop/evidence-policy.ts";
import { ImplementationAttemptSchema, ReviewCycleSchema, FocusedFixInstructionSchema, ClarificationRequestSchema, SpecReviewCycleSchema } from "../lineage/records.ts";
import { WorkflowStateSchema } from "../workflow/state-machine.ts";

export const ArtifactTypeSchema = z.enum([
  "config",
  "runtime_baseline",
  "work_packet",
  "source_artifact"
]);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export const CommonTopLevelArtifactSchema = z.object({
  artifact_type: z.string().min(1),
  schema_version: z.number().int().positive(),
  id: z.string().min(1).optional(),
  revision: z.number().int().positive(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  diagnostics: z.array(DiagnosticSchema)
}).strict();
export type CommonTopLevelArtifact = z.infer<typeof CommonTopLevelArtifactSchema>;

export const PathPolicySchema = z.object({
  spec_guard_artifact_evidence: z.array(z.string()),
  docs: z.array(z.string()),
  tests: z.array(z.string()),
  implementation_source: z.array(z.string()),
  runtime_product_configuration: z.array(z.string()),
  generated_build_output: z.array(z.string()),
  docs_test_manifests: z.array(z.string()),
  ignored_paths: z.array(z.string())
}).strict();

export const ChangeBaselinePolicySchema = z.object({ mode: z.enum(["auto", "vcs", "manifest"]) }).strict();

export const CleanupObserverSchema = z.object({
  resource_category: z.string(),
  identity_fields: z.array(z.string()),
  before_command_spec: CommandSpecSchema.nullable(),
  after_command_spec: CommandSpecSchema.nullable(),
  deterministic_capture: z.enum(["files", "processes"]).nullable(),
  comparison_rule: z.enum(["exact_match", "no_new_resources", "custom_command_exit_zero"])
}).strict();

export const ConfigSchema = z.object({
  artifact_type: z.literal("config"),
  schema_version: z.literal(1),
  revision: z.number().int().positive(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  project_id: z.string().min(1),
  artifact_root: z.string().default(".spec-guard/"),
  project_root: z.string().min(1),
  command_execution: z.object({
    default_mode: z.enum(["argv", "shell"]),
    configured_shell: z.string().nullable(),
    default_timeout_ms: z.number().int().positive(),
    env_policy: z.enum(["inherit", "clean", "configured"])
  }).strict(),
  path_policy: PathPolicySchema,
  change_baseline_policy: ChangeBaselinePolicySchema,
  cleanup_observers: z.array(CleanupObserverSchema),
  diagnostics: z.array(DiagnosticSchema)
}).strict();
export type Config = z.infer<typeof ConfigSchema>;

const RuntimeBaselineStatusSchema = z.enum(["draft", "accepted", "blocked"]);
export const BlockerSchema = z.object({
  reason: z.string().min(1),
  owner: z.string().nullable(),
  next_action: z.string().nullable(),
  at: TimestampSchema
}).strict();
export type Blocker = z.infer<typeof BlockerSchema>;

export const RuntimeBaselineSchema = z.object({
  artifact_type: z.literal("runtime_baseline"),
  schema_version: z.literal(1),
  revision: z.number().int().positive(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  status: RuntimeBaselineStatusSchema,
  stack: z.object({
    product_platform: z.string().nullable(),
    runtime: z.string().nullable(),
    language: z.string().nullable(),
    package_manager: z.string().nullable(),
    framework: z.string().nullable(),
    build_tool: z.string().nullable(),
    architecture: z.string().nullable()
  }).strict(),
  commands: z.object({
    test: CommandSpecSchema.nullable(),
    test_not_applicable_reason: z.string().nullable(),
    build: CommandSpecSchema.nullable(),
    build_not_applicable_reason: z.string().nullable(),
    runtime_production: CommandSpecSchema.nullable(),
    runtime_production_not_applicable_reason: z.string().nullable(),
    runtime_development: DevRuntimeSchema.nullable(),
    runtime_development_not_applicable_reason: z.string().nullable()
  }).strict(),
  configuration: z.object({
    environment_strategy: z.string().nullable(),
    required_env_vars: z.array(z.string()),
    greenfield_scaffold: z.boolean()
  }).strict(),
  dependency_modes: z.object({
    install_mode: z.string().nullable(),
    external_services: z.string().nullable()
  }).strict(),
  diff_policy: z.object({
    dependency_changes_require_approval: z.boolean(),
    include_untracked: z.boolean()
  }).strict(),
  validation: z.object({
    command_results: z.array(CommandResultSchema),
    // Optional so baselines without a dev runtime (the common case) keep their exact review-snapshot hash;
    // present only once baseline.dev_runtime.run has recorded a result.
    dev_runtime_run_result: DevRuntimeRunResultSchema.optional(),
    diagnostics: z.array(DiagnosticSchema)
  }).strict(),
  acceptance: HumanDecisionSchema.nullable(),
  decision_history: z.array(HumanDecisionSchema),
  blocker: BlockerSchema.nullable(),
  diagnostics: z.array(DiagnosticSchema)
}).strict();
export type RuntimeBaseline = z.infer<typeof RuntimeBaselineSchema>;

export const WorkPacketSchema = z.object({
  artifact_type: z.literal("work_packet"),
  schema_version: z.literal(1),
  id: z.string().min(1),
  revision: z.number().int().positive(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  disposition: DispositionSchema.default("active"),
  title: z.string(),
  classification: WorkClassificationSchema,
  // Defaulted to new_entirely so existing packets migrate to today's all-establish behavior; the
  // origination step-0 gate (Slice 2) sets it deliberately. (WORK_ORIGINATION_DESIGN.md §2.)
  origination: WorkOriginationSchema.default("new_entirely"),
  parent_plan_id: z.string().nullable(),
  plan_slice_id: z.string().nullable(),
  intent: z.object({
    goal: z.string(),
    desired_outcomes: z.array(z.string()),
    in_scope: z.array(z.string()),
    out_of_scope: z.array(z.string()),
    users_actors: z.array(z.string()),
    edge_cases: z.array(z.string()),
    open_questions: z.array(z.string())
  }).strict(),
  acceptance_criteria: z.array(AcceptanceCriterionSchema),
  docs: z.object({
    policy: DocsPolicySchema,
    none_required_reason: z.string().nullable(),
    not_applicable_reason: z.string().nullable(),
    requirements: z.array(z.record(z.string(), JsonValueSchema))
  }).strict(),
  scope: z.object({ allowed_globs: z.array(z.string()), deviations: z.array(z.string()) }).strict(),
  platform: z.object({
    required: z.boolean(),
    choice: z.string().nullable(),
    decision_id: z.string().nullable(),
    not_required_reason: z.string().nullable()
  }).strict(),
  architecture: z.object({
    required: z.boolean(),
    required_reason: z.string().nullable(),
    not_required_reason: z.string().nullable(),
    decision_ids: z.array(z.string())
  }).strict(),
  // Framework/tooling decision (M11), distinct from the structural `architecture` decision. Required
  // under the same classification condition as architecture (greenfield app / API surface); defaulted
  // so existing packets migrate cleanly.
  stack: z.object({
    required: z.boolean(),
    required_reason: z.string().nullable(),
    not_required_reason: z.string().nullable(),
    decision_ids: z.array(z.string())
  }).strict().default({ required: false, required_reason: null, not_required_reason: "stack_choice_not_required", decision_ids: [] }),
  runtime_baseline_ref: RuntimeBaselineRefSchema.nullable(),
  // Back-link to the Work Breakdown (Plan) that decomposes this packet; null until one is created.
  // Not in WORK_PACKET_APPROVED_FIELDS, so it is excluded from the approval snapshot. (Slice 0 adds the
  // field; later slices populate it.) (WORK_ORIGINATION_DESIGN.md §7.)
  work_breakdown_ref: WorkBreakdownRefSchema.nullable().default(null),
  // True when the Work Breakdown partitioned this packet into >1 slice: the packet is a "decomposed
  // parent" — approved as the WHAT but realized through child WorkPackets, never directly authorized.
  // Synchronous signal so workLifecycleStage / leaf-scoping need no Plan read. (ALWAYS_PLAN_DESIGN.md.)
  decomposed: z.boolean().default(false),
  // For UI work, the mockup question MUST be answered before drafting ACs (so ACs aren't drafted then
  // discarded): "present" (a mockup exists — register it and derive ACs from it) or "none" (no mockup —
  // draft features directly). "pending" blocks AC approval for UI classifications. (PLANNING_BEFORE_APPROVAL_DESIGN.md.)
  mockup_decision: z.enum(["pending", "none", "present"]).default("pending"),
  work_kind_resolution: ApprovedWorkKindResolutionProjectionV1Schema.nullable().default(null),
  work_kind_resolution_hash: Sha256HexSchema.nullable().default(null),
  implementation_plan: ApprovedImplementationPlanProjectionV1Schema.nullable().default(null),
  implementation_plan_hash: Sha256HexSchema.nullable().default(null),
  evidence_policy_resolution: ApprovedEvidencePolicyProjectionV1Schema.nullable().default(null),
  evidence_policy_resolution_hash: Sha256HexSchema.nullable().default(null),
  change_baseline: PacketChangeBaselineSchema.nullable(),
  lifecycle: z.object({
    ac_approval: HumanDecisionSchema.nullable(),
    packet_approval: HumanDecisionSchema.nullable(),
    authorization: HumanDecisionSchema.nullable(),
    history: z.array(z.record(z.string(), JsonValueSchema))
  }).strict(),
  decision_history: z.array(HumanDecisionSchema),
  // Role-loop authoritative lifecycle + compact audit lineage (M9.7). Default null/[] so existing
  // WorkPackets migrate cleanly; not part of the approval projection (lineage never stales approval).
  workflow_state: WorkflowStateSchema.default("packet_draft"),
  implementation_attempts: z.array(ImplementationAttemptSchema).default([]),
  review_cycles: z.array(ReviewCycleSchema).default([]),
  focused_fix_instructions: z.array(FocusedFixInstructionSchema).default([]),
  clarification_requests: z.array(ClarificationRequestSchema).default([]),
  // PRE-approval independent spec reviews (SPEC_CLASSIFICATION_AND_REVIEW_DESIGN.md Part C). spec_author is
  // the identity that anchored the ACs (set at work.ac.establish); a spec review's producer must differ from it
  // (no self-review of the spec). Both default so existing packets are unchanged.
  spec_review_cycles: z.array(SpecReviewCycleSchema).default([]),
  spec_author_agent_instance_id: z.string().nullable().default(null),
  diagnostics: z.array(DiagnosticSchema)
}).strict();
export type WorkPacket = z.infer<typeof WorkPacketSchema>;

export const SourceArtifactSchema = z.object({
  artifact_type: z.literal("source_artifact"),
  schema_version: z.literal(1),
  id: z.string().min(1),
  revision: z.number().int().positive(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  kind: z.string().min(1),
  label: z.string().min(1),
  locator: z.string().nullable(),
  content_ref: z.string().min(1),
  content_hash: Sha256HexSchema,
  descriptor: z.record(z.string(), JsonValueSchema).nullable(),
  captured_at: TimestampSchema,
  source_interface: z.string().min(1),
  diagnostics: z.array(DiagnosticSchema)
}).strict();
export type SourceArtifact = z.infer<typeof SourceArtifactSchema>;

export const TopLevelArtifactSchema = z.discriminatedUnion("artifact_type", [
  ConfigSchema,
  RuntimeBaselineSchema,
  WorkPacketSchema,
  SourceArtifactSchema
]);
export type TopLevelArtifact = z.infer<typeof TopLevelArtifactSchema>;
