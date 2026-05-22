# Implementation Review

## Linked Spec

`.spec-guard/specs/implementation-planning-phase.md`

## Linked Contract

None — Direct behavior with no new API or UI does not require a contract.

## Classification

Direct behavior with no new API or UI

## Implementation Files

- `src/check.js`
- `src/run.js`
- `bin/spec-guard.js`
- `mcp/server.js`
- `templates/spec.md`
- `AGENTS.md`
- `WORKFLOW.md`
- `README.md`

## Test Files

- `test/implementation-planning.test.js`
- `test/run.test.js`
- `test/cli.test.js`
- `test/mcp.test.js`

## Summary of Change

- Added an Implementation Planning phase between Classify & Contract and Test First.
- Added spec-template fields for `Planning Required` and `Confirmed Plan`.
- Added SG-PLAN-001 validation when a spec marks planning required but has no confirmed plan details.
- Updated agent and workflow instructions to require context-appropriate stack/layer suggestions with human accept/override.
- Updated CLI/MCP gate flow to include planning as Gate 3 and shift failure-first, tests-pass, and review gates accordingly.

## Tests Written First

- `workflow includes implementation planning between classify/contract and test first` verifies the phase ordering.
- `spec template can record required and confirmed implementation planning details` verifies template support for required planning and stack/layer details.
- `planning-required spec without confirmed plan reports a planning diagnostic` verifies missing planning details produce SG-PLAN-001.
- `planning-required spec with confirmed stack-layer details passes planning validation` verifies confirmed plans satisfy validation.
- `UI mockup and component-library blockers remain separate from planning validation` verifies UI requirements are not replaced by planning.
- `agent instructions require suggesting a context-appropriate stack or layer with human override` verifies agent guidance.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.
- [x] Failure-first evidence recorded in Gate 4: `test/implementation-planning.test.js` initially failed because `PHASES` had no planning phase, `templates/spec.md` had no `Implementation Planning` section, `checkSpecText` emitted no SG-PLAN-001 diagnostic, and `AGENTS.md` had no planning instructions.

## Behavior / Contract Validated

- [x] A workflow phase or checkpoint exists between Classify & Contract and Test First for implementation planning.
- [x] Specs or related artifacts can record required implementation-plan decisions, including full stack or stack-layer choices.
- [x] Agent instructions require suggesting a context-appropriate stack/layer and asking the human to accept or override it when planning is required.
- [x] Validation reports a blocker or warning when a spec that requires planning lacks the required plan details.
- [x] Existing UI mockup/component-library requirements continue to work and are not replaced by the planning phase.
- [x] Tests cover planning-required specs with and without recorded plan details.

## Linked Documentation

- [Agent Instructions](../../AGENTS.md)
- [Workflow](../../WORKFLOW.md)
- [Spec Template](../../templates/spec.md)
- [README](../../README.md)

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
- N/A — documentation updates were required and completed.
- [x] Durable workflow/template and README documentation was updated.
- N/A — the document itself was not the deliverable.

## Remaining Risks / Follow-Ups

- None.
