# Spec

## Title

Pre-Implementation Analyze (analyze --dry-run)

## Status

Implemented

## Problem / Goal

`spec-guard analyze` runs only at Gate 6, after implementation is complete. Contract-alignment issues (blank contract, missing structure, missing API doc) are not surfaced until then, even though they could be caught before any code is written. A dry-run mode that runs contract-only alignment checks before Gate 3 would surface these issues earlier — while the cost of fixing them is still low.

## In Scope

- Add a `--dry-run` flag to `spec-guard analyze` that runs contract alignment checks only (SG-ALIGN-003, SG-ALIGN-008), skipping all review-dependent rules (SG-ALIGN-001, SG-ALIGN-002, SG-ALIGN-004, SG-ALIGN-005, SG-ALIGN-006, SG-ALIGN-007, SG-ALIGN-009, SG-STALE-001).
- Output is labeled as a pre-implementation check to distinguish it from the full Gate 6 run.
- Dry-run always exits 0 — results are advisory only, never blocking.
- Add a `dry_run` boolean parameter to the `spec_guard_analyze` MCP tool with the same behavior.
- Wire dry-run analysis into the `run` orchestrator at the end of Phase 3 (Implementation Planning): if a contract is inferred, run `analyzeArtifacts({ dryRun: true })` and print any diagnostics as advisory output before proceeding to Phase 4.

## Out of Scope

- Changing the existing Gate 6 `analyze` behavior in any way.
- Running dry-run checks at Gate 2 (contract checks are Gate 2's responsibility).
- Adding new alignment rules.
- Making dry-run results block the workflow.

## Users / Actors

- Agents and developers running `spec-guard analyze <name> --dry-run` before writing tests or implementation.
- The `spec-guard run` orchestrator invoking dry-run at Phase 3 automatically.

## Expected Behavior

`spec-guard analyze <name> --dry-run` runs contract alignment checks, prints results labeled as a pre-implementation check, and exits 0 regardless of findings. When a contract is inferred in the `run` orchestrator at Phase 3, dry-run analysis runs automatically and prints any diagnostics as advisory output without blocking forward progress.

## Acceptance Criteria

- [ ] `spec-guard analyze <name> --dry-run` runs and exits 0 even when contract alignment warnings are present.
- [ ] Dry-run output is labeled to indicate it is a pre-implementation check.
- [ ] Dry-run skips all review-dependent rules: SG-ALIGN-001, SG-ALIGN-002, SG-ALIGN-004, SG-ALIGN-005, SG-ALIGN-006, SG-ALIGN-007, SG-ALIGN-009, SG-STALE-001.
- [ ] Dry-run still runs contract alignment checks: SG-ALIGN-003 and SG-ALIGN-008.
- [ ] `spec_guard_analyze` MCP tool accepts `dry_run: true` and applies the same behavior.
- [ ] The `run` orchestrator invokes dry-run analysis at Phase 3 when a contract is inferred, printing results as advisory output before Phase 4 begins.

## Edge Cases

- No contract inferred or provided: dry-run produces no contract diagnostics and exits 0.
- Dry-run with `--json`: output includes a `dry_run: true` field in the result object.
- Running `spec-guard analyze <name>` without `--dry-run` is unchanged.

## Prior Implementation Review

No prior implementation review — new flag on an existing command.

## Related Artifacts

- [implementation review](../reviews/analyze-dry-run.md)

## Documentation Requirements

- [CLI Documentation](docs/cli.md) — document `--dry-run` flag on the `analyze` command.
- [Agent Instructions](AGENTS.md) — note that dry-run runs automatically at Phase 3 and results are advisory.

## Implementation Planning

Planning Required: No

Confirmed Plan:
- No implementation planning required. Direct behavior addition within the existing Node.js CLI/MCP implementation.

## Dependencies

None.

## Open Questions

None.

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [x] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
- [ ] Bugfix
