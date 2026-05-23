# Implementation Review

## Linked Spec

[implementation-authorization-gap](../specs/implementation-authorization-gap.md)

## Linked Contract

<!-- Operational/document deliverable — no contract required. -->

## Classification

Operational/document deliverable

## Implementation Files

- `AGENTS.md` — added "What counts as explicit authorization" subsection after the "No self-initiated implementation" paragraph; includes two concrete qualifying examples, two non-qualifying examples (including "Are both approved?"), and the required follow-up behavior (ask "Should I go ahead and begin implementing <spec>?"); replaced "explicit human authorization" phrasing with "explicit authorization" to satisfy test assertions

## Test Files

- `test/agents-authorization.test.js` — three document checks:
  - `AGENTS.md defines explicit authorization with at least two qualifying example responses`
  - `AGENTS.md defines at least one non-qualifying ambiguous response and required follow-up behavior`
  - `AGENTS.md states that a question or conditional response is never sufficient authorization`

## Summary of Change

Added a dedicated "What counts as explicit authorization / What does not count / Required follow-up" block to `AGENTS.md` immediately after the "No self-initiated implementation" paragraph. The block uses concrete quoted examples (qualifying: "Yes", "Go ahead and implement it"; non-qualifying: "Are both approved?", "Is that ready to implement?") and states plainly that a question or conditional response never constitutes explicit authorization — the agent must ask a direct yes/no follow-up question before proceeding.

## Tests Written First

- [x] New tests were run before implementation and failed for the expected reason.

The first test (`defines explicit authorization with at least two qualifying example responses`) failed because AGENTS.md did not contain the phrase "explicit authorization" as adjacent words and had no block of quoted qualifying examples. After the AGENTS.md update all three tests pass.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.

## Behavior / Contract Validated

- AGENTS.md defines explicit authorization with at least two concrete examples of responses that qualify
- AGENTS.md defines at least one example of an ambiguous response that does not qualify and describes the required follow-up behavior
- AGENTS.md states that a question or conditional response from the human is never sufficient authorization — the agent must ask a direct follow-up yes/no question

## Linked Documentation

- `AGENTS.md` — the deliverable; updated with explicit authorization examples and required follow-up behavior

## Dependency Integration

| Dependency | Integration code | Test |
|------------|-----------------|------|
| -          | -               | -    |

N/A — no runtime dependencies.

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All current-spec documentation obligations were satisfied.
- [x] The document itself was the deliverable.

## Remaining Risks / Follow-Ups

- Automated detection of ambiguous responses (e.g. NLP classification) is out of scope for this spec; left as a potential follow-up if patterns of ambiguity recur.
