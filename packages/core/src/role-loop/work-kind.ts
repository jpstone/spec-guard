import { z } from "zod";
import { Sha256HexSchema, type Diagnostic } from "../schemas/embedded.ts";
import { sha256CanonicalJson } from "./canonical-hash.ts";
import {
  CONFIG_PROJECTION_V1,
  HASH_ALGORITHM_V1,
  RESOLVER_VERSION_V1,
  SCHEMA_VERSION_V1,
  type SpecGuardPolicyConfigProjectionV1
} from "./constants.ts";
import {
  DocsImpactSchema,
  WorkKindSchema,
  WorkspaceEditIntentSchema,
  type DocsImpact,
  type WorkKind,
  type WorkspaceEditIntent
} from "./enums.ts";
import {
  decisionRefValid,
  HumanDecisionRefV1Schema,
  type HumanDecisionPayloadV1,
  type HumanDecisionRefV1
} from "./human-decision.ts";

export const ApprovedWorkKindResolutionProjectionV1Schema = z.object({
  schema_version: z.number().int(),
  hash_algorithm: z.literal(HASH_ALGORITHM_V1),
  resolver_version: z.number().int(),
  config_hash: Sha256HexSchema,
  human_exception_ref: HumanDecisionRefV1Schema.nullable(),
  work_kind: WorkKindSchema,
  docs_impact: DocsImpactSchema,
  workspace_edit_intent: WorkspaceEditIntentSchema,
  requires_implementation_plan: z.boolean()
}).strict();
export type ApprovedWorkKindResolutionProjectionV1 = z.infer<typeof ApprovedWorkKindResolutionProjectionV1Schema>;

export interface WorkKindResolverInputV1 {
  packet_classification: string;
  explicit_work_kind: WorkKind | null;
  docs_impact: DocsImpact | null;
  workspace_edit_intent: WorkspaceEditIntent | null;
  human_exception_ref: HumanDecisionRefV1 | null;
  human_exception_payload: HumanDecisionPayloadV1 | null;
  config_projection: SpecGuardPolicyConfigProjectionV1;
}

interface ClassificationDefaults {
  work_kind: WorkKind;
  docs_impact: DocsImpact;
  workspace_edit_intent: WorkspaceEditIntent;
}

// Existing `WorkClassification` -> work-kind mapping (Resolver functions v1 table).
const CLASSIFICATION_MAPPING: Record<string, ClassificationDefaults> = {
  reusable_api: { work_kind: "product_code_change", docs_impact: "unknown", workspace_edit_intent: "product" },
  rest_api: { work_kind: "product_code_change", docs_impact: "unknown", workspace_edit_intent: "product" },
  reusable_ui: { work_kind: "product_code_change", docs_impact: "unknown", workspace_edit_intent: "product" },
  one_off_application_ui: { work_kind: "product_code_change", docs_impact: "unknown", workspace_edit_intent: "product" },
  direct_behavior: { work_kind: "product_code_change", docs_impact: "unknown", workspace_edit_intent: "product" },
  bugfix: { work_kind: "product_code_change", docs_impact: "unknown", workspace_edit_intent: "product" },
  operational_document: { work_kind: "docs_only", docs_impact: "operational_procedure", workspace_edit_intent: "docs" }
};

// Unknown/deprecated classifications fail closed to product_code_change/unknown/unknown.
const UNKNOWN_CLASSIFICATION_DEFAULTS: ClassificationDefaults = {
  work_kind: "product_code_change",
  docs_impact: "unknown",
  workspace_edit_intent: "unknown"
};

function diagnostic(code: string, message: string, severity: Diagnostic["severity"], fieldPath: string | null = null): Diagnostic {
  return { code, severity, message, field_path: fieldPath, gate: null, fix: null };
}

export interface RequiresPlanResolution {
  requires_implementation_plan: boolean;
  reason_code: string;
}

