# Spec

## Title

Spec Status Transitions

## Status

Implemented

## Problem / Goal

Spec status currently defaults to `Draft` and does not reflect the actual workflow lifecycle after approval, gate progress, implementation, blockers, or completion. The goal is for Spec Guard to keep spec status aligned with workflow state so humans and agents can quickly tell whether a spec is Draft, Ready, Blocked, or Implemented.

## In Scope

- Define when spec status transitions between `Draft`, `Ready`, `Blocked`, and `Implemented`.
- Update workflow behavior so approved and gated specs no longer remain `Draft` indefinitely.
- Mark specs `Ready` when they are approved and ready for implementation.
- Mark specs `Blocked` when a blocker or unresolved deviation prevents safe progress.
- Mark specs `Implemented` when Gate 5 is complete.
- Ensure status changes update the spec file's `## Status` section.
- Add tests/checks that verify status transitions occur as expected.

## Out of Scope

- Adding new status values beyond `Draft`, `Ready`, `Blocked`, and `Implemented`.
- Replacing gate/run state files under `.spec-guard/runs/`.
- Treating status as a substitute for gates; gates remain authoritative.
- Automatically inferring implementation completeness without Gate 5.
- Changing historical specs unless they are part of the current workflow or explicitly updated.

## Expected Behavior

Newly drafted specs begin as `Draft`. Once a spec is approved and passes the required pre-implementation gates, the spec status changes to `Ready`. If work records a blocker or unresolved deviation for the spec, the spec status changes to `Blocked`. When Gate 5 is confirmed, the spec status changes to `Implemented`. `spec-guard status`, `spec-guard gate-status`, and direct spec reads show lifecycle status that matches the latest workflow state. Gate/run state remains the authoritative source for whether gates passed.

## Acceptance Criteria

- [ ] Newly drafted specs continue to start with `Status` set to `Draft`.
- [ ] The workflow can update a spec's `## Status` section to `Ready`.
- [ ] When a spec reaches the pre-implementation ready point, its status is set to `Ready`.
- [ ] The workflow can update a spec's `## Status` section to `Blocked`.
- [ ] When a blocker or unresolved deviation is recorded for a spec, its status is set to `Blocked`.
- [ ] The workflow can update a spec's `## Status` section to `Implemented`.
- [ ] When Gate 5 is confirmed for a spec, its status is set to `Implemented`.
- [ ] Status updates do not replace gate/run state; gates remain independently recorded and checked.
- [ ] `spec-guard status` and `spec-guard gate-status` report the updated spec status from the spec file.

## Prior Implementation Review

- No prior implementation review specifically covers spec status transitions. Related existing behavior is in `src/check.js`, `src/run.js`, and `bin/spec-guard.js`.

## Documentation Requirements

- [Workflow](../../WORKFLOW.md) — document status transition behavior and gate authority.

## Dependencies

None.

## Open Questions

None.

## Work Classification

<!-- Choose one primary classification. -->

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [x] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
- [ ] Bugfix
