import type { WorkPacket } from "../schemas/artifacts.ts";
import type { Diagnostic } from "../schemas/embedded.ts";
import type { SpecGuardRoleConfig } from "../role-config/config.ts";
import type { ImplementationAttempt, ReviewCycle, SpecReviewCycle } from "../lineage/records.ts";
import { diagnostic } from "../actions/config.ts";

// #11 enforcement (the teeth). The role config DESCRIBES the right setup; this BLOCKS the role loop from
// advancing on records that violate it: the coordinator may not record mechanical work inline, and the
// reviewer must be a genuinely separate agent from the implementer. Runs in work.loop.record; any error
// diagnostic blocks the record. It is honor-system to the extent the producer self-reports its role/identity,
// but it makes the separation explicit, checkable, and visible — and is exact teeth once the harness supplies
// provider-proven identities. Skipped entirely when there is no valid role config (advisory over an opt-in file).

function roleEntry(config: SpecGuardRoleConfig, role: string): { may_edit_code: boolean; execution: string } | undefined {
  return (config.roles as Record<string, { may_edit_code: boolean; execution: string } | undefined>)[role];
}

export function enforceImplementationAttemptIdentity(record: ImplementationAttempt, config: SpecGuardRoleConfig): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const role = record.producer.role;
  const entry = roleEntry(config, role);
  if (entry === undefined) {
    diagnostics.push(diagnostic("LOOP_PRODUCER_ROLE_UNKNOWN", `Implementation attempt producer role '${role}' is not defined in the role config.`, "error", "/record/producer/role"));
    return diagnostics;
  }
  if (!entry.may_edit_code) {
    diagnostics.push(diagnostic("LOOP_IMPLEMENTATION_NOT_DELEGATED", `Implementation was recorded by role '${role}', which is not edit-capable (may_edit_code: false). Implementation must be delegated to an edit-capable role (e.g. implementer/fixer) — the coordinator/reviewer/validator must not implement.`, "error", "/record/producer/role"));
  }
  if (entry.execution === "inline") {
    diagnostics.push(diagnostic("LOOP_INLINE_MECHANICAL_WORK_BLOCKED", `Implementation was recorded by role '${role}', which runs inline (execution: inline). Mechanical work must run in a disposable subagent, not the coordinator's persistent context.`, "error", "/record/producer/role"));
  }
  return diagnostics;
}

export function enforceReviewCycleIdentity(record: ReviewCycle, work: WorkPacket, config: SpecGuardRoleConfig): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const entry = roleEntry(config, record.producer.role);
  if (entry !== undefined && entry.execution === "inline") {
    diagnostics.push(diagnostic("LOOP_INLINE_REVIEW_BLOCKED", `Review was recorded by role '${record.producer.role}', which runs inline (execution: inline). Review must run in a separate disposable subagent, not the coordinator's context.`, "error", "/record/producer/role"));
  }
  return enforceReviewBody(record, work, config, diagnostics);
}

// PRE-approval spec review independence (Part C): the spec reviewer must be a genuinely separate agent from the
// spec AUTHOR (the identity that anchored the ACs, recorded on work.spec_author_agent_instance_id) — no
// reviewing your own spec. Reuses the same inline-bar + identity-collision pattern as the implementation review.
export function enforceSpecReviewIdentity(record: SpecReviewCycle, work: WorkPacket, config: SpecGuardRoleConfig): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const entry = roleEntry(config, record.producer.role);
  if (entry !== undefined && entry.execution === "inline") {
    diagnostics.push(diagnostic("SPEC_INLINE_REVIEW_BLOCKED", `Spec review was recorded by role '${record.producer.role}', which runs inline (execution: inline). The spec review must run in a separate disposable subagent, not the coordinator's context.`, "error", "/record/producer/role"));
  }
  const reviewerId = record.producer.agent_instance_id;
  const authorId = work.spec_author_agent_instance_id;
  if (reviewerId === null || authorId === null) {
    diagnostics.push(diagnostic("SPEC_REVIEW_IDENTITY_UNVERIFIED", `Spec review independence cannot be verified: ${reviewerId === null ? "the reviewer" : "the spec author"} has a null agent_instance_id. Record a spec_author at work.ac.establish and a reviewer identity to prove independence.`, "warning", "/record/producer/agent_instance_id"));
  } else if (reviewerId === authorId) {
    diagnostics.push(diagnostic("SPEC_SELF_REVIEW_BLOCKED", `The spec reviewer identity '${reviewerId}' is the same agent that authored the spec (anchored the ACs). Self-review of the spec is never valid — the reviewer must be a genuinely separate agent.`, "error", "/record/producer/agent_instance_id"));
  }
  return diagnostics;
}

function enforceReviewBody(record: ReviewCycle, work: WorkPacket, config: SpecGuardRoleConfig, diagnostics: Diagnostic[]): Diagnostic[] {
  const attempt = work.implementation_attempts.find((candidate) => candidate.id === record.attempt_id);
  if (attempt !== undefined) {
    const reviewerId = record.producer.agent_instance_id;
    const implementerId = attempt.producer.agent_instance_id;
    if (reviewerId === null || implementerId === null) {
      // Honor-system limit: with a null identity we cannot prove the reviewer is a separate agent. Surface it
      // (non-blocking) so the degraded mode is visible rather than a silent pass.
      diagnostics.push(diagnostic("LOOP_REVIEW_IDENTITY_UNVERIFIED", `Review cannot be verified as independent: ${reviewerId === null ? "the reviewer" : "the reviewed implementer"} reported a null agent_instance_id. Self-review separation is unproven for this review.`, "warning", "/record/producer/agent_instance_id"));
    } else if (reviewerId === implementerId) {
      const overridePermitted = record.self_review_override && config.self_review_identity_mode !== "strict_provider_identity_required";
      if (!overridePermitted) {
        const strictNote = config.self_review_identity_mode === "strict_provider_identity_required" ? " (self_review_identity_mode is strict; self_review_override is not permitted.)" : " Set self_review_override only with a visible, justified trust boundary.";
        diagnostics.push(diagnostic("LOOP_SELF_REVIEW_BLOCKED", `The reviewer identity '${reviewerId}' is the same agent that produced the implementation attempt under review. Self-review is never valid — the reviewer must be a genuinely separate agent.${strictNote}`, "error", "/record/producer/agent_instance_id"));
      }
    } else {
      // Label-distinct, but core cannot verify a genuinely separate agent reviewed — honest, mirroring the spec
      // review. Warn (non-blocking) so a relabeled review isn't read as proven-independent.
      diagnostics.push(diagnostic("LOOP_REVIEW_INDEPENDENCE_UNVERIFIED", `Review independence is AGENT-ASSERTED, not verified: the reviewer label ('${reviewerId}') differs from the implementer's, but Spec Guard cannot confirm a genuinely separate agent reviewed. Do NOT report this as 'independent' unless a separate reviewer agent (its own context) actually performed it.`, "warning", "/record/producer/agent_instance_id"));
    }
  }
  return diagnostics;
}
