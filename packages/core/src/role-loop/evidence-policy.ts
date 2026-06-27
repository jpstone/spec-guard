import { z } from "zod";
import type { Diagnostic } from "../schemas/embedded.ts";
import { sha256CanonicalJson } from "./canonical-hash.ts";
import {
  APPROVAL_PROJECTION_VERSION_V1,
  CONFIG_PROJECTION_V1,
  HASH_ALGORITHM_V1,
  POLICY_ID_V1,
  POLICY_VERSION_V1,
  RESOLVER_VERSION_V1,
  SCHEMA_VERSION_V1,
  type SpecGuardPolicyConfigProjectionV1
} from "./constants.ts";
import {
  AcEvidenceClassificationSchema,
  EvidenceModeSchema,
  EvidencePolicyIdentityBindingPolicySchema,
  EvidenceRequirementSchema,
  PlanTestEntryKindSchema,
  RequiredForSchema,
  ValidationRequirementSourceSchema,
  WaiverAuthoritySchema,
  type AcEvidenceClassification,
  type EvidenceMode,
  type EvidenceRequirement,
  type RequiredFor,
  type WaiverAuthority
} from "./enums.ts";
import { decisionRefValid, ProducerIdentitySchema, type DecisionWithRefV1 } from "./human-decision.ts";
import { acContentHashV1, type AcceptanceCriterionProjectionV1 } from "./nested-projections.ts";
import { implementationPlanHash, type ApprovedImplementationPlanProjectionV1, type PlanTestV1 } from "./implementation-plan.ts";
import type { ApprovedWorkKindResolutionProjectionV1 } from "./work-kind.ts";

// EvidenceRequirementRef + RequiredEvidenceGateEntryV1 (Normative appendix).
export const EvidenceRequirementRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("evidence"), evidence: EvidenceRequirementSchema }).strict(),
  z.object({ kind: z.literal("validation_requirement"), requirement_id: z.string() }).strict()
]);
export type EvidenceRequirementRef = z.infer<typeof EvidenceRequirementRefSchema>;

export const RequiredEvidenceGateEntryV1Schema = z.object({
  requirement: EvidenceRequirementRefSchema,
  waiver_authority: WaiverAuthoritySchema.nullable(),
  requires_reviewer_attestation: z.boolean()
}).strict();
export type RequiredEvidenceGateEntryV1 = z.infer<typeof RequiredEvidenceGateEntryV1Schema>;

export const ValidationRequirementV1Schema = z.object({
  requirement_id: z.string(),
  source: ValidationRequirementSourceSchema,
  command_or_evidence: z.string(),
  evidence_type: EvidenceRequirementSchema,
  required_for: RequiredForSchema
}).strict();
export type ValidationRequirementV1 = z.infer<typeof ValidationRequirementV1Schema>;

export const EvidencePolicyPerAcV1Schema = z.object({
  ac_id: z.string(),
  ac_content_hash: z.string(),
  mode: EvidenceModeSchema,
  classification: AcEvidenceClassificationSchema,
  rationale_code: z.string(),
  appropriate_evidence_rationale_code: z.string().nullable(),
  required_evidence: z.array(EvidenceRequirementSchema),
  required_before_authorization: z.array(RequiredEvidenceGateEntryV1Schema),
  required_before_completion: z.array(RequiredEvidenceGateEntryV1Schema),
  validation_requirements: z.array(ValidationRequirementV1Schema)
}).strict();
export type EvidencePolicyPerAcV1 = z.infer<typeof EvidencePolicyPerAcV1Schema>;

export const ApprovedEvidencePolicyProjectionV1Schema = z.object({
  schema_version: z.number().int(),
  approval_projection_version: z.number().int(),
  hash_algorithm: z.literal(HASH_ALGORITHM_V1),
  identity_binding_policy: EvidencePolicyIdentityBindingPolicySchema,
  policy_id: z.string(),
  policy_version: z.number().int(),
  config_hash: z.string(),
  resolver_version: z.number().int(),
  per_ac: z.array(EvidencePolicyPerAcV1Schema),
  approval_bound_resolver_ref: ProducerIdentitySchema.nullable()
}).strict().superRefine((value, ctx) => {
  if (value.identity_binding_policy === "content_only" && value.approval_bound_resolver_ref !== null) {
    ctx.addIssue({ code: "custom", path: ["approval_bound_resolver_ref"], message: "content_only evidence policy must emit approval_bound_resolver_ref as null" });
  }
  if (value.identity_binding_policy === "bind_resolver_identity" && value.approval_bound_resolver_ref === null) {
    ctx.addIssue({ code: "custom", path: ["approval_bound_resolver_ref"], message: "bind_resolver_identity evidence policy requires approval_bound_resolver_ref" });
  }
});
export type ApprovedEvidencePolicyProjectionV1 = z.infer<typeof ApprovedEvidencePolicyProjectionV1Schema>;

