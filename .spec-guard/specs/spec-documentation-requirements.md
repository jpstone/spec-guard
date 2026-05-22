# Spec

## Title

Spec Documentation Requirements Integrity

## Status

Implemented

## Problem / Goal

Spec Guard currently has documentation checks in some places, but it does not consistently require agents to verify 100% of the documentation obligations for the governing spec being implemented. The goal is to make documentation integrity a required part of the workflow for the current spec's documented obligations only: every doc the spec, linked contract, classification, or prior implementation review requires must be created or updated, linked where required, and validated for alignment with the implemented behavior. The workflow must not expand into a broad audit of unrelated repository documentation.

## In Scope

- Add a spec-level `Documentation Requirements` section that records docs the current spec requires to be created, updated, linked, or validated.
- Require any documentation file created or updated for the current spec to be listed as a direct repository-relative link in the spec's `Documentation Requirements` section.
- Require the implementation review's `Linked Documentation` section to include the same created or updated docs.
- Define a workflow requirement that agents identify documentation obligations from the current spec, linked contract, work classification, and prior implementation review.
- Require agents to create or update every required doc for the current spec.
- Require agents to verify required docs are linked where the current spec or workflow requires linking.
- Require agents to validate that required docs align with implemented behavior.
- Add review/analyze support so missing or incomplete documentation obligations for the current spec are detected.
- Keep documentation integrity checks scoped to the current spec's documentation obligations only.

## Out of Scope

- Auditing every documentation file in the repository.
- Rewriting unrelated docs not required by the current spec, contract, classification, or prior implementation review.
- Creating new documentation obligations that are not required by the current spec or workflow.
- Judging prose style or editorial quality beyond whether required docs exist, are linked where required, and align with implemented behavior.
- Replacing existing API contract doc validation or README preference behavior.

## Expected Behavior

During implementation and review of a spec, the agent identifies all documentation obligations created by that spec, linked contract, classification, and prior implementation review. The agent creates or updates every required doc for that spec, lists each created or updated doc as a direct repository-relative link in the spec's `Documentation Requirements` section, and records the same docs in the implementation review's `Linked Documentation` section. The agent verifies required docs are linked where the spec or workflow requires links and validates required docs against the implemented behavior for that spec. Review/analyze reports an issue when a required doc for the current spec is missing, not linked where required, not listed in both the spec and review, or not aligned. Unrelated repository docs are not audited or changed.

## Acceptance Criteria

- [ ] Specs support a `Documentation Requirements` section that records docs the current spec requires to be created, updated, linked, or validated.
- [ ] Any documentation file created or updated for the current spec must be listed as a direct repository-relative link in the spec's `Documentation Requirements` section.
- [ ] The implementation review's `Linked Documentation` section must include the same created or updated docs.
- [ ] The workflow requires agents to identify documentation obligations from the current spec, linked contract, classification, and prior implementation review.
- [ ] The workflow requires agents to verify 100% of the current spec's documentation obligations before review is complete.
- [ ] Review/analyze reports an issue when a spec's `Documentation Requirements` section lists required docs that are not present in the implementation review's `Linked Documentation` section.
- [ ] Review/analyze reports an issue when docs were created or updated but are not directly linked from the spec's `Documentation Requirements` section.
- [ ] Review/analyze reports an issue when required documentation update or validation checklist items are not completed.
- [ ] If the current spec has no documentation obligations, the spec or review must explicitly record that no documentation changes are required.
- [ ] The documentation integrity check is scoped only to the current spec's obligations and does not audit unrelated repository docs.

## Prior Implementation Review

- `.spec-guard/reviews/api-contract-end-user-docs.md` â€” identifies existing API contract end-user documentation creation, persisted documentation path behavior, and API doc validation.
- `.spec-guard/reviews/readme-maintenance-preference.md` â€” identifies existing README preference persistence and README maintenance behavior.

## Documentation Requirements

- [Agent Instructions](AGENTS.md) â€” document agent obligations for current-spec documentation requirements.
- [Workflow](WORKFLOW.md) â€” document workflow obligations for current-spec documentation integrity.
- [Spec Template](templates/spec.md) â€” add the `Documentation Requirements` section for future specs.
- [Implementation Review Template](templates/implementation-review.md) â€” require linked documentation alignment and documentation update validation.

## Dependencies

None.

## Open Questions

None.

## Work Classification

<!-- Choose one primary classification. -->

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [x] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
- [ ] Bugfix
