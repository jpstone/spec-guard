import { z } from "zod";
import { ChangeFileCategorySchema, EvidenceStatusSchema, WorkClassificationSchema } from "./enums.ts";

export const TimestampSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  "timestamp must be UTC RFC3339 with millisecond precision and Z suffix"
);
export type Timestamp = z.infer<typeof TimestampSchema>;

export const Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const DiagnosticSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
  field_path: z.string().nullable(),
  gate: z.string().nullable(),
  fix: z.string().nullable()
}).strict();
export type Diagnostic = z.infer<typeof DiagnosticSchema>;

export const SourceArtifactRefSchema = z.object({
  artifact_type: z.string().min(1),
  id: z.string().min(1).nullable(),
  revision: z.number().int().positive(),
  content_hash: Sha256HexSchema.optional()
}).strict().superRefine((value, ctx) => {
  if (value.artifact_type === "source_artifact" && value.content_hash === undefined) {
    ctx.addIssue({ code: "custom", path: ["content_hash"], message: "source_artifact refs require content_hash" });
  }
  if (value.artifact_type !== "source_artifact" && value.content_hash !== undefined) {
    ctx.addIssue({ code: "custom", path: ["content_hash"], message: "non-source_artifact refs must omit content_hash" });
  }
});
export type SourceArtifactRef = z.infer<typeof SourceArtifactRefSchema>;

export const ApprovedPayloadRefSchema = z.object({
  record_type: z.enum(["other"]),
  record_id: z.string().min(1),
  payload_field: z.string().min(1),
  payload_pointer: z.string(),
  payload_hash: Sha256HexSchema,
  payload_revision: z.string().min(1)
}).strict();
export type ApprovedPayloadRef = z.infer<typeof ApprovedPayloadRefSchema>;

const JsonLiteralSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type JsonValue = z.infer<typeof JsonValueSchema>;
export const JsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  JsonLiteralSchema,
  z.array(JsonValueSchema),
  z.record(z.string(), JsonValueSchema)
]));

export const HumanDecisionSchema = z.object({
  id: z.string().min(1),
  decision_type: z.string().min(1),
  prompt_id: z.string().min(1),
  prompt_text: z.string(),
  raw_response: z.string(),
  selected_number: z.number().int().positive(),
  normalized_decision: z.string().min(1),
  approved_fields: z.array(z.string()),
  custom_response: z.string().nullable(),
  supersedes_decision_id: z.string().nullable(),
  superseded_by_decision_id: z.string().nullable(),
  review_snapshot_hash: Sha256HexSchema.nullable(),
  review_snapshot_revision: z.string().nullable(),
  // Revision-INDEPENDENT hash of the approved content (references-by-hash, Part B). Lets freshness compare the
  // current content's hash to the approved one without re-reading the approved revision. Nullable + defaulted
  // so existing decisions (which fall back to the revision read) stay valid.
  approved_content_hash: Sha256HexSchema.nullable().default(null),
  source_artifact_refs: z.array(SourceArtifactRefSchema),
  approved_payload_hash: Sha256HexSchema.nullable(),
  approved_payload_revision: z.string().nullable(),
  approved_payload: z.record(z.string(), JsonValueSchema).nullable(),
  approved_payload_ref: ApprovedPayloadRefSchema.nullable(),
  reviewed_payload_hash: Sha256HexSchema.nullable(),
  reviewed_payload_revision: z.string().nullable(),
  reviewed_payload: z.record(z.string(), JsonValueSchema).nullable(),
  target_artifact_revision: z.number().int().positive().nullable(),
  parent_batch_snapshot_hash: Sha256HexSchema.nullable(),
  parent_batch_snapshot_revision: z.string().nullable(),
  source_interface: z.string().min(1),
  human_confirmed: z.boolean(),
  at: TimestampSchema
}).strict();
export type HumanDecision = z.infer<typeof HumanDecisionSchema>;

