# Implementation Review

## Linked Spec

[ui-mockup-ac-suggestion-marker](../specs/ui-mockup-ac-suggestion-marker.md)

## Linked Contract

<!-- Direct behavior with no new API or UI — no contract required. -->

## Classification

Direct behavior with no new API or UI

## Implementation Files

- `src/check.js` — added SG-UI-003 validation for UI specs whose mockup/design input marker is checked but whose mockup-derived AC suggestion marker is missing or unchecked; excluded the tracking section from legacy mockup keyword detection unless the provided marker is checked.
- `src/suggest.js` — added actionable fix guidance for SG-UI-003.
- `templates/spec.md` — added `UI Mockup AC Suggestion Tracking` structured markers.
- `templates/one-off-ui.md` — added the same structured markers to the one-off UI template.
- `AGENTS.md` — updated spec interview guidance to mark mockup/design input and mockup-derived AC suggestion tracking fields, and to explain the marker records offered suggestions, not accepted ACs.
- `WORKFLOW.md` — updated spec authoring guidance with the same marker instructions.

## Test Files

- `test/check.test.js` — added SG-UI-003 validation coverage, template marker checks, and AGENTS.md marker guidance checks; updated UI fixture tracking markers to preserve existing UI validation tests.

## Summary of Change

UI-classified specs now have structured tracking markers for whether one or more mockups/design inputs were provided and whether mockup-derived acceptance criteria were suggested to the human. Validation reports SG-UI-003 as a blocker only when UI work marks mockup/design input as provided but does not check the mockup-derived AC suggestion marker. Non-UI specs are unaffected, and validation does not inspect or require final acceptance criteria to include every mockup-derived suggestion.

## Tests Written First

- `blocks UI spec when mockup input is marked provided but mockup-derived AC suggestion is unchecked` verifies SG-UI-003 blocks unchecked suggestion tracking.
- `blocks UI spec when mockup input is marked provided but mockup-derived AC suggestion marker is missing` verifies SG-UI-003 blocks missing suggestion tracking.
- `does not require mockup-derived AC suggestion when mockup input is not marked provided` verifies the conditional does not fire when the provided marker is unchecked.
- `non-UI classifications are not affected by mockup AC suggestion marker validation` verifies non-UI specs are unaffected.
- `spec template includes UI mockup AC suggestion tracking markers` verifies the general spec template includes both structured markers.
- `one-off UI template includes UI mockup AC suggestion tracking markers` verifies the UI template includes both structured markers.
- `AGENTS.md explains mockup AC suggestion marker records offered suggestions, not accepted ACs` verifies agent guidance explains the marker semantics.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.
- Failure-first evidence: `node --test test/check.test.js --test-name-pattern "SG-UI-003|template includes UI mockup|AGENTS.md explains"` failed because SG-UI-003 validation, template markers, and AGENTS.md marker guidance did not yet exist.

## Behavior / Contract Validated

- UI spec templates/guidance include a structured marker for whether one or more mockups/design inputs were provided.
- UI spec templates/guidance include a structured marker for whether mockup-derived acceptance criteria were suggested to the human.
- Validation reports a blocker for UI-classified specs when mockup/design input is marked as provided and mockup-derived AC suggestions are not marked as offered.
- Validation does not require mockup-derived AC suggestions when mockup/design input is not marked as provided.
- Validation does not require the final acceptance criteria to include every mockup-derived suggestion.
- Non-UI classifications are not affected by the new validation.
- Agent guidance explains that the marker records that suggestions were offered, not that the human accepted them.
- `npm test` passed: 387 tests.

## Linked Documentation

- [AGENTS.md](../../AGENTS.md)
- [WORKFLOW.md](../../WORKFLOW.md)

## Dependency Integration

N/A — no runtime dependency changes.

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All current-spec documentation obligations were satisfied.
- [x] All docs listed in Linked Documentation above are directly linked from the governing spec's Documentation Requirements section.
- [x] All docs listed in Linked Documentation above were validated against the implemented behavior, or confirmed not applicable.
- [x] No unrelated repository documentation was audited or changed.
- [x] Durable documentation updated only if contract changed, or confirmed not applicable because no contract changed.

## Remaining Risks / Follow-Ups

- None.