export interface EvidencePolicyResolverInputV1 {
  work_packet_id: string;
  packet_classification: string;
  work_kind_resolution: ApprovedWorkKindResolutionProjectionV1;
  implementation_plan: ApprovedImplementationPlanProjectionV1 | null;
  acceptance_criterion: AcceptanceCriterionProjectionV1;
  human_decisions: DecisionWithRefV1[];
  config_projection: SpecGuardPolicyConfigProjectionV1;
}

export interface EvidencePolicyPerAcResolution {
  per_ac: EvidencePolicyPerAcV1;
  diagnostics: Diagnostic[];
}

function diagnostic(code: string, message: string, severity: Diagnostic["severity"], fieldPath: string | null = null): Diagnostic {
  return { code, severity, message, field_path: fieldPath, gate: null, fix: null };
}

// Higher rank == stricter mode (used for tighten/weaken decisions in step 4).
const MODE_STRICTNESS: Record<EvidenceMode, number> = {
  reproduction_evidence_required: 4,
  automated_tests_required: 3,
  docs_config_evidence_required: 2,
  appropriate_evidence_required: 1,
  manual_or_smoke_allowed: 0
};

function requiresAttestation(evidence: EvidenceRequirement): boolean {
  return evidence === "manual_smoke" || evidence === "target_rendered_runtime_smoke";
}

function planWaiverAuthority(evidence: EvidenceRequirement): WaiverAuthority {
  switch (evidence) {
    case "manual_smoke":
    case "target_rendered_runtime_smoke":
    case "review_attestation":
      return "reviewer";
    default:
      // automated_test, passing_command, reproduction, target_rendered_runtime_e2e,
      // target_rendered_runtime_reproduction, docs_static_check (command/static practical).
      return "human";
  }
}

function classificationForMode(mode: EvidenceMode): AcEvidenceClassification {
  switch (mode) {
    case "reproduction_evidence_required": return "bug_regression";
    case "automated_tests_required": return "behavior_change";
    case "docs_config_evidence_required": return "docs_config";
    case "manual_or_smoke_allowed": return "manual_smoke";
    case "appropriate_evidence_required": return "other";
  }
}

function baseRationaleCode(mode: EvidenceMode, packetClassification: string): string {
  if (packetClassification === "bugfix") return "source_mode_packet_classification_bugfix";
  return `source_mode_${mode}`;
}

function evidenceGateEntry(evidence: EvidenceRequirement, waiver: WaiverAuthority | null): RequiredEvidenceGateEntryV1 {
  return { requirement: { kind: "evidence", evidence }, waiver_authority: waiver, requires_reviewer_attestation: requiresAttestation(evidence) };
}

function validationGateEntry(requirementId: string, evidenceType: EvidenceRequirement, waiver: WaiverAuthority | null): RequiredEvidenceGateEntryV1 {
  return { requirement: { kind: "validation_requirement", requirement_id: requirementId }, waiver_authority: waiver, requires_reviewer_attestation: requiresAttestation(evidenceType) };
}

function normalizeCommandOrEvidence(entryKind: z.infer<typeof PlanTestEntryKindSchema>, raw: string): string {
  let value = raw.replace(/\r\n/g, "\n").trim();
  if (entryKind === "path") value = value.replace(/\\/g, "/");
  return value;
}