export const CommandSpecSchema = z.object({
  mode: z.enum(["argv", "shell"]),
  argv: z.array(z.string()).nullable().optional(),
  shell_command: z.string().nullable().optional(),
  working_directory: z.string().min(1).default("."),
  timeout_ms: z.number().int().positive().nullable().default(null),
  env_mode: z.enum(["inherit", "clean", "configured"]).default("inherit"),
  env_overrides_ref: z.string().nullable().default(null)
}).strict().superRefine((value, ctx) => {
  if (value.mode === "argv") {
    if (!Array.isArray(value.argv) || value.argv.length === 0) ctx.addIssue({ code: "custom", path: ["argv"], message: "argv mode requires a non-empty argv array" });
    if (value.shell_command !== undefined && value.shell_command !== null) ctx.addIssue({ code: "custom", path: ["shell_command"], message: "argv mode must not set shell_command" });
  }
  if (value.mode === "shell") {
    if (typeof value.shell_command !== "string" || value.shell_command.trim().length === 0) ctx.addIssue({ code: "custom", path: ["shell_command"], message: "shell mode requires shell_command" });
    if (value.argv !== undefined && value.argv !== null) ctx.addIssue({ code: "custom", path: ["argv"], message: "shell mode must not set argv" });
  }
});
export type CommandSpec = z.infer<typeof CommandSpecSchema>;

// Platform-agnostic readiness signal for a long-running process / dev runtime. Spec Guard owns the SHAPE
// (kinds); the agent supplies the platform-specific value (a URL, a log regex, a port, a file path, or a
// probe command) so dev runtimes for web / desktop / game / mobile / backend are validated uniformly.
export const ReadinessProbeSchema = z.object({
  kind: z.enum(["http_healthcheck", "log_pattern", "port_open", "file_ready", "probe_command"]),
  value: z.string().min(1),
  timeout_ms: z.number().int().positive().default(60000)
}).strict();
export type ReadinessProbe = z.infer<typeof ReadinessProbeSchema>;

// One long-running process in a dev runtime (e.g. a frontend dev server, a backend, a watcher). Its
// optional `readiness` is the per-process up-signal; the group's cross-seam check is the DevRuntime's
// integration_probe.
export const DevRuntimeProcessSchema = z.object({
  name: z.string().min(1),
  command: CommandSpecSchema,
  readiness: ReadinessProbeSchema.nullable().default(null)
}).strict();
export type DevRuntimeProcess = z.infer<typeof DevRuntimeProcessSchema>;

// A dev runtime is a PROCESS GROUP (one or more long-running processes). `readiness_probe` proves the
// runtime is actually USABLE, not merely started:
//  - single-process (a game's play mode, a no-backend SPA): it confirms the one process is up;
//  - multi-process (web client + backend, client + multiplayer server): it must CROSS THE SEAM (exercise
//    the cross-process path) so a partial runtime — frontend up, backend down — fails.
// `stop` is how the group is torn down.
export const DevRuntimeSchema = z.object({
  processes: z.array(DevRuntimeProcessSchema).min(1),
  readiness_probe: ReadinessProbeSchema,
  stop: z.object({
    signal: z.enum(["SIGINT", "SIGTERM"]).default("SIGTERM"),
    grace_ms: z.number().int().positive().default(5000)
  }).strict().default({ signal: "SIGTERM", grace_ms: 5000 })
}).strict();
export type DevRuntime = z.infer<typeof DevRuntimeSchema>;

// Evidence that a dev runtime was actually RUN (slice 3): the runner started the process group, polled the
// readiness_probe, and tore the group down. `dev_runtime_hash` binds this result to the exact DevRuntime
// spec that was run, so a stale result for a changed spec doesn't satisfy validation.
export const DevRuntimeProcessObservationSchema = z.object({
  name: z.string().min(1),
  started: z.boolean(),
  exited_early: z.boolean(),
  exit_code: z.number().int().nullable()
}).strict();
export type DevRuntimeProcessObservation = z.infer<typeof DevRuntimeProcessObservationSchema>;

