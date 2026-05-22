# Implementation Review

## Linked Spec

`.spec-guard/specs/artifact-backlink-path-bug.md`

## Linked Contract

None — Bugfix classification; no contract required.

## Classification

Bugfix

## Implementation Files

- `bin/spec-guard.js` — `addArtifactLinkToSpec`: anchor changed from `process.cwd()` to `dirname(resolvedSpec)`
- `mcp/server.js` — `addArtifactLinkToSpec`: same one-line fix

## Test Files

- `test/cli.test.js` — added `artifact backlinks use paths relative to the spec file, not the repo root`; updated existing `spec-linked artifact creation records direct links…` to assert `../subdir/name.md` paths
- `test/mcp.test.js` — added `MCP: spec_guard_create_artifact link is relative to spec file directory, not repo root`

## Summary of Change

- Both `addArtifactLinkToSpec` implementations computed the artifact link path relative to `process.cwd()` (repo root). GitHub resolves markdown links relative to the file containing the link, so a link like `.spec-guard/reviews/foo.md` inside `.spec-guard/specs/foo.md` resolved to a non-existent path.
- Changed to `relative(dirname(resolvedSpec), resolve(artifactPath))` so the link is relative to the spec file's own directory, producing `../reviews/foo.md` as expected.

## Tests Written First

- CLI test: creates a review artifact linked to a spec in `.spec-guard/specs/`, then asserts the written link matches `(../reviews/my-review.md)` and does not match `(.spec-guard/reviews/my-review.md)`.
- MCP test: same structure with the spec nested in `.spec-guard/specs/` inside a temp dir; asserts `(../reviews/review.md)`.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.

Test `artifact backlinks use paths relative to the spec file, not the repo root` failed because the written link was `(.spec-guard/reviews/my-review.md)` — CWD-relative, not spec-file-relative.

Test `MCP: spec_guard_create_artifact link is relative to spec file directory, not repo root` failed because the written link was `(../../AppData/Local/Temp/sg-artifact-.../reviews/review.md)` — fully path-traversed from CWD.

## Behavior / Contract Validated

- A link written by `addArtifactLinkToSpec` for an artifact in `.spec-guard/reviews/` from a spec in `.spec-guard/specs/` is `../reviews/<artifact>.md`, not `.spec-guard/reviews/<artifact>.md`.
- The fix is applied in both `bin/spec-guard.js` and `mcp/server.js`.
- Calling `addArtifactLinkToSpec` twice with the same arguments does not produce a duplicate link.
- All 235 tests pass after the fix.

## Linked Documentation

- None

## Dependency Integration

No runtime dependency wiring — internal path computation change only.

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] No documentation update was needed.

## Remaining Risks / Follow-Ups

- Existing specs that received broken links from the previous implementation retain those broken links. No migration was in scope; users can manually correct them or re-run the relevant commands if the artifacts still exist.
