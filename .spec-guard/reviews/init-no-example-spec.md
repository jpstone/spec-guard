# Implementation Review

## Linked Spec

[init-no-example-spec](../specs/init-no-example-spec.md)

## Linked Contract

<!-- Bugfix with no new API or UI — no contract required. -->

## Classification

Bugfix

## Implementation Files

- `bin/spec-guard.js` — removed the "Starter spec" block (lines 473–481) that created `.spec-guard/specs/example.md` by copying `templates/spec.md` via `writeFile` with `flag: 'wx'`

## Test Files

- `test/cli.test.js` — deleted `init creates starter spec` and `init does not overwrite existing starter spec`
- `test/initiative.test.js` — removed two "Do NOT call init — it creates example.md" comments
- `test/artifact-index.test.js` — removed one "Do NOT call init — it creates example.md" comment
- `README.md` — removed `example.md` from the `## What init creates` directory listing
- `docs/cli.md` — removed `example.md` from the `spec-guard init` directory listing

## Summary of Change

Deleted the nine-line "Starter spec" block from `initCommand` in `bin/spec-guard.js`. The block read the spec template and wrote it to `.spec-guard/specs/example.md` on every init where the file did not already exist. Removing it leaves `.spec-guard/specs/` empty after init, which is the correct state: the initiative trigger condition is unblocked, `spec-guard validate` exits 0 immediately after init, and the two test files no longer need workaround comments.

## Tests Written First

The failure-first evidence was the two existing tests that documented and asserted the wrong behavior:
- `init creates starter spec` — passed against the buggy code confirming example.md was created
- `init does not overwrite existing starter spec` — passed confirming the idempotency of wrong behavior

Both tests were deleted as part of the fix. No new test was added — example.md's existence must not be tested in any direction.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason. The existing tests `init creates starter spec` and `init does not overwrite existing starter spec` both passed against the pre-fix code, confirming the bug exists. They were then deleted as part of the fix.

## Behavior / Contract Validated

- spec-guard init does not create .spec-guard/specs/example.md.
- No test references example.md — neither asserting it is created nor asserting it is absent.
- No documentation file references example.md or describes it as a file created by init.
- spec-guard validate exits 0 immediately after spec-guard init on a fresh project.

## Linked Documentation

None — the spec carries no documentation obligations. References to the example spec were removed from the project README and the CLI reference doc as collateral cleanup.

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