export const DevRuntimeRunResultSchema = z.object({
  status: z.enum(["passed", "failed", "timed_out"]),
  readiness_passed: z.boolean(),
  probe_kind: z.enum(["http_healthcheck", "log_pattern", "port_open", "file_ready", "probe_command"]),
  process_observations: z.array(DevRuntimeProcessObservationSchema),
  error_message: z.string().nullable(),
  output_excerpt: z.string().nullable(),
  duration_ms: z.number().int().nonnegative(),
  dev_runtime_hash: Sha256HexSchema
}).strict();
export type DevRuntimeRunResult = z.infer<typeof DevRuntimeRunResultSchema>;

export const RuntimeBaselineRefSchema = z.object({
  artifact_type: z.literal("runtime_baseline"),
  id: z.null().default(null),
  revision: z.number().int().positive(),
  accepted_at: TimestampSchema,
  acceptance_decision_id: z.string().min(1),
  acceptance_snapshot_hash: Sha256HexSchema,
  acceptance_snapshot_revision: z.string().min(1)
}).strict();
export type RuntimeBaselineRef = z.infer<typeof RuntimeBaselineRefSchema>;

// Back-reference from a source WorkPacket to the Work Breakdown (the Plan artifact) that decomposes it.
// Authority is Plan.source_work_id; this packet field is a maintained pointer. Mirrors RuntimeBaselineRef,
// but a Work Breakdown is a normal (non-singleton) Plan, so id is a string.
export const WorkBreakdownRefSchema = z.object({
  artifact_type: z.literal("plan"),
  id: z.string().min(1),
  revision: z.number().int().positive()
}).strict();
export type WorkBreakdownRef = z.infer<typeof WorkBreakdownRefSchema>;

export const CommandResultSchema = z.object({
  id: z.string().min(1),
  storage_ref: z.string().min(1),
  command: z.string(),
  command_spec: CommandSpecSchema,
  purpose: z.enum(["test", "build", "runtime_production", "runtime_development", "verifier_health", "other"]),
  working_directory: z.string(),
  timeout_ms: z.number().int().positive().nullable(),
  env_mode: z.string().nullable(),
  related_work_id: z.string().nullable(),
  related_runtime_baseline_ref: RuntimeBaselineRefSchema.nullable(),
  related_runtime_baseline_draft_revision: z.number().int().positive().nullable(),
  exit_code: z.number().int().nullable(),
  started_at: TimestampSchema,
  finished_at: TimestampSchema.nullable(),
  duration_ms: z.number().int().nonnegative().nullable(),
  status: z.enum(["passed", "failed", "timed_out", "skipped"]),
  skip_reason: z.string().nullable(),
  skip_precondition: z.string().nullable(),
  error_message: z.string().nullable(),
  output_ref: z.string().nullable(),
  output_excerpt: z.string().nullable(),
  resource_categories: z.array(z.string()),
  cleanup_observations: z.record(z.string(), JsonValueSchema).nullable(),
  source_interface: z.string().min(1)
}).strict();
export type CommandResult = z.infer<typeof CommandResultSchema>;

export const SourceEvidenceSchema = z.object({
  kind: z.string().min(1),
  reference: z.string().min(1),
  description: z.string().min(1),
  source_artifact_refs: z.array(SourceArtifactRefSchema),
  // COMPUTE-DON'T-DEMAND: the tool derives this. Omit it (defaults to the zero placeholder) or pass any value —
  // work.spec.acs overwrites it with the canonical hash before storing. (See normalizeAcceptanceCriteria.)
  evidence_hash: Sha256HexSchema.default("0".repeat(64))
}).strict();
export type SourceEvidence = z.infer<typeof SourceEvidenceSchema>;

