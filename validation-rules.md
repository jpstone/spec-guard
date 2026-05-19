# Validation Rules

These rules describe what future tooling may check. They are written for humans first and CLI implementation later.

## Severity Levels

- **Blocker** — work should not continue until fixed or explicitly overridden by a human.
- **Warning** — review before continuing, but work may proceed with justification.
- **Info** — useful context, not a gate.

Future CLI diagnostics should print severities as uppercase labels: `BLOCKER`, `WARNING`, or `INFO`.

## Usage Rules

### SG-USAGE-001: Input is readable

Severity: Blocker

The CLI input path must exist and be readable.

## Spec Rules

### SG-SPEC-001: Spec exists

Severity: Blocker

A task must identify a governing spec before implementation.

### SG-SPEC-002: Spec has required sections

Severity: Blocker

A spec should include these headings:

- `Problem / Goal`,
- `In Scope`,
- `Out of Scope`,
- `Expected Behavior`,
- `Acceptance Criteria`,
- `Work Classification`,
- `Required Tests / Checks`.

### SG-SPEC-003: Open questions are resolved before implementation

Severity: Blocker when questions affect implementation behavior.

Unresolved questions that affect behavior, UI, contracts, or scope must produce a blocker.

## Classification Rules

### SG-CLASS-001: Classification selected

Severity: Blocker

Every task must select one primary classification.

### SG-CLASS-002: Classification-specific template exists

Severity: Blocker for reusable/API/UI/document work; Warning for direct behavior.

Required templates:

- reusable non-UI API → API contract,
- REST/service API → REST/service API contract,
- reusable UI component → component contract,
- one-off application UI → one-off UI spec,
- operational/document deliverable → operational/document template.

### SG-CLASS-003: Classification changes are acknowledged

Severity: Blocker

If classification changes during implementation, the change must be recorded and acknowledged before continuing.

## Test Rules

### SG-TEST-001: Tests/checks identified before implementation

Severity: Blocker

The spec or task plan must name required tests/checks before implementation begins.

### SG-TEST-002: Failure-first confirmation recorded

Severity: Blocker by default; Warning if explicitly configured.

New tests/checks must be run before implementation and fail for the expected reason, or a concrete reason must be recorded.

### SG-TEST-003: Tests target contracts/behavior, not internals

Severity: Warning; Blocker for reusable API/component work.

Unit/component tests should target documented/exported surfaces only.

## UI Rules

### SG-UI-001: UI design input exists

Severity: Blocker

UI work must reference mockups, wireframes, or explicit design direction.

### SG-UI-002: Component library input exists

Severity: Blocker

UI work must reference the existing component library or document that none exists and halt for guidance.

### SG-UI-003: Placeholder UI authorization recorded

Severity: Blocker

Placeholder UI requires explicit human authorization and must be marked unreviewed.

## Documentation Rules

### SG-DOC-001: Docs are required only for durable contracts or document deliverables

Severity: Warning

Documentation should not be created solely to satisfy process.

### SG-DOC-002: Product features do not use doc-content tests

Severity: Blocker

Doc-content tests are valid only when the document itself is the deliverable.

## Scope Rules

### SG-SCOPE-001: Scope discoveries recorded

Severity: Blocker when discovered work is required; Warning when additive.

New work discovered during implementation must be recorded and classified as required or additive.

### SG-SCOPE-002: Additive work not implemented in current change

Severity: Warning; Blocker if it creates new undocumented behavior.

Additive work should be follow-up unless explicitly authorized.
