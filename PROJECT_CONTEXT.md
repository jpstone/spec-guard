# Project Context

This file preserves implementation context and decisions from the initial Spec Guard buildout. It is intended for future agents and maintainers so repo direction is not lost between sessions.

## Product Definition

Spec Guard is a spec-first methodology and starter kit for AI-assisted software development.

Tagline:

> Spec-first. Behavior-tested. Agent-safe.

Core point of view:

> Specs guide implementation, but tests validate running behavior and durable contracts — not prose.

Spec Guard is not meant to become documentation theater. Documentation exists only when it defines a durable contract or is itself the deliverable.

## Current Scope

The repository is a functional v0.1 baseline containing:

- methodology docs,
- paste-ready agent instructions,
- work classification guidance,
- templates,
- checklists,
- examples,
- a small CLI,
- validation-rule documentation,
- cross-platform test workflow.

## Canonical Documents

- `methodology.md` — canonical operating contract.
- `agent-instructions.md` — concise paste-ready agent context.
- `work-classification.md` — classification decision guide.
- `quickstart.md` — fastest path for a user to apply Spec Guard.
- `cli.md` — current CLI contract.
- `validation-rules.md` — validation rules for humans and future tooling.
- `next-steps-agent-plan.md` — original buildout plan; useful history, not normal end-user instructions.

## Methodology Rules That Must Not Be Weakened

Agents must not:

- implement before identifying the governing spec,
- skip work classification,
- create docs by default,
- test prose instead of behavior except when the document itself is the deliverable,
- invent UI without mockups, wireframes, or explicit design direction,
- invent a component library,
- test undocumented internals as a substitute for contract tests,
- patch around bad specs,
- silently absorb scope creep,
- skip failure-first testing/checking without a concrete reason,
- produce placeholder UI unless explicitly authorized by a human and marked as unreviewed.

Agents must:

- classify work before implementation,
- write the appropriate tests/checks before implementation,
- run tests/checks and observe failure where practical,
- halt on missing/unclear specs, missing UI inputs, bad specs, or scope creep,
- test documented/exported contracts and user-visible behavior,
- keep changes minimal and traceable.

## Work Classifications

Every task should be classified as one primary type:

1. Reusable non-UI API
2. REST/service API
3. Reusable UI component
4. One-off application UI
5. Direct behavior with no new API or UI
6. Operational/document deliverable

Classification determines required documentation and test/check strategy.

## CLI State

The CLI exists and currently supports:

```bash
spec-guard check path/to/spec.md
spec-guard init [directory]
spec-guard new spec path/to/spec.md
spec-guard classify path/to/spec.md
spec-guard blocker path/to/blocker.md
spec-guard scope-discovery path/to/scope-discovery.md
spec-guard review path/to/review.md
```

From this repository, run commands as:

```bash
node bin/spec-guard.js <command>
```

Current CLI behavior is intentionally simple:

- `check` validates one spec file only.
- `init` creates a minimal directory layout.
- template commands create files from existing templates and refuse to overwrite files.
- `classify` prints the selected classification or reports a blocker.

Current CLI does not:

- crawl repositories,
- validate all contracts,
- run project tests,
- decide whether a spec is semantically good enough,
- resolve ambiguity,
- act as a workflow engine.

## CLI Validation Contract

`check` validates:

- required headings exist,
- exactly one classification checkbox is selected,
- required tests/checks are identified.

Required spec headings:

- `Problem / Goal`
- `In Scope`
- `Out of Scope`
- `Expected Behavior`
- `Acceptance Criteria`
- `Work Classification`
- `Required Tests / Checks`

Exit codes:

- `0` — success/no blockers,
- `1` — blockers found,
- `2` — usage or unreadable input errors.

Diagnostic format:

```text
[SEVERITY] RULE_ID path: message
```

## Cross-Platform Constraints

The CLI should remain cross-platform:

- use Node/runtime path APIs,
- avoid POSIX-only shell commands,
- support LF and CRLF,
- avoid filesystem case-sensitivity assumptions,
- keep output useful as plain text,
- test on Windows, macOS, and Linux.

## Test/Release State

Current local validation has passed with:

```bash
npm test
npm run check:example
npm pack --dry-run
```

At the time this file was created, the test suite had 20 passing tests.

## Important History / Direction

The README previously over-represented `next-steps-agent-plan.md` as a normal project-use instruction file. That was corrected. `next-steps-agent-plan.md` is internal/historical buildout guidance, not what users should paste into an agent for ordinary software projects.

The repo intentionally moved from docs-only to a small CLI once the minimal CLI contract was defined. The CLI should not grow into a full workflow engine without a deliberate methodology decision.

## Next Sensible Improvements

After committing the current baseline, likely next steps are:

1. Review docs for clarity after real use.
2. Add examples of CLI output to `cli.md` if needed.
3. Add classification-specific validation only if users need it.
4. Add repository crawling only after single-file validation proves stable.
5. Keep methodology strict; do not optimize for agent convenience at the cost of safety.
