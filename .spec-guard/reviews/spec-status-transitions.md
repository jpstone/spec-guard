# Implementation Review

## Linked Spec

`.spec-guard/specs/spec-status-transitions.md`

## Linked Contract

None — Direct behavior with no new API or UI does not require a contract.

## Classification

Direct behavior with no new API or UI

## Implementation Files

- `src/spec-status.js`
- `src/run.js`
- `bin/spec-guard.js`
- `WORKFLOW.md`

## Test Files

- `test/cli.test.js`

## Summary of Change

- Added shared spec status update helper for `Draft`, `Ready`, `Blocked`, and `Implemented`.
- `confirm-gate 3` now updates the spec status to `Ready` while preserving gate/run state as authoritative.
- `confirm-gate 5` now updates the spec status to `Implemented` while preserving gate/run state as authoritative.
- `blocker --spec <spec> <topic>` and `deviation --spec <spec> <topic>` now mark the referenced spec as `Blocked`.
- `gate-status --json` now includes status from the spec file and plain `gate-status` prints it.
- Workflow documentation now describes status transitions and gate authority.

## Tests Written First

- `confirm-gate 3 updates spec status to Ready` verifies the pre-implementation ready transition.
- `confirm-gate 5 updates spec status to Implemented and gate-status reports it` verifies implemented transition and status reporting.
- `blocker --spec updates referenced spec status to Blocked` verifies blocked transition for spec-specific blockers.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.
- [x] Failure-first evidence recorded in Gate 3: confirm-gate did not update spec Status to Ready or Implemented, gate-status did not report updated status, and blocker --spec was not supported to mark a spec Blocked.

## Behavior / Contract Validated

- [x] Newly drafted specs continue to start with `Status` set to `Draft`.
- [x] The workflow can update a spec's `## Status` section to `Ready`.
- [x] When a spec reaches the pre-implementation ready point, its status is set to `Ready`.
- [x] The workflow can update a spec's `## Status` section to `Blocked`.
- [x] When a blocker or unresolved deviation is recorded for a spec, its status is set to `Blocked`.
- [x] The workflow can update a spec's `## Status` section to `Implemented`.
- [x] When Gate 5 is confirmed for a spec, its status is set to `Implemented`.
- [x] Status updates do not replace gate/run state; gates remain independently recorded and checked.
- [x] `spec-guard status` and `spec-guard gate-status` report the updated spec status from the spec file.

## Linked Documentation

- [Workflow](../../WORKFLOW.md)

## Dependency Integration

No runtime dependencies.

- [x] No runtime dependency integration is required for this direct behavior change.

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All current-spec documentation obligations were satisfied.
- [x] All docs listed in Linked Documentation above are directly linked from the governing spec's Documentation Requirements section.
- [x] All docs listed in Linked Documentation above were validated against the implemented behavior, or confirmed not applicable.
- N/A — documentation update was required and completed.
- [x] Durable workflow documentation was updated.
- N/A — the document itself was not the deliverable.

## Remaining Risks / Follow-Ups

- None.
