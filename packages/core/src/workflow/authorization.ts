import type { Config } from "../schemas/artifacts.ts";
import type { Diagnostic } from "../schemas/embedded.ts";
import { matchesAnyGlob } from "../paths/glob.ts";
import { classifyPath } from "../paths/classify.ts";
import { evaluateEvidenceReadiness } from "../role-loop/readiness.ts";
import type { ApprovedEvidencePolicyProjectionV1 } from "../role-loop/evidence-policy.ts";
import type { EvidenceRefV1, EvidenceWaiverV1 } from "../role-loop/evidence-refs.ts";
import { EMPTY_SOURCE_FACTS_V1, type SourceFactsV1 } from "../role-loop/source-facts.ts";

/** M6: turn the M1B authorization-gate readiness predicates + the M3 boundary machinery into actual
 * enforcement — implementation/fix/evidence-prep authorization, reproduction-evidence gating, and
 * drift classification of a sealed attempt's changed files. These deterministic gates are consumed by
 * the dispatch flow (M8) and the review/state machine (M7/M9); M6 itself does not run subagents. */

export type AuthorizationKind = "implementation" | "fix" | "evidence_preparation";

// --- Drift classification ---------------------------------------------------------------------

export type DriftCategory = "planned_files" | "review_justifiable_drift" | "approval_required_drift" | "forbidden";

/** Deterministic triggers that force clarification/human approval even inside allowed globs (design
 * "approved implementation boundary"): dependency manifests, runtime/build config, migrations,
 * auth/security/privacy-sensitive paths, CI/release, container, and generated outputs. */
export const APPROVAL_REQUIRED_DRIFT_TRIGGERS: string[] = [
  "**/package.json",
  "package.json",
  "**/package-lock.json",
  "package-lock.json",
  "**/pnpm-lock.yaml",
  "**/yarn.lock",
  "**/tsconfig*.json",
  "tsconfig*.json",
  "**/migrations/**",
  "**/migration/**",
  "**/auth/**",
  "**/security/**",
  ".github/workflows/**",
  "**/Dockerfile",
  "**/docker-compose*.yml",
  "**/generated/**"
];

export interface DriftContext {
  expectedFiles: string[];
  allowedGlobs: string[];
  approvalRequiredTriggers?: string[];
}

/** Classify one changed path against the approved implementation boundary. Order: planned (in the
 * approved plan) → forbidden (outside allowed globs) → approval-required trigger → review-justifiable. */
export function classifyDrift(changedPath: string, ctx: DriftContext): DriftCategory {
  const triggers = ctx.approvalRequiredTriggers ?? APPROVAL_REQUIRED_DRIFT_TRIGGERS;
  if (matchesAnyGlob(changedPath, ctx.expectedFiles)) return "planned_files";
  if (!matchesAnyGlob(changedPath, ctx.allowedGlobs)) return "forbidden";
  if (matchesAnyGlob(changedPath, triggers)) return "approval_required_drift";
  return "review_justifiable_drift";
}

export interface AttemptBoundaryClassification {
  path: string;
  drift: DriftCategory;
}

export interface AttemptBoundaryResult {
  classifications: AttemptBoundaryClassification[];
  blocked: boolean;
  diagnostics: Diagnostic[];
}

const DRIFT_BLOCKING: Record<DriftCategory, boolean> = {
  planned_files: false,
  review_justifiable_drift: false,
  approval_required_drift: true,
  forbidden: true
};

/** Classify all of a sealed attempt's changed files; `forbidden` and `approval_required_drift` block
 * (the latter needs clarification/human approval and usually stales packet approval). */
export function evaluateAttemptBoundary(changedFiles: readonly string[], ctx: DriftContext): AttemptBoundaryResult {
  const classifications = changedFiles.map((path) => ({ path, drift: classifyDrift(path, ctx) }));
  const violations = classifications.filter((entry) => DRIFT_BLOCKING[entry.drift]);
  const diagnostics: Diagnostic[] = violations.map((violation) => ({
    code: violation.drift === "forbidden" ? "ATTEMPT_FILE_FORBIDDEN" : "ATTEMPT_FILE_APPROVAL_REQUIRED",
    severity: "error",
    message: violation.drift === "forbidden"
      ? `Changed file is outside the approved boundary (allowed globs): ${violation.path}`
      : `Changed file requires clarification/human approval before acceptance: ${violation.path}`,
    field_path: "/review/changed_files",
    gate: null,
    fix: violation.drift === "forbidden" ? "Revert it or extend the approved scope." : "Obtain human approval (re-approving the packet) or revert it."
  }));
  return { classifications, blocked: violations.length > 0, diagnostics };
}

