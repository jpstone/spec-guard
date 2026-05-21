# Spec: Bugfix Classification

## Status

Draft

## Problem / Goal

Spec Guard currently requires permanent tests for all implementation work, which can be disproportionate for tiny or small bugfixes such as moving an icon a few pixels. Developers need a dedicated Bugfix work classification that still preserves failure-first discipline while allowing temporary test evidence when permanent tests are not warranted.

## In Scope

- Add Bugfix as an additional valid work classification type that can be selected in specs and workflow guidance.
- Update classification validation so specs using Bugfix are accepted.
- Update test guidance for Bugfix work to require failure-first confirmation.
- When Bugfix is selected, ask whether test evidence should be permanent or temporary.
- Allow temporary Bugfix tests to be run transiently or removed after they pass, but only after human confirmation that the reported bug is fixed.

## Out of Scope

- Removing or weakening test-first requirements for any existing classification.
- Making Bugfix a replacement for feature work, API changes, UI component work, broad refactors, or other non-bugfix work.
- Changing contract requirements for existing classifications.
- Adding a new UI component or REST/service endpoint.

## Expected Behavior

Bugfix work follows failure-first validation. When Bugfix is selected, the workflow asks whether the test evidence should be permanent or temporary. If temporary tests are chosen, they may be run transiently or removed after they pass, but only after the human confirms the bug is fixed using a prompt such as: "Have you verified that the reported bug is fixed and no longer reproduces?"

## Acceptance Criteria

- [ ] Bugfix appears as a valid work classification choice.
- [ ] Specs using Bugfix pass classification validation.
- [ ] Bugfix guidance requires failure-first confirmation.
- [ ] Bugfix guidance asks whether test evidence should be permanent or temporary.
- [ ] Temporary Bugfix tests may be removed after passing only after human confirmation that the reported bug is fixed and no longer reproduces.
- [ ] Other classifications keep their existing test guidance and requirements unchanged.

## Dependencies

None.

## Open Questions

None.

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [x] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
