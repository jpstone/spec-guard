# Implementation Review

## Linked Spec

`.spec-guard/specs/readme-maintenance-preference.md`

## Linked Contract

None — Direct behavior with no new API or UI does not require a contract.

## Classification

Direct behavior with no new API or UI

## Implementation Files

- `src/readme-maintenance.js`
- `src/run.js`
- `bin/spec-guard.js`

## Test Files

- `test/readme-maintenance.test.js`
- `test/cli.test.js`

## Summary of Change

- Added repo-scoped README preference persistence at `.spec-guard/repo-preferences.json`.
- Added README preference prompting support for interactive Spec Guard runs when no README exists and no preference is recorded.
- Added README maintenance helpers that create concise at-a-glance READMEs when opted in.
- Added README update behavior that links useful deeper docs without rewriting unrelated README content.
- Updated API contract doc-link behavior to respect README maintenance opt-out.

## Tests Written First

- `ensureReadmePreference asks once when no README and persists opt-out` verifies the preference prompt is asked once, persisted, reused, and does not create a README when opted out.
- `ensureReadmePreference persists opt-in and maintainReadme creates concise README with useful doc links` verifies opt-in persistence and concise README creation with overview and doc links.
- `maintainReadme does not create or update README when preference is opt-out` verifies opt-out prevents README changes.
- `readReadmePreference returns persisted repo-scoped preference` verifies future agents can read the stored repo-scoped preference.
- `new api-contract does not update README when README maintenance preference is opt-out` verifies relevant workflows respect the persisted opt-out preference.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.
- [x] Failure-first evidence recorded in Gate 3: `test/readme-maintenance.test.js` failed because `src/readme-maintenance.js` did not exist yet.

## Behavior / Contract Validated

- [x] In a repo with no README and no persisted README preference, the workflow prompts the user once whether Spec Guard should create and maintain a README.
- [x] The user's README preference is persisted under `.spec-guard/` in a repo-scoped artifact.
- [x] After a preference is persisted, future workflows in that repo do not prompt for the README preference again.
- [x] If the persisted preference is opt-out, Spec Guard does not create or update a README.
- [x] If the persisted preference is opt-in and no README exists, Spec Guard creates a README during the relevant workflow.
- [x] If the persisted preference is opt-in and a README exists, Spec Guard updates it intelligently during relevant workflows.
- [x] README content remains concise and at-a-glance: repo purpose and overview plus links to deeper useful docs.
- [x] More complex or detailed documentation is kept in separate docs files and linked from the README.
- [x] Existing README content is not rewritten beyond the needed intelligent updates.

## Linked Documentation

- None.

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All docs listed in Linked Documentation above updated, or confirmed not applicable.
- [x] No documentation update was needed.

## Remaining Risks / Follow-Ups

- None.
