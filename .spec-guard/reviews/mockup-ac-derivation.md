# Implementation Review

## Linked Spec

[mockup-ac-derivation](../specs/mockup-ac-derivation.md)

## Linked Contract

<!-- Operational/document deliverable — no contract required. -->

## Classification

Operational/document deliverable

## Implementation Files

- `AGENTS.md` — added interview guidance to derive suggested ACs from provided UI mockups/design direction.
- `WORKFLOW.md` — added matching spec authoring guidance for mockup-derived suggested ACs.

## Test Files

- `test/mockup-ac-derivation.test.js` — added document checks for the required AGENTS.md and WORKFLOW.md guidance.

## Summary of Change

Added guidance for UI spec interviews/spec authoring so agents derive suggested acceptance criteria from provided mockups or design direction in addition to verbal input. The guidance requires each distinct element, interaction, or visible state in the mockup to have a corresponding suggested AC, while making clear that the human may accept, modify, or replace those suggestions.

## Tests Written First

- `AGENTS.md interview guidance derives suggested ACs from provided UI mockups` verifies AGENTS.md includes the mockup-derived AC guidance.
- `WORKFLOW.md spec authoring guidance derives suggested ACs from provided UI mockups` verifies WORKFLOW.md includes the same guidance.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.
- Failure-first evidence: `node --test test/mockup-ac-derivation.test.js` failed because AGENTS.md and WORKFLOW.md did not yet instruct agents to derive suggested acceptance criteria from provided UI mockups.

## Behavior / Contract Validated

- AGENTS.md interview guidance instructs the agent to derive suggested ACs from the mockup when a UI classification is present and a mockup has been provided.
- WORKFLOW.md spec authoring guidance includes the same instruction.
- The instruction specifies that each distinct element, interaction, or visible state in the mockup should have a corresponding suggested AC.
- The instruction makes clear these are suggestions — the human accepts, modifies, or replaces them.
- `npm test` passed: 380 tests.

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
- [x] Durable contract documentation updated only if contract changed, or confirmed not applicable because no contract changed.
- [x] The document itself was the deliverable.

## Remaining Risks / Follow-Ups

- None.
