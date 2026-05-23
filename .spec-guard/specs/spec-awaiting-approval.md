# Spec

## Title

Spec Approval Status Flow

## Status

Implemented

## Problem / Goal

The artifact index shows only Draft, Ready, Blocked, Implemented, and Deferred — these labels do not communicate where a spec sits in the approval lifecycle. There is no way to distinguish a spec that is complete and waiting for human review, one that has been spec-approved and is queued for implementation consideration, or one that has received explicit implementation sign-off. Agents can confirm Gate 3 on any spec regardless of whether a human has reviewed or approved it. This spec introduces two new statuses (Pending Approval and Implementation Approved), renames Ready to Ready for Implementation for clarity, and enforces that Gate 3 cannot be confirmed until a human has explicitly set the status to Implementation Approved.

## In Scope

- Add `Pending Approval` as a valid spec status value in `src/check.js`.
- Rename `Ready` to `Ready for Implementation` in `src/check.js` — removing `Ready` from the valid statuses list and adding `Ready for Implementation`.
- Add `Implementation Approved` as a valid spec status value in `src/check.js`.
- Update `src/artifact-index.js` SPEC_STATUS_ORDER to the new fixed order: Draft, Pending Approval, Ready for Implementation, Implementation Approved, Blocked, Implemented, Deferred (seven statuses total). Replace the `### Ready` sub-header with `### Ready for Implementation`.
- Update `templates/spec.md` status comment to list all seven valid statuses in the correct order.
- Update all existing spec files in `.spec-guard/specs/` that have `## Status\n\nReady` to use `Ready for Implementation`.
- Update all tests that reference `Ready` as a valid status or that assert the `### Ready` sub-header in the artifact index.
- Update AGENTS.md spec status table: rename `Ready` row to `Ready for Implementation`; add `Pending Approval` row documenting when to use it; add `Implementation Approved` row documenting that it unblocks Gate 3.
- Block `spec-guard confirm-gate 3` with a hard error when the spec's current status is anything other than `Implementation Approved`. The error message must explain that explicit human authorization is required before implementation can begin; once the human authorizes, the agent must set the spec status to `Implementation Approved` and then confirm Gate 3. `Ready for Implementation` is not sufficient — it signals queued and spec-approved, but not cleared to build; the human must give explicit go-ahead.
- Block the equivalent MCP tool (`spec_guard_confirm_gate`) for Gate 3 under the same condition.
- Update any documentation files (docs/cli.md, README.md, WORKFLOW.md) that reference the `Ready` status by name.

## Out of Scope

- A dedicated CLI or MCP command for requesting or granting approval — status changes are made by the agent editing the spec file directly in response to human instruction.
- Auto-transition based on `spec-guard check` passing or any other automated signal.
- Any change to how Blocked, Implemented, or Deferred statuses behave.
- Any new API surface, UI, or interactive workflow beyond the Gate 3 block.
- Migration of spec files outside `.spec-guard/specs/` — only specs in the managed directory are updated.

## Users / Actors

- Developers reviewing the artifact index — they can see at a glance which specs are awaiting their review, which are queued, and which have been cleared for implementation.
- Agents completing a spec — they set `Pending Approval` and surface the spec for human review.
- Humans approving specs — they communicate approval to the agent; the agent sets `Ready for Implementation` (spec content approved, queued) or `Implementation Approved` (cleared to build) based on human instruction.

## Expected Behavior

An agent completing a spec sets its status to `Pending Approval` and asks the human to review. The human reads the spec; if the content is acceptable, they tell the agent, and the agent sets the status to `Ready for Implementation`. When the human is ready to authorize implementation, they tell the agent to proceed; the agent sets the status to `Implementation Approved` and then confirms Gate 3. Any attempt by an agent to confirm Gate 3 before setting the status to `Implementation Approved` is rejected by the tool with a clear error — `Ready for Implementation` is not sufficient; explicit human go-ahead is required. The artifact index always shows all seven status sub-headers so the human can see the full pipeline at a glance.

## Acceptance Criteria

- [ ] `spec-guard check` accepts `Pending Approval` as a valid status value and produces no SG-SPEC-006 diagnostic.
- [ ] `spec-guard check` accepts `Ready for Implementation` as a valid status value and produces no SG-SPEC-006 diagnostic.
- [ ] `spec-guard check` accepts `Implementation Approved` as a valid status value and produces no SG-SPEC-006 diagnostic.
- [ ] `spec-guard check` flags `Ready` as an unrecognized status with SG-SPEC-006 (it is no longer valid after the rename).
- [ ] `spec-guard confirm-gate 3` returns a non-zero exit code and a human-readable error when the spec status is anything other than `Implementation Approved`; the error states that explicit human authorization is required, and once the human authorizes, the agent must set the spec status to `Implementation Approved` before confirming Gate 3.
- [ ] `spec-guard confirm-gate 3` returns a non-zero exit code and a human-readable error when the spec status is `Ready for Implementation`; the error states that `Ready for Implementation` is not sufficient — the human must explicitly authorize implementation and the agent must set the status to `Implementation Approved` first.
- [ ] `spec_guard_confirm_gate` MCP tool returns an error (not a gate confirmation) for Gate 3 when spec status is anything other than `Implementation Approved`.
- [ ] The artifact index includes `### Pending Approval`, `### Ready for Implementation`, and `### Implementation Approved` H3 sub-headers under the Specs section in the correct fixed order: Draft → Pending Approval → Ready for Implementation → Implementation Approved → Blocked → Implemented → Deferred; all seven sub-headers are always present regardless of whether any specs have that status.
- [ ] `templates/spec.md` status comment lists all seven valid statuses in the correct order.
- [ ] AGENTS.md documents all three new/renamed statuses and the Gate 3 enforcement rule.
- [ ] No existing spec file in `.spec-guard/specs/` retains `Ready` as its status value after this change is applied.

## Edge Cases

- Spec is in `Pending Approval` — Gate 3 is blocked; human must advance through `Ready for Implementation` and then `Implementation Approved`.
- Spec is in `Ready for Implementation` — Gate 3 is still blocked; the human must take a second explicit action to set `Implementation Approved`.
- Spec transitions from `Pending Approval` → `Ready for Implementation` → `Implementation Approved` mid-session: Gate 3 unblocks only at `Implementation Approved`.
- Spec is in `Blocked` — Gate 3 is blocked (the spec is blocked on a dependency, not implementation-approved).
- Spec is in `Deferred` — Gate 3 is blocked.
- Spec is already `Implemented` — gates are already confirmed; the status check does not interfere with already-confirmed gate state.
- Artifact index with no specs in `Pending Approval`, `Ready for Implementation`, or `Implementation Approved`: all sub-headers still appear with no list items beneath them.

## Related Artifacts

- [implementation review](../reviews/spec-awaiting-approval.md)

## Documentation Requirements
- [AGENTS.md](../../AGENTS.md) — document `Pending Approval`, `Ready for Implementation`, and `Implementation Approved` statuses and the Gate 3 enforcement rule.

## Dependencies

- [artifact-index](artifact-index.md) — the fixed status sub-header ordering is defined by this spec; the two new sub-headers must be inserted at the correct positions.

## Open Questions

- None.

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [x] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
- [ ] Bugfix
