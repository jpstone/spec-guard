# Spec

## Title

Bugfix Evidence Permanence

## Status

Implemented

## Problem / Goal

Bugfix specs have no field to record whether test evidence is permanent or temporary, and no gate checks for the decision. Agents can silently skip asking the question (and humans have no place to record the answer in the spec) even though the Bugfix test guidance requires it. The goal is to close this gap so the permanence decision is captured in the spec and validated before implementation proceeds.

## In Scope

- Add a `## Test Evidence` section to `templates/spec.md` with two checkbox options: permanent and temporary (with a removal-condition sub-field).
- Add validation rule **SG-BUG-001** (BLOCKER) to `spec-guard check`: fires when classification is Bugfix and the `Test Evidence` section is absent or has neither checkbox checked.
- Update `AGENTS.md` Bugfix test guidance to reference the new field and require it to be filled before Gate 4.
- Update `docs/validation-rules.md` to document SG-BUG-001.

## Out of Scope

- Migrating or backfilling existing Bugfix specs with the new field.
- Changing the Bugfix workflow in any other way.
- Adding Test Evidence requirements to non-Bugfix classifications.

## Users / Actors

- Agents and developers implementing bugfixes under Spec Guard.

## Expected Behavior

When a spec is classified as Bugfix, `spec-guard check` reports SG-BUG-001 if the `Test Evidence` section is absent or has no option checked. Once the section is present with one option checked, the rule passes. Non-Bugfix specs are never checked by this rule.

## Acceptance Criteria

- [ ] `templates/spec.md` includes a `## Test Evidence` section with a permanent checkbox and a temporary checkbox (with a removal-condition field).
- [ ] `spec-guard check` reports a SG-BUG-001 BLOCKER when classification is Bugfix and `Test Evidence` is absent.
- [ ] `spec-guard check` reports a SG-BUG-001 BLOCKER when classification is Bugfix and `Test Evidence` is present but neither option is checked.
- [ ] A Bugfix spec with `Test Evidence` â€” permanent option checked â€” passes SG-BUG-001 with no diagnostic.
- [ ] A Bugfix spec with `Test Evidence` â€” temporary option checked â€” passes SG-BUG-001 with no diagnostic.
- [ ] Non-Bugfix specs are not affected by SG-BUG-001.
- [ ] `AGENTS.md` documents that the `Test Evidence` field must be filled before Gate 4 for Bugfix specs.

## Edge Cases

- A spec with Bugfix classification but no `Test Evidence` heading at all fires SG-BUG-001.
- A spec with a `Test Evidence` section containing only unchecked boxes fires SG-BUG-001.
- A spec with both permanent and temporary checked is treated as passing (agent or human error, not a blocker).

## Prior Implementation Review

- `.spec-guard/reviews/bugfix-classification.md` (adds to the Bugfix classification feature)

## Related Artifacts

- [implementation review](../reviews/bugfix-evidence-permanence.md)

## Documentation Requirements

- [Agent Instructions](AGENTS.md) â€” update Bugfix row in Writing Tests table to reference the `Test Evidence` field and require it before Gate 4.
- [Spec Template](templates/spec.md) â€” add `## Test Evidence` section.
- [Validation Rules](docs/validation-rules.md) â€” add SG-BUG-001 entry.

## Implementation Planning

Planning Required: No

Confirmed Plan:
- No implementation planning required. Direct behavior addition within the existing Node.js check pipeline.

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
