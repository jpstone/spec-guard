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

Classification determines which documentation and tests/checks are required. If one request spans multiple classifications, split it into slices and validate each slice separately.

## Installation

Use directly from this repository during development:

```bash
node bin/spec-guard.js check path/to/spec.md
```

After publishing or installing as a package, use:

```bash
npm install --save-dev spec-guard
npx spec-guard check path/to/spec.md
```

## Quick start

Read `quickstart.md`, then initialize a project and create a spec:

```bash
node bin/spec-guard.js init
node bin/spec-guard.js new spec specs/my-feature.md
node bin/spec-guard.js check specs/my-feature.md
```

If you are not using the CLI, copy `templates/spec.md` into a project `specs/` directory.

For an AI coding agent, paste `agent-instructions.md` into the agent context. Use `methodology.md` as the canonical human-readable methodology.

For adopting Spec Guard in an existing project, see `adoption.md`.

## CLI

Spec Guard includes a small CLI for checking specs and creating methodology files from templates.

From an installed package:

```bash
npx spec-guard check path/to/spec.md
npx spec-guard init [directory]
npx spec-guard new spec path/to/spec.md
npx spec-guard classify path/to/spec.md
npx spec-guard blocker path/to/blocker.md
npx spec-guard scope-discovery path/to/scope-discovery.md
npx spec-guard review path/to/review.md
npx spec-guard discovery path/to/discovery.md
npx spec-guard deviation path/to/deviation.md
```

From this repository, use `node bin/spec-guard.js` instead of `npx spec-guard`.

Example:

```bash
node bin/spec-guard.js check test/fixtures/valid-spec.md
```

`check` validates one Markdown spec for required headings, concrete required-section content, exactly one selected work classification, and identified tests/checks.

See `cli.md` for command details, exit codes, and diagnostic format.

## Templates and checklists

Templates live in `templates/`:

- `spec.md`
- `task-plan.md`
- `compound-work.md`
- `api-contract.md`
- `rest-api-contract.md`
- `reusable-ui-component.md`
- `one-off-ui.md`
- `operational-document.md`
- `blocker.md`
- `scope-discovery.md`
- `spec-deviation.md`
- `discovery-request.md`
- `implementation-review.md`

Checklists live in `checklists/` and cover preflight, spec adherence, failure-first testing, API/UI/document readiness, browser tests, explicit discovery requests, and implementation review.

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
- add unrequested features or optional enhancements,
- opportunistically refactor unrelated code,
- upgrade dependencies or change architecture unless required by the spec,
- redesign UI beyond provided direction,
- implement nearby TODOs unless required by the spec,
- propose unsolicited feature roadmaps,
- treat "what's next?" as permission to invent features,
- perform discovery unless explicitly asked,
- implement discovery findings without separate authorization,
- skip failure-first testing/checking without a concrete reason.

## Project map

Core docs:

- `methodology.md` — canonical human-readable methodology.
- `agent-instructions.md` — paste-ready operating contract for agents.
- `work-classification.md` — classification guide.
- `quickstart.md` — shortest usage path.
- `adoption.md` — applying Spec Guard in an existing project.
- `cli.md` — CLI contract.
- `validation-rules.md` — validation rules for humans and tooling.
- `quality-gates.md` — objective readiness gates for safer agent implementation.
- `spec-kit-comparison.md` — objective comparison with Spec Kit-style workflows.
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
