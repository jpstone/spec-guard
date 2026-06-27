import type { WorkPacket } from "../schemas/artifacts.ts";
import type { WorkClassification } from "../schemas/enums.ts";
import { WorkClassificationSchema } from "../schemas/enums.ts";
import { isApiContractSurface } from "./docs-policy.ts";

export interface ArchitectureRequirementDefaults {
  required: boolean;
  required_reason: string | null;
  not_required_reason: string | null;
}

const NON_EXCEPTION_ARCHITECTURE_REASONS = new Set([
  "",
  "legacy_migration_unspecified",
  "classification_default_localized_or_direct",
  "operational_document_docs_only",
  "none",
  "n/a",
  "na",
  "not_applicable",
  "not applicable",
  "todo",
  "tbd",
  "undefined",
  "null"
]);

export function architectureRequirementDefaults(classification: WorkClassification): ArchitectureRequirementDefaults {
  if (isApiContractSurface(classification)) return { required: true, required_reason: "api_contract_surface", not_required_reason: null };
  if (classification === "one_off_application_ui") return { required: true, required_reason: "greenfield_app_stack_choice_required", not_required_reason: null };
  if (classification === "operational_document") return { required: false, required_reason: null, not_required_reason: "operational_document_docs_only" };
  return { required: false, required_reason: null, not_required_reason: "classification_default_localized_or_direct" };
}

// Stack (framework/tooling) required-ness, decoupled from architecture so origination can require a
// stack choice while architecture is inherited (v2, "new in existing"). v1 keeps the same classification
// condition as architecture, so behavior is unchanged; this is the seam Slice 2 / v2 vary independently.
export function stackRequirementDefaults(classification: WorkClassification): ArchitectureRequirementDefaults {
  return architectureRequirementDefaults(classification);
}

export function architectureRequirementDefaultsForUnknownClassification(classification: unknown): ArchitectureRequirementDefaults {
  const parsed = WorkClassificationSchema.safeParse(classification);
  return architectureRequirementDefaults(parsed.success ? parsed.data : "direct_behavior");
}

export function isArchitectureRequiredByClassification(classification: WorkClassification): boolean {
  return architectureRequirementDefaults(classification).required;
}

export function isValidArchitectureNotRequiredReason(reason: string | null | undefined): boolean {
  if (typeof reason !== "string") return false;
  const trimmed = reason.trim();
  const normalized = trimmed.toLowerCase().replaceAll(/\s+/g, "_");
  if (trimmed.length < 12) return false;
  if (NON_EXCEPTION_ARCHITECTURE_REASONS.has(trimmed.toLowerCase()) || NON_EXCEPTION_ARCHITECTURE_REASONS.has(normalized)) return false;
  if (trimmed.toLowerCase().includes("lorem ipsum") || trimmed.toLowerCase().includes("as an ai language model")) return false;
  return true;
}

export function architectureRequirementStateFor(classification: WorkClassification, architecture: { required: boolean; required_reason: string | null; not_required_reason: string | null }): { required: boolean; classification_required: boolean; has_valid_exception: boolean; required_reason: string | null } {
  const defaults = architectureRequirementDefaults(classification);
  const hasValidException = defaults.required && architecture.required === false && isValidArchitectureNotRequiredReason(architecture.not_required_reason);
  return {
    required: architecture.required || (defaults.required && !hasValidException),
    classification_required: defaults.required,
    has_valid_exception: hasValidException,
    required_reason: architecture.required_reason ?? defaults.required_reason
  };
}

export function architectureRequirementState(work: WorkPacket): { required: boolean; classification_required: boolean; has_valid_exception: boolean; required_reason: string | null } {
  return architectureRequirementStateFor(work.classification, work.architecture);
}

export function assertArchitectureRequirementConsistent(work: WorkPacket): void {
  if (work.architecture.required && (work.architecture.required_reason ?? "").trim().length === 0) throw new Error("architecture.required true requires non-empty required_reason");
  if (isArchitectureRequiredByClassification(work.classification) && work.architecture.required === false && !isValidArchitectureNotRequiredReason(work.architecture.not_required_reason)) {
    throw new Error("classification requires architecture/stack choice; architecture.required cannot be false without an explicit documented exception in architecture.not_required_reason");
  }
}