export const AcceptanceCriterionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  source: z.enum(["human", "frontend_agent", "source_derived"]),
  source_evidence: SourceEvidenceSchema.nullable(),
  // Marks an AC as covering repo bootstrap (standing up an established platform/architecture/stack)
  // rather than a leaf feature. Optional so existing ACs are unchanged. (WORK_ORIGINATION_DESIGN.md §5.)
  bootstrap: z.boolean().optional(),
  // The work classification this AC belongs to (its "surface"): a reusable API AC vs a one-off UI AC vs a
  // direct-behavior AC etc. Optional + back-compat: absent ACs inherit the packet/slice classification. When
  // present, the Work Breakdown must keep each slice classification-homogeneous, so ACs that span
  // classifications are FORCED into separate slices (each getting its correct docs/architecture policy).
  // (SPEC_CLASSIFICATION_AND_REVIEW_DESIGN.md.) NOTE: tag BEFORE work.ac.establish — adding it after re-anchors.
  classification: WorkClassificationSchema.optional()
}).strict().superRefine((value, ctx) => {
  if (value.source === "source_derived") {
    if (value.source_evidence === null) {
      ctx.addIssue({ code: "custom", path: ["source_evidence"], message: "source-derived ACs require SourceEvidence" });
    } else if (value.source_evidence.source_artifact_refs.length === 0) {
      ctx.addIssue({ code: "custom", path: ["source_evidence", "source_artifact_refs"], message: "source-derived AC SourceEvidence requires source_artifact_refs" });
    }
  }
});
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;

export const ChangedFileStatusSchema = z.enum(["added", "modified", "deleted", "renamed", "untracked"]);
export const ChangedFileSchema = z.object({
  path: z.string(),
  category: ChangeFileCategorySchema,
  status: ChangedFileStatusSchema,
  allowed_by_globs: z.boolean()
}).strict();
export type ChangedFile = z.infer<typeof ChangedFileSchema>;

export const PreauthorizationDirtyEntrySchema = z.object({
  path: z.string(),
  status: ChangedFileStatusSchema,
  size: z.number().int().nonnegative().nullable(),
  content_hash: Sha256HexSchema.nullable()
}).strict();
export type PreauthorizationDirtyEntry = z.infer<typeof PreauthorizationDirtyEntrySchema>;

export const VcsChangeBaselineSchema = z.object({
  system: z.string(),
  commit: z.string().nullable(),
  tree: z.string().nullable(),
  dirty_files: z.array(z.string()),
  untracked_files: z.array(z.string()),
  preauthorization_dirty_entries: z.array(PreauthorizationDirtyEntrySchema)
}).strict();

export const ManifestChangeBaselineSchema = z.object({
  manifest_hash: Sha256HexSchema,
  files: z.array(z.object({ path: z.string(), size: z.number().int().nonnegative(), mtime: TimestampSchema, content_hash: Sha256HexSchema }).strict())
}).strict();

export const PacketChangeBaselineSchema = z.object({
  mode: z.enum(["vcs", "manifest"]),
  captured_at: TimestampSchema,
  work_id: z.string().min(1),
  artifact_revision: z.number().int().positive(),
  artifact_hash: Sha256HexSchema,
  review_snapshot_hash: Sha256HexSchema,
  allowed_globs: z.array(z.string()),
  ignored_paths: z.array(z.string()),
  vcs: VcsChangeBaselineSchema.nullable(),
  manifest: ManifestChangeBaselineSchema.nullable()
}).strict().superRefine((value, ctx) => {
  if (value.mode === "vcs" && value.vcs === null) ctx.addIssue({ code: "custom", path: ["vcs"], message: "vcs baseline requires vcs data" });
  if (value.mode === "manifest" && value.manifest === null) ctx.addIssue({ code: "custom", path: ["manifest"], message: "manifest baseline requires manifest data" });
});
export type PacketChangeBaseline = z.infer<typeof PacketChangeBaselineSchema>;

