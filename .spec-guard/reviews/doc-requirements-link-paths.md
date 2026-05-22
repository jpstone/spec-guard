# Implementation Review

## Linked Spec

[.spec-guard/specs/doc-requirements-link-paths.md](../specs/doc-requirements-link-paths.md)

## Linked Contract

None — Bugfix, no contract required.

## Classification

Bugfix

## Implementation Files

- [src/analyze.js](../../src/analyze.js) — added `relative` to path import; added `inferRepoRootFromSpecPath` helper; updated `extractDocLinks` and `addDocLink` to accept and use an optional `filePath` parameter for normalizing `..` paths; updated callers to pass `specPath` and `reviewPath`

## Test Files

- [test/doc-links-path-resolution.test.js](../../test/doc-links-path-resolution.test.js) — 4 tests covering file-relative/repo-root-relative cross-matching, mismatch detection, and escape-root edge case

## Summary of Change

- `addDocLink` previously filtered all paths containing `..`, making file-relative links (e.g. `../../docs/cli.md`) unusable for SG-ALIGN-009 validation. Updated to normalize `..` paths by resolving them relative to the containing file and computing a repo-root-relative key for comparison. Paths that escape the repo root are still silently skipped. Existing repo-root-relative paths are unchanged.
- Added `inferRepoRootFromSpecPath(filePath)` — locates the repo root from any file under `.spec-guard/` by scanning for the `/.spec-guard/` marker in the resolved path.
- `extractDocLinks` now accepts an optional `filePath` parameter and passes it through to `addDocLink`.
- Callers in `analyzeArtifacts` pass `specPath` and `reviewPath` to `extractDocLinks` so normalization has file context.
- AGENTS.md updated with the file-relative link path requirement and explanation.

## Tests Written First

- `SG-ALIGN-009 does not fire when spec uses file-relative Documentation Requirements path and review uses repo-root-relative Linked Documentation path` — verifies cross-format match (spec `../../docs/api.md` ↔ review `docs/api.md`)
- `SG-ALIGN-009 does not fire when spec uses repo-root-relative Documentation Requirements path and review uses file-relative Linked Documentation path` — verifies reverse cross-format match
- `SG-ALIGN-009 fires when spec has two file-relative Documentation Requirements paths but review only links one` — verifies mismatch detection still works with file-relative paths
- `SG-ALIGN-009 silently skips file-relative path that resolves outside the repo root` — verifies escape-root edge case

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.

Tests 1, 2, and 3 failed before implementation: file-relative links were filtered by the `..` check, causing cross-format mismatches and missed mismatch detection. Test 4 passed trivially (the existing `..` filter incidentally caught escape-root paths).

## Behavior / Contract Validated

- A Documentation Requirements link written as `../../docs/cli.md` in a spec at `.spec-guard/specs/` resolves to the correct file on GitHub (path is relative to the spec file, not the repo root).
- SG-ALIGN-009 matches ../../docs/cli.md in a spec's Documentation Requirements against docs/cli.md in a review's Linked Documentation (and vice versa) — both normalize to the same repo-root-relative key.
- SG-ALIGN-009 continues to match existing repo-root-relative paths (e.g., `docs/cli.md`) without requiring any changes to those files.
- When `extractDocLinks` is called with a `filePath` of `.spec-guard/specs/foo.md` and a link of `../../docs/cli.md`, the extracted comparison key is `docs/cli.md`. A link without `..` (e.g., `docs/cli.md`) is returned as-is.

## Linked Documentation

- [AGENTS.md](../../AGENTS.md) — added file-relative link path requirement to Documentation Requirements Integrity section

## Dependency Integration

None — no new runtime dependencies.

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All current-spec documentation obligations were satisfied.
- [x] All docs listed in Linked Documentation above are directly linked from the governing spec's Documentation Requirements section.
- [x] All docs listed in Linked Documentation above were validated against the implemented behavior, or confirmed not applicable.

## Remaining Risks / Follow-Ups

- Existing specs and reviews with repo-root-relative paths remain as-is; GitHub links in those files are still broken but backward compat is preserved. Retroactive rewriting is out of scope per the spec.
