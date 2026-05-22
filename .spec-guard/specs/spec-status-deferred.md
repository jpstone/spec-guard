# Spec

## Title

Deferred Spec Status

## Status

Draft

## Problem / Goal

Specs that were drafted but later determined to be unnecessary, premature, or indefinitely on hold have no status to reflect that state. They remain in `Draft`, which implies active work is either in progress or pending. This makes it impossible to distinguish specs that are genuinely being worked toward from specs that have been deliberately set aside. A `Deferred` status captures the decision that a spec exists, was considered, and has been intentionally parked without a commitment to implement it.

## In Scope

- Add `Deferred` as a valid spec status value in `src/check.js` alongside the existing values `Draft`, `Ready`, `Blocked`, and `Implemented`.
- Update `templates/spec.md` to document `Deferred` as a valid status value with a one-line description of when to use it.
- Update the `artifact-index` spec's status sub-header list to include `Deferred` as a fifth sub-header, positioned after `Implemented` in the fixed order: Draft, Ready, Blocked, Implemented, Deferred.
- Update AGENTS.md to document when to use `Deferred`: a spec that was drafted and deliberately set aside with no current intention to implement — not blocked by a specific problem, not actively being worked, just indefinitely on hold.
- `spec-guard check` treats `Deferred` specs the same as any other status for validation purposes — the spec content is still validated, gate rules still apply if gates are confirmed. Deferred is purely a human-readable signal; it does not alter tool behavior.

## Out of Scope

- Preventing gate confirmations or check operations on Deferred specs — the status is informational only.
- An automatic transition to Deferred based on inactivity or time.
- Any mechanism to "reactivate" a Deferred spec — changing the status back to `Draft` is sufficient.
- Changes to any other status value or transition rule.
- Any new CLI command, API surface, or UI.

## Users / Actors

- Developers and agents reviewing the spec list — they can distinguish specs that are genuinely in progress from specs that have been deliberately parked.

## Expected Behavior

A spec with `Status: Deferred` passes `spec-guard check` without errors related to its status. It appears under the `Deferred` sub-header in the `.spec-guard/README.md` artifact index. Agents encountering a Deferred spec during work planning understand it is not to be implemented without an explicit decision to reactivate it.

## Acceptance Criteria

- [ ] `spec-guard check` accepts `Deferred` as a valid status value and does not report an error when a spec's `## Status` section contains `Deferred`.
- [ ] `templates/spec.md` documents `Deferred` as a valid status value.
- [ ] The `artifact-index` spec is updated to include `Deferred` as a fifth status sub-header positioned after `Implemented`.
- [ ] AGENTS.md documents `Deferred` status and when to apply it.

## Edge Cases

- A spec transitions from `Deferred` back to `Draft`: valid — changing the status field is sufficient; no other action required.
- A Deferred spec has confirmed gates from before it was deferred: `spec-guard check` and `analyze` still run normally; the Deferred status does not invalidate existing gate confirmations.

## Documentation Requirements

- [AGENTS.md](../../AGENTS.md) — document `Deferred` status: definition, when to use it, and that changing status back to `Draft` is sufficient to reactivate.

## Dependencies

- [artifact-index](artifact-index.md) — the artifact index spec must be updated to include the `Deferred` sub-header as part of this implementation.

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
