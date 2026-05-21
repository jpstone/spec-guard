# Implementation Review

## Linked Spec

.spec-guard/specs/bugfix-classification.md

## Linked Contract

None — Direct behavior with no new API or UI does not require a contract.

## Classification

Direct behavior with no new API or UI

## Implementation Files

- src/check.js
- src/run.js
- mcp/server.js
- templates/spec.md
- templates/brownfield-spec.md
- WORKFLOW.md
- AGENTS.md
- docs/work-classification.md

## Test Files

- test/check.test.js
- test/run.test.js
- test/mcp.test.js

## Summary of Change

- Added Bugfix to the valid classification list.
- Added Bugfix test guidance requiring failure-first reproduction and a permanent-or-temporary evidence choice.
- Added the human confirmation prompt for temporary Bugfix tests/checks.
- Added Bugfix to spec templates and MCP input schemas.
- Updated workflow/classification documentation without changing other classifications' guidance.

## Tests Written First

- Bugfix appears as a valid work classification choice — `test/check.test.js`: `Bugfix is a valid classification choice and passes validation` asserts `CLASSIFICATIONS` includes `Bugfix`.
- Specs using Bugfix pass classification validation — `test/check.test.js`: `Bugfix is a valid classification choice and passes validation` asserts no blockers and selected classification `Bugfix`.
- Bugfix guidance requires failure-first confirmation — `test/run.test.js`: `Bugfix test guidance requires failure-first and permanent-or-temporary evidence choice` matches `failure-first` in guidance.
- Bugfix guidance asks whether test evidence should be permanent or temporary — `test/run.test.js`: `Bugfix test guidance requires failure-first and permanent-or-temporary evidence choice` matches `permanent` and `temporary` in guidance.
- Temporary Bugfix tests may be removed after passing only after human confirmation that the reported bug is fixed and no longer reproduces — `test/run.test.js`: `Bugfix test guidance requires failure-first and permanent-or-temporary evidence choice` matches the confirmation prompt text.
- Other classifications keep their existing test guidance and requirements unchanged — `test/run.test.js`: `existing non-bugfix test guidance remains unchanged` asserts Direct behavior guidance remains unchanged; `test/mcp.test.js`: `MCP: spec_guard_test_guidance returns guidance for each classification` covers Bugfix alongside existing classifications.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.
- [x] Expected failure recorded: `npm test` failed because Bugfix was not yet in `CLASSIFICATIONS` and `TEST_GUIDANCE`.

## Behavior / Contract Validated

- `npm test` passes: 196 tests passing.
- No contract required for this classification.

## Linked Documentation

- WORKFLOW.md
- AGENTS.md
- docs/work-classification.md

## Dependency Integration

No runtime dependency integration was introduced.

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged; none were discovered.

## Documentation Updates

- [x] All docs listed in Linked Documentation above updated, or confirmed not applicable.
- [x] No durable contract documentation update was needed.

## Remaining Risks / Follow-Ups

None.
