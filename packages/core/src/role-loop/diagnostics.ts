import type { Diagnostic } from "../schemas/embedded.ts";
import type { ReadinessGate } from "./enums.ts";
import type { EvidenceRequirementRef } from "./evidence-policy.ts";

// Role-loop (Milestone 1A) diagnostic codes. These are surfaced through the existing ad-hoc
// `diagnostic()` factory pattern (not the curated catalog), matching how PACKET_APPROVAL_STALE
// and similar approval diagnostics are emitted across the repo.
export const ROLE_LOOP_DIAGNOSTIC_CODES = {
  PACKET_APPROVAL_REFRESH_REQUIRED: "PACKET_APPROVAL_REFRESH_REQUIRED",
  PACKET_APPROVAL_STALE: "PACKET_APPROVAL_STALE",
  PACKET_APPROVAL_PROJECTION_INVALID: "PACKET_APPROVAL_PROJECTION_INVALID",
  WORK_REQUIRES_IMPLEMENTATION_PLAN: "WORK_REQUIRES_IMPLEMENTATION_PLAN",
  IMPLEMENTATION_PLAN_HASH_MISMATCH: "IMPLEMENTATION_PLAN_HASH_MISMATCH",
  EVIDENCE_POLICY_HASH_MISMATCH: "EVIDENCE_POLICY_HASH_MISMATCH",
  WORK_KIND_RESOLUTION_HASH_MISMATCH: "WORK_KIND_RESOLUTION_HASH_MISMATCH"
} as const;

export function roleLoopDiagnostic(code: string, message: string, severity: Diagnostic["severity"] = "error", fieldPath: string | null = null, fix: string | null = null): Diagnostic {
  return { code, severity, message, field_path: fieldPath, gate: null, fix };
}

// Milestone 1B evidence-readiness diagnostic codes (diagnostic-only; never enforced in 1B).
export const READINESS_DIAGNOSTIC_CODES = {
  EVIDENCE_REQUIREMENT_NOT_SATISFIED: "EVIDENCE_REQUIREMENT_NOT_SATISFIED",
  EVIDENCE_SOURCE_FACT_UNAVAILABLE: "EVIDENCE_SOURCE_FACT_UNAVAILABLE",
  EVIDENCE_SOURCE_FACT_HASH_MISMATCH: "EVIDENCE_SOURCE_FACT_HASH_MISMATCH",
  EVIDENCE_VALIDATION_REQUIREMENT_MISSING: "EVIDENCE_VALIDATION_REQUIREMENT_MISSING"
} as const;

// Milestone 1B readiness diagnostics are ALWAYS `blocking:true, enforced:false`: they report
// whether an obligation would block a gate, but 1B never enforces authorization/review/completion
// (the enforcement matrix: "Evidence readiness — diagnostic only, blocking:true, enforced:false").
export interface ReadinessDiagnosticV1 {
  code: string;
  severity: Diagnostic["severity"];
  message: string;
  gate: ReadinessGate | null;
  ac_id: string | null;
  requirement: EvidenceRequirementRef | null;
  blocking: true;
  enforced: false;
}

export interface ReadinessDiagnosticOptions {
  severity?: Diagnostic["severity"];
  gate?: ReadinessGate | null;
  ac_id?: string | null;
  requirement?: EvidenceRequirementRef | null;
}

export function readinessDiagnostic(code: string, message: string, options: ReadinessDiagnosticOptions = {}): ReadinessDiagnosticV1 {
  return {
    code,
    severity: options.severity ?? "error",
    message,
    gate: options.gate ?? null,
    ac_id: options.ac_id ?? null,
    requirement: options.requirement ?? null,
    blocking: true,
    enforced: false
  };
}

// Projects a readiness diagnostic onto the base Diagnostic shape (for ActionResult.diagnostics).
// The blocking/enforced flags are preserved structurally in the readiness result `data`; here they
// are surfaced in the message so a CLI/MCP reader sees them inline.
export function readinessDiagnosticToBase(diagnostic: ReadinessDiagnosticV1): Diagnostic {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: `${diagnostic.message} (blocking:true, enforced:false)`,
    field_path: diagnostic.ac_id === null ? null : `/acceptance_criteria/${diagnostic.ac_id}`,
    gate: diagnostic.gate,
    fix: null
  };
}
