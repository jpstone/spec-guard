# Spec Guard

Spec-first. Behavior-tested. Agent-safe.

Spec Guard is a practical methodology and starter kit for AI-assisted software development. It helps humans and coding agents turn specs into behavior tests, contract tests, browser tests, and safe implementation workflows.

> Specs guide implementation, but tests validate running behavior and durable contracts — not prose.

## Why use it?

AI coding agents often drift into unsafe patterns:

- implementing before requirements are clear,
- inventing UI,
- creating docs just to satisfy process,
- testing documentation instead of behavior,
- testing private internals instead of durable contracts,
- silently expanding scope,
- patching around bad or incomplete specs.

Spec Guard exists to prevent those patterns.

## How it works

Minimum workflow:

```text
1. Identify the governing spec.
2. Classify the work.
3. Add only the contract/template docs that are truly needed.
4. Write the correct test or process check before implementation.
5. Run it and observe failure.
6. Implement the smallest change.
7. Run tests/checks until passing.
8. Record blockers or scope discoveries instead of guessing.
```

Work is classified as one primary type:

- reusable non-UI API,
- REST/service API,
- reusable UI component,
- one-off application UI,
- direct behavior with no new API or UI,
- operational/document deliverable.

Classification determines which documentation and tests/checks are required.

## Quick start

Read `quickstart.md`, then start with a spec:

```bash
cp templates/spec.md specs/my-feature.md
```

Or use the CLI:

```bash
node bin/spec-guard.js new spec specs/my-feature.md
node bin/spec-guard.js check specs/my-feature.md
```

For an AI coding agent, paste `agent-instructions.md` into the agent context. Use `methodology.md` as the canonical reference.

For adopting Spec Guard in an existing project, see `adoption.md`.

## CLI

Spec Guard includes a small CLI for checking specs and creating methodology files from templates.

From an installed package:

```bash
spec-guard check path/to/spec.md
spec-guard init [directory]
spec-guard new spec path/to/spec.md
spec-guard classify path/to/spec.md
spec-guard blocker path/to/blocker.md
spec-guard scope-discovery path/to/scope-discovery.md
spec-guard review path/to/review.md
```

From this repository, replace `spec-guard` with `node bin/spec-guard.js`.

Example:

```bash
node bin/spec-guard.js check test/fixtures/valid-spec.md
```

See `cli.md` for command details, exit codes, and diagnostic format.

## Templates and checklists

Templates live in `templates/`:

- `spec.md`
- `task-plan.md`
- `api-contract.md`
- `rest-api-contract.md`
- `reusable-ui-component.md`
- `one-off-ui.md`
- `operational-document.md`
- `blocker.md`
- `scope-discovery.md`
- `implementation-review.md`

Checklists live in `checklists/` and cover preflight, failure-first testing, API/UI/document readiness, browser tests, and implementation review.

Examples live in `examples/`.

## What agents must never do

Agents must not:

- implement before identifying the spec,
- skip work classification,
- create documentation by default,
- write doc-content tests as a substitute for behavior tests,
- invent UI without mockups or design direction,
- invent a UI component library,
- test undocumented internals,
- work around bad or incomplete specs,
- absorb out-of-scope work silently,
- skip failure-first testing/checking without a concrete reason.

## Project map

Core docs:

- `methodology.md` — canonical operating contract.
- `agent-instructions.md` — paste-ready agent instructions.
- `work-classification.md` — classification guide.
- `quickstart.md` — shortest usage path.
- `adoption.md` — applying Spec Guard in an existing project.
- `cli.md` — CLI contract.
- `validation-rules.md` — validation rules for humans and tooling.
- `PROJECT_CONTEXT.md` — preserved project context for future maintainers/agents.

Supporting docs:

- `principles.md`
- `glossary.md`
- `comparisons.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`
- `cli-readiness.md`
- `tooling-interface.md`
- `next-steps-agent-plan.md`

Implementation:

- `bin/spec-guard.js`
- `src/check.js`
- `test/`
- `.github/workflows/test.yml`

## Development

Run tests:

```bash
npm test
```

Run the CLI smoke check:

```bash
npm run check:example
```

Preview package contents:

```bash
npm pack --dry-run
```

## Current status

This is a functional v0.1 baseline. The CLI intentionally remains small: it checks one spec at a time and creates files from templates. It does not crawl repositories, validate every contract, run project test suites, or act as a workflow engine.

## License

MIT. See `LICENSE`.
