import { z } from "zod";

export const WorkClassifications = [
  "reusable_api",
  "rest_api",
  "reusable_ui",
  "one_off_application_ui",
  "direct_behavior",
  "operational_document",
  "bugfix"
] as const;
export const WorkClassificationSchema = z.enum(WorkClassifications);
export type WorkClassification = z.infer<typeof WorkClassificationSchema>;

// Work origination (WORK_ORIGINATION_DESIGN.md): does this packet modify an existing thing, build a new
// thing entirely, or add a new thing inside an existing thing? Drives per-dimension establish-vs-inherit.
// v1 supports modify_existing + new_entirely; new_in_existing is reserved in the schema but rejected by
// v1 actions (it needs target-scoped baselines, deferred to v2).
export const WorkOriginations = ["modify_existing", "new_entirely", "new_in_existing"] as const;
export const WorkOriginationSchema = z.enum(WorkOriginations);
export type WorkOrigination = z.infer<typeof WorkOriginationSchema>;

// The role-loop workflow_state (workflow/state-machine.ts) is the authoritative lifecycle. `disposition`
// captures the orthogonal states that are not lifecycle positions: a declined human gate (blocked), a
// packet set aside in favor of a Plan (deferred), or a retired packet (archived). (M9.7 retired the
// flat WorkStatus enum.)
export const Dispositions = ["active", "blocked", "deferred", "archived"] as const;
export const DispositionSchema = z.enum(Dispositions);
export type Disposition = z.infer<typeof DispositionSchema>;

export const VerificationStatuses = ["passed", "failed", "inconclusive", "invalid"] as const;
export const VerificationStatusSchema = z.enum(VerificationStatuses);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const EvidenceStatuses = ["passed", "failed", "inconclusive", "not_applicable"] as const;
export const EvidenceStatusSchema = z.enum(EvidenceStatuses);
export type EvidenceStatus = z.infer<typeof EvidenceStatusSchema>;

export const DocsPolicies = ["required", "changed", "none_required", "not_applicable"] as const;
export const DocsPolicySchema = z.enum(DocsPolicies);
export type DocsPolicy = z.infer<typeof DocsPolicySchema>;

export const ChangeFileCategories = [
  "spec_guard_artifact_evidence",
  "docs",
  "tests",
  "implementation_source",
  "runtime_product_configuration",
  "generated_build_output",
  "other_unexpected"
] as const;
export const ChangeFileCategorySchema = z.enum(ChangeFileCategories);
export type ChangeFileCategory = z.infer<typeof ChangeFileCategorySchema>;
