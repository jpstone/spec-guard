# Implementation Review

## Linked Spec

[spec-status-deferred](../specs/spec-status-deferred.md)

## Linked Contract

<!-- Direct behavior with no new API or UI — no contract required. -->

## Classification

Direct behavior with no new API or UI

## Implementation Files

- `src/check.js` — added `'Deferred'` to the `validStatuses` array so `spec-guard check` accepts it without SG-SPEC-006
- `templates/spec.md` — updated status comment to `<!-- Draft | Ready | Blocked | Implemented | Deferred -->`
- `AGENTS.md` — added `Deferred` row to the Spec Status Values table with definition and reactivation path

## Test Files

- `test/check.test.js` — 3 new tests: Deferred does not produce SG-SPEC-006, existing statuses remain valid, unknown status still produces SG-SPEC-006

## Summary of Change

- Added `Deferred` as a valid spec status in `src/check.js` so specs parked indefinitely do not produce a validation error.
- Updated `templates/spec.md` status comment to list all five valid statuses including `Deferred`.
- Updated `AGENTS.md` Spec Status Values table to document when to apply `Deferred` and how to reactivate (change status back to `Draft`).
- The artifact index (spec `artifact-index`) was separately updated to include `Deferred` as the fifth H3 sub-header in the Specs section — that behaviour is covered under the `artifact-index` spec, not this one.

## Tests Written First

- `checkSpecText does not flag Deferred as invalid status (no SG-SPEC-006)` — verifies adding `Deferred` to `validStatuses` allows it through Gate 1 validation
- `checkSpecText does not flag Draft, Ready, Blocked, Implemented as invalid` — regression guard; all pre-existing statuses remain valid
- `checkSpecText flags unknown status with SG-SPEC-006` — verifies unrecognised statuses still produce an INFO diagnostic
- `templates/spec.md status comment includes Deferred` — verifies the template documents the status
- `AGENTS.md documents Deferred status with definition and when to use it` — verifies agent guidance was added

## Failure-First Confirmation

- [x] If not run, the concrete reason is recorded here: Tests were written retroactively to verify pre-existing behaviour; all three check tests passed immediately against the already-implemented code. The template and AGENTS.md content tests were written after the documentation was updated.

## Behavior / Contract Validated

- `spec-guard check` accepts `Deferred` as a valid status value and does not report an error when a spec's `## Status` section contains `Deferred`.
- `templates/spec.md` documents `Deferred` as a valid status value.
- The `artifact-index` spec is updated to include `Deferred` as a fifth status sub-header positioned after `Implemented`.
- AGENTS.md documents `Deferred` status and when to apply it.

## Linked Documentation

- [AGENTS.md](../../AGENTS.md) — Spec Status Values table updated with Deferred row

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
- [x] All docs listed in Linked Documentation above are directly linked from the governing spec's Documentation Requirements section.
- [x] All docs listed in Linked Documentation above were validated against the implemented behavior, or confirmed not applicable.

## Remaining Risks / Follow-Ups

- None.
