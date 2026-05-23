# Spec

## Title

Spec Guard Artifact Index

## Status

Implemented

## Problem / Goal

Navigating to the `.spec-guard` folder in GitHub shows a raw directory listing with no structured overview of what artifacts exist. There is no single place to see all specs, contracts, reviews, initiatives, and other artifacts at a glance. GitHub automatically renders a `README.md` file when you navigate to a folder, making `.spec-guard/README.md` the natural home for a living index of all artifacts. Without it, discoverability depends entirely on knowing the folder structure and filename conventions.

## In Scope

- `spec-guard init` creates `.spec-guard/README.md` with all artifact type headings and empty lists under each.
- Every spec-guard command that writes a `.spec-guard` artifact regenerates `.spec-guard/README.md` in full from the current state of the artifact directories after the artifact is successfully written. Commands that trigger regeneration: `spec-guard draft`, `spec-guard initiative`, `spec-guard review`, `spec-guard blocker`, `spec-guard deviation`, `spec-guard scope-discovery`, `spec-guard discovery`, and any command that writes a contract. The corresponding MCP tools (`spec_guard_draft_spec`, `spec_guard_save_initiative`, etc.) trigger regeneration on the same condition.
- The index contains one H2 heading per artifact type in this fixed order: Specs, Contracts, Reviews, Initiatives, Blockers, Deviations, Scope Discoveries, Discoveries.
- The Specs heading is subdivided into five H3 status sub-headers in this fixed order: Draft, Ready, Blocked, Implemented, Deferred. Each spec appears under the sub-header matching its `## Status` section value. All five sub-headers always appear regardless of whether any specs have that status.
- Under all other artifact type headings (Contracts, Reviews, Initiatives, etc.), entries appear as a flat list with no sub-headers.
- Under each heading or sub-header, every artifact appears as a markdown list entry: a clickable link whose display text is the artifact's title and whose target is the artifact file's path relative to `.spec-guard/README.md` (e.g., `specs/foo.md`, `contracts/bar.md`).
- Entries within each heading or sub-header are sorted alphabetically by display title, case-insensitively.
- If no artifacts exist for a heading or sub-header, the heading or sub-header still appears with no list items beneath it.
- Title extraction: for all artifact types except reviews, use the content of the `## Title` section; if no `## Title` section is found, fall back to the filename converted from kebab-case to Title Case. For reviews, derive the display text as `Implementation Review: <Title>` where `<Title>` is extracted from the spec referenced in the review's `## Linked Spec` section; if the linked spec cannot be resolved or has no `## Title`, fall back to `Implementation Review: <filename-as-title>`.
- Regeneration scans the artifact directories from disk on every trigger, so the index naturally reflects any files that have been added, renamed, or deleted since the last regeneration.

## Out of Scope

- A dedicated `spec-guard index` command — the index is always maintained automatically as a side effect of artifact writes.
- Sorting by anything other than display title (date created, status, classification, etc.).
- Including gate status, classification, or other metadata in index entries — each entry is a title link only. Spec status is used only to determine sub-header placement, not as visible text in the entry itself.
- Watching for filesystem changes and regenerating without a triggering command.
- Any change to artifact file formats or templates.
- Any new CLI command, API surface, or UI beyond the README.md regeneration behavior.

## Users / Actors

- Developers navigating the `.spec-guard` folder on GitHub — they see a structured, linked index of all artifacts instead of a raw directory listing.
- Agents working on the project — they can discover existing artifacts by reading the index rather than scanning directory listings.

## Expected Behavior

After `spec-guard init`, `.spec-guard/README.md` exists with all eight artifact type headings and no list entries; the Specs heading has all five status sub-headers (Draft, Ready, Blocked, Implemented, Deferred) with no entries under any of them. After each subsequent artifact write command completes successfully, the file is regenerated from disk: every artifact appears under its heading as a sorted, clickable title link. Specs are grouped under their status sub-header; when a spec's status changes, the next regeneration moves its entry to the correct sub-header automatically. Reviews display as `Implementation Review: <linked spec title>`. Headings and sub-headers with no artifacts remain present with empty lists. The file is always current as of the last artifact write.

## Acceptance Criteria

- [ ] `spec-guard init` creates `.spec-guard/README.md` containing all eight artifact type headings (Specs, Contracts, Reviews, Initiatives, Blockers, Deviations, Scope Discoveries, Discoveries) in the specified order; the Specs heading contains five H3 status sub-headers (Draft, Ready, Blocked, Implemented, Deferred) in that order with no list entries under any heading or sub-header.
- [ ] After any artifact write command succeeds, `.spec-guard/README.md` is regenerated and reflects the current contents of all artifact directories.
- [ ] Each artifact appears as a markdown list entry with a relative link from `.spec-guard/README.md` to the artifact file, using the artifact's title as display text.
- [ ] Each spec entry appears under the H3 sub-header matching its `## Status` value; when a spec's status changes, the next regeneration moves its entry to the correct sub-header.
- [ ] Entries within each heading and sub-header are sorted alphabetically by display title, case-insensitively.
- [ ] All five status sub-headers (Draft, Ready, Blocked, Implemented, Deferred) appear under the Specs heading regardless of whether any specs have that status.
- [ ] Review entries display as `Implementation Review: <Title>` where `<Title>` is the `## Title` content of the spec referenced in the review's `## Linked Spec` section.
- [ ] If a review's linked spec cannot be resolved or has no `## Title`, the review entry falls back to `Review of <filename-as-title>`.
- [ ] If any artifact has no `## Title` section (excluding reviews), its entry falls back to the filename converted from kebab-case to Title Case.
- [ ] The index is regenerated from disk state on each trigger, reflecting any files added, renamed, or deleted since the last regeneration.
- [ ] MCP tools that write artifacts (`spec_guard_draft_spec`, `spec_guard_save_initiative`, etc.) trigger the same regeneration as their CLI equivalents.

## Edge Cases

- `.spec-guard/README.md` does not exist when a write command runs (e.g., was deleted manually): regenerate it from scratch.
- A spec file has an unrecognized or missing `## Status` value: place the entry under the Draft sub-header as the default.
- An artifact file exists in a subdirectory but cannot be read (permissions, encoding): skip that entry silently — do not error the write command.
- Two artifacts in the same heading have identical titles after case-normalization: both appear; secondary sort by filename to produce a stable order.
- A review's `## Linked Spec` section references a spec outside the `.spec-guard/` directory or uses an unresolvable path: fall back to filename-based display text.
- `spec-guard init` is run on a project that already has artifacts and an existing `README.md`: regenerate from current disk state rather than overwriting with empty headings.
- The `.spec-guard/runs/` directory (ephemeral gate state) is not an artifact type and does not appear as a heading in the index.

## Documentation Requirements

- [AGENTS.md](../../AGENTS.md) — note that `.spec-guard/README.md` is the artifact index and is automatically maintained; agents should not manually edit it.

## Dependencies

- None.

## Open Questions

- None.

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [x] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
- [ ] Bugfix
