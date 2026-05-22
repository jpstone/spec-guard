# Spec

## Title

Artifact Backlink Path Bug

## Status

Draft

## Problem / Goal

`addArtifactLinkToSpec` in both `bin/spec-guard.js` and `mcp/server.js` computes the artifact link path relative to `process.cwd()` (the repo root). GitHub resolves relative markdown links relative to the directory of the file containing the link, not the repo root. As a result, artifact backlinks written into specs (e.g. a review link written into `.spec-guard/specs/foo.md`) resolve to a non-existent path on GitHub and cannot be followed.

## Existing Behavior

- `addArtifactLinkToSpec` calls `relative(process.cwd(), resolve(artifactPath))` to compute the link path.
- A link to `.spec-guard/reviews/foo.md` written into `.spec-guard/specs/foo.md` is stored as `.spec-guard/reviews/foo.md`.
- GitHub interprets this as `.spec-guard/specs/.spec-guard/reviews/foo.md`, which does not exist, so the link is broken.

## Behavior Delta

- BEFORE: artifact link path is relative to `process.cwd()` → GitHub link is broken. → AFTER: artifact link path is relative to the spec file's directory → GitHub link resolves correctly.

## In Scope

- Fix `addArtifactLinkToSpec` in `bin/spec-guard.js` to compute the artifact path relative to the spec file's directory (`dirname(resolvedSpec)`) instead of `process.cwd()`.
- Apply the same fix to the duplicate `addArtifactLinkToSpec` in `mcp/server.js`.
- Preserve idempotency: re-running the command must not write a duplicate link.

## Out of Scope

- Migrating or rewriting existing broken links already written to spec files.
- Any change to artifact file locations or directory structure.
- Any change to link-writing behavior other than correcting the path anchor.

## Users / Actors

- Developers and agents who follow artifact backlinks from a spec file on GitHub.

## Expected Behavior

When an artifact is created for a spec, the link written into the spec resolves correctly when clicked on GitHub. The link path is relative to the spec file's own directory.

## Acceptance Criteria

- [ ] A link written by `addArtifactLinkToSpec` for an artifact in `.spec-guard/reviews/` from a spec in `.spec-guard/specs/` is `../reviews/<artifact>.md`, not `.spec-guard/reviews/<artifact>.md`.
- [ ] The fix is applied in both `bin/spec-guard.js` and `mcp/server.js`.
- [ ] Calling `addArtifactLinkToSpec` twice with the same arguments does not produce a duplicate link.

## Edge Cases

- Artifact and spec in the same directory: path should be the bare filename with no leading `./` prefix required (but `./filename.md` is also acceptable).
- Existing specs with the old (broken) CWD-relative link format are not modified by this fix.

## Prior Implementation Review

- `.spec-guard/reviews/spec-artifact-backlinks.md`

## Related Artifacts

- [implementation review](../reviews/artifact-backlink-path-bug.md)

## Documentation Requirements

No documentation changes required — this is a bug in path computation only.

## Implementation Planning

Planning required: no. Direct one-line fix within the existing Node.js implementation.

Confirmed Plan: Fix `relative()` anchor in `addArtifactLinkToSpec` in both `bin/spec-guard.js` and `mcp/server.js`.

## Dependencies

None.

## Open Questions

None.

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