// requirement_id = "vr_" + sha256(canonicalJson({ ac_id, source, source_ref_hash, entry_kind,
// normalized_command_or_evidence, evidence_type, required_for, duplicate_ordinal })).
function makeRequirementId(parts: {
  ac_id: string;
  source: z.infer<typeof ValidationRequirementSourceSchema>;
  source_ref_hash: string;
  entry_kind: z.infer<typeof PlanTestEntryKindSchema>;
  normalized_command_or_evidence: string;
  evidence_type: EvidenceRequirement;
  required_for: RequiredFor;
  duplicate_ordinal: number;
}): string {
  return `vr_${sha256CanonicalJson(parts)}`;
}

function planTestsForAc(plan: ApprovedImplementationPlanProjectionV1 | null, acId: string): PlanTestV1[] {
  if (plan === null || plan.kind !== "standard_plan") return [];
  return plan.tests.filter((test) => test.ac_ids.includes(acId));
}

export function resolveEvidencePolicyPerAc(input: EvidencePolicyResolverInputV1): EvidencePolicyPerAcResolution {
  const diagnostics: Diagnostic[] = [];
  const acId = input.acceptance_criterion.id;
  const acContentHash = acContentHashV1(input.acceptance_criterion);

  // Valid human decisions bound to this AC, in decision order.
  const validDecisions = input.human_decisions.filter((decision) => decisionRefValid(decision));
  const acClassificationDecisions = validDecisions
    .filter((decision) => decision.payload.decision_type === "ac_evidence_classification_v1" && decision.payload.payload.ac_id === acId);
  const additionalRequirementDecisions = validDecisions
    .filter((decision) => decision.payload.decision_type === "additional_validation_requirement_v1" && decision.payload.payload.ac_id === acId);
  const preapprovalIntents = validDecisions
    .filter((decision) => decision.payload.decision_type === "preapproval_waiver_intent_v1" && decision.payload.payload.ac_id === acId);
  for (const intent of preapprovalIntents) {
    diagnostics.push(diagnostic("EVIDENCE_PREAPPROVAL_WAIVER_INTENT_RECORDED", `preapproval_waiver_intent_v1 for ${acId} recorded as intent only; not an effective waiver until materialized post-approval.`, "info", "/acceptance_criteria"));
  }

  // Step 3: source_mode (reads only the `classification` field of AC decisions).
  let mode: EvidenceMode;
  let rationaleCode: string;
  const hasBugRegressionSignal = acClassificationDecisions.some((decision) => decision.payload.decision_type === "ac_evidence_classification_v1" && decision.payload.payload.classification === "bug_regression");
  if (hasBugRegressionSignal) {
    mode = "reproduction_evidence_required";
    rationaleCode = "source_mode_human_bug_regression_signal";
  } else if (input.packet_classification === "bugfix") {
    mode = "reproduction_evidence_required";
    rationaleCode = baseRationaleCode(mode, input.packet_classification);
  } else {
    const workKind = input.work_kind_resolution.work_kind;
    if (workKind === "docs_only" || workKind === "config_tooling") mode = "docs_config_evidence_required";
    else if (workKind === "analysis_only") mode = "appropriate_evidence_required";
    else if (workKind === "product_code_change" || workKind === "test_or_evidence_change") mode = "automated_tests_required";
    else mode = "appropriate_evidence_required";
    rationaleCode = baseRationaleCode(mode, input.packet_classification);
  }

  // Step 4: a valid AC decision may tighten directly, or weaken only with reclassifies_signal.
  let classification = classificationForMode(mode);
  for (const decision of acClassificationDecisions) {
    if (decision.payload.decision_type !== "ac_evidence_classification_v1") continue;
    const payload = decision.payload.payload;
    const targetRank = MODE_STRICTNESS[payload.mode];
    const currentRank = MODE_STRICTNESS[mode];
    if (targetRank >= currentRank) {
      mode = payload.mode;
      classification = payload.classification;
      rationaleCode = payload.rationale_code;
    } else if (payload.reclassifies_signal) {
      mode = payload.mode;
      classification = payload.classification;
      rationaleCode = payload.rationale_code;
    } else {
      diagnostics.push(diagnostic("EVIDENCE_MODE_WEAKEN_IGNORED", `ac_evidence_classification_v1 for ${acId} attempted to weaken evidence mode without reclassifies_signal; source mode retained.`, "warning", "/acceptance_criteria"));
    }
  }

  const validationRequirements: ValidationRequirementV1[] = [];
  const authEntries: RequiredEvidenceGateEntryV1[] = [];
  const completionEntries: RequiredEvidenceGateEntryV1[] = [];
  const duplicateCounts = new Map<string, number>();

  function appendValidationRequirement(args: {
    source: z.infer<typeof ValidationRequirementSourceSchema>;
    source_ref_hash: string;
    entry_kind: z.infer<typeof PlanTestEntryKindSchema>;
    command_or_evidence: string;
    evidence_type: EvidenceRequirement;
    required_for: RequiredFor;
    waiver_authority: WaiverAuthority | null;
  }): void {
    const normalized = normalizeCommandOrEvidence(args.entry_kind, args.command_or_evidence);
    const tupleKey = sha256CanonicalJson({ ac_id: acId, source: args.source, source_ref_hash: args.source_ref_hash, entry_kind: args.entry_kind, normalized_command_or_evidence: normalized, evidence_type: args.evidence_type, required_for: args.required_for });
    const ordinal = duplicateCounts.get(tupleKey) ?? 0;
    duplicateCounts.set(tupleKey, ordinal + 1);
    const requirementId = makeRequirementId({ ac_id: acId, source: args.source, source_ref_hash: args.source_ref_hash, entry_kind: args.entry_kind, normalized_command_or_evidence: normalized, evidence_type: args.evidence_type, required_for: args.required_for, duplicate_ordinal: ordinal });
    validationRequirements.push({ requirement_id: requirementId, source: args.source, command_or_evidence: normalized, evidence_type: args.evidence_type, required_for: args.required_for });
    const entry = validationGateEntry(requirementId, args.evidence_type, args.waiver_authority);
    if (args.required_for === "authorization") authEntries.push(entry);
    else completionEntries.push(entry);
  }

  // Step 5: base gate entries from the selected mode.
  let appropriateEvidenceRationaleCode: string | null = null;
  switch (mode) {
    case "reproduction_evidence_required":
      authEntries.push(evidenceGateEntry("reproduction", "human"));
      completionEntries.push(evidenceGateEntry("passing_command", "human_and_reviewer"));
      break;
    case "automated_tests_required":
      completionEntries.push(evidenceGateEntry("automated_test", "human"));
      completionEntries.push(evidenceGateEntry("passing_command", "human"));
      break;
    default:
      break;
  }

  // Step 6: implementation-plan tests become validation requirements (plan order).
  const planHash = input.implementation_plan !== null ? implementationPlanHash(input.implementation_plan) : null;
  const planTests = planTestsForAc(input.implementation_plan, acId);
  for (const test of planTests) {
    appendValidationRequirement({
      source: "implementation_plan_test",
      source_ref_hash: planHash ?? "",
      entry_kind: test.entry_kind,
      command_or_evidence: test.command_or_path,
      evidence_type: test.evidence_type,
      required_for: test.required_for,
      waiver_authority: planWaiverAuthority(test.evidence_type)
    });
  }

  // Step 7: additional_validation_requirement_v1 decisions (decision order).
  for (const decision of additionalRequirementDecisions) {
    if (decision.payload.decision_type !== "additional_validation_requirement_v1") continue;
    const payload = decision.payload.payload;
    appendValidationRequirement({
      source: "human_decision",
      source_ref_hash: decision.ref.decision_hash,
      entry_kind: payload.entry_kind,
      command_or_evidence: payload.command_or_evidence,
      evidence_type: payload.evidence_type,
      required_for: payload.required_for,
      waiver_authority: payload.waiver_authority
    });
  }

  // Mode-specific completion fallbacks that depend on whether plan/static evidence exists.
  const hasCommandCapablePlanTest = planTests.some((test) => test.entry_kind === "shell_command");
  if (mode === "appropriate_evidence_required" && !hasCommandCapablePlanTest && validationRequirements.length === 0) {
    completionEntries.push(evidenceGateEntry("review_attestation", "reviewer"));
    appropriateEvidenceRationaleCode = "no_command_evidence_review_attestation";
  }
  if (mode === "docs_config_evidence_required" && validationRequirements.length === 0) {
    completionEntries.push(evidenceGateEntry("docs_static_check", "human"));
  }
  if (mode === "manual_or_smoke_allowed") {
    completionEntries.push(evidenceGateEntry("manual_smoke", "reviewer"));
  }

  const requiredEvidence = requiredEvidenceSummary(mode, planTests);

  const per_ac = EvidencePolicyPerAcV1Schema.parse({
    ac_id: acId,
    ac_content_hash: acContentHash,
    mode,
    classification,
    rationale_code: rationaleCode,
    appropriate_evidence_rationale_code: appropriateEvidenceRationaleCode,
    required_evidence: requiredEvidence,
    required_before_authorization: authEntries,
    required_before_completion: completionEntries,
    validation_requirements: validationRequirements
  });
  return { per_ac, diagnostics };
}

