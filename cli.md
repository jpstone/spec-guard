# CLI

Spec Guard includes a small CLI for checking specs and creating methodology files from templates.

From this repository, replace `spec-guard` with `node bin/spec-guard.js` in the examples below.

## Commands

```bash
spec-guard check path/to/spec.md
spec-guard init [directory]
spec-guard new spec path/to/spec.md
spec-guard classify path/to/spec.md
spec-guard blocker path/to/blocker.md
spec-guard scope-discovery path/to/scope-discovery.md
spec-guard review path/to/review.md
```

## `check`

Checks one Markdown spec for:

- required headings,
- concrete content in required sections,
- exactly one selected work classification,
- identified required tests/checks.

Required headings:

- `Problem / Goal`
- `In Scope`
- `Out of Scope`
- `Expected Behavior`
- `Acceptance Criteria`
- `Work Classification`
- `Required Tests / Checks`

## Classification Format

Use checkbox lines from `templates/spec.md`:

```md
- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [x] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
```

Exactly one checkbox must be selected.

## Exit Codes

- `0` — no blockers found.
- `1` — one or more blockers found.
- `2` — usage error or unreadable input.

## Diagnostic Format

```text
[SEVERITY] RULE_ID path: message
```

Example:

```text
[BLOCKER] SG-CLASS-001 specs/login.md: exactly one work classification must be selected; found none
```

## `init`

Creates a minimal Spec Guard directory layout:

```text
specs/
contracts/
.spec-guard/blockers/
.spec-guard/scope-discoveries/
.spec-guard/reviews/
```

## `new spec`

Creates a new spec file from `templates/spec.md`.

The command refuses to overwrite an existing file.

## `classify`

Prints the selected work classification from a spec file.

The command exits with a blocker if zero or multiple classifications are selected.

## `blocker`

Creates a blocker file from `templates/blocker.md`.

The command refuses to overwrite an existing file.

## `scope-discovery`

Creates a scope discovery file from `templates/scope-discovery.md`.

The command refuses to overwrite an existing file.

## `review`

Creates an implementation review file from `templates/implementation-review.md`.

The command refuses to overwrite an existing file.

## Current Scope

The CLI creates files only from existing templates and validates one spec at a time. It does not crawl repositories, validate contract documents, run project tests, or decide whether a spec is semantically good enough.

Future CLI expansion should follow `cli-readiness.md`, `tooling-interface.md`, and `validation-rules.md`.
