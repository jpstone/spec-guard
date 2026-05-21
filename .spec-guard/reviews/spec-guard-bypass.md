# Implementation Review

## Linked Spec

.spec-guard/specs/spec-guard-bypass.md

## Linked Contract

None — Operational/document deliverable does not require a contract.

## Classification

Operational/document deliverable

## Implementation Files

- AGENTS.md
- WORKFLOW.md

## Test Files

- test/spec-guard-bypass-instructions.test.js

## Summary of Change

- Added agent instruction requiring the user to be asked whether to use Spec Guard at the start of every new codebase change request.
- Documented yes/no behavior: yes uses the full workflow, no bypasses specs/gates/artifacts for the current task.
- Documented that bypass cannot be inferred and applies only to the current task.
- Added a workflow note that Phase 1 is triggered only after the user explicitly opts into Spec Guard.

## Tests Written First

- `AGENTS requires prompting for Spec Guard use at the start of new codebase changes` verifies the prompt text and start-of-task requirement.
- `AGENTS requires full Spec Guard workflow when the user answers yes` verifies yes-answer behavior.
- `AGENTS allows bypassing specs, gates, and artifacts when the user answers no` verifies no-answer behavior.
- `AGENTS forbids inferred bypass and scopes the answer to the current task` verifies no heuristic bypass and current-task scoping.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.
- [x] Expected failure recorded: `node --test test/spec-guard-bypass-instructions.test.js` failed because `AGENTS.md` did not yet require the Spec Guard opt-in prompt or bypass behavior.

## Behavior / Contract Validated

- Agent instructions require asking whether to use Spec Guard at the start of every new codebase change request.
- Agent instructions state that a yes answer requires the existing full Spec Guard workflow.
- Agent instructions state that a no answer allows the agent to complete the current task without drafting specs, running gates, or creating Spec Guard artifacts.
- Agent instructions state that bypass must not be inferred from task size, file type, perceived risk, or any other heuristic.
- Agent instructions state that the user's answer applies only to the current task or instruction.
- Existing Spec Guard requirements remain unchanged when the user chooses to use Spec Guard.
- `node --test test/spec-guard-bypass-instructions.test.js` passes.
- `npm test` passes: 200 tests passing.

## Linked Documentation

- AGENTS.md
- WORKFLOW.md

## Dependency Integration

No runtime dependency integration was introduced.

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged; none were discovered.

## Documentation Updates

- [x] All docs listed in Linked Documentation above updated, or confirmed not applicable.
- [x] No durable contract documentation update was needed.
- [x] The document itself was the deliverable.

## Remaining Risks / Follow-Ups

None.
