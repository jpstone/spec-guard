# Implementation Review

## Linked Spec

[spec-awaiting-approval](../specs/spec-awaiting-approval.md)

## Linked Contract

<!-- Direct behavior with no new API or UI — no contract required. -->

## Classification

Direct behavior with no new API or UI

## Implementation Files

- `src/check.js` — updated `validStatuses` from `['Draft', 'Ready', 'Blocked', 'Implemented', 'Deferred']` to `['Draft', 'Pending Approval', 'Ready for Implementation', 'Implementation Approved', 'Blocked', 'Implemented', 'Deferred']`; changed comparison from substring `includes()` to exact `===` (case-insensitive) to prevent 'Ready' from matching 'Ready for Implementation'
- `src/artifact-index.js` — updated `SPEC_STATUS_ORDER` to seven-status order: `['Draft', 'Pending Approval', 'Ready for Implementation', 'Implementation Approved', 'Blocked', 'Implemented', 'Deferred']`
- `src/spec-status.js` — updated `SPEC_STATUSES` allowlist to all seven statuses; removed `'Ready'`, added `'Pending Approval'`, `'Ready for Implementation'`, `'Implementation Approved'`
- `bin/spec-guard.js` — added Gate 3 status check in `confirmGateCommand`: reads spec file, checks status equals `'Implementation Approved'`, returns exit code 1 with human-readable error if not; updated Gate 4's `updateSpecStatus` call from `'Ready'` to `'Ready for Implementation'`
- `mcp/server.js` — added same Gate 3 status check in `toolConfirmGate`: returns `{ success: false, error: '...' }` directing agent to get human authorization and set `Implementation Approved` first
- `templates/spec.md` — updated status comment from `Draft | Ready | Blocked | Implemented | Deferred` to all seven statuses in correct order
- `.spec-guard/specs/spec-awaiting-approval.md` — migrated status from `Ready` to `Ready for Implementation` (was the only spec with `Ready` status)
- `AGENTS.md` — updated Spec Status Values table: removed `Ready` row; added `Pending Approval`, `Ready for Implementation`, and `Implementation Approved` rows with descriptions; added Gate 3 enforcement paragraph
- `WORKFLOW.md` — updated Gate 4 description: `'Ready'` → `'Ready for Implementation'`
- `docs/validation-rules.md` — updated SG-SPEC-006 description to list all seven valid statuses

## Test Files

- `test/check.test.js` — renamed existing valid-statuses test to remove `Ready`; added tests for `Pending Approval`, `Ready for Implementation`, and `Implementation Approved` (no SG-SPEC-006); added test that `Ready` now produces SG-SPEC-006
- `test/artifact-index.test.js` — updated sub-header presence tests to check all seven statuses; updated order test to seven-status order; updated six boundary-marker references from `### Ready` to `### Pending Approval`; added tests for `Pending Approval`, `Ready for Implementation`, and `Implementation Approved` specs routing to correct sub-headers
- `test/cli.test.js` — updated Gate 4 status test from `Ready` to `Ready for Implementation`; added Gate 3 block tests (Draft blocked, Ready for Implementation blocked, Implementation Approved succeeds)
- `test/mcp.test.js` — added three `spec_guard_confirm_gate` Gate 3 tests (Draft blocked, Ready for Implementation blocked, Implementation Approved succeeds)

## Summary of Change

Added three new spec statuses (`Pending Approval`, `Ready for Implementation`, `Implementation Approved`) and removed `Ready`. Updated all validation, artifact index bucketing, status update allowlist, and documentation to use the seven-status set. Added a Gate 3 enforcement check in both the CLI `confirm-gate 3` command and the MCP `spec_guard_confirm_gate` tool: reads the spec file and hard-errors if the status is not `Implementation Approved`, instructing the agent to get explicit human authorization first. Gate 4 now sets the spec status to `Ready for Implementation` instead of `Ready`. Changed status validation from substring `includes()` to exact `===` match so that `Ready` is no longer accepted through `Ready for Implementation`.

## Tests Written First

- [x] New tests were run before implementation and failed for the expected reason.

Failure-first evidence (Gate 4): `check.test.js` — 3 new status tests failed (new statuses absent from `validStatuses`; `Ready` still passed); `artifact-index.test.js` — 8 tests failed (new sub-headers absent, `### Ready` boundary references broken); `cli.test.js` — Gate 3 block tests exited 0 instead of 1; Gate 4 status test matched `Ready` not `Ready for Implementation`; `mcp.test.js` — Gate 3 MCP block tests returned `success: true` instead of error.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.

## Behavior / Contract Validated

- `spec-guard check` accepts `Pending Approval` as a valid status value and produces no SG-SPEC-006 diagnostic.
- `spec-guard check` accepts `Ready for Implementation` as a valid status value and produces no SG-SPEC-006 diagnostic.
- `spec-guard check` accepts `Implementation Approved` as a valid status value and produces no SG-SPEC-006 diagnostic.
- `spec-guard check` flags `Ready` as an unrecognized status with SG-SPEC-006 (it is no longer valid after the rename).
- `spec-guard confirm-gate 3` returns a non-zero exit code and a human-readable error when the spec status is anything other than `Implementation Approved`; the error states that explicit human authorization is required, and once the human authorizes, the agent must set the spec status to `Implementation Approved` before confirming Gate 3.
- `spec-guard confirm-gate 3` returns a non-zero exit code and a human-readable error when the spec status is `Ready for Implementation`; the error states that `Ready for Implementation` is not sufficient — the human must explicitly authorize implementation and the agent must set the status to `Implementation Approved` first.
- `spec_guard_confirm_gate` MCP tool returns an error (not a gate confirmation) for Gate 3 when spec status is anything other than `Implementation Approved`.
- The artifact index includes `### Pending Approval`, `### Ready for Implementation`, and `### Implementation Approved` H3 sub-headers under the Specs section in the correct fixed order: Draft → Pending Approval → Ready for Implementation → Implementation Approved → Blocked → Implemented → Deferred; all seven sub-headers are always present regardless of whether any specs have that status.
- `templates/spec.md` status comment lists all seven valid statuses in the correct order.
- AGENTS.md documents all three new/renamed statuses and the Gate 3 enforcement rule.
- No existing spec file in `.spec-guard/specs/` retains `Ready` as its status value after this change is applied.

## Linked Documentation

[AGENTS.md](../../AGENTS.md)

## Dependency Integration

| Dependency | Integration code | Test |
|------------|-----------------|------|
| -          | -               | -    |

N/A — no external dependencies.

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All current-spec documentation obligations were satisfied.
- [x] All docs listed in Linked Documentation above are directly linked from the governing spec's Documentation Requirements section.
- [x] All docs listed in Linked Documentation above were validated against the implemented behavior, or confirmed not applicable.

## Remaining Risks / Follow-Ups

- None.
