# Spec

## Title

README Maintenance Preference

## Status

Draft

## Problem / Goal

Spec Guard-assisted projects need useful repository documentation without repeatedly asking the same setup question. When a repository has no README, Spec Guard should ask once whether the user wants Spec Guard to create and maintain one. The answer should be persisted under `.spec-guard/` so future agents can reuse the repo-scoped preference. If the user opts in, Spec Guard should help keep a concise README updated as part of relevant workflows.

## In Scope

- Detect when a Spec Guard-assisted repository has no README.
- Ask the user once per repo whether Spec Guard should create and maintain a README.
- Persist the user's README preference under `.spec-guard/` so future agents do not ask again for that repo.
- If the user opts in, incorporate README creation and update into relevant workflows.
- Keep README content concise and at-a-glance: repo purpose, relevant simple overview information, and links to useful deeper docs such as API docs.
- Put more complex or additional documentation in separate docs files and link them from the README rather than expanding the README.

## Out of Scope

- Forcing README creation when the user opts out.
- Asking the README preference question more than once per repo after an answer is recorded.
- Creating long-form or exhaustive documentation inside the README.
- Rewriting unrelated existing README content beyond needed intelligent updates.
- Creating unrelated docs that are not useful to link from the README.
- Replacing existing project documentation structure when one already exists.

## Expected Behavior

In a repo with no README and no recorded README preference, Spec Guard asks once whether it should create and maintain a README. The answer is saved under `.spec-guard/` and reused by future agents. If the user opts out, Spec Guard does not create or maintain a README and does not ask again. If the user opts in, Spec Guard creates or updates a concise README as part of relevant workflows. The README provides at-a-glance repository purpose and overview information, plus links to deeper useful docs instead of embedding complex detail.

## Acceptance Criteria

- [ ] In a repo with no README and no persisted README preference, the workflow prompts the user once whether Spec Guard should create and maintain a README.
- [ ] The user's README preference is persisted under `.spec-guard/` in a repo-scoped artifact.
- [ ] After a preference is persisted, future workflows in that repo do not prompt for the README preference again.
- [ ] If the persisted preference is opt-out, Spec Guard does not create or update a README.
- [ ] If the persisted preference is opt-in and no README exists, Spec Guard creates a README during the relevant workflow.
- [ ] If the persisted preference is opt-in and a README exists, Spec Guard updates it intelligently during relevant workflows.
- [ ] README content remains concise and at-a-glance: repo purpose and overview plus links to deeper useful docs.
- [ ] More complex or detailed documentation is kept in separate docs files and linked from the README.
- [ ] Existing README content is not rewritten beyond the needed intelligent updates.

## Prior Implementation Review

- `.spec-guard/reviews/api-contract-end-user-docs.md` — identifies existing behavior for creating end-user API docs and updating README table-of-contents links from API contract workflows.

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
