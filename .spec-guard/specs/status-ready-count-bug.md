# Spec

## Title

Status Ready Count Bug

## Status

Implemented

## Problem / Goal

`spec-guard status` reports the summary count as `0 Ready` even when the status table includes a spec with status `Ready for Implementation`, causing the ready count to be inaccurate.

## In Scope

- Fix the status summary/counting logic so specs with status `Ready for Implementation` are counted as Ready.
- Add a regression test that reproduces the mismatch.

## Out of Scope

- No changes to spec status names.
- No changes to gate semantics.
- No changes to implementation authorization rules.
- No unrelated `spec-guard status` output formatting changes beyond correcting the inaccurate Ready count.

## Users / Actors

- User

## Expected Behavior

Running `spec-guard status` in a repository with one or more specs whose status is `Ready for Implementation` shows a Ready summary count that matches the number of such specs in the status table.

## Acceptance Criteria

- [ ] `spec-guard status` counts each `Ready for Implementation` spec in the Ready summary total.
- [ ] The Ready summary total matches the number of status table rows whose status is `Ready for Implementation`.
- [ ] Existing status rows and classifications remain unchanged apart from the corrected Ready summary count.
- [ ] A regression test fails before the fix and passes after the fix.

## Edge Cases

- Repositories with zero `Ready for Implementation` specs still report `0 Ready`.

## Prior Implementation Review

- [spec-awaiting-approval review](../reviews/spec-awaiting-approval.md) — introduced `Ready for Implementation` as a lifecycle status and updated status-related validation, artifact index, CLI, MCP, templates, and documentation.

## Related Artifacts

- [implementation review](../reviews/status-ready-count-bug.md)

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

- [x] Permanent regression coverage.
- [ ] Temporary — remove after:
