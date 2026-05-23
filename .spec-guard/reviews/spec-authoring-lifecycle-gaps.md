# Implementation Review

## Linked Spec

[spec-authoring-lifecycle-gaps](../specs/spec-authoring-lifecycle-gaps.md)

## Linked Contract

<!-- No contract required — Bugfix classification -->

## Classification

Bugfix

## Implementation Files

- `src/check.js` — added SG-STATUS-001 WARNING rule in `checkStatus()`
- `src/discover.js` — conditional Documentation Requirements placeholder for `Operational/document deliverable`
- `bin/spec-guard.js` — added `set-status` command; updated `check` exit code to include warnings when `--warnings` is passed; imported `SPEC_STATUSES`
- `mcp/server.js` — added `spec_guard_set_status` tool definition and handler; imported `updateSpecStatus` and `SPEC_STATUSES`

## Test Files

- `test/spec-authoring-lifecycle-gaps.test.js`

## Summary of Change

- SG-STATUS-001 fires as a WARNING when spec status is `Draft`, causing `spec-guard check --warnings` (Gate 2) to exit non-zero until the agent advances the status
- `spec-guard set-status <name> <status>` and `spec_guard_set_status` MCP tool update the spec's Status field and regenerate the artifact index atomically, preventing stale index entries
- AGENTS.md now instructs agents to use `set-status` for all status transitions and specifies the correct status for each lifecycle stage
- `buildSpecFromAnswers` now generates a placeholder in Documentation Requirements for `Operational/document deliverable` specs instead of the incorrect "No documentation changes required" default

## Tests Written First

- `SG-STATUS-001 WARNING fires when spec status is Draft` — verifies rule fires at WARNING severity for Draft status
- `SG-STATUS-001 does not fire when status is Pending Approval` — verifies rule does not fire for non-Draft statuses
- `Draft status does not produce a BLOCKER — Gate 1 still passes` — verifies no regression at Gate 1
- `spec-guard check --warnings (Gate 2) exits non-zero for a Draft spec` — verifies Gate 2 fails on Draft
- `spec-guard check --warnings exits 0 when status is Pending Approval` — verifies Gate 2 passes on Pending Approval
- `spec-guard set-status updates the spec Status field` — verifies CLI command writes updated status
- `spec-guard set-status regenerates the artifact index` — verifies artifact index reflects new status
- `spec-guard set-status rejects invalid status values` — verifies error on invalid input
- `spec_guard_set_status MCP tool updates spec status and returns updated status` — verifies MCP tool works end-to-end
- `spec_guard_set_status MCP tool returns error for invalid status` — verifies MCP error path
- `AGENTS.md instructs agent to use set-status command for status changes` — document check
- `AGENTS.md instructs agent to set Pending Approval when presenting` — document check
- `AGENTS.md instructs agent to set Ready for Implementation after approval` — document check
- `buildSpecFromAnswers with Operational/document deliverable does not generate "No documentation changes required"` — verifies template fix
- `buildSpecFromAnswers with non-operational classification keeps default` — regression check

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.

## Behavior / Contract Validated

- [x] `spec-guard check --warnings emits SG-STATUS-001 WARNING when spec status is Draft`
- [x] `A spec with status Draft cannot pass Gate 2 — spec-guard check --warnings exits non-zero`
- [x] `A spec with status Pending Approval or higher passes the SG-STATUS-001 check`
- [x] `spec-guard set-status <name> <status>` updates the spec's Status field to the given value and regenerates the artifact index
- [x] `spec-guard set-status` rejects invalid status values with a clear error
- [x] `spec_guard_set_status` MCP tool accepts spec_path and status, performs the same update, and returns the updated status
- [x] AGENTS.md instructs the agent to use `spec-guard set-status` or `spec_guard_set_status` for all status changes — never edit the spec file directly
- [x] AGENTS.md instructs the agent to call set-status to Pending Approval when presenting a spec for review, and Ready for Implementation after the human approves the spec
- [x] For Operational/document deliverable classification, the draft tool's Documentation Requirements section generates a placeholder instead of "No documentation changes required"
- [x] spec-guard check (Gate 1, without --warnings) continues to pass for specs in Draft status — no regression

## Linked Documentation

- [AGENTS.md](../../AGENTS.md)
- [docs/cli.md](../../docs/cli.md)
- [docs/mcp.md](../../docs/mcp.md)
- [.spec-guard/contracts/cli-api-contract.md](../contracts/cli-api-contract.md)
- [.spec-guard/contracts/mcp-api-contract.md](../contracts/mcp-api-contract.md)
- [docs/validation-rules.md](../../docs/validation-rules.md)

## Dependency Integration

No runtime dependencies introduced.

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All current-spec documentation obligations were satisfied.
- [x] All docs listed in Linked Documentation above are directly linked from the governing spec's Documentation Requirements section.
- [x] All docs listed in Linked Documentation above were validated against the implemented behavior, or confirmed not applicable.
- [x] Durable contract documentation was updated.

## Remaining Risks / Follow-Ups

- None.
