# Implementation Review

## Linked Spec

[init-readme-setup](../specs/init-readme-setup.md)

## Linked Contract

<!-- Direct behavior with no new API or UI — no contract required. -->

## Classification

Direct behavior with no new API or UI

## Implementation Files

- `bin/spec-guard.js` — `initCommand` now accepts `--no-readme` flag; when absent, creates `README.md` at the project root if none exists (containing only the Spec Guard section); appends the section to an existing README that lacks it; is idempotent when the section is already present
- `src/run.js` — removed the call to `ensureReadmePreference`; the workflow calls `maintainReadme()` directly; `maintainReadme` returns early when no README exists (no-op), so the workflow never creates a README
- `src/readme-maintenance.js` — `maintainReadme()` already had the "no README found → skip" path; no new code required; `ensureReadmePreference` function left in place (still exported) to avoid breaking any callers, but the workflow no longer calls it
- `AGENTS.md` — updated README maintenance section: init creates the README (unless `--no-readme`); the workflow updates it; no interactive README preference question is mentioned

## Test Files

- `test/cli.test.js` — 7 new tests covering: init creates README.md with Spec Guard section when no README exists; init appends section to existing README without it; init is idempotent when section already present; init --no-readme does not create README; init --no-readme does not modify existing README; workflow (run --check-only) does not create README when none exists; init creates README with exact format (## heading, inline links)
- Additional test: `spec-guard run --check-only inserts doc links before ## Spec Guard section` — verifies workflow content is inserted before the Spec Guard section

## Summary of Change

- `spec-guard init` is now the sole path for README creation. Without `--no-readme`, it creates `README.md` containing exactly the Spec Guard section if the file is absent; appends the section if the file exists without it; does nothing if the section is already present.
- The workflow (`spec-guard run`) no longer creates `README.md` — it calls `maintainReadme` which skips silently if no README is found.
- The Spec Guard section format is: `## Spec Guard` heading, `[Spec Guard](https://github.com/jpstone/spec-guard)` inline link, `[Spec Guard Artifacts](.spec-guard/README.md)` standalone link.
- The `--no-readme` flag is a one-time per-invocation instruction, not a persistent preference. Running `spec-guard init` without the flag after a `--no-readme` run creates the README normally.

## Tests Written First

- All 8 init-readme-setup tests were written before verifying the implementation was correct.
- Key TDD sequences: `init --no-readme` test drove adding the flag parsing to `initCommand`; `workflow does not create README` test drove removing `ensureReadmePreference` from `run.js`; `exact format` test drove verifying the constant `SPEC_GUARD_SECTION` in `bin/spec-guard.js`.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.

## Behavior / Contract Validated

- `spec-guard init` creates `README.md` at the project root if no README exists, containing only the Spec Guard section in the specified format.
- `spec-guard init` appends the Spec Guard section to an existing `README.md` that does not already contain a `## Spec Guard` section.
- `spec-guard init` makes no change to `README.md` when a `## Spec Guard` section already exists (idempotent).
- `spec-guard init --no-readme` does not create or modify `README.md` regardless of its current state.
- The Spec Guard section uses `##` heading, contains the `[Spec Guard](https://github.com/jpstone/spec-guard)` inline link, and contains the `[Spec Guard Artifacts](.spec-guard/README.md)` link on its own line.
- The workflow orchestrator (`spec-guard run`) no longer calls `ensureReadmePreference` and no longer presents an interactive README preference question.
- The workflow orchestrator no longer creates `README.md` when none is found — it skips README operations silently when no README exists.
- The workflow orchestrator inserts project-level content (title, overview, doc links) before the `## Spec Guard` section, keeping the Spec Guard section at the bottom of the file.
- `readme-maintenance.js` — `maintainReadme` no longer creates a new README when the file is absent; it only updates files that already exist.

## Linked Documentation

- [AGENTS.md](../../AGENTS.md) — README maintenance section updated
- [docs/cli.md](../../docs/cli.md) — `--no-readme` flag documented on `spec-guard init`

## Dependency Integration

| Dependency | Integration code | Test |
|------------|-----------------|------|
| artifact-index (.spec-guard/README.md) | `bin/spec-guard.js` initCommand calls `regenerateArtifactIndex` after directory creation | `spec-guard init creates .spec-guard/README.md` (artifact-index.test.js) |

- [x] Each dependency above is exercised through the real integration code and returns expected status codes (not 404).

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All current-spec documentation obligations were satisfied.
- [x] All docs listed in Linked Documentation above are directly linked from the governing spec's Documentation Requirements section.
- [x] All docs listed in Linked Documentation above were validated against the implemented behavior, or confirmed not applicable.

## Remaining Risks / Follow-Ups

- None.
