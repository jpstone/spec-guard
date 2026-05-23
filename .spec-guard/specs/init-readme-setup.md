# Spec

## Title

Init README Setup

## Status

Implemented

## Problem / Goal

README creation and maintenance responsibility is currently split incorrectly between `spec-guard init` and the workflow orchestrator. Init does nothing with README.md; the workflow orchestrator handles both creation (when no README exists) and updates, and asks an interactive preference question mid-workflow to decide whether to do so. This means README creation happens at the wrong time, the opt-out mechanism is buried inside the workflow, and the workflow carries conditional logic (create vs update vs skip) that belongs at setup time. The correct design: init is responsible for ensuring a README exists and for recording the user's opt-out decision; the workflow assumes a README is present and focuses solely on intelligent content updates.

## In Scope

- `spec-guard init` creates `README.md` at the project root if none exists. The created file contains only the Spec Guard section (see format below) — no placeholder title, no other content. The workflow is responsible for prepending project-level content later.
- `spec-guard init --no-readme` skips README creation entirely. No README is created or modified during init when this flag is present.
- The Spec Guard section appended by init has this exact format:
  ```
  ## Spec Guard

  This project uses [Spec Guard](https://github.com/jpstone/spec-guard)

  [Spec Guard Artifacts](.spec-guard/README.md)
  ```
  It uses `##` on the assumption the project README will have a `#` title prepended by the workflow. The `.spec-guard/README.md` link is relative to the project root and resolves correctly on GitHub.
- The Spec Guard section is always appended at the bottom of the README. If the README already exists and does not contain a `## Spec Guard` section, the section is appended. If it already contains a `## Spec Guard` section, init makes no change (idempotent).
- Remove the `ensureReadmePreference` ask-and-store flow from the workflow orchestrator (`src/run.js`). The workflow no longer asks the user whether to maintain a README, no longer creates README.md, and no longer writes to `repo-preferences.json` for the README preference.
- Remove the README opt-out preference check from the workflow orchestrator. The workflow's update behavior is now unconditional: if a README is found, update it intelligently; if no README is found, skip silently with no error.
- The workflow orchestrator continues to update the README intelligently when one is present: prepending a project title and overview section derived from the spec's Problem/Goal, and adding documentation links. All workflow-added content is inserted before the `## Spec Guard` section so the Spec Guard section remains at the bottom of the file.
- Update `readme-maintenance.js` to remove the creation path and the preference-asking logic. The `maintainReadme` function no longer creates a new README when none is found — it only updates existing files.
- Update AGENTS.md to reflect the new README lifecycle: init creates the README (unless `--no-readme`), the workflow updates it; no interactive README preference question exists.

## Out of Scope

- Moving or restructuring the `repo-preferences.json` file — it may continue to exist on disk for projects that previously stored a README preference; this spec does not migrate or clean up that file.
- Changing the content or behavior of the workflow's intelligent README updates beyond the Spec Guard section placement constraint (the section stays at the bottom).
- Adding a `--readme` flag to reverse a prior `--no-readme` decision — if a project needs a README after opting out, the developer creates one manually and subsequent workflow runs will update it.
- Changing the `artifact-index` spec's `.spec-guard/README.md` content or generation behavior — this spec only links to that file from the project root README.
- Any new CLI command, API surface, or UI beyond the `--no-readme` flag on `spec-guard init`.
- Changes to the standard single-spec interview flow.

## Users / Actors

- Developers running `spec-guard init` on a new project — README is created automatically with the Spec Guard section; no question asked mid-workflow
- Developers who want no README — pass `--no-readme` to `spec-guard init` once; the workflow never touches README.md thereafter
- Agents running the workflow — they no longer encounter the interactive README preference question; the README is either present (and updated) or absent (and skipped)

## Expected Behavior

A developer runs `spec-guard init` on a new project. If no README.md exists, init creates one containing only the Spec Guard section. If README.md already exists without a Spec Guard section, init appends the section at the bottom. If the section is already present, init does nothing to the README. From that point forward, each workflow run that encounters a README prepends project-level content above the Spec Guard section. If `spec-guard init --no-readme` is used, no README is created or modified and the workflow silently skips README operations for the life of the project (since no README will exist unless the developer creates one manually).

## Acceptance Criteria

- [ ] `spec-guard init` creates `README.md` at the project root if no README exists, containing only the Spec Guard section in the specified format.
- [ ] `spec-guard init` appends the Spec Guard section to an existing `README.md` that does not already contain a `## Spec Guard` section.
- [ ] `spec-guard init` makes no change to `README.md` when a `## Spec Guard` section already exists (idempotent).
- [ ] `spec-guard init --no-readme` does not create or modify `README.md` regardless of its current state.
- [ ] The Spec Guard section uses `##` heading, contains the `[Spec Guard](https://github.com/jpstone/spec-guard)` inline link, and contains the `[Spec Guard Artifacts](.spec-guard/README.md)` link on its own line.
- [ ] The workflow orchestrator (`spec-guard run`) no longer calls `ensureReadmePreference` and no longer presents an interactive README preference question.
- [ ] The workflow orchestrator no longer creates `README.md` when none is found — it skips README operations silently when no README exists.
- [ ] The workflow orchestrator inserts project-level content (title, overview, doc links) before the `## Spec Guard` section, keeping the Spec Guard section at the bottom of the file.
- [ ] `readme-maintenance.js` — `maintainReadme` no longer creates a new README when the file is absent; it only updates files that already exist.

## Edge Cases

- `spec-guard init` is run on a project whose README exists but has no `## Spec Guard` section: append the section at the bottom.
- `spec-guard init` is run on a project that previously stored `{ readme: { maintain: false } }` in `repo-preferences.json` (set by the old workflow preference question): init does not consult this preference — it uses only the presence of the `--no-readme` flag. The workflow also ignores the stored preference; it simply checks for README existence.
- `spec-guard init --no-readme` is run, then later `spec-guard init` is run again without the flag: init creates the README (since none exists) and appends the Spec Guard section — the `--no-readme` flag is a one-time instruction, not a persistent preference.
- The project root README.md already contains a `## Spec Guard` section when init runs (e.g., copied from another project): init detects the section and makes no change.
- The workflow runs and finds a README that has no `## Spec Guard` section (e.g., a project with a pre-existing README where init was not run): the workflow updates normally, appending its content; it does not inject the Spec Guard section — section injection is init's responsibility only.
- `README` (no extension) exists at project root: init and the workflow treat it identically to `README.md` for detection purposes but always write the Spec Guard section to `README.md` specifically.

## Related Artifacts

- [scope discovery](../scope-discoveries/docs/cli.md needs comprehensive updates as multiple new specs add new commands, flags, and behavioral changes — each spec documents its own slice but a dedicated pass to audit and update cli.md holistically has not been specced.md)

- [scope discovery](../scope-discoveries/cli-documentation-updates.md)

## Documentation Requirements
- [AGENTS.md](../../AGENTS.md) — update README maintenance section: init creates README (unless `--no-readme`), workflow updates it; remove reference to the interactive preference question.
- [docs/cli.md](../../docs/cli.md) — document the `--no-readme` flag on `spec-guard init`: its purpose, effect, and that it is the only opt-out mechanism for README maintenance.

## Dependencies

- [artifact-index](artifact-index.md) — the `[Spec Guard Artifacts](.spec-guard/README.md)` link in the Spec Guard section points to the artifact index introduced by this spec; that file must exist for the link to resolve.

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
