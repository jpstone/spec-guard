# Spec

## Title

Documentation Requirements Link Path Bug

## Status

Implemented

## Problem / Goal

Links in the Documentation Requirements section of specs (and the Linked Documentation section of reviews) use repo-root-relative paths (e.g., docs/cli.md, AGENTS.md). GitHub resolves markdown links relative to the containing file's directory, so from .spec-guard/specs/foo.md a link to docs/cli.md resolves to .spec-guard/specs/docs/cli.md — not found. This is the same root cause as the artifact-backlink-path-bug: paths anchored to process.cwd() (repo root) instead of the file that contains the link. The secondary effect: extractDocLinks in src/analyze.js explicitly filters out paths containing '..' to prevent false matches, which means file-relative paths like ../../docs/cli.md cannot be used for SG-ALIGN-009 validation either — there is currently no format that is both a working GitHub link and a valid SG-ALIGN-009 comparison target.

## In Scope

- Fix extractDocLinks (and addDocLink) in src/analyze.js to accept an optional file path parameter and normalize file-relative paths (those containing '..') by resolving them relative to the containing file, producing a repo-root-relative key for comparison. This enables SG-ALIGN-009 to match file-relative links in both the spec and review.
- Update callers of extractDocLinks in analyzeArtifacts to pass the spec path and review path respectively.
- Update AGENTS.md to document that Documentation Requirements and Linked Documentation links must use paths relative to the containing file (e.g., ../../docs/cli.md from .spec-guard/specs/).
- Add a helper to infer repo root from a spec or review file path (parallel to the existing inferRepoRootFromContractPath).

## Out of Scope

- Retroactively rewriting existing repo-root-relative paths already written in specs or reviews — backward compatibility is required; existing repo-root-relative paths must continue to pass SG-ALIGN-009.
- Changing how contract paths or artifact backlinks are handled — those were fixed in artifact-backlink-path-bug.
- Changes to spec-guard check — SG-ALIGN-009 is an analyze-only rule.

## Users / Actors

- User

## Expected Behavior

A Documentation Requirements link written as a file-relative path (e.g., ../../docs/cli.md) in a spec at .spec-guard/specs/foo.md resolves to the correct file when clicked on GitHub. SG-ALIGN-009 correctly matches file-relative links against their repo-root-relative equivalents so the spec and review stay in alignment. Existing specs and reviews with repo-root-relative paths continue to pass SG-ALIGN-009 without modification.

## Acceptance Criteria

- [ ] A Documentation Requirements link written as ../../docs/cli.md in a spec at .spec-guard/specs/ resolves to the correct file on GitHub (path is relative to the spec file, not the repo root).
- [ ] SG-ALIGN-009 matches ../../docs/cli.md in a spec's Documentation Requirements against docs/cli.md in a review's Linked Documentation (and vice versa) — both normalize to the same repo-root-relative key.
- [ ] SG-ALIGN-009 continues to match existing repo-root-relative paths (e.g., docs/cli.md) without requiring any changes to those files.
- [ ] When `extractDocLinks` is called with a `filePath` of `.spec-guard/specs/foo.md` and a link of `../../docs/cli.md`, the extracted comparison key is `docs/cli.md`. A link without `..` (e.g., `docs/cli.md`) is returned as-is.

## Edge Cases

- A link path that contains `..` but cannot be resolved relative to a known file path (no `filePath` context): skip silently, same as current behavior.
- A path that resolves outside the repo root after normalization (e.g., `../../../outside.md`): skip silently.
- Both spec and review use file-relative paths: both normalize to the same repo-root-relative key and match.
- Spec uses repo-root-relative, review uses file-relative (or vice versa): both normalize to the same key and match.

## Prior Implementation Review

Related fix: `.spec-guard/reviews/artifact-backlink-path-bug.md` — same root cause; that fix addressed `addArtifactLinkToSpec`; this fix addresses `extractDocLinks`.

## Related Artifacts

- [implementation review](../reviews/doc-requirements-link-paths.md)

## Documentation Requirements
- [AGENTS.md](../../AGENTS.md) — document that Documentation Requirements and Linked Documentation links must use file-relative paths.

## Dependencies

- None.

## Open Questions

- None.

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [ ] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
- [x] Bugfix

## Test Evidence

- [x] Permanent regression coverage.
- [ ] Temporary — remove after: 
