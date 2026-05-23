# Validation Rules

## Severity Levels

- **BLOCKER** — work should not continue until fixed or explicitly overridden by a human.
- **WARNING** — review before continuing, but work may proceed with justification.
- **INFO** — useful context, not a gate.

CLI diagnostics print severities as uppercase labels.

Diagnostic format:

```text
[SEVERITY] RULE_ID path: message
```

By default, BLOCKERs and WARNINGs are shown. Pass `--warnings` to also include INFO diagnostics.

---

## Implemented Rules

These rules are checked by `spec-guard check`, `spec-guard suggest`, and the MCP `spec_guard_check` / `spec_guard_suggest` tools.

### SG-SPEC-002: Spec has required sections

**Severity:** BLOCKER

A spec must include these headings:

- `Problem / Goal`
- `In Scope`
- `Out of Scope`
- `Expected Behavior`
- `Acceptance Criteria`
- `Work Classification`

### SG-SPEC-003: Open questions are resolved before implementation

**Severity:** WARNING

Unresolved questions that may affect behavior, UI, contracts, or scope should be resolved or marked N/A before implementation begins. Detected by presence of non-empty bullet items in the `Open Questions` section that are not marked resolved, answered, or N/A.

### SG-SPEC-004: Required sections contain concrete content

**Severity:** BLOCKER

Required spec sections must contain substantive content — not only placeholders, comments, or empty bullets.

### SG-SPEC-005: Acceptance criteria use checkbox format

**Severity:** WARNING

Acceptance criteria should use `- [ ] criterion` format to support mechanical verification. Plain bullets are allowed but produce a warning.

### SG-SPEC-006: Status is a known value

**Severity:** INFO

The `Status` section, if present, should contain one of: `Draft`, `Pending Approval`, `Ready for Implementation`, `Implementation Approved`, `Blocked`, `Implemented`, `Deferred`.

### SG-SPEC-007: Acceptance criteria are measurable

**Severity:** INFO

Acceptance criteria that use vague qualifiers ("correctly", "properly", "well", "fast", "efficient", "easy", "smooth", "cleanly", "appropriately", etc.) are flagged because they cannot be mechanically verified. Replace vague qualifiers with specific, observable outcomes.

### SG-SPEC-008: Scope items are descriptive

**Severity:** INFO

Scope items (in `In Scope` and `Out of Scope`) with one or two words are flagged as too brief to prevent misinterpretation. Describe the specific boundary — what exactly is included or excluded, and why.

---

### SG-CLASS-001: Exactly one classification selected

**Severity:** BLOCKER

Every task must select exactly one primary work classification. Zero or multiple selections are both blockers.

### SG-CLASS-002: Contract document referenced for durable work

**Severity:** WARNING

Tasks classified as Reusable non-UI API, REST/service API, or Reusable UI component should reference a contract document in Dependencies or include a Contract heading. This is a warning (not a blocker) to support incremental adoption.

---

### SG-UI-001: UI design direction exists

**Severity:** BLOCKER

Tasks classified as One-off application UI or Reusable UI component must reference a mockup, wireframe, or explicit design direction before implementation. If a component library is referenced but no mockup is present, the agent must ask the human whether the component library is sufficient before proceeding — it must not assume. If the human confirms, the agent documents "No mockup required — [reason]" in the spec, which clears the blocker on re-check. Detected by looking for terms like "mockup", "wireframe", "Figma", "design direction", "sketch", or "prototype" in the spec text.

### SG-UI-002: Component library reference exists

**Severity:** BLOCKER

UI work must reference a component library or explicitly confirm that custom styling will be used. Fires only when a mockup is present but no component library is referenced. The agent must ask the human whether an existing library is being used or if styling is custom — it must not assume. If custom styling is confirmed, the agent documents "No component library — custom styling from mockup" in the spec, which clears the blocker on re-check. Detected by looking for terms like "component library", "design system", or "UI kit" in the spec text.