function requiredEvidenceSummary(mode: EvidenceMode, planTests: PlanTestV1[]): EvidenceRequirement[] {
  switch (mode) {
    case "reproduction_evidence_required": return ["reproduction", "passing_command"];
    case "automated_tests_required": return ["automated_test", "passing_command"];
    case "manual_or_smoke_allowed": return ["manual_smoke", "review_attestation"];
    case "docs_config_evidence_required": {
      const fromPlan = distinctEvidence(planTests);
      return fromPlan.length > 0 ? fromPlan : ["docs_static_check"];
    }
    case "appropriate_evidence_required": {
      const fromPlan = distinctEvidence(planTests);
      return fromPlan.length > 0 ? fromPlan : ["review_attestation"];
    }
  }
}

function distinctEvidence(planTests: PlanTestV1[]): EvidenceRequirement[] {
  const seen: EvidenceRequirement[] = [];
  for (const test of planTests) if (!seen.includes(test.evidence_type)) seen.push(test.evidence_type);
  return seen;
}

export interface ApprovedEvidencePolicyInput {
  work_packet_id: string;
  packet_classification: string;
  work_kind_resolution: ApprovedWorkKindResolutionProjectionV1;
  implementation_plan: ApprovedImplementationPlanProjectionV1 | null;
  acceptance_criteria: AcceptanceCriterionProjectionV1[];
  human_decisions?: DecisionWithRefV1[];
  config_projection?: SpecGuardPolicyConfigProjectionV1;
  identity_binding_policy?: z.infer<typeof EvidencePolicyIdentityBindingPolicySchema>;
  approval_bound_resolver_ref?: z.infer<typeof ProducerIdentitySchema> | null;
}

