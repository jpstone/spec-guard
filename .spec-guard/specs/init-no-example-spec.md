# Spec

## Title

Init Must Not Create example.md

## Status

Implemented

## Problem / Goal

spec-guard init creates .spec-guard/specs/example.md as a starter spec. This file is unwanted: it is an incomplete template that causes spec-guard validate to fail immediately after init, it triggers the initiative trigger condition (any .md in specs/ blocks saveInitiative and the initiative CLI), it forces initiative tests to avoid calling init, and it is referenced in tests and documentation that assert its existence. The correct behavior is for spec-guard init to leave .spec-guard/specs/ empty.

## In Scope

- Remove the creation of .spec-guard/specs/example.md from the init command in bin/spec-guard.js.
- Delete all tests that reference example.md (tests that assert it is created, or that it is not overwritten) — example.md's existence must not be tested in any direction.
- Remove any documentation references to example.md or the 'starter spec' concept.

## Out of Scope

- Changes to any other init behavior (directory creation, AGENTS.md, WORKFLOW.md, GitHub Actions workflow, README setup, artifact index generation).
- Adding a different form of starter content or template.

## Users / Actors

- User

## Expected Behavior

After spec-guard init, .spec-guard/specs/ exists and is empty. No example.md or any other spec file is created automatically. Users create their first spec with spec-guard draft or spec-guard initiative.

## Acceptance Criteria

- [ ] spec-guard init does not create .spec-guard/specs/example.md.
- [ ] No test references example.md — neither asserting it is created nor asserting it is absent.
- [ ] No documentation file references example.md or describes it as a file created by init.
- [ ] spec-guard validate exits 0 immediately after spec-guard init on a fresh project.

## Edge Cases

- Running spec-guard init twice on the same project: still no example.md created; idempotent.
- Running spec-guard initiative --from-json immediately after spec-guard init: succeeds because no .md files exist in .spec-guard/specs/.

## Documentation Requirements

- No documentation changes required.

## Dependencies

- None.

## Open Questions

- None.

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [ ] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
- [x] Bugfix

## Test Evidence

- [x] Permanent regression coverage: the two tests that asserted example.md is created are the failure-first evidence (they pass against the buggy code and are deleted as part of the fix). spec-guard validate passing on a fresh init is the ongoing regression guard via AC4.
