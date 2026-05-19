# Tooling Interface

This document defines the current minimal CLI surface and possible future tooling.

Do not expand tooling beyond spec checking and template-based file creation until the methodology, templates, checklists, and examples are stable.

## Goals

Future tooling should help agents and humans verify that Spec Guard process gates were followed.

Tooling should not make product decisions, invent missing specs, resolve ambiguous UI, or silently approve scope expansion.

See `cli.md` for the current CLI contract. See `validation-rules.md` for candidate checks and severities. See `cli-readiness.md` for the readiness gate before expanding implementation.

## Current CLI Commands

```bash
spec-guard check path/to/spec.md
spec-guard init [directory]
spec-guard new spec path/to/spec.md
spec-guard classify path/to/spec.md
spec-guard blocker path/to/blocker.md
spec-guard scope-discovery path/to/scope-discovery.md
spec-guard review path/to/review.md
spec-guard discovery path/to/discovery.md
spec-guard deviation path/to/deviation.md
```

These commands check one spec file or create files from existing templates. Do not add repository crawling or workflow-engine behavior yet.

## Command Intent

### `spec-guard check`

Read one spec-like Markdown file. Report missing required headings, empty required sections, missing or multiple classifications, and missing required tests/checks without modifying files. Use the required headings from `cli-readiness.md`.

### `spec-guard init`

Create the minimal Spec Guard directories in a repository.

### `spec-guard new spec`

Create a new spec from `templates/spec.md`.

### `spec-guard classify`

Print the selected work classification, or report a blocker if zero or multiple classifications are selected.

### `spec-guard blocker`

Create a blocker record from `templates/blocker.md`.

### `spec-guard scope-discovery`

Create a scope discovery record from `templates/scope-discovery.md`.

### `spec-guard review`

Create an implementation review using `templates/implementation-review.md`.

### `spec-guard discovery`

Create a discovery request using `templates/discovery-request.md`. This records explicitly requested risk/gap/feature discovery and does not authorize implementation.

### `spec-guard deviation`

Create a spec deviation request using `templates/spec-deviation.md`. This records any required change, expansion, relaxation, or contradiction of the governing spec and does not authorize implementation.

## `check` Command Contract

The `check` command supports this shape:

```bash
spec-guard check path/to/spec.md
```

Behavior:

- reads one Markdown spec file,
- does not modify files,
- accepts LF or CRLF line endings,
- checks exact required headings documented in `cli-readiness.md`,
- checks required sections for concrete content,
- checks that exactly one work classification checkbox is selected,
- checks that required tests/checks are identified,
- prints plain-text diagnostics.

Exit codes:

- `0` — no blockers found,
- `1` — one or more blockers found,
- `2` — usage error or unreadable input.

Diagnostic format:

```text
[SEVERITY] RULE_ID path: message
```

Example:

```text
[BLOCKER] SG-CLASS-001 specs/login.md: exactly one work classification must be selected
```

## Current and Possible Validations

Current `check` validation covers:

- a spec file exists,
- required spec headings are present,
- required sections contain concrete content,
- exactly one work classification is selected,
- required tests/checks are identified.

Later tooling may validate that:

- UI work references mockups or design direction,
- UI work references a component library,
- reusable APIs include contract documentation,
- blocker records exist when required inputs are missing,
- scope discoveries are recorded,
- implementation review confirms failure-first testing.

## Cross-Platform Requirements

Future tooling must run on Windows, macOS, and Linux.

The CLI should:

- use runtime path APIs instead of hardcoded path separators,
- avoid POSIX-only shell commands and shell glob assumptions,
- support LF and CRLF line endings,
- avoid filesystem case-sensitivity assumptions,
- produce useful plain text without requiring color or advanced terminal features,
- be tested on Windows, macOS, and Linux before release.

## Non-Goals

Future tooling must not:

- generate implementation without a spec,
- infer acceptance criteria from code,
- approve placeholder UI without human authorization,
- treat prose checks as product behavior tests,
- replace human review of ambiguous specs or scope changes.
