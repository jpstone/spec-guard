import type { DocsPolicy, WorkClassification } from "../schemas/enums.ts";

export function isApiContractSurface(classification: WorkClassification): boolean {
  return classification === "reusable_api" || classification === "rest_api" || classification === "reusable_ui";
}

// UI classifications are the ones that actually render a UI, so a mockup/design reference can drive the
// features/ACs. Used to nudge "ask for a mockup before features" for these classifications only.
export function isUiClassification(classification: WorkClassification): boolean {
  return classification === "reusable_ui" || classification === "one_off_application_ui";
}

export function defaultDocsPolicy(classification: WorkClassification): DocsPolicy {
  return isApiContractSurface(classification) || classification === "operational_document" ? "required" : "none_required";
}

export function validateDocsPolicyForClassification(input: { classification: WorkClassification; policy: DocsPolicy; none_required_reason?: string | null; not_applicable_reason?: string | null }): string | null {
  if (isApiContractSurface(input.classification) && input.policy !== "required") return "API/contract-surface classifications require docs policy required";
  if (input.classification === "operational_document" && input.policy !== "required") return "operational_document requires docs policy required";
  if (input.policy === "not_applicable" && (input.not_applicable_reason ?? "").trim().length === 0) return "not_applicable docs policy requires docs_not_applicable_reason";
  if (input.policy === "none_required" && (input.none_required_reason ?? "").trim().length === 0) return "none_required docs policy requires none_required_reason";
  return null;
}
