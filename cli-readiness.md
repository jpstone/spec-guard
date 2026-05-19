# CLI Readiness

This document defines the readiness bar and scope limits for CLI work.

The CLI should automate stable Spec Guard checks. It should not define the methodology by accident.

## Required Before CLI Expansion

- [ ] `methodology.md` is stable enough to be the canonical human-readable methodology.
- [ ] `agent-instructions.md` accurately summarizes the methodology.
- [ ] Work classifications are stable and documented in `work-classification.md`.
- [ ] Templates exist for each classification that needs structured input.
- [ ] Checklists exist for preflight, failure-first testing, readiness, and review.
- [ ] Examples demonstrate each classification.
- [ ] `tooling-interface.md` defines command intent and non-goals.
- [ ] Validation rules are documented before implementation.
- [ ] Minimum `spec-guard check` behavior is defined narrowly enough to implement without inventing policy.

## Current `check` Validation Scope

The `check` command validates one spec-like Markdown file.

It checks:

- the input file exists and is readable,
- required spec headings are present,
- required sections contain concrete content,
- exactly one work classification is selected,
- required tests/checks are identified.

It does not validate repositories, contracts, UI inputs, blockers, scope discoveries, or implementation reviews yet.

## CLI Must Not Decide

A CLI must not:

- decide whether a vague spec is good enough,
- invent missing acceptance criteria,
- infer UI from surrounding code,
- approve placeholder UI,
- decide that scope creep is acceptable,
- classify private helpers as reusable APIs automatically,
- treat document checks as product behavior tests.

## Implemented Baseline CLI

The baseline CLI supports:

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

`check` reads one spec-like Markdown file and reports whether:

- required headings are present,
- required sections contain concrete content,
- exactly one work classification is selected,
- required tests/checks are identified.

Required headings are:

- `Problem / Goal`
- `In Scope`
- `Out of Scope`
- `Expected Behavior`
- `Acceptance Criteria`
- `Work Classification`
- `Required Tests / Checks`

The template creation commands copy existing templates and refuse to overwrite files.

No repository crawling or workflow-engine behavior is implemented.

## Cross-Platform Requirements

The CLI must work on Windows, macOS, and Linux.

Implementation requirements:

- [ ] Use a cross-platform runtime and packaging path.
- [ ] Use runtime path APIs instead of hardcoded `/` or `\\` separators.
- [ ] Do not depend on POSIX shell commands such as `grep`, `sed`, `find`, `cat`, or shell glob expansion.
- [ ] Support LF and CRLF line endings.
- [ ] Avoid filesystem case-sensitivity assumptions.
- [ ] Avoid terminal features that break without ANSI/color support.
- [ ] Keep output useful as plain text.
- [ ] Test the CLI on Windows, macOS, and Linux before release.

## CLI Acceptance Criteria

The baseline CLI is acceptable when:

- [ ] `check` can run without modifying files.
- [ ] Template creation commands refuse to overwrite existing files.
- [ ] It reports actionable failures.
- [ ] It distinguishes warnings from blockers.
- [ ] It uses exit code `0` for success, `1` for blockers, and `2` for usage or unreadable-input errors.
- [ ] It does not require every template for every task.
- [ ] It does not require classification-specific contract files yet.
- [ ] `check` is scoped to the spec file path provided on the command line.
- [ ] It prints diagnostics as `[SEVERITY] RULE_ID path: message`.
- [ ] It passes the cross-platform requirements above.

## Suggested Expansion Order

1. Keep `check` limited to one spec until the rules prove stable.
2. Add classification-specific validation only after the basic check proves useful.
3. Add contract/blocker/scope/review validation before repository crawling.
4. Add repository crawling only after single-file validation is stable.
5. Do not add workflow-engine behavior without a new methodology decision.