// --- Evidence-preparation scope ---------------------------------------------------------------

/** Evidence preparation may touch only test/repro/fixture/evidence paths — never product source.
 * A product-source change during evidence prep is blocking. */
export function evaluateEvidencePreparationScope(changedFiles: readonly string[], config: Config): { blocked: boolean; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  for (const raw of changedFiles) {
    const classified = classifyPath(raw, config);
    // Allow-list: only test, governed (.spec-guard), and ignored/uncategorized paths. Everything else
    // (product source, docs, config, generated, AND other_unexpected) is blocked during evidence prep.
    if (classified.ignored || classified.category === null || classified.category === "spec_guard_artifact_evidence" || classified.category === "tests") continue;
    diagnostics.push({
      code: "EVIDENCE_PREP_PRODUCT_CHANGE",
      severity: "error",
      message: `Evidence preparation may only touch test/repro/fixture/evidence paths; disallowed change: ${classified.path} (${classified.category}).`,
      field_path: "/review/changed_files",
      gate: null,
      fix: "Limit evidence preparation to test/repro/fixture/evidence paths, or request product implementation authorization."
    });
  }
  return { blocked: diagnostics.length > 0, diagnostics };
}

// --- Authorization gate -----------------------------------------------------------------------

export interface AuthorizationGateInput {
  kind: AuthorizationKind;
  packet_approval_current: boolean;
  packet_approval_hash: string;
  evidence_policy: ApprovedEvidencePolicyProjectionV1;
  evidence_policy_resolution_hash?: string;
  refs?: EvidenceRefV1[];
  waivers?: EvidenceWaiverV1[];
  facts?: SourceFactsV1;
  // For fix authorization reuse: the focused fix allowed_files must be a subset of the boundary.
  fix_allowed_files?: string[];
  allowed_globs?: string[];
}

export interface AuthorizationGateResult {
  authorized: boolean;
  evidence_ready: boolean;
  diagnostics: Diagnostic[];
}

/** Enforce the authorization gate: packet approval must be current, the authorization-gate evidence
 * obligations (e.g. reproduction evidence for bug/regression ACs) must be satisfied or waived, and a
 * fix's allowed_files must stay within the boundary. Unlike M1B (diagnostic-only), failure here
 * denies authorization. */
export function evaluateAuthorizationGate(input: AuthorizationGateInput): AuthorizationGateResult {
  const diagnostics: Diagnostic[] = [];
  if (!input.packet_approval_current) {
    diagnostics.push({ code: "PACKET_APPROVAL_STALE", severity: "error", message: "Packet approval is stale; re-approve before authorization.", field_path: "/lifecycle/packet_approval", gate: null, fix: "Re-approve the WorkPacket." });
  }

  const readiness = evaluateEvidenceReadiness({
    gate: "authorization",
    packet_approval_hash: input.packet_approval_hash,
    evidence_policy: input.evidence_policy,
    ...(input.evidence_policy_resolution_hash !== undefined ? { evidence_policy_resolution_hash: input.evidence_policy_resolution_hash } : {}),
    refs: input.refs ?? [],
    waivers: input.waivers ?? [],
    facts: input.facts ?? EMPTY_SOURCE_FACTS_V1
  });
  if (!readiness.ready) {
    // Promote M1B's blocking-but-not-enforced readiness diagnostics into enforced authorization denial.
    for (const diag of readiness.diagnostics) {
      diagnostics.push({ code: diag.code, severity: "error", message: diag.message, field_path: diag.ac_id === null ? null : `/acceptance_criteria/${diag.ac_id}`, gate: diag.gate, fix: null });
    }
  }

  if (input.kind === "fix" && input.fix_allowed_files !== undefined && input.allowed_globs !== undefined) {
    for (const file of input.fix_allowed_files) {
      if (!matchesAnyGlob(file, input.allowed_globs)) {
        diagnostics.push({ code: "FIX_ALLOWED_FILE_OUTSIDE_BOUNDARY", severity: "error", message: `Focused fix allowed_file is outside the approved boundary: ${file}`, field_path: "/focused_fix_instruction/allowed_files", gate: null, fix: "Restrict fix allowed_files to the approved allowed_globs." });
      }
    }
  }

  const authorized = diagnostics.every((diag) => diag.severity !== "error");
  return { authorized, evidence_ready: readiness.ready, diagnostics };
}
