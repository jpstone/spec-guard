# Implementation Review

## Linked Spec

`.spec-guard/specs/question-sequencing.md`

## Linked Contract

None — Operational/document deliverable does not require a contract.

## Classification

Operational/document deliverable

## Implementation Files

- AGENTS.md
- WORKFLOW.md

## Test Files

- test/question-sequencing-instructions.test.js

## Summary of Change

- Added Spec Guard Question Sequencing guidance to `AGENTS.md`.
- Updated initiative and AI-assisted spec authoring guidance to use the new sequencing rule.
- Added workflow-level guidance in `WORKFLOW.md` for Spec Guard question flows.
- Clarified that the rule is scoped to Spec Guard workflow question flows and does not govern unrelated agent questions.

## Tests Written First

- `Spec Guard question flows list multiple known questions before stepping through them` verifies up-front listing and one-at-a-time messaging.
- `Spec Guard question flows ask only the first question after listing multiple questions` verifies the agent asks only the first question and waits for the user's answer before the next.
- `single-question Spec Guard prompts may be asked directly` verifies no list preface is required for a single question.
- `Spec Guard question flows include suggested answers when available without requiring them` verifies suggested answers and custom answers are documented.
- `question sequencing guidance is scoped to Spec Guard workflows only` verifies unrelated agent questions are excluded.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.
- [x] Expected failure recorded: `node --test test/question-sequencing-instructions.test.js` failed because `AGENTS.md` and `WORKFLOW.md` did not yet include Spec Guard question sequencing guidance, suggested answers guidance, or scoping language.

## Behavior / Contract Validated

- When agent instructions require asking multiple known questions during a Spec Guard workflow, the guidance requires listing the questions up front.
- The agent must tell the user they will be walked through the questions one at a time.
- After listing multiple questions, the guidance requires asking only the first question and waiting for the user's answer before asking the next.
- When only one question is needed, the guidance allows asking it directly without a question-list preface.
- When the agent reasonably knows likely answers to a question, the agent must offer those suggested answers while allowing the user to provide their own answer.
- The guidance must apply only to Spec Guard workflow question flows used by agents, including spec interviews, initiative decomposition, classification clarification, blocker/deviation clarification, and similar Spec Guard-driven user-question sequences; it does not govern unrelated agent questions outside a Spec Guard flow.
- `node --test test/question-sequencing-instructions.test.js` passes.
- `npm test` passes: 205 tests passing.

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
