# Implementation Review

## Linked Spec

[confirm-gate-index-refresh](../specs/confirm-gate-index-refresh.md)

## Linked Contract

<!-- Direct behavior with no new API or UI — no contract required. -->

## Classification

Bugfix

## Implementation Files

- `bin/spec-guard.js` — added `await regenerateArtifactIndex()` immediately after `await updateSpecStatus(inputPath, 'Implemented')` in `confirmGateCommand` Gate 6 branch

## Test Files

- `test/cli.test.js` — added `confirm-gate 6 regenerates artifact index so spec appears under Implemented immediately`: runs `confirm-gate 6`, reads `.spec-guard/README.md`, asserts the spec link appears after `### Implemented` and not under any earlier status header

## Summary of Change

One-line fix: `confirm-gate 6` now calls `regenerateArtifactIndex()` after `updateSpecStatus`. The artifact index reflects the `Implemented` status immediately after the command completes, without requiring any subsequent command to trigger regeneration.

## Tests Written First

- [x] New tests were run before implementation and failed for the expected reason.

Failure-first evidence (Gate 4): test failed — spec link appeared before `### Implemented` because the index was not regenerated after the status update.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.

## Behavior / Contract Validated

- `confirm-gate 6` causes the spec to appear under `### Implemented` in .spec-guard/README.md immediately after the command completes — no subsequent command required

## Linked Documentation

None.

## Dependency Integration

| Dependency | Integration code | Test |
|------------|-----------------|------|
| -          | -               | -    |

N/A — no external dependencies.

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All current-spec documentation obligations were satisfied.
- [x] No documentation update was needed.

## Remaining Risks / Follow-Ups

- The same gap exists when `updateSpecStatus` is called via direct module invocation outside the CLI — index must be manually regenerated in those cases until addressed by a follow-up spec.
