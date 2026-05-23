# Spec

## Title

Implementation Active Status

## Status

Implemented

## Problem / Goal

The current status `Implementation Approved` and the proposed `Implementation Active` serve the same human-authorization intent but create two steps where one is sufficient. When a human authorizes implementation, that is the moment implementation becomes active — there is no meaningful intermediate "approved but not yet started" state worth tracking separately. The goal is a single `Implementation Active` status that replaces `Implementation Approved`: the human authorizes, the agent sets it, and Gate 3 unblocks. Gate 4 no longer auto-sets any status since the spec is already marked active.

## In Scope

- Replace `Implementation Approved` with `Implementation Active` in `src/check.js` `validStatuses` — remove `Implementation Approved`, add `Implementation Active`.
- Replace `Implementation Approved` with `Implementation Active` in `src/artifact-index.js` `SPEC_STATUS_ORDER` — same position (after `Ready for Implementation`, before `Blocked`); seven statuses total.
- Replace `Implementation Approved` with `Implementation Active` in `src/spec-status.js` `SPEC_STATUSES`.
- Update the Gate 3 status check in `bin/spec-guard.js` and `mcp/server.js` to require `Implementation Active` instead of `Implementation Approved`.
- Remove the automatic status update from Gate 4 confirmation in `bin/spec-guard.js` — Gate 4 currently sets `Ready for Implementation`, which is incorrect; the spec is already `Implementation Active` when failure-first tests are written.
- Update `templates/spec.md` status comment to list all seven valid statuses with `Implementation Active` in place of `Implementation Approved`.
- Migrate any existing spec files in `.spec-guard/specs/` that have `Implementation Approved` status to `Implementation Active`.
- Update `AGENTS.md`: replace the `Implementation Approved` row with `Implementation Active`; document that the agent sets `Implementation Active` when the human explicitly authorizes implementation (by instructing the agent or confirming when asked); update Gate 3 enforcement note; add instruction that agents must not begin implementing on their own — explicit human authorization is required.
- Update `WORKFLOW.md`: replace `Implementation Approved` references and remove the Gate 4 auto-status note.
- Update `docs/validation-rules.md`: replace `Implementation Approved` with `Implementation Active` in the valid statuses list.
- Update all tests that reference `Implementation Approved` as a valid status, as a Gate 3 prerequisite, or as an artifact index sub-header — replace with `Implementation Active` throughout.
- Update tests that assert Gate 4 sets `Ready for Implementation` — delete or replace to assert Gate 4 does not change the spec status.

## Out of Scope

- Any automatic transition to `Implementation Active` via a gate — the agent sets this status only in response to an explicit human instruction.
- Any CLI or MCP command specifically for claiming or releasing a spec — status changes are made by the agent editing the spec file directly.
- Any concurrency or locking mechanism to prevent two agents from setting the same spec to `Implementation Active`.
- Any change to how Gate 5 or Gate 6 behave beyond removing Gate 4's auto-status-set.

## Users / Actors

- Humans authorizing implementation — they instruct the agent (or confirm when asked) to begin implementing a specific spec.
- Agents implementing specs — they set `Implementation Active` after receiving explicit human authorization, then proceed with the gate workflow.
- Developers reviewing the artifact index — they can see at a glance which specs are currently being actively implemented.

## Expected Behavior

When a human explicitly authorizes implementation — either by telling the agent to begin (e.g. "go ahead and implement X") or by responding affirmatively when the agent asks (e.g. "Should I begin implementation?" → "yes") — the agent sets the spec's status to `Implementation Active` and then confirms Gate 3. Gate 3 now requires `Implementation Active` (instead of `Implementation Approved`). Gate 4 no longer auto-sets any status; the spec remains `Implementation Active` throughout the implementation process. Gate 6 continues to set `Implemented`. Agents must not begin implementing a spec without explicit human authorization — specs in `Ready for Implementation` must wait.

## Acceptance Criteria

- [ ] `spec-guard check` accepts `Implementation Active` as a valid status value and produces no SG-SPEC-006 diagnostic.
- [ ] `spec-guard check` flags `Implementation Approved` as an unrecognized status with SG-SPEC-006 (it is no longer valid after this change).
- [ ] The artifact index includes a `### Implementation Active` H3 sub-header in the correct fixed order: Draft → Pending Approval → Ready for Implementation → Implementation Active → Blocked → Implemented → Deferred; all seven sub-headers are always present regardless of whether any specs have that status; `### Implementation Approved` no longer appears.
- [ ] `spec-guard confirm-gate 3` succeeds (exit 0) when the spec status is `Implementation Active`.
- [ ] `spec-guard confirm-gate 3` returns a non-zero exit code and error when the spec status is `Ready for Implementation` (unchanged — still blocked).
- [ ] `spec_guard_confirm_gate` MCP tool succeeds for Gate 3 when the spec status is `Implementation Active`.
- [ ] `spec-guard confirm-gate 4` does not change the spec's status field.
- [ ] `templates/spec.md` status comment lists all seven valid statuses with `Implementation Active` in place of `Implementation Approved`.
- [ ] AGENTS.md documents `Implementation Active`, instructs agents to set it only after explicit human authorization, and explicitly prohibits agents from self-initiating implementation.
- [ ] No existing spec file in `.spec-guard/specs/` retains `Implementation Approved` as its status value after this change.

## Edge Cases

- Spec is in `Ready for Implementation` — Gate 3 is still blocked; human must authorize implementation first.
- Spec is already in `Implementation Active` and Gate 3 needs re-confirming — Gate 3 check accepts `Implementation Active` and succeeds.
- Gate 4 is confirmed while spec is `Implementation Active` — status remains `Implementation Active`; no automatic update occurs.
- Two specs both in `Implementation Active` — both show under the `### Implementation Active` sub-header simultaneously; no conflict.
- Any spec currently at `Implementation Approved` — migrated to `Implementation Active` as part of this change.

## Documentation Requirements

- [AGENTS.md](../../AGENTS.md) — replace `Implementation Approved` with `Implementation Active`; document authorization flow and no-self-initiation rule; update Gate 3 enforcement note.

## Dependencies

- [spec-awaiting-approval](spec-awaiting-approval.md) — introduced `Implementation Approved` and the Gate 3 block; this spec supersedes that behavior for `Implementation Approved`.

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
