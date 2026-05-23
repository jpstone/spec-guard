# Implementation Review

## Linked Spec

[implementation-active-status](../specs/implementation-active-status.md)

## Linked Contract

<!-- Direct behavior with no new API or UI — no contract required. -->

## Classification

Direct behavior with no new API or UI

## Implementation Files

- `src/check.js` — replaced `'Implementation Approved'` with `'Implementation Active'` in `validStatuses`; `Implementation Approved` now produces SG-SPEC-006; `Implementation Active` is accepted without diagnostic
- `src/artifact-index.js` — replaced `'Implementation Approved'` with `'Implementation Active'` in `SPEC_STATUS_ORDER`; artifact index now renders `### Implementation Active` sub-header in correct position (after `### Ready for Implementation`, before `### Blocked`); `### Implementation Approved` no longer appears
- `src/spec-status.js` — replaced `'Implementation Approved'` with `'Implementation Active'` in `SPEC_STATUSES` allowlist; `updateSpecStatus` now accepts `'Implementation Active'` and rejects `'Implementation Approved'`
- `bin/spec-guard.js` — updated Gate 3 status check: requires `'Implementation Active'` instead of `'Implementation Approved'`; error messages updated to reference `Implementation Active`; removed `updateSpecStatus(inputPath, 'Ready for Implementation')` call from Gate 4 confirmation — Gate 4 no longer changes spec status
- `mcp/server.js` — updated Gate 3 status check in `toolConfirmGate`: requires `'Implementation Active'`; error message updated to reference `Implementation Active`
- `templates/spec.md` — updated status comment: `Implementation Approved` → `Implementation Active`; comment now reads `Draft | Pending Approval | Ready for Implementation | Implementation Active | Blocked | Implemented | Deferred`
- `AGENTS.md` — replaced `Implementation Approved` row with `Implementation Active`; added no-self-initiation rule; updated Gate 3 enforcement note; added explicit prohibition on self-initiated implementation
- `WORKFLOW.md` — updated Gate 4 description: removed "updates the spec's Status to Ready for Implementation"; now states Gate 4 does not change status; spec remains `Implementation Active` throughout
- `docs/validation-rules.md` — updated SG-SPEC-006 valid statuses list: `Implementation Approved` → `Implementation Active`

## Test Files

- `test/check.test.js` — replaced `checkSpecText does not flag Implementation Approved as invalid` with `checkSpecText does not flag Implementation Active as invalid (no SG-SPEC-006)`; added `checkSpecText flags Implementation Approved as invalid status (SG-SPEC-006)` asserting `Implementation Approved` now produces one SG-SPEC-006 INFO diagnostic
- `test/artifact-index.test.js` — updated sub-header presence test: `### Implementation Approved` → `### Implementation Active`; added assertion `!content.includes('### Implementation Approved')`; updated status order test: `Implementation Approved` → `Implementation Active`; updated `Ready for Implementation` boundary marker from `### Implementation Approved` to `### Implementation Active`; replaced `Implementation Approved sub-header` routing test with `Implementation Active sub-header` routing test
- `test/cli.test.js` — replaced `confirm-gate 4 updates spec status to Ready for Implementation` with `confirm-gate 4 does not change spec status` (asserts status remains `Implementation Active` after Gate 4); updated Gate 3 block error tests to reference `Implementation Active`; replaced `confirm-gate 3 succeeds when spec status is Implementation Approved` with `confirm-gate 3 succeeds when spec status is Implementation Active`
- `test/mcp.test.js` — updated two Gate 3 block tests: `assert.match(result.error, /Implementation Active/)` instead of `/Implementation Approved/`; replaced `spec_guard_confirm_gate succeeds for Gate 3 when spec status is Implementation Approved` with `spec_guard_confirm_gate succeeds for Gate 3 when spec status is Implementation Active`

## Summary of Change

Replaced `Implementation Approved` with `Implementation Active` as the status that unlocks Gate 3. The status ladder remains 7 statuses: Draft → Pending Approval → Ready for Implementation → Implementation Active → Blocked → Implemented → Deferred. Gate 3 now requires `Implementation Active` in both the CLI and MCP. Gate 4 no longer auto-sets any status — the spec remains `Implementation Active` throughout implementation. Agents must set `Implementation Active` only after explicit human authorization (verbal instruction or affirmative response to an agent query); self-initiated implementation is prohibited. No existing spec files required migration.

## Tests Written First

- [x] New tests were run before implementation and failed for the expected reason.

Failure-first evidence (Gate 4): 13 tests failed before implementation — `check.test.js`: `Implementation Active` not in `validStatuses`; `Implementation Approved` still accepted. `artifact-index.test.js`: 3 sub-header tests failed (SPEC_STATUS_ORDER still had `Implementation Approved`). `cli.test.js`: Gate 4 status-unchanged test failed (updateSpecStatus still called); 3 Gate 3 tests failed (error messages referenced `Implementation Approved`; `Implementation Active` not accepted). `mcp.test.js`: 3 Gate 3 tests failed for same reasons.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.

## Behavior / Contract Validated

- `spec-guard check` accepts `Implementation Active` as a valid status value and produces no SG-SPEC-006 diagnostic.
- `spec-guard check` flags `Implementation Approved` as an unrecognized status with SG-SPEC-006 (it is no longer valid after this change).
- The artifact index includes a `### Implementation Active` H3 sub-header in the correct fixed order: Draft → Pending Approval → Ready for Implementation → Implementation Active → Blocked → Implemented → Deferred; all seven sub-headers are always present regardless of whether any specs have that status; `### Implementation Approved` no longer appears.
- `spec-guard confirm-gate 3` succeeds (exit 0) when the spec status is `Implementation Active`.
- `spec-guard confirm-gate 3` returns a non-zero exit code and error when the spec status is `Ready for Implementation` (unchanged — still blocked).
- `spec_guard_confirm_gate` MCP tool succeeds for Gate 3 when the spec status is `Implementation Active`.
- `spec-guard confirm-gate 4` does not change the spec's status field.
- `templates/spec.md` status comment lists all seven valid statuses with `Implementation Active` in place of `Implementation Approved`.
- AGENTS.md documents `Implementation Active`, instructs agents to set it only after explicit human authorization, and explicitly prohibits agents from self-initiating implementation.
- No existing spec file in `.spec-guard/specs/` retains `Implementation Approved` as its status value after this change.

## Linked Documentation

[AGENTS.md](../../AGENTS.md)

## Dependency Integration

| Dependency | Integration code | Test |
|------------|-----------------|------|
| spec-awaiting-approval | superseded — `Implementation Approved` removed, `Implementation Active` takes its position and role at Gate 3 | all Gate 3 tests updated |

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All current-spec documentation obligations were satisfied.
- [x] All docs listed in Linked Documentation above are directly linked from the governing spec's Documentation Requirements section.
- [x] All docs listed in Linked Documentation above were validated against the implemented behavior, or confirmed not applicable.

## Remaining Risks / Follow-Ups

- None.
