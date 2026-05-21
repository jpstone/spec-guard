# Spec: Minor Version Bump

## Status

Draft

## Problem / Goal

The package metadata and changelog should reflect the newly implemented Bugfix classification feature as the next minor release. Without this, consumers cannot see the correct package version or release notes for the new classification capability.

## Prior Implementation Review

.spec-guard/reviews/bugfix-classification.md

## In Scope

- Bump `package.json` version from `0.11.0` to `0.12.0`.
- Add a top-level `0.12.0` changelog entry describing the Bugfix classification feature.
- Preserve existing changelog entries and wording below the new release entry.

## Out of Scope

- Publishing the package.
- Changing source code behavior beyond release metadata and changelog text.
- Changing dependency versions or package scripts.
- Rewriting historical changelog entries except as needed to place the new `0.12.0` entry above them.

## Expected Behavior

`package.json` reports version `0.12.0`, and `CHANGELOG.md` starts with a `0.12.0` section that summarizes the Bugfix classification feature. Existing changelog history remains intact below the new section.

## Acceptance Criteria

- [ ] `package.json` has exactly `"version": "0.12.0"`.
- [ ] `CHANGELOG.md` contains a `## 0.12.0` section above `## 0.11.0`.
- [ ] The `0.12.0` changelog section mentions Bugfix as a new work classification.
- [ ] The `0.12.0` changelog section mentions failure-first bug reproduction.
- [ ] The `0.12.0` changelog section mentions permanent or temporary test evidence.
- [ ] Existing changelog entries below `0.12.0` remain present.

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
- [x] Operational/document deliverable
- [ ] Bugfix
