# Spec

## Title

Spec Guard Question Sequencing

## Status

Draft

## Problem / Goal

Users can be overwhelmed or uncertain when an agent asks multiple questions in a single message and expects all answers at once. This is especially problematic in Spec Guard flows where questions often drive required artifacts, classifications, blockers, deviations, or acceptance criteria. The goal is to make Spec Guard-driven agent question flows predictable by showing the full known question set up front, then walking the user through the questions one at a time.

## In Scope

- Add guidance for agents using Spec Guard to handle multiple known user questions one by one.
- Require agents to list all known questions up front when more than one question will be asked.
- Require agents to tell the user they will be walked through the questions individually.
- Require agents to ask only the first question after listing multiple questions, then wait for the user's answer before asking the next question.
- Require agents to offer suggested answers when the agent reasonably knows likely answers, while still allowing the user to provide a custom answer.
- Apply the guidance to Spec Guard workflow question flows used by agents, including spec interviews, initiative decomposition, classification clarification, blocker/deviation clarification, and similar Spec Guard-driven user-question sequences.

## Out of Scope

- No change to the Spec Guard CLI prompts/wizards unless specifically required.
- No new interactive UI or form system.
- No automatic answering of questions on the user's behalf.
- No requirement to split every single clarification into a separate message when there is only one question.
- No change to the actual required questions in the Spec Guard workflow, only how agents present them.
- No broad rewrite of AGENTS/WORKFLOW beyond the question-asking behavior.

## Users / Actors

- Agents operating under Spec Guard.
- Users answering Spec Guard-driven agent questions.

## Expected Behavior

When an agent needs to ask more than one question during a Spec Guard workflow, it first tells the user the full list of known questions and says they will be asked one at a time. The agent then asks only the first question and waits for the user's answer before asking the next. If the agent reasonably knows likely answers to a question, it includes those suggestions with the question while still allowing the user to provide a different answer.

## Acceptance Criteria

- [ ] When agent instructions require asking multiple known questions during a Spec Guard workflow, the agent must list the questions up front.
- [ ] The agent must tell the user they will be walked through the questions one at a time.
- [ ] After listing multiple questions, the agent must ask only the first question and wait for the user's answer before asking the next.
- [ ] When only one question is needed, the agent may ask it directly without a question-list preface.
- [ ] When the agent reasonably knows likely answers to a question, the agent must offer those suggested answers while allowing the user to provide their own answer.
- [ ] The guidance must apply only to Spec Guard workflow question flows used by agents, including spec interviews, initiative decomposition, classification clarification, blocker/deviation clarification, and similar Spec Guard-driven user-question sequences; it does not govern unrelated agent questions outside a Spec Guard flow.

## Edge Cases

- If an agent discovers an additional necessary question after the initial list, it may ask that follow-up after the current answer rather than requiring a new up-front list.
- If likely suggested answers are not reasonably knowable, the agent asks the question without suggestions.
- If a user proactively answers later questions early, the agent may use those answers and continue with the next unanswered question.

## Prior Implementation Review

- `.spec-guard/reviews/spec-guard-bypass.md` — identifies AGENTS.md and WORKFLOW.md as existing agent/workflow guidance files and `test/spec-guard-bypass-instructions.test.js` as a documentation-instruction test pattern.
- `.spec-guard/reviews/initiative-decomposition.md` — identifies initiative decomposition question guidance in AGENTS.md and related question flow behavior.

## Dependencies

- Deliverable documentation: `AGENTS.md` and/or `WORKFLOW.md` guidance for Spec Guard-driven agent question sequencing.
- Tests/checks should validate the durable instruction text rather than implementation internals.

## Open Questions

- None.

## Work Classification

<!-- Choose one primary classification. -->

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [ ] Direct behavior with no new API or UI
- [x] Operational/document deliverable
- [ ] Bugfix
