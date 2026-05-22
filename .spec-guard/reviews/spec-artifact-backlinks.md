# Implementation Review

## Linked Spec

- `.spec-guard/specs/spec-artifact-backlinks.md`

## Linked Contract

None — classification does not require a contract.

## Classification

Direct behavior with no new API or UI

## Implementation Files

- `bin/spec-guard.js`
- `mcp/server.js`
- `AGENTS.md`
- `WORKFLOW.md`
- `docs/cli.md`

## Test Files

- `test/cli.test.js`
- `test/mcp.test.js`

## Summary of Change

- Added `--spec` support for spec-linked artifact creation so created contracts, reviews, blockers, deviations, discoveries, and scope discoveries are linked from the originating spec.
- Added idempotent `Related Artifacts` link insertion that preserves existing spec sections and links.
- Updated CLI and MCP artifact creation paths and required documentation.

## Tests Written First

- `test/cli.test.js` — `spec-linked artifact creation records direct links in the originating spec without duplicates` verifies contract, review, blocker, deviation, scope discovery, discovery, idempotency, and preservation of existing documentation requirements.
- `test/mcp.test.js` — `MCP: spec_guard_create_artifact records a direct link in the originating spec` verifies MCP artifact creation records a direct spec link while preserving existing sections.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.
- [x] If not run, the concrete reason is recorded here: N/A — test was run. Expected failure: `test/cli.test.js` `spec-linked artifact creation records direct links in the originating spec without duplicates` failed because `spec-guard new` did not accept `--spec` for contract creation yet.

## Behavior / Contract Validated

- Creating a contract for a spec records a direct link to that contract in the originating spec.
- Creating an implementation review for a spec records a direct link to that review in the originating spec.
- Creating a blocker for a spec records a direct link to that blocker in the originating spec.
- Creating a deviation for a spec records a direct link to that deviation in the originating spec.
- Creating a scope discovery for a spec records a direct link to that scope discovery in the originating spec.
- Creating a discovery for a spec, when the command is associated with a spec, records a direct link to that discovery in the originating spec.
- Re-running artifact creation or link recording does not duplicate links in the spec.
- Existing spec sections and existing links are preserved.

## Linked Documentation

- `AGENTS.md`
- `WORKFLOW.md`
- `docs/cli.md`

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All current-spec documentation obligations were satisfied.
- [x] All docs listed in Linked Documentation above are directly linked from the governing spec's Documentation Requirements section.
- [x] All docs listed in Linked Documentation above were validated against the implemented behavior, or confirmed not applicable.
- [x] No documentation update was needed. N/A — documentation updates were required and completed.
- [x] Durable contract documentation was updated. N/A — no contract documentation was required.
- [x] The document itself was the deliverable. N/A — implementation was the deliverable.

## Remaining Risks / Follow-Ups

- None.
