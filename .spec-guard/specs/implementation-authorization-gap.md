# Spec

## Title

Ambiguous human response treated as implementation authorization

## Status

Implemented

## Problem / Goal

AGENTS.md requires explicit human authorization before an agent sets a spec to 'Implementation Active' and confirms Gate 3. However, when a human responds with an ambiguous statement (e.g. 'are both approved' in response to 'Want to authorize implementation of both?'), the agent may incorrectly interpret it as authorization and proceed. The authorization requirement exists precisely to prevent agents from self-initiating implementation; ambiguous responses must not satisfy it.

## In Scope

- Update AGENTS.md to clarify what constitutes explicit authorization: a direct instruction ('go ahead and implement X', 'yes', 'implement it') or an unambiguous affirmative response to a direct yes/no question
- Update AGENTS.md to require that when a human responds ambiguously (e.g. asking a question back, giving a conditional answer, or using language that could be read as either confirmation or inquiry), the agent must ask a direct follow-up yes/no question before proceeding
- Update AGENTS.md to give concrete examples of responses that do and do not constitute explicit authorization

## Out of Scope

- Changes to the CLI or MCP gate enforcement — Gate 3 already requires Implementation Active status; this is about agent behavior before that check
- Automated detection of ambiguous responses
- Changes to any source code files other than AGENTS.md

## Users / Actors

- User

## Expected Behavior

When an agent asks a human for implementation authorization and receives an ambiguous response, the agent asks one direct follow-up question ('Should I go ahead and begin implementing <spec>?') and waits for an unambiguous yes or no before setting Implementation Active or confirming Gate 3. A human saying 'are both approved?' or 'is that ready?' is not authorization — the agent treats it as a question and answers it, then asks again if authorization is still needed.

## Acceptance Criteria

- [ ] AGENTS.md defines explicit authorization with at least two concrete examples of responses that qualify
- [ ] AGENTS.md defines at least one example of an ambiguous response that does not qualify and describes the required follow-up behavior
- [ ] AGENTS.md states that a question or conditional response from the human is never sufficient authorization — the agent must ask a direct follow-up yes/no question

## Edge Cases

- 

## Related Artifacts

- [implementation review](../reviews/implementation-authorization-gap.md)

## Documentation Requirements
- `AGENTS.md` — the document itself is the deliverable; update the explicit authorization section with qualifying examples, non-qualifying examples, and required follow-up behavior

## Dependencies

- 

## Open Questions

- 

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [ ] Direct behavior with no new API or UI
- [x] Operational/document deliverable
- [ ] Bugfix
