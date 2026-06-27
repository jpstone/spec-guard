import { z } from "zod";

// Work-kind resolution enums (Normative appendix — ApprovedWorkKindResolutionProjectionV1).
export const WorkKindSchema = z.enum([
  "product_code_change",
  "test_or_evidence_change",
  "docs_only",
  "config_tooling",
  "analysis_only"
]);
export type WorkKind = z.infer<typeof WorkKindSchema>;

export const DocsImpactSchema = z.enum([
  "none",
  "behavior_contract",
  "generated_docs",
  "release_process",
  "operational_procedure",
  "unknown"
]);
export type DocsImpact = z.infer<typeof DocsImpactSchema>;

export const WorkspaceEditIntentSchema = z.enum([
  "none",
  "docs",
  "tests",
  "product",
  "config_tooling",
  "unknown"
]);
export type WorkspaceEditIntent = z.infer<typeof WorkspaceEditIntentSchema>;

// Evidence model enums (shared by 1A projections and 1B satisfaction predicates).
export const EvidenceRequirementSchema = z.enum([
  "reproduction",
  "automated_test",
  "passing_command",
  "manual_smoke",
  "docs_static_check",
  "review_attestation",
  "target_rendered_runtime_e2e",
  "target_rendered_runtime_smoke",
  "target_rendered_runtime_reproduction"
]);
export type EvidenceRequirement = z.infer<typeof EvidenceRequirementSchema>;

export const ReadinessGateSchema = z.enum([
  "authorization",
  "review_entry",
  "review_verdict",
  "completion"
]);
export type ReadinessGate = z.infer<typeof ReadinessGateSchema>;

export const EvidenceModeSchema = z.enum([
  "reproduction_evidence_required",
  "automated_tests_required",
  "appropriate_evidence_required",
  "docs_config_evidence_required",
  "manual_or_smoke_allowed"
]);
export type EvidenceMode = z.infer<typeof EvidenceModeSchema>;

export const AcEvidenceClassificationSchema = z.enum([
  "bug_regression",
  "behavior_change",
  "docs_config",
  "manual_smoke",
  "other"
]);
export type AcEvidenceClassification = z.infer<typeof AcEvidenceClassificationSchema>;

export const WaiverAuthoritySchema = z.enum(["human", "reviewer", "human_and_reviewer"]);
export type WaiverAuthority = z.infer<typeof WaiverAuthoritySchema>;

export const RequiredForSchema = z.enum(["authorization", "completion"]);
export type RequiredFor = z.infer<typeof RequiredForSchema>;

export const PlanTestEntryKindSchema = z.enum(["shell_command", "path"]);
export type PlanTestEntryKind = z.infer<typeof PlanTestEntryKindSchema>;

export const ValidationRequirementSourceSchema = z.enum([
  "ac",
  "implementation_plan_test",
  "project_policy",
  "human_decision"
]);
export type ValidationRequirementSource = z.infer<typeof ValidationRequirementSourceSchema>;

export const ChangeTypeSchema = z.enum(["create", "modify", "delete", "unknown"]);
export type ChangeType = z.infer<typeof ChangeTypeSchema>;

// Identity-binding policy: 1A/1B emit only `content_only` at runtime; the `bind_*` modes are
// schema-compatible golden-test targets.
export const PlanIdentityBindingPolicySchema = z.enum(["content_only", "bind_planner_identity"]);
export type PlanIdentityBindingPolicy = z.infer<typeof PlanIdentityBindingPolicySchema>;

export const EvidencePolicyIdentityBindingPolicySchema = z.enum(["content_only", "bind_resolver_identity"]);
export type EvidencePolicyIdentityBindingPolicy = z.infer<typeof EvidencePolicyIdentityBindingPolicySchema>;
