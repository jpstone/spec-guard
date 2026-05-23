# Spec

## Title

Mockup-Faithful AC Suggestions

## Status

Implemented

## Problem / Goal

When a UI mockup is provided for a UI classification during spec authoring, the agent's suggested acceptance criteria are based only on what the user has said verbally. Elements, interactions, and states the mockup explicitly shows can be missed, leaving no corresponding AC — and therefore no test — for behavior the design defined.

## In Scope

- When the agent is conducting the spec interview and a UI mockup or design direction is provided, suggested ACs are derived from the mockup's elements in addition to the user's verbal input
- Each distinct element, interaction, or visible state in the mockup should have a corresponding suggested AC
- Suggested ACs are presented for human acceptance or modification — not enforced mechanically

## Out of Scope

- Mechanical gate enforcement — no new validation rule checks that every mockup element has a corresponding AC
- Non-UI classifications — applies only when a mockup is present for a UI classification
- Changes to test writing guidance — the Writing Tests section is unchanged; this only affects AC suggestion during the interview

## Users / Actors

- User

## Expected Behavior

When conducting a spec interview for a UI classification where a mockup or design direction is provided, the agent generates suggested ACs that trace back to the mockup's specific elements, interactions, and visible states, in addition to any ACs derived from verbal input. These are presented as suggestions the human can accept, modify, or replace.

## Acceptance Criteria

- [ ] AGENTS.md interview guidance instructs the agent to derive suggested ACs from the mockup when a UI classification is present and a mockup has been provided
- [ ] WORKFLOW.md spec authoring guidance includes the same instruction
- [ ] The instruction specifies that each distinct element, interaction, or visible state in the mockup should have a corresponding suggested AC
- [ ] The instruction makes clear these are suggestions — the human accepts, modifies, or replaces them

## Edge Cases

- 

## Related Artifacts

- [implementation review](../reviews/mockup-ac-derivation.md)

## Documentation Requirements
- [AGENTS.md](../../AGENTS.md) — add mockup-to-AC derivation guidance to the spec interview section
- [WORKFLOW.md](../../WORKFLOW.md) — add the same guidance to the spec authoring section

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
