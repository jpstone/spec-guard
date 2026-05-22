# Implementation Review

## Linked Spec

`.spec-guard/specs/bugfix-evidence-permanence.md`

## Linked Contract

None — Direct behavior classification; no contract required.

## Classification

Direct behavior with no new API or UI

## Implementation Files

- `src/check.js` — added `checkBugfixEvidence()` function and wired it into `checkSpecText()`
- `src/suggest.js` — added `SG-BUG-001` fix instruction to `RULE_SUGGESTIONS`
- `src/discover.js` — added `testEvidence` parameter to `buildSpecFromAnswers()`; appends `## Test Evidence` section when `classification === 'Bugfix'`
- `templates/spec.md` — added `## Test Evidence` section with permanent and temporary checkbox options
- `AGENTS.md` — updated Bugfix row in Writing Tests table to require `Test Evidence` field before Gate 4
- `docs/validation-rules.md` — added SG-BUG-001 entry

## Test Files

- `test/bugfix-evidence-permanence.test.js` — 7 new tests covering all acceptance criteria
- `test/check.test.js` — updated `Bugfix is a valid classification choice and passes validation` to include a checked `Test Evidence` section
- `test/discover.test.js` — updated `buildSpecFromAnswers — output passes Gate 1 for every classification` to pass `testEvidence: 'permanent'` for Bugfix

## Summary of Change

- Added `SG-BUG-001` BLOCKER to `spec-guard check`: fires when classification is Bugfix and the `Test Evidence` section is absent or has neither checkbox checked.
- Added `## Test Evidence` section to the spec template with permanent and temporary checkbox options.
- `buildSpecFromAnswers` now accepts a `testEvidence` parameter and outputs the section when classification is Bugfix.
- Updated AGENTS.md to explicitly require the field before Gate 4 and reference SG-BUG-001.
- Added fix instruction for SG-BUG-001 to `spec-guard suggest`.

## Tests Written First

- `Bugfix spec without Test Evidence section reports SG-BUG-001 BLOCKER` — verifies missing section fires the rule
- `Bugfix spec with Test Evidence section but no option checked reports SG-BUG-001 BLOCKER` — verifies unchecked section fires the rule
- `Bugfix spec with permanent option checked passes SG-BUG-001` — verifies rule clears with permanent checked
- `Bugfix spec with temporary option checked passes SG-BUG-001` — verifies rule clears with temporary checked
- `Non-Bugfix spec is not affected by SG-BUG-001` — verifies rule never fires for other classifications
- `spec template includes a Test Evidence section with permanent and temporary checkboxes` — verifies template update
- `AGENTS.md documents the Test Evidence field requirement for Bugfix specs before Gate 4` — verifies doc update

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.

4 of 7 tests failed before implementation:
- SG-BUG-001 tests failed because the rule did not exist.
- Template test failed because the section was not in `templates/spec.md`.
- AGENTS.md test failed because the doc reference was not present.
3 tests already passed (the "should not fire" and "passes when checked" cases — correct, as no rule fired at all).

## Behavior / Contract Validated

- `templates/spec.md` includes a `## Test Evidence` section with a permanent checkbox and a temporary checkbox (with a removal-condition field).
- `spec-guard check` reports a SG-BUG-001 BLOCKER when classification is Bugfix and `Test Evidence` is absent.
- `spec-guard check` reports a SG-BUG-001 BLOCKER when classification is Bugfix and `Test Evidence` is present but neither option is checked.
- A Bugfix spec with `Test Evidence` — permanent option checked — passes SG-BUG-001 with no diagnostic.
- A Bugfix spec with `Test Evidence` — temporary option checked — passes SG-BUG-001 with no diagnostic.
- Non-Bugfix specs are not affected by SG-BUG-001.
- `AGENTS.md` documents that the `Test Evidence` field must be filled before Gate 4 for Bugfix specs.

## Linked Documentation

- [Agent Instructions](../../AGENTS.md)
- [Spec Template](../../templates/spec.md)
- [Validation Rules](../../docs/validation-rules.md)

## Dependency Integration

No runtime dependency wiring — internal validation rule addition only.

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All current-spec documentation obligations were satisfied.
- [x] All docs listed in Linked Documentation above are directly linked from the governing spec's Documentation Requirements section.
- [x] All docs listed in Linked Documentation above were validated against the implemented behavior, or confirmed not applicable.

## Remaining Risks / Follow-Ups

- Existing Bugfix specs that predate this change will now fail `spec-guard check` with SG-BUG-001. They need a `Test Evidence` section added before further gate work proceeds.