// Work-kind resolver defaults table. `config`/`humanExceptionRef` are accepted for the
// authoritative signature but do not affect the V1 plan requirement directly (human exceptions
// reclassify work_kind upstream, which this function then consumes).
export function resolveRequiresImplementationPlan(
  workKind: WorkKind,
  docsImpact: DocsImpact,
  workspaceEditIntent: WorkspaceEditIntent,
  _config: SpecGuardPolicyConfigProjectionV1 = CONFIG_PROJECTION_V1,
  _humanExceptionRef: HumanDecisionRefV1 | null = null
): RequiresPlanResolution {
  if (workKind === "analysis_only") return { requires_implementation_plan: false, reason_code: "analysis_only_no_authorization" };
  if (workKind === "docs_only") {
    if (docsImpact === "none") {
      // No-edit analysis path (workspace_edit_intent="none") does not require a plan; any
      // docs edits (including unknown edit intent) require a standard_plan.
      if (workspaceEditIntent === "none") return { requires_implementation_plan: false, reason_code: "docs_only_no_edit_analysis" };
      return { requires_implementation_plan: true, reason_code: "docs_only_edits_require_plan" };
    }
    return { requires_implementation_plan: true, reason_code: "docs_only_non_none_impact_requires_plan" };
  }
  // product_code_change, test_or_evidence_change, config_tooling all default to requiring a plan.
  return { requires_implementation_plan: true, reason_code: "implementation_bearing_requires_plan" };
}

export interface WorkKindResolution {
  projection: ApprovedWorkKindResolutionProjectionV1;
  diagnostics: Diagnostic[];
}

export function resolveWorkKind(input: WorkKindResolverInputV1): WorkKindResolution {
  const diagnostics: Diagnostic[] = [];
  const known = Object.prototype.hasOwnProperty.call(CLASSIFICATION_MAPPING, input.packet_classification);
  if (!known) diagnostics.push(diagnostic("WORK_KIND_CLASSIFICATION_UNKNOWN", `Unknown/deprecated classification ${input.packet_classification} failed closed to product_code_change.`, "warning", "/classification"));
  const base = known ? CLASSIFICATION_MAPPING[input.packet_classification]! : UNKNOWN_CLASSIFICATION_DEFAULTS;

  let work_kind: WorkKind = base.work_kind;
  let docs_impact: DocsImpact = base.docs_impact;
  let workspace_edit_intent: WorkspaceEditIntent = base.workspace_edit_intent;

  // Explicit fields override classification mapping.
  if (input.explicit_work_kind !== null) work_kind = input.explicit_work_kind;
  if (input.docs_impact !== null) docs_impact = input.docs_impact;
  if (input.workspace_edit_intent !== null) workspace_edit_intent = input.workspace_edit_intent;

  // A valid work_kind_exception_v1 human decision has highest precedence.
  let appliedRef: HumanDecisionRefV1 | null = null;
  const payload = input.human_exception_payload;
  if (payload !== null && payload.decision_type === "work_kind_exception_v1") {
    if (input.human_exception_ref !== null && decisionRefValid({ ref: input.human_exception_ref, payload })) {
      if (payload.payload.work_kind !== undefined) work_kind = payload.payload.work_kind;
      if (payload.payload.docs_impact !== undefined) docs_impact = payload.payload.docs_impact;
      if (payload.payload.workspace_edit_intent !== undefined) workspace_edit_intent = payload.payload.workspace_edit_intent;
      appliedRef = input.human_exception_ref;
    } else {
      diagnostics.push(diagnostic("WORK_KIND_EXCEPTION_INVALID", "work_kind_exception_v1 decision hash/ref did not validate; exception ignored and stricter default retained.", "warning", "/lifecycle"));
    }
  }

  const plan = resolveRequiresImplementationPlan(work_kind, docs_impact, workspace_edit_intent, input.config_projection, appliedRef);
  const projection = ApprovedWorkKindResolutionProjectionV1Schema.parse({
    schema_version: SCHEMA_VERSION_V1,
    hash_algorithm: HASH_ALGORITHM_V1,
    resolver_version: RESOLVER_VERSION_V1,
    config_hash: sha256CanonicalJson(input.config_projection),
    human_exception_ref: appliedRef,
    work_kind,
    docs_impact,
    workspace_edit_intent,
    requires_implementation_plan: plan.requires_implementation_plan
  });
  return { projection, diagnostics };
}

export function workKindResolutionHash(projection: ApprovedWorkKindResolutionProjectionV1): string {
  return sha256CanonicalJson(ApprovedWorkKindResolutionProjectionV1Schema.parse(projection));
}
