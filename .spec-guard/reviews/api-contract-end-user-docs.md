# Implementation Review

## Linked Spec

`.spec-guard/specs/api-contract-end-user-docs.md`

## Linked Contract

None — Direct behavior with no new API or UI does not require a contract.

## Classification

Direct behavior with no new API or UI

## Implementation Files

- `bin/spec-guard.js`
- `src/analyze.js`
- `templates/api-contract.md`
- `templates/rest-api-contract.md`

## Test Files

- `test/cli.test.js`
- `test/analyze.test.js`

## Summary of Change

- API and REST API contract creation now creates a corresponding end-user API doc.
- Contract creation automatically selects an existing obvious documentation location from a README table of contents, existing docs-like directories, or falls back to `docs/`.
- The selected repository-relative doc path is persisted in the contract file under `## End-User API Documentation`.
- End-user API doc filenames use `api` instead of `contract`.
- README table-of-contents entries are added when a new API doc is created and the README TOC already links to repository docs.
- Analyze validation now blocks API contracts that lack a persisted end-user API doc path or point to a missing doc file.
- API contract templates document the required end-user API documentation path behavior.

## Tests Written First

- `new api-contract creates end-user API doc in existing documentation location and records path` verifies automatic existing-doc-location selection, persisted contract path, doc creation, and README TOC update.
- `new rest-api-contract falls back to docs folder and avoids contract in API doc filename` verifies `docs/` fallback and `api` naming.
- `new api-contract does not modify README table of contents when API doc is already linked` verifies README is unchanged for doc updates/already-linked docs.
- `analyzeArtifacts — BLOCKER when API contract has no persisted end-user API doc path` verifies validation blocks missing persisted paths.
- `analyzeArtifacts — BLOCKER when persisted end-user API doc path does not exist` verifies validation blocks missing doc files and reports the path.
- `analyzeArtifacts — clean when persisted end-user API doc path exists` verifies validation passes when the persisted doc path exists.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.
- [x] Failure-first evidence recorded in Gate 3: CLI tests failed because contract creation did not create/persist end-user API docs or update README TOCs; analyze tests failed because SG-ALIGN-008 validation did not exist.

## Behavior / Contract Validated

- [x] For any new or updated API contract, the workflow automatically selects the repository-relative path where the corresponding end-user API doc is written or saved.
- [x] The workflow uses an existing obvious end-user documentation location when one is present in the user's repository.
- [x] The workflow uses a `docs/` folder when no obvious existing end-user documentation location is present.
- [x] The workflow does not prompt the user to choose the end-user API documentation location.
- [x] The selected end-user API doc path is persisted in the API contract file so future agents know where to update the doc.
- [x] Validation fails with a blocker if an API contract does not have a persisted corresponding end-user API doc path.
- [x] Validation fails with a blocker if the persisted corresponding end-user API doc path does not exist in the repository.
- [x] The blocker message identifies the missing documentation requirement and the expected persisted repository-relative path.
- [x] When the corresponding doc path is persisted and the doc exists, validation no longer reports that blocker.
- [x] Contract creation or update guidance/templates mention the required end-user API doc deliverable and automatic path-selection behavior.
- [x] Suggested end-user API doc filenames include `api` rather than `contract`.
- [x] If the user's repository has an existing `README` with a table of contents linking to other repository docs, creation of a new end-user API doc adds the new doc to that table of contents.
- [x] If the existing `README` table of contents already links to the end-user API doc, updating that doc does not modify the `README`.

## Linked Documentation

- `templates/api-contract.md`
- `templates/rest-api-contract.md`

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All docs listed in Linked Documentation above updated, or confirmed not applicable.
- [x] Durable contract documentation was updated.

## Remaining Risks / Follow-Ups

- None.
