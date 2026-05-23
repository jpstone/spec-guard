# Spec

## Title

confirm-gate does not refresh artifact index after status update

## Status

Implemented

## Problem / Goal

When `confirm-gate 6` sets a spec's status to `Implemented`, `updateSpecStatus` writes the spec file but `regenerateArtifactIndex` is never called. The artifact index (.spec-guard/README.md) stays stale — the spec remains listed under its old status bucket until some other command happens to trigger a regeneration. Developers browsing the artifact index see incorrect status groupings.

## In Scope

- Call `regenerateArtifactIndex()` in `confirmGateCommand` (bin/spec-guard.js) after any `updateSpecStatus` call — specifically after Gate 6 sets status to `Implemented`

## Out of Scope

- Changes to any other command
- Changes to how other status transitions work
- Changing the artifact index format or content

## Users / Actors

- User

## Expected Behavior

After `spec-guard confirm-gate <spec> 6` runs, the artifact index is regenerated immediately. The spec appears under `### Implemented` in .spec-guard/README.md without requiring any subsequent command to trigger regeneration.

## Acceptance Criteria

- [ ] `confirm-gate 6` causes the spec to appear under `### Implemented` in .spec-guard/README.md immediately after the command completes — no subsequent command required

## Edge Cases

- Spec has never had a run state file — `confirm-gate 6` still writes the spec and regenerates the index correctly

## Related Artifacts

- [implementation review](../reviews/confirm-gate-index-refresh.md)

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
