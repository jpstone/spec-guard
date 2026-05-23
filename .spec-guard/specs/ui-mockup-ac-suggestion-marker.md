# Spec

## Title

UI Mockup AC Suggestion Marker

## Status

Implemented

## Problem / Goal

For UI-classified specs, Spec Guard already requires the agent to address whether a mockup/design direction exists, and guidance now says mockup-derived acceptance criteria should be suggested when mockups are provided. However, there is no structured marker that records whether mockup/design input was provided or whether the agent actually offered mockup-derived AC suggestions. Without a mechanical marker, validation cannot block a UI spec that references provided mockups but fails to record that mockup-derived AC suggestions were offered.

## In Scope

- Keep the existing requirement that UI-classified specs must address whether a mockup/design direction exists.
- Add a structured checkbox or equivalent field to UI-classified specs that records when one or more mockups/design inputs were provided.
- Add a structured checkbox or equivalent field that records: “Mockup-derived acceptance criteria were suggested to the human.”
- Add validation that blocks UI-classified specs when mockup/design input is marked as provided but mockup-derived AC suggestions are not marked as offered.
- The validation only enforces that mockup-derived ACs were suggested and recorded; it does not require the human to accept every suggested AC or require one-to-one AC coverage in the final spec.
- Update relevant templates/guidance so agents know to mark both fields when mockups are provided and suggestions are made.

## Out of Scope

- No mechanical validation that every mockup element, interaction, or state appears in the final acceptance criteria.
- No requirement that the human accept mockup-derived AC suggestions.
- No image parsing or automated mockup analysis.
- No changes to non-UI classifications.
- No changes to the existing requirement that UI specs must address mockup/design direction.

## Users / Actors

- User
- Agent

## Expected Behavior

When authoring or validating a UI-classified spec, the spec has structured markers for whether mockup/design input was provided and whether mockup-derived AC suggestions were offered. If mockup/design input is marked as provided but the suggestion marker is missing or unchecked, validation reports a blocker. If no mockup/design input was provided, this mockup-derived suggestion marker is not required.

## Acceptance Criteria

- [ ] UI spec templates/guidance include a structured marker for whether one or more mockups/design inputs were provided.
- [ ] UI spec templates/guidance include a structured marker for whether mockup-derived acceptance criteria were suggested to the human.
- [ ] Validation reports a blocker for UI-classified specs when mockup/design input is marked as provided and mockup-derived AC suggestions are not marked as offered.
- [ ] Validation does not require mockup-derived AC suggestions when mockup/design input is not marked as provided.
- [ ] Validation does not require the final acceptance criteria to include every mockup-derived suggestion.
- [ ] Non-UI classifications are not affected by the new validation.
- [ ] Agent guidance explains that the marker records that suggestions were offered, not that the human accepted them.

## Edge Cases

- Multiple mockups/design inputs are treated the same as one mockup/design input for purposes of the structured marker.

## Prior Implementation Review

- [mockup-ac-derivation review](../reviews/mockup-ac-derivation.md) — added AGENTS.md and WORKFLOW.md guidance to derive suggested ACs from provided UI mockups/design direction.

## Related Artifacts

- [implementation review](../reviews/ui-mockup-ac-suggestion-marker.md)

## Documentation Requirements
- [AGENTS.md](../../AGENTS.md) — update agent guidance to record the new mockup/design input and suggestion markers.
- [WORKFLOW.md](../../WORKFLOW.md) — update workflow guidance to record the new markers during spec authoring.

## Dependencies

- None.

## Open Questions

- None.

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [x] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
- [ ] Bugfix
