# Spec

## Title

API Contract End-User Documentation Requirement

## Status

Draft

## Problem / Goal

Spec Guard currently saves API-style contracts under `.spec-guard/contracts/`, which is correct for workflow governance, but those contracts are not the same as end-user API documentation. The goal is to require a corresponding end-user API document whenever an API-style contract is newly created or updated, automatically choose the repository-relative location for that document, and persist the chosen path so future contract updates can update the correct end-user API document.

## In Scope

- Automatically select the repository-relative path where the corresponding end-user API doc is written or saved when a new API-style contract is created or an existing API-style contract is updated.
- Before choosing a path, inspect the user's repository for an existing obvious end-user documentation location.
- Use the existing obvious end-user documentation location when one is found.
- Use a `docs/` folder when no obvious existing end-user documentation location is found.
- Persist the selected end-user API doc path in the API contract file so future agents know where to update the doc.
- Apply the requirement to API-style contracts saved under `.spec-guard/contracts/`.
- Make validation fail with a blocker when the persisted corresponding end-user API doc path is missing or the file does not exist.
- Ensure the blocker message identifies the missing documentation requirement and the expected persisted repository-relative path.
- Update contract creation or update guidance/templates so they mention the required end-user API doc deliverable and the path-selection requirement.
- Use end-user API documentation filenames that include `api` rather than `contract`, because end users do not typically use the word `contract` for API docs.
- When the user's repository has an existing `README` with a table of contents linking to other repository docs, add the new end-user API doc to that table of contents.
- Do not modify the `README` table of contents when the end-user API doc is already linked there.

## Out of Scope

- Automatically generating polished prose beyond a basic required doc/template.
- Reorganizing existing `.spec-guard/contracts/` storage.
- Prompting the user to choose an end-user API documentation location.
- Hard-coding `docs/` as the only valid end-user API documentation location.
- Using OS-absolute paths for the saved end-user API doc location.
- Changing contract formats unrelated to API documentation path tracking and requirements.
- Applying this requirement to non-contract specs or unrelated documentation.

## Expected Behavior

When a Spec Guard workflow requires or references a new or updated API-style contract, Spec Guard automatically determines where the matching end-user API doc is written or saved. It first inspects the user's repository for an existing obvious end-user documentation location. If one is found, it uses that location. If none is found, it uses a `docs/` folder. The generated or suggested filename includes `api` rather than `contract`. The selected repository-relative path is persisted in the API contract file so future agents know where to update the end-user API doc. Validation fails with a blocker if the persisted path is missing or if the corresponding file does not exist. The blocker identifies the missing doc requirement and the expected persisted repository-relative path. Once the matching doc path is recorded and the doc exists at that path, validation no longer reports that blocker. When the repository has an existing `README` with a table of contents linking to other repository docs, creation of a new end-user API doc adds the new doc to that table of contents. If the table of contents already links to that end-user API doc, the `README` is not modified.

## Acceptance Criteria

- [ ] For any new or updated API contract, the workflow automatically selects the repository-relative path where the corresponding end-user API doc is written or saved.
- [ ] The workflow uses an existing obvious end-user documentation location when one is present in the user's repository.
- [ ] The workflow uses a `docs/` folder when no obvious existing end-user documentation location is present.
- [ ] The workflow does not prompt the user to choose the end-user API documentation location.
- [ ] The selected end-user API doc path is persisted in the API contract file so future agents know where to update the doc.
- [ ] Validation fails with a blocker if an API contract does not have a persisted corresponding end-user API doc path.
- [ ] Validation fails with a blocker if the persisted corresponding end-user API doc path does not exist in the repository.
- [ ] The blocker message identifies the missing documentation requirement and the expected persisted repository-relative path.
- [ ] When the corresponding doc path is persisted and the doc exists, validation no longer reports that blocker.
- [ ] Contract creation or update guidance/templates mention the required end-user API doc deliverable and automatic path-selection behavior.
- [ ] Suggested end-user API doc filenames include `api` rather than `contract`.
- [ ] If the user's repository has an existing `README` with a table of contents linking to other repository docs, creation of a new end-user API doc adds the new doc to that table of contents.
- [ ] If the existing `README` table of contents already links to the end-user API doc, updating that doc does not modify the `README`.

## Prior Implementation Review

- No prior implementation review specifically covers API contract end-user documentation. Related existing behavior is in contract validation and creation paths identified during discovery: `src/check.js`, `src/run.js`, `src/suggest.js`, `templates/api-contract.md`, `templates/rest-api-contract.md`, and tests under `test/`.

## Dependencies

None.

## Open Questions

None.

## Work Classification

<!-- Choose one primary classification. -->

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [x] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
- [ ] Bugfix