export const DocsContentTokensSchema = z.object({
  paths: z.array(z.string()),
  headings: z.array(z.string()),
  links: z.array(z.string()),
  examples: z.array(z.string())
}).strict();
export type DocsContentTokens = z.infer<typeof DocsContentTokensSchema>;

export const FileStateSnapshotSchema = z.object({
  captured_at: TimestampSchema,
  mode: z.enum(["vcs", "manifest"]),
  vcs_commit: z.string().nullable(),
  manifest_hash: Sha256HexSchema.nullable(),
  changed_files_since_packet_baseline: z.array(ChangedFileSchema)
}).strict();
export type FileStateSnapshot = z.infer<typeof FileStateSnapshotSchema>;

export const CleanupEvidenceSchema = z.object({
  checked_resources: z.array(z.string()),
  resource_categories: z.array(z.string()),
  before_observations: z.record(z.string(), JsonValueSchema),
  after_observations: z.record(z.string(), JsonValueSchema),
  side_effect_status: z.enum(["none", "cleaned", "remaining_unapproved_side_effects"]),
  related_evidence_refs: z.array(z.string()),
  remaining_cleanup_actions: z.array(z.string())
}).strict();
export type CleanupEvidence = z.infer<typeof CleanupEvidenceSchema>;

export const NotApplicableEvidenceSchema = z.object({
  evidence_type: z.enum(["tests", "test_failure", "test_pass", "runtime_production", "runtime_development", "cleanup", "implementation_files"]),
  resource_categories: z.array(z.string()),
  reason: z.string().min(1),
  applies_to_ac_ids: z.array(z.string()),
  classification_policy_context: z.string().min(1)
}).strict().superRefine((value, ctx) => {
  if (value.evidence_type === "cleanup" && value.resource_categories.length === 0) ctx.addIssue({ code: "custom", path: ["resource_categories"], message: "cleanup not-applicable evidence requires resource_categories" });
  if (value.evidence_type !== "cleanup" && value.resource_categories.length > 0) ctx.addIssue({ code: "custom", path: ["resource_categories"], message: "non-cleanup not-applicable evidence must not set resource_categories" });
});
export type NotApplicableEvidence = z.infer<typeof NotApplicableEvidenceSchema>;

export const EvidenceRecordSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["docs", "test_failure", "test_pass", "runtime_production", "runtime_development", "cleanup", "not_applicable", "review_trace", "final_claim_support"]),
  created_at: TimestampSchema,
  command: z.string().nullable(),
  exit_code: z.number().int().nullable(),
  status: EvidenceStatusSchema,
  paths: z.array(z.string()),
  related_ac_ids: z.array(z.string()),
  related_doc_ids: z.array(z.string()),
  resource_categories: z.array(z.string()),
  command_result_ref: z.string().nullable(),
  evidence_role: z.enum(["docs", "behavior_test", "failure_first", "passing_test", "runtime", "cleanup", "not_applicable", "review"]),
  file_state_snapshot: FileStateSnapshotSchema.nullable(),
  summary: z.string(),
  output_ref: z.string().nullable(),
  docs_content_tokens: DocsContentTokensSchema.nullable(),
  cleanup: CleanupEvidenceSchema.nullable(),
  not_applicable: NotApplicableEvidenceSchema.nullable(),
  source_interface: z.string().min(1)
}).strict();
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

export const MinimalEvidenceRecordSchema = EvidenceRecordSchema;

export const ClaimSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  claim_type: z.enum(["docs_mapping", "docs_updated", "tests_mapping", "documented_contract_mapping", "failure_evidence", "retained_test_not_docs", "runtime", "runtime_claim", "implementation_summary", "final", "final_user_claim", "other"]),
  related_ac_ids: z.array(z.string()),
  related_doc_ids: z.array(z.string()),
  evidence_refs: z.array(z.string()),
  resource_categories: z.array(z.string()),
  presentation: z.enum(["verified", "unverified", "not_applicable"]),
  verification_status: z.enum(["pending", "verified", "unverified", "contradicted"]).optional(),
  backend_verification_ids: z.array(z.string()).optional()
}).strict();
export type Claim = z.infer<typeof ClaimSchema>;

