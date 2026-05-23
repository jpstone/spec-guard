# Implementation Review

## Linked Spec

[status-ready-count-bug](../specs/status-ready-count-bug.md)

## Linked Contract

<!-- Bugfix — no contract required. -->

## Classification

Bugfix

## Implementation Files

- `bin/spec-guard.js` — changed `status` summary ready-count logic to count specs whose status is `Ready for Implementation`.

## Test Files

- `test/cli.test.js` — added regression coverage for `spec-guard status` summary when a `Ready for Implementation` spec is present.

## Summary of Change

`spec-guard status` now counts `Ready for Implementation` rows in the Ready summary total. The status table output and classification rows are otherwise unchanged.

## Tests Written First

- `status summary counts Ready for Implementation specs as Ready` verifies a temp repository with one `Ready for Implementation` spec reports `1 Ready` in the summary.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.
- Failure-first evidence: `node --test test/cli.test.js --test-name-pattern "status summary counts Ready for Implementation specs as Ready"` failed because the status table contained `Ready for Implementation` while the summary printed `1 spec(s) — 0 Ready, 0 Blocked, 1 clean`.

## Behavior / Contract Validated

- `spec-guard status` counts each `Ready for Implementation` spec in the Ready summary total.
- The Ready summary total matches the number of status table rows whose status is `Ready for Implementation`.
- Existing status rows and classifications remain unchanged apart from the corrected Ready summary count.
- A regression test fails before the fix and passes after the fix.
- `status summary counts Ready for Implementation specs as Ready` failed before the fix and passed after the fix.
- `npm test` passed: 378 tests.

## Linked Documentation

- None — no documentation changes required.

## Dependency Integration

N/A — no runtime dependency changes.

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All current-spec documentation obligations were satisfied.
- [x] All docs listed in Linked Documentation above are directly linked from the governing spec's Documentation Requirements section, or no docs were listed because none were required.
- [x] All docs listed in Linked Documentation above were validated against the implemented behavior, or confirmed not applicable.
- [x] No documentation update was needed.
- [x] Durable contract documentation was updated, or confirmed not applicable because no contract changed.
- The document itself was not the deliverable.

## Remaining Risks / Follow-Ups

- None.
