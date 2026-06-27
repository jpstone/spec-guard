import { z } from "zod";
import { DiagnosticSchema, type Diagnostic } from "../schemas/embedded.ts";

export const DiagnosticSeveritySchema = z.enum(["error", "warning", "info"]);
export type DiagnosticSeverity = z.infer<typeof DiagnosticSeveritySchema>;

export interface DiagnosticCatalogEntry {
  code: string;
  severity: DiagnosticSeverity;
  category: string;
  message: string;
  spec_refs: string[];
  field_path?: string;
  gate?: string;
  fix?: string;
  maps_to?: string[];
}

export const diagnosticCatalog = [
  { code: "CHOICE_NON_BINARY_SOMETHING_ELSE_MISSING", severity: "error", category: "choice_authority", message: "Non-binary semantic choices must include a Something else option.", spec_refs: ["18", "19.1"], gate: "choice" },
  { code: "CHOICE_DISCUSS_MISSING", severity: "error", category: "choice_authority", message: "Human-gated choices must include a Discuss option.", spec_refs: ["18", "19.1"], gate: "choice" },
  { code: "CHOICE_CUSTOM_CONFIRMATION_REQUIRED", severity: "warning", category: "choice_authority", message: "Custom non-binary prose requires numbered confirmation before recording a decision.", spec_refs: ["18", "B.3"], gate: "choice" },
  { code: "BINARY_GATE_REPROMPT_REQUIRED", severity: "error", category: "choice_authority", message: "Binary gate discussion must re-prompt with Yes/No/Discuss.", spec_refs: ["18", "19.1"], gate: "human_gate" },
  { code: "AC_APPROVAL_REQUIRED", severity: "error", category: "approval_gates", message: "Acceptance criteria must be anchored (work.ac.establish) before packet approval.", spec_refs: ["18", "19.3"], field_path: "/lifecycle/ac_approval", gate: "work.ac.establish" },
  { code: "AC_REVIEW_SNAPSHOT_STALE", severity: "error", category: "approval_gates", message: "AC review snapshot is missing, stale, or does not match the reviewed payload.", spec_refs: ["18", "19.3"], gate: "work.ac.establish" },
  { code: "SOURCE_DERIVED_AC_EVIDENCE_MISSING", severity: "error", category: "source_traceability", message: "Source-derived acceptance criteria require source evidence and artifact refs.", spec_refs: ["18", "19.3"], field_path: "/acceptance_criteria" },
  { code: "RUNTIME_BASELINE_MISSING", severity: "error", category: "runtime_baseline", message: "A runtime baseline reference is required.", spec_refs: ["18", "19.4"], field_path: "/runtime_baseline_ref", gate: "work.approve" },
  { code: "RUNTIME_BASELINE_NOT_ACCEPTED", severity: "error", category: "runtime_baseline", message: "Runtime baseline must be accepted by a real HumanDecision before use.", spec_refs: ["18", "20"], field_path: "/runtime_baseline_ref" },
  { code: "RUNTIME_BASELINE_VALIDATION_FAILED", severity: "error", category: "runtime_baseline", message: "Runtime baseline deterministic validation failed or is stale.", spec_refs: ["18", "19.4"], field_path: "/validation" },
  { code: "RUNTIME_TARGET_REQUIRED", severity: "error", category: "runtime_baseline", message: "Runtime-relevant work (a runtime-producing classification or an app platform) must declare a target_id; it cannot be runtime-less.", spec_refs: ["RBTS", "5"], field_path: "/target_id", gate: "work.approve" },
  { code: "RUNTIME_NOT_RELEVANT_REASON_REQUIRED", severity: "error", category: "runtime_baseline", message: "A runtime-less (null target_id) packet that is not purely operational_document requires a human-approved runtime_not_relevant_reason.", spec_refs: ["RBTS", "5"], field_path: "/runtime_not_relevant_reason", gate: "work.approve" },
  { code: "RUNTIME_LESS_CONTRADICTED_BY_DIFF", severity: "error", category: "runtime_baseline", message: "A runtime-less packet changed executable source; runtime-less work must ship no code — declare a target_id.", spec_refs: ["RBTS", "5"], field_path: "/target_id", gate: "work.complete" },
  { code: "RUNTIME_BASELINE_TARGET_MISMATCH", severity: "error", category: "runtime_baseline", message: "runtime_baseline_ref.id does not match the packet's target_id; re-attach the correct target.", spec_refs: ["RBTS", "3"], field_path: "/runtime_baseline_ref", gate: "work.approve" },
  { code: "RUNTIME_TARGET_NOT_FOUND", severity: "error", category: "runtime_baseline", message: "No runtime baseline exists for the named target; establish it or attach an existing target.", spec_refs: ["RBTS", "4"], field_path: "/target_id", gate: "work.target.attach" },
  { code: "RUNTIME_TARGET_NOT_ACCEPTED", severity: "error", category: "runtime_baseline", message: "The named target's runtime baseline is not accepted; prove + accept it before inheriting.", spec_refs: ["RBTS", "4"], field_path: "/target_id", gate: "work.target.attach" },
  { code: "WORK_TARGET_ATTACH_APPROVED", severity: "error", category: "runtime_baseline", message: "A target can only be attached/inherited before approval; the packet is already approved.", spec_refs: ["RBTS", "4"], field_path: "/lifecycle/approval", gate: "work.target.attach" },
  { code: "WORK_TARGET_ATTACH_RUNTIME_LESS", severity: "error", category: "runtime_baseline", message: "work.target.attach requires a non-null target_id; a runtime-less packet has no baseline to inherit.", spec_refs: ["RBTS", "4"], field_path: "/target_id", gate: "work.target.attach" },
  { code: "WORK_TARGET_ATTACH_REJECTED", severity: "error", category: "runtime_baseline", message: "Attaching the target runtime baseline failed (read/update error).", spec_refs: ["RBTS", "4"], gate: "work.target.attach" },
  { code: "NEW_IN_EXISTING_TARGET_REQUIRED", severity: "error", category: "runtime_baseline", message: "new_in_existing requires an explicit, non-default target_id (the new app's id).", spec_refs: ["RBTS", "4.2"], field_path: "/target_id", gate: "work.create" },
  { code: "NEW_IN_EXISTING_TARGET_NOT_FRESH", severity: "error", category: "runtime_baseline", message: "new_in_existing target already has an accepted baseline; it is not new — use modify_existing to inherit it.", spec_refs: ["RBTS", "4.2"], field_path: "/target_id", gate: "work.create" },
  { code: "DEV_RUNTIME_PROOF_PLAN_REQUIRED", severity: "error", category: "runtime_baseline", message: "A packet establishing a new app target (dev-runtime-required platform) must declare a dev_runtime_proof (command + readiness assertion) on at least one Spec's plan, reviewed at approval.", spec_refs: ["RBTS", "4.3"], field_path: "/specs", gate: "work.approve" },
  { code: "PACKET_CHANGE_BASELINE_MISSING", severity: "error", category: "implementation_boundary", message: "Packet change baseline is required before implementation starts.", spec_refs: ["18", "19.4"], field_path: "/change_baseline", gate: "work.authorize" },
  { code: "IMPLEMENTATION_SOURCE_DIRTY_AT_AUTHORIZATION", severity: "error", category: "implementation_boundary", message: "Dirty implementation source at authorization blocks the gate.", spec_refs: ["18", "19.7"], gate: "work.authorize" },
  { code: "CHANGED_FILES_OUTSIDE_ALLOWED_GLOBS", severity: "error", category: "implementation_boundary", message: "Changed product files are outside approved allowed globs.", spec_refs: ["18", "19.7"], field_path: "/scope/allowed_globs" },
  { code: "CLASSIFICATION_INVALID", severity: "error", category: "docs_classification", message: "Work classification must be one of Appendix C.1.", spec_refs: ["18", "C.1"], field_path: "/classification" },
  { code: "DOCS_POLICY_INVALID", severity: "error", category: "docs_classification", message: "Docs policy is invalid for classification or required contract surface.", spec_refs: ["18", "19.5"], field_path: "/docs/policy" },
  { code: "DOCS_REQUIRED_BUT_MISSING", severity: "error", category: "docs_classification", message: "Required documentation evidence is missing.", spec_refs: ["18", "19.5"], gate: "work.loop.record" },
  { code: "BACKEND_VERIFIER_DISABLED", severity: "error", category: "backend_verification", message: "Required backend verification cannot run while the verifier is disabled.", spec_refs: ["18", "19.6"] },
  { code: "BACKEND_VERIFIER_MISCONFIGURED", severity: "error", category: "backend_verification", message: "Verifier adapter is unavailable, misconfigured, unhealthy, or returned invalid data.", spec_refs: ["18", "19.6"] },
  { code: "VERIFIER_HUMAN_INTENT_JUDGMENT_PROHIBITED", severity: "error", category: "backend_verification", message: "Backend verifier attempted to judge human-approved intent.", spec_refs: ["18", "21"], fix: "Adjust verifier task inputs to avoid human-approved content judgment." },
  { code: "SOURCE_ARTIFACT_REF_UNRESOLVED", severity: "error", category: "source_traceability", message: "Source artifact reference could not be resolved.", spec_refs: ["18", "19.3"], field_path: "/source_artifact_refs" },
  { code: "SOURCE_ARTIFACT_CONTENT_HASH_MISMATCH", severity: "error", category: "source_traceability", message: "Source artifact content hash does not match referenced revision.", spec_refs: ["18", "19.3"], field_path: "/source_artifact_refs" },
  { code: "APPROVED_FIELDS_MISSING", severity: "error", category: "decision_binding", message: "Approved fields are missing for a registered approving decision.", spec_refs: ["18", "4.4", "B.3"] },
  { code: "APPROVAL_HASH_STALE", severity: "error", category: "decision_binding", message: "Approval hash or approved payload is stale.", spec_refs: ["18", "4.4"], gate: "approval" },
  { code: "APPROVED_FIELD_UPDATE_INVALIDATED", severity: "warning", category: "decision_binding", message: "Update touched approved fields and invalidated dependent approvals.", spec_refs: ["18", "20"], fix: "Re-run affected human gates." },
  { code: "PROTECTED_APPROVED_FIELD_UPDATE_REJECTED", severity: "error", category: "decision_binding", message: "Protected approved-field update was rejected.", spec_refs: ["18", "B.3"] },
  { code: "COMMAND_RESULT_MISSING", severity: "error", category: "evidence_kernel", message: "Command-backed evidence requires a kernel-created CommandResult.", spec_refs: ["18", "19.7"], field_path: "/command_result_ref" },
  { code: "COMMAND_RESULT_INCOMPATIBLE", severity: "error", category: "evidence_kernel", message: "CommandResult status, purpose, or execution context is incompatible with evidence type.", spec_refs: ["18", "19.7"] },
  { code: "REVIEW_TRACEABILITY_MISSING", severity: "error", category: "review_completion", message: "Review traceability evidence is missing.", spec_refs: ["18", "19.7"], gate: "work.loop.record" },
  { code: "FINAL_CLAIM_UNSUPPORTED", severity: "error", category: "review_completion", message: "Final claim is unsupported, contradicted, or unverified where verification is required.", spec_refs: ["18", "19.7"], field_path: "/claims" },
  { code: "CLI_MCP_PARITY_MISSING", severity: "error", category: "interface_parity", message: "CLI/MCP/Pi parity is missing or inconsistent.", spec_refs: ["18", "19.8", "B.2"] },
  { code: "MIGRATION_LEGACY_FIELD_MAPPED", severity: "warning", category: "migration", message: "Legacy synonymous field was mapped to canonical schema-safe field.", spec_refs: ["20"] },
  { code: "MIGRATION_APPROVALS_INVALIDATED", severity: "warning", category: "migration", message: "Migration changed approved semantics and invalidated affected approvals.", spec_refs: ["20"] },
  { code: "MIGRATION_BASELINE_ACCEPTANCE_NOT_FABRICATED", severity: "warning", category: "migration", message: "Legacy runtime acceptance marker was not converted into a fabricated HumanDecision.", spec_refs: ["20", "21"] },
  { code: "MIGRATION_VERIFIER_RECORD_NOT_FABRICATED", severity: "warning", category: "migration", message: "Legacy verifier-shaped data was not converted into fabricated BackendVerification records.", spec_refs: ["20", "21"] },
  { code: "RELEASE_READINESS_CHECK_FAILED", severity: "error", category: "release_readiness", message: "Release readiness check failed.", spec_refs: ["22"] }
] as const satisfies readonly DiagnosticCatalogEntry[];

export const requiredDiagnosticCategories = [
  "choice_authority",
  "approval_gates",
  "runtime_baseline",
  "implementation_boundary",
  "docs_classification",
  "backend_verification",
  "source_traceability",
  "decision_binding",
  "evidence_kernel",
  "review_completion",
  "interface_parity",
  "migration",
  "release_readiness"
] as const;

export function catalogDiagnostic(code: string, overrides: Partial<Omit<Diagnostic, "code">> = {}): Diagnostic {
  const entry = diagnosticCatalog.find((candidate) => candidate.code === code) as DiagnosticCatalogEntry | undefined;
  if (entry === undefined) throw new Error(`unknown diagnostic catalog code: ${code}`);
  return DiagnosticSchema.parse({
    code: entry.code,
    severity: overrides.severity ?? entry.severity,
    message: overrides.message ?? entry.message,
    field_path: overrides.field_path ?? entry.field_path ?? null,
    gate: overrides.gate ?? entry.gate ?? null,
    fix: overrides.fix ?? entry.fix ?? null
  });
}