---

### SG-STALE-001: Gates are current with the spec

**Severity:** WARNING

Checked by `spec-guard analyze`. When a spec is edited after gate confirmations were recorded by `spec-guard run`, the recorded gates are considered stale. Re-run `spec-guard analyze` and update the implementation review to reflect the changed spec before closing Gate 5.

---

### SG-ALIGN-001: Acceptance criteria covered in review

**Severity:** WARNING

Checked by `spec-guard analyze`. Every acceptance criterion from the spec must appear somewhere in the implementation review.

### SG-ALIGN-002: Required tests covered in review

**Severity:** WARNING

Checked by `spec-guard analyze`. Every required test named in the spec must appear in the implementation review's "Tests Written First" section.

### SG-ALIGN-003: Contract file is present and non-blank

**Severity:** BLOCKER (file missing) / WARNING (blank template)

Checked by `spec-guard analyze`. A contract file referenced in Dependencies must exist and contain actual interface definitions — not just template placeholders.

### SG-ALIGN-004: Review has no unchecked items

**Severity:** WARNING

Checked by `spec-guard analyze`. All checklist items in the implementation review must be resolved. Gate 5 requires every checkbox to be checked.

---

## Process Rules (enforced by workflow, not `check`)

These rules are enforced procedurally by `spec-guard run` and documented in `AGENTS.md`. They are not emitted as check diagnostics.

### SG-SPEC-001: Spec exists before implementation

A task must identify a governing spec before implementation.

### SG-BUG-001: Bugfix test evidence permanence not recorded — BLOCKER

Fires when classification is `Bugfix` and the spec's `Test Evidence` section is absent or has neither option checked. Bugfix test evidence must be explicitly declared as permanent or temporary before Gate 4. Record the decision in `## Test Evidence` and check one option.

### SG-TEST-002: Failure-first confirmation recorded

New tests/checks must run before implementation and fail for the expected reason, or a concrete reason must be recorded explaining why this was impractical.

### SG-TEST-003: Tests target contracts/behavior, not internals

Unit/component tests must target documented/exported surfaces only. Underlying helpers, pure functions, and internal state transitions are tested implicitly through the public surface — testing them directly is redundant and makes tests brittle to refactoring.

---

## Process Rules

These rules are required agent behaviors enforced by `AGENTS.md` and `WORKFLOW.md`. They are not yet implemented as automated CLI checks, but they are mandatory — not optional.

### SG-CLASS-003: Classification changes are acknowledged

If classification changes during implementation, the change must be recorded and acknowledged before continuing.

### SG-CLASS-004: Compound work is split into slices

Requests that span multiple classifications must be split into slices and classified separately before implementation.

### SG-UI-003: Placeholder UI authorization recorded

Placeholder UI requires explicit human authorization and must be marked unreviewed.

### SG-DOC-001: Docs are required only for durable contracts or deliverables

Documentation should not be created solely to satisfy process.

### SG-DOC-002: Product features do not use doc-content tests

Doc-content tests are valid only when the document itself is the deliverable.

### SG-SCOPE-001: Scope discoveries recorded

When work expands beyond the original spec, the discovery must be recorded in `.spec-guard/scope-discoveries/` before implementation proceeds. BLOCKER when discovered work is required; WARNING when additive.

### SG-SCOPE-002: Additive work not implemented in current change

Additive scope discoveries should not be absorbed silently into the current change.

### SG-SCOPE-003: No unsolicited roadmap after implementation

Agents must not propose feature expansions or roadmap items after completing implementation.

### SG-ADHERE-001: Changed files trace to the governing spec

### SG-ADHERE-002: No unrequested implementation

### SG-ADHERE-003: Spec deviations require separate authorization

### SG-DISCOVERY-001: Discovery requires explicit human request

### SG-DISCOVERY-002: Discovery findings are not implementation authorization