export interface ApprovedEvidencePolicyResolution {
  projection: ApprovedEvidencePolicyProjectionV1;
  diagnostics: Diagnostic[];
}

export function buildApprovedEvidencePolicyProjectionV1(input: ApprovedEvidencePolicyInput): ApprovedEvidencePolicyResolution {
  const config = input.config_projection ?? CONFIG_PROJECTION_V1;
  const humanDecisions = input.human_decisions ?? [];
  const policy = input.identity_binding_policy ?? "content_only";
  const diagnostics: Diagnostic[] = [];
  const per_ac = input.acceptance_criteria.map((ac) => {
    const resolution = resolveEvidencePolicyPerAc({
      work_packet_id: input.work_packet_id,
      packet_classification: input.packet_classification,
      work_kind_resolution: input.work_kind_resolution,
      implementation_plan: input.implementation_plan,
      acceptance_criterion: ac,
      human_decisions: humanDecisions,
      config_projection: config
    });
    diagnostics.push(...resolution.diagnostics);
    return resolution.per_ac;
  });
  const resolverRef = policy === "content_only" ? null : (input.approval_bound_resolver_ref ?? null);
  const projection = ApprovedEvidencePolicyProjectionV1Schema.parse({
    schema_version: SCHEMA_VERSION_V1,
    approval_projection_version: APPROVAL_PROJECTION_VERSION_V1,
    hash_algorithm: HASH_ALGORITHM_V1,
    identity_binding_policy: policy,
    policy_id: POLICY_ID_V1,
    policy_version: POLICY_VERSION_V1,
    config_hash: sha256CanonicalJson(config),
    resolver_version: RESOLVER_VERSION_V1,
    per_ac,
    approval_bound_resolver_ref: resolverRef
  });
  return { projection, diagnostics };
}

export function evidencePolicyResolutionHash(projection: ApprovedEvidencePolicyProjectionV1): string {
  return sha256CanonicalJson(ApprovedEvidencePolicyProjectionV1Schema.parse(projection));
}
