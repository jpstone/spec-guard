# Implementation Review

## Linked Spec

[artifact-index](../specs/artifact-index.md)

## Linked Contract

<!-- Direct behavior with no new API or UI — no contract required. -->

## Classification

Direct behavior with no new API or UI

## Implementation Files

- `src/artifact-index.js` — new file; `regenerateArtifactIndex({ dir })` builds `.spec-guard/README.md` from disk state; scans all 8 artifact directories; groups specs by status (Draft/Ready/Blocked/Implemented/Deferred) under H3 sub-headers; renders reviews as `Implementation Review: <linked spec title>`; falls back to filename-as-title when no `## Title` section; entries sorted alphabetically case-insensitively within each section
- `bin/spec-guard.js` — `initCommand` calls `regenerateArtifactIndex` after creating the `.spec-guard` directory tree; `initiativeCommand` calls `regenerateArtifactIndex` after writing the initiative artifact; `copyTemplateCommand` (used by `review`, `blocker`, `scope-discovery`, `deviation`, `discovery`) calls `regenerateArtifactIndex` after each write; `draftCommand` calls `regenerateArtifactIndex` after writing the spec
- `mcp/server.js` — added `import { regenerateArtifactIndex }` from `src/artifact-index.js`; added `inferProjectRoot(filePath)` helper that extracts the project root from an absolute path by locating `/.spec-guard/`; `toolDraftSpec`, `toolSaveInitiative`, and `toolCreateArtifact` each call `regenerateArtifactIndex` after a successful write

## Test Files

- `test/artifact-index.test.js` — 17 tests covering: `spec-guard init` creates `.spec-guard/README.md`; all 8 headings in correct order; Specs heading has all 5 H3 status sub-headers in order; artifact write regenerates index; each artifact has a relative link with its title; spec appears under correct status sub-header (Draft/Implemented/Deferred/unknown→Draft); entries sorted alphabetically; all 5 sub-headers present when empty; review entries render as `Implementation Review: <title>`; review fallback when spec not found; artifact without `## Title` falls back to filename; disk-state reflects deleted files; status change moves spec to correct sub-header; `spec-guard initiative --from-json` regenerates index; MCP `spec_guard_draft_spec` triggers regeneration

## Summary of Change

- Introduced `src/artifact-index.js` as the single source of truth for generating `.spec-guard/README.md`. The file is always built from a fresh disk scan rather than maintained incrementally, so it automatically reflects any added, renamed, or deleted artifacts.
- Hooked regeneration into every artifact-writing CLI command so the index is always current after a write. MCP tools received the same treatment via `inferProjectRoot` to reliably locate the project root from an absolute output path.
- The Specs section uses H3 sub-headers in the fixed order (Draft → Ready → Blocked → Implemented → Deferred), all five always present. All other artifact types use flat lists under H2 headings in the fixed order. Reviews derive their display title by resolving the linked spec and extracting its `## Title`.

## Tests Written First

- All 17 tests in `test/artifact-index.test.js` were written before the corresponding implementation was complete.
- Key TDD sequences: headings/sub-headers tests verified the structure before the generation logic was finalized; the status sub-header placement tests (`Draft`, `Implemented`, `Deferred`, unrecognized) drove the `extractStatus` + bucketing logic; the review title test drove `extractLinkedSpec` + `resolveLinkedSpec`; the MCP test drove adding `inferProjectRoot` to `mcp/server.js`.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.

## Behavior / Contract Validated

- `spec-guard init` creates `.spec-guard/README.md` containing all eight artifact type headings (Specs, Contracts, Reviews, Initiatives, Blockers, Deviations, Scope Discoveries, Discoveries) in the specified order; the Specs heading contains five H3 status sub-headers (Draft, Ready, Blocked, Implemented, Deferred) in that order with no list entries under any heading or sub-header.
- After any artifact write command succeeds, `.spec-guard/README.md` is regenerated and reflects the current contents of all artifact directories.
- Each artifact appears as a markdown list entry with a relative link from `.spec-guard/README.md` to the artifact file, using the artifact's title as display text.
- Each spec entry appears under the H3 sub-header matching its `## Status` value; when a spec's status changes, the next regeneration moves its entry to the correct sub-header.
- Entries within each heading and sub-header are sorted alphabetically by display title, case-insensitively.
- All five status sub-headers (Draft, Ready, Blocked, Implemented, Deferred) appear under the Specs heading regardless of whether any specs have that status.
- Review entries display as `Implementation Review: <Title>` where `<Title>` is the `## Title` content of the spec referenced in the review's `## Linked Spec` section.
- If a review's linked spec cannot be resolved or has no `## Title`, the review entry falls back to `Review of <filename-as-title>`.
- If any artifact has no `## Title` section (excluding reviews), its entry falls back to the filename converted from kebab-case to Title Case.
- The index is regenerated from disk state on each trigger, reflecting any files added, renamed, or deleted since the last regeneration.
- MCP tools that write artifacts (`spec_guard_draft_spec`, `spec_guard_save_initiative`, etc.) trigger the same regeneration as their CLI equivalents.

## Linked Documentation

- [AGENTS.md](../../AGENTS.md) — note that `.spec-guard/README.md` is automatically maintained; agents must not manually edit it

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