export const ChoicePromptOptionSchema = z.object({
  number: z.number().int().positive(),
  label: z.string(),
  kind: z.enum(["standard", "something_else", "discuss", "custom_confirmation"]),
  payload: z.record(z.string(), JsonValueSchema).nullable(),
  architecture_option_details: z.record(z.string(), JsonValueSchema).nullable(),
  custom_confirmation_value: z.string().nullable()
}).strict();
export type ChoicePromptOption = z.infer<typeof ChoicePromptOptionSchema>;

export const ChoicePromptSchema = z.object({
  id: z.string().min(1),
  choice_type: z.string().min(1),
  prompt_text: z.string(),
  options: z.array(ChoicePromptOptionSchema),
  status: z.enum(["pending", "answered", "superseded"]),
  custom_confirmation_required: z.boolean(),
  created_at: TimestampSchema
}).strict();
export type ChoicePrompt = z.infer<typeof ChoicePromptSchema>;

export const ChoiceAnswerSchema = z.object({
  choice_id: z.string().min(1),
  selected_number: z.number().int().positive(),
  raw_response: z.string(),
  normalized_decision: z.string(),
  human_confirmed: z.boolean(),
  created_at: TimestampSchema
}).strict();
export type ChoiceAnswer = z.infer<typeof ChoiceAnswerSchema>;

export const ProductContextSchema = z.object({
  platform_choice: z.string().nullable(),
  platform_decision_id: z.string().nullable(),
  architecture_decision_ids: z.array(z.string()),
  // Target-scoped stack (framework/tooling) decisions inherited by Plan children. Defaulted so existing
  // serialized product contexts migrate cleanly. (WORK_ORIGINATION_DESIGN.md §3.)
  stack_decision_ids: z.array(z.string()).default([]),
  source_request_summary: z.string().nullable(),
  source_evidence_summary: z.string().nullable()
}).strict();
export type ProductContext = z.infer<typeof ProductContextSchema>;

export const PlatformChoiceDecisionPayloadSchema = z.object({
  work_id: z.string().min(1),
  choice: z.string().min(1),
  custom_response: z.string().min(1).nullable()
}).strict();
export type PlatformChoiceDecisionPayload = z.infer<typeof PlatformChoiceDecisionPayloadSchema>;

export const ArchitectureOptionDetailsSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1),
  // Tradeoff arrays are optional provenance (the human already chose) — default empty so a choice can be
  // recorded from just label + description rather than a five-field ceremony. (MERGED_APPROVAL churn fixes.)
  benefits: z.array(z.string().min(1)).default([]),
  costs_tradeoffs: z.array(z.string().min(1)).default([]),
  downstream_constraints: z.array(z.string().min(1)).default([]),
  // The chosen component/UI library for a NEW application UI stack (or the literal "none"). Required only for
  // a one_off_application_ui stack_choice (enforced in payloadForChoice); absent for architecture choices,
  // reusable UI, API surfaces, and inherited (feature-on-existing-app) work. Optional at the schema level so
  // it is preserved when present without forcing it on every structural choice.
  component_library: z.string().min(1).nullable().optional()
}).strict();
export type ArchitectureOptionDetails = z.infer<typeof ArchitectureOptionDetailsSchema>;

export const ArchitectureChoiceDecisionPayloadSchema = z.object({
  work_id: z.string().min(1),
  choice: z.string().min(1),
  custom_response: z.string().min(1).nullable(),
  option_details: ArchitectureOptionDetailsSchema
}).strict();
export type ArchitectureChoiceDecisionPayload = z.infer<typeof ArchitectureChoiceDecisionPayloadSchema>;
