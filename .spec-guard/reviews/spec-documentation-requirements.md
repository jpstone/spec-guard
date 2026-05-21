# Implementation Review

## Linked Spec

`.spec-guard/specs/spec-documentation-requirements.md`

## Linked Contract

None — Direct behavior with no new API or UI does not require a contract.

## Classification

Direct behavior with no new API or UI

## Implementation Files

- `src/analyze.js`
- `src/discover.js`
- `templates/spec.md`
- `templates/implementation-review.md`
- `AGENTS.md`
- `WORKFLOW.md`

## Test Files

- `test/analyze.test.js`
- `test/documentation-requirements-instructions.test.js`

## Summary of Change

- Added `Documentation Requirements` support to the spec template and AI-generated specs.
- Added workflow and agent instructions requiring 100% verification of documentation obligations for the current governing spec only.
- Added implementation review template checklist items for documentation requirement alignment and validation.
- Added `SG-ALIGN-009` analyze diagnostics for mismatches between spec `Documentation Requirements` and review `Linked Documentation`.
- Added tests for spec/review documentation link alignment and instruction/template coverage.

## Tests Written First

- `analyzeArtifacts — SG-ALIGN-009 when spec documentation requirement is missing from review linked docs` verifies required docs in the spec must appear in review linked docs.
- `analyzeArtifacts — clean documentation requirements when spec and review linked docs match` verifies matching links do not warn.
- `analyzeArtifacts — SG-ALIGN-009 when review linked doc is not directly linked from spec documentation requirements` verifies created/updated docs in review must be directly linked from the spec.
- `spec template includes Documentation Requirements section` verifies specs support the new section.
- `workflow requires identifying documentation obligations for the current spec only` verifies workflow guidance is present and scoped.
- `agent instructions require direct links for docs created or updated by the current spec` verifies agent guidance is present.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.
- [x] Failure-first evidence recorded in Gate 3: documentation requirements instruction tests failed because templates/spec.md, WORKFLOW.md, and AGENTS.md did not yet define Documentation Requirements behavior; analyze SG-ALIGN-009 tests failed until documentation requirement alignment validation was implemented.

## Behavior / Contract Validated

- [x] Specs support a `Documentation Requirements` section that records docs the current spec requires to be created, updated, linked, or validated.
- [x] Any documentation file created or updated for the current spec must be listed as a direct repository-relative link in the spec's `Documentation Requirements` section.
- [x] The implementation review's `Linked Documentation` section must include the same created or updated docs.
- [x] The workflow requires agents to identify documentation obligations from the current spec, linked contract, classification, and prior implementation review.
- [x] The workflow requires agents to verify 100% of the current spec's documentation obligations before review is complete.
- [x] Review/analyze reports an issue when a spec's `Documentation Requirements` section lists required docs that are not present in the implementation review's `Linked Documentation` section.
- [x] Review/analyze reports an issue when docs were created or updated but are not directly linked from the spec's `Documentation Requirements` section.
- [x] Review/analyze reports an issue when required documentation update or validation checklist items are not completed.
- [x] If the current spec has no documentation obligations, the spec or review must explicitly record that no documentation changes are required.
- [x] The documentation integrity check is scoped only to the current spec's obligations and does not audit unrelated repository docs.

## Linked Documentation

- [Agent Instructions](AGENTS.md)
- [Workflow](WORKFLOW.md)
- [Spec Template](templates/spec.md)
- [Implementation Review Template](templates/implementation-review.md)

## Dependency Integration

No runtime dependencies.

- [x] No runtime dependency integration is required for this direct behavior change.

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All current-spec documentation obligations were satisfied.
- [x] All docs listed in Linked Documentation above are directly linked from the governing spec's Documentation Requirements section.
- [x] All docs listed in Linked Documentation above were validated against the implemented behavior, or confirmed not applicable.
- N/A — documentation updates were required and completed.
- [x] Durable workflow/template documentation was updated.
- N/A — the document itself was not the deliverable.

## Remaining Risks / Follow-Ups

- None.
