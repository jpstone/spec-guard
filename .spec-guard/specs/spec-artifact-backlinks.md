# Spec

## Title

Spec Artifact Backlinks

## Status

Implemented

## Problem / Goal

Spec Guard lifecycle artifacts created for a spec are not consistently traceable from the originating spec. A user can open a spec and miss downstream artifacts that flowed from it, such as contracts, reviews, blockers, deviations, discoveries, or scope discoveries. The goal is for the originating spec to include direct links to every new `.spec-guard` artifact created for that spec's implementation lifecycle.

## Existing Behavior

- Spec Guard write commands create artifacts under `.spec-guard/` directories.
- Some artifact relationships are represented elsewhere or by convention, such as contract references in `Dependencies` and inferred review paths.
- The original spec file does not consistently receive direct links to every artifact created for or from that spec.

## Behavior Delta

- BEFORE: creating spec-linked artifacts can leave the originating spec without a direct link to the new artifact. → AFTER: creating a spec-linked artifact records a direct repository-relative link to that artifact in the originating spec.
- BEFORE: repeated artifact creation or link-recording paths may require manual deduplication. → AFTER: link recording is idempotent and does not duplicate existing links.
- BEFORE: artifacts created without an identifiable originating spec are created with no spec backlink update. → AFTER: artifacts created without an identifiable originating spec preserve existing behavior unless the command explicitly requires a spec association.

## In Scope

- Add or update behavior so specs record direct links to downstream `.spec-guard` artifacts created from or for that spec.
- Include spec-linked contracts, implementation reviews, blockers, deviations, discoveries, and scope discoveries.
- Use direct repository-relative links persisted in the originating spec.
- Update relevant Spec Guard command or lifecycle paths that create those artifacts.
- Preserve existing required links and sections while adding the artifact traceability links.

## Out of Scope

- Migrating or backfilling all historical specs, except any minimal fixtures needed for tests.
- Changing the meaning or contents of existing artifact files beyond adding links from the originating spec.
- Adding or changing a UI.
- Changing Spec Guard gate semantics except where needed to validate artifact links.

## Users / Actors

- Developers and agents using Spec Guard to implement a spec through its lifecycle.
- Maintainers reviewing a spec's complete implementation trail.

## Expected Behavior

When a Spec Guard command creates an artifact associated with an originating spec, the spec is updated to include a direct repository-relative link to that artifact. Users can open the spec and see all artifacts produced from that spec's lifecycle. Existing required links, such as contract references, documentation requirements, and reviews, remain valid and are not duplicated. If artifact creation cannot be linked to a spec, existing behavior remains unchanged unless that command explicitly requires a spec association.

## Acceptance Criteria

- [ ] Creating a contract for a spec records a direct link to that contract in the originating spec.
- [ ] Creating an implementation review for a spec records a direct link to that review in the originating spec.
- [ ] Creating a blocker for a spec records a direct link to that blocker in the originating spec.
- [ ] Creating a deviation for a spec records a direct link to that deviation in the originating spec.
- [ ] Creating a scope discovery for a spec records a direct link to that scope discovery in the originating spec.
- [ ] Creating a discovery for a spec, when the command is associated with a spec, records a direct link to that discovery in the originating spec.
- [ ] Re-running artifact creation or link recording does not duplicate links in the spec.
- [ ] Existing spec sections and existing links are preserved.

## Edge Cases

- Artifact creation commands that do not receive or infer a spec association should preserve current behavior.
- Existing links to the same artifact should not be duplicated even if path separators or command inputs differ.
- Link recording should not overwrite existing spec content, status, documentation requirements, dependencies, or review references.

## Previous Implementation Review

No prior implementation review exists for `spec-artifact-backlinks`. Related prior reviews considered for context:

- `.spec-guard/reviews/spec-documentation-requirements.md`
- `.spec-guard/reviews/api-contract-end-user-docs.md`

## Related Artifacts

- [implementation review](.spec-guard/reviews/spec-artifact-backlinks.md)

## Documentation Requirements
- [Agent Instructions](../../AGENTS.md) — document that spec-linked artifact creation must preserve direct links from the originating spec to created artifacts.
- [Workflow](../../WORKFLOW.md) — document the lifecycle traceability requirement for spec-linked artifacts.
- [CLI Documentation](../../docs/cli.md) — document relevant command behavior for linking created artifacts to a spec.

## Implementation Planning

Planning required: no. This is a direct behavior change within the existing Node.js CLI/MCP implementation.

Confirmed Plan: Use the existing repository stack and command structure.

## Dependencies

- No new external dependencies.

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

