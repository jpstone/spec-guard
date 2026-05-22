# Implementation Review

## Linked Spec

[.spec-guard/specs/analyze-dry-run.md](../specs/analyze-dry-run.md)

## Linked Contract

None — Direct behavior, no new API or UI.

## Classification

Direct behavior with no new API or UI

## Implementation Files

<!-- Source files created or modified by this implementation. -->

- [src/analyze.js](../../src/analyze.js) — Added `dryRun` parameter, `REVIEW_RULES` constant set, gated stale and review blocks on `!dryRun`, added `dry_run: true` field to return value
- [bin/spec-guard.js](../../bin/spec-guard.js) — Added `--dry-run` flag handling in `analyzeCommand`; advisory exit 0 and labeled output in dry-run mode
- [mcp/server.js](../../mcp/server.js) — Added `dry_run` boolean parameter to `spec_guard_analyze` tool schema and `toolAnalyze` function
- [src/run.js](../../src/run.js) — Imported `analyzeArtifacts`; added advisory dry-run analysis call at end of Phase 3 when a contract is inferred

## Test Files

<!-- Test files written for this implementation. -->

- [test/analyze.test.js](../../test/analyze.test.js) — 4 dry-run unit tests
- [test/cli.test.js](../../test/cli.test.js) — 2 CLI-level `analyze --dry-run` tests
- [test/mcp.test.js](../../test/mcp.test.js) — 1 MCP `spec_guard_analyze` dry_run test

## Summary of Change

- Added a `dryRun` parameter to `analyzeArtifacts()` in `src/analyze.js`. When `true`, skips all review-dependent rules (`REVIEW_RULES` set: SG-ALIGN-001, 002, 004, 005, 006, 007, 009, SG-STALE-001) and returns `dry_run: true` in the result.
- CLI `analyze` command reads the `--dry-run` flag, passes `dryRun: true` to `analyzeArtifacts`, labels output as a pre-implementation check, and always exits 0.
- MCP `spec_guard_analyze` tool accepts `dry_run: true` with identical behavior.
- `spec-guard run` orchestrator imports `analyzeArtifacts` and calls it with `dryRun: true` after Phase 3 when a contract is inferred, printing any diagnostics as advisory output.

## Tests Written First

<!-- Description of what each test verifies — one line per test. -->

- `analyzeArtifacts — dry_run: true skips review rules (SG-ALIGN-001)` — confirms no SG-ALIGN-001 diagnostic when review is missing in dry-run mode
- `analyzeArtifacts — dry_run: true skips stale gate detection (SG-STALE-001)` — confirms no SG-STALE-001 diagnostic in dry-run mode
- `analyzeArtifacts — dry_run: true still runs contract checks (SG-ALIGN-003)` — confirms SG-ALIGN-003 still fires when contract is blank template
- `analyzeArtifacts — dry_run: true returns dry_run: true in result` — confirms `dry_run` field is present in return value
- CLI: `analyze --dry-run exits 0 even when contract alignment warning present` — end-to-end CLI test
- CLI: `analyze --dry-run labels output as pre-implementation check` — verifies label in stdout
- MCP: `spec_guard_analyze — dry_run: true includes dry_run field and skips review rules` — MCP tool returns `dry_run: true`

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.

Gate 4 recorded: 6 of 7 tests failed before implementation. The 7th (`dry_run: true still runs contract checks`) passed immediately because the existing `analyzeArtifacts` already ran contract checks regardless of the (not-yet-implemented) `dryRun` parameter — this is correct pre-implementation behavior.

## Behavior / Contract Validated

- `spec-guard analyze <name> --dry-run` runs and exits 0 even when contract alignment warnings are present.
- Dry-run output is labeled to indicate it is a pre-implementation check.
- Dry-run skips all review-dependent rules: SG-ALIGN-001, SG-ALIGN-002, SG-ALIGN-004, SG-ALIGN-005, SG-ALIGN-006, SG-ALIGN-007, SG-ALIGN-009, SG-STALE-001.
- Dry-run still runs contract alignment checks: SG-ALIGN-003 and SG-ALIGN-008.
- `spec_guard_analyze` MCP tool accepts `dry_run: true` and applies the same behavior.
- The `run` orchestrator invokes dry-run analysis at Phase 3 when a contract is inferred, printing results as advisory output before Phase 4 begins.

## Linked Documentation

- [docs/cli.md](../../docs/cli.md) — `--dry-run` flag documented on the `analyze` command
- [AGENTS.md](../../AGENTS.md) — CLI Quick Reference and `spec_guard_analyze` tool description updated

## Dependency Integration

None — no new runtime dependencies introduced.

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All current-spec documentation obligations were satisfied.
- [x] All docs listed in Linked Documentation above are directly linked from the governing spec's Documentation Requirements section.
- [x] All docs listed in Linked Documentation above were validated against the implemented behavior, or confirmed not applicable.

## Remaining Risks / Follow-Ups

- None.
