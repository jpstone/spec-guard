# New Methodology Repository Agent Plan

This document is intended to be given to an implementation agent after creating a new repository for this methodology project.

## Goal

Create a standalone repository for a practical, agent-safe software methodology based on **spec-first, test-driven development**.

The methodology should compete with and improve on Spec Kit-style workflows by emphasizing:

- tests that validate code behavior, API contracts, and user-visible behavior,
- no doc-content tests unless the document itself is the deliverable,
- explicit work classification before implementation,
- reusable API contracts backed by unit tests,
- one-off UI backed by browser automation tests,
- reusable UI treated as an API,
- halt rules for missing specs, unclear UI, bad specs, and scope creep,
- minimal, traceable changes.

## Canonical Source Material

Use the current methodology documents from the original project as the starting point, especially:

- `methodology.md`
- this `next-steps-agent-plan.md`

The new repository should refine these into a standalone methodology and starter kit for agentic software development.

## Product Positioning

Position the project as:

> Spec Guard is a spec-first methodology for AI-assisted software development that turns specs into behavior tests, contract tests, and safe implementation workflows.

The project should not merely be another documentation template system. Its distinctive point of view is:

> Specs guide implementation, but tests validate running behavior and durable contracts — not prose.

## Initial Repository Scope

Do not build a CLI immediately.

Start with a high-quality documentation/template repository that can later support tooling.

Initial deliverables:

1. `README.md`
2. canonical methodology document
3. agent instruction document
4. templates
5. checklists
6. examples
7. comparison/positioning against adjacent methodologies
8. contribution guidance

## Suggested Repository Structure

```text
/
  README.md
  methodology.md
  agent-instructions.md
  principles.md
  glossary.md
  comparisons.md
  CONTRIBUTING.md
  templates/
    spec.md
    task-plan.md
    api-contract.md
    rest-api-contract.md
    reusable-ui-component.md
    one-off-ui.md
    blocker.md
    scope-discovery.md
    implementation-review.md
  checklists/
    preflight.md
    failure-first.md
    api-contract-readiness.md
    ui-readiness.md
    reusable-ui-readiness.md
    browser-test-readiness.md
    implementation-review.md
  examples/
    README.md
    reusable-non-ui-api/
      spec.md
      api-contract.md
      tests-outline.md
      implementation-notes.md
    rest-api/
      spec.md
      rest-api-contract.md
      tests-outline.md
      implementation-notes.md
    reusable-ui-component/
      spec.md
      component-contract.md
      tests-outline.md
      implementation-notes.md
    one-off-application-ui/
      spec.md
      mockup-notes.md
      browser-tests-outline.md
      implementation-notes.md
    operational-document-deliverable/
      spec.md
      doc-deliverable.md
      process-check-outline.md
```

## Required Methodology Content

The canonical methodology should include these sections:

1. Prime directive
2. Core principles
3. Required decision flow
4. Work classification
5. Documentation rules
6. Documentation testing policy
7. Failure-first testing rule
8. Mid-implementation spec failure handling
9. Scope creep handling
10. Workflow for reusable non-UI APIs
11. Workflow for REST/service APIs
12. Workflow for reusable UI components
13. Workflow for one-off application UI
14. Workflow for direct behavior with no new API/UI
15. Test selection rules
16. Agent must/must-not rules
17. Operating loop

## Required Agent Instruction Content

The agent-facing document should be concise, imperative, and suitable for pasting into coding-agent context.

It should include:

- identify the spec first,
- classify the work,
- do not create docs by default,
- do not test docs by default,
- write the appropriate tests before implementation,
- run tests and observe failure,
- halt on unclear/missing specs,
- halt on missing UI inputs,
- halt on bad specs discovered during implementation,
- do not silently absorb scope creep,
- test exported/documented API contracts only,
- use browser automation for one-off UI,
- require human authorization for placeholder UI.

## Template Requirements

Templates should be short, practical, and hard to misuse.

Each template should include only fields that help produce implementation-ready work.

### `templates/spec.md`

Should include:

- title
- status
- problem / goal
- in scope
- out of scope
- users / actors
- expected behavior
- acceptance criteria
- edge cases
- dependencies
- open questions
- work classification
- required tests

### `templates/task-plan.md`

Should include:

- linked spec
- classification
- implementation phases
- tests to write before implementation
- expected failing tests
- files likely to change
- risks/blockers
- non-goals

### `templates/api-contract.md`

Should include:

- API name
- package/module
- exported surface
- inputs
- outputs
- errors
- side effects
- security/tenant rules
- examples
- versioning/backward compatibility
- required unit tests

### `templates/rest-api-contract.md`

Should include:

- route/method
- authentication
- authorization
- request body/query/path params
- response body
- status codes
- error format
- tenant isolation
- audit/logging
- versioning/deprecation
- required API/integration tests

### `templates/reusable-ui-component.md`

Should include:

- component name
- package/location
- purpose
- props/API
- states
- events/callbacks
- accessibility contract
- styling/theming constraints
- composition rules
- examples
- required unit/component tests
- whether browser automation is required and why

### `templates/one-off-ui.md`

Should include:

- screen/workflow name
- linked mockup/design reference
- component library reference
- user-visible behavior
- mechanically verifiable mockup fidelity
- accessibility expectations
- browser automation tests
- explicit statement that no reusable docs are needed unless reusable API/component emerges

### `templates/blocker.md`

Should include:

- blocker type
- discovered during which step
- missing/unclear input
- why work cannot safely continue
- question for human
- current halt state

### `templates/scope-discovery.md`

Should include:

- discovered work
- where discovered
- required for current spec: yes/no
- recommended handling
- follow-up task if additive

## Checklist Requirements

Checklists should be short and operational.

Important checklists:

- preflight before implementation
- failure-first test confirmation
- API contract readiness
- UI readiness
- reusable UI readiness
- browser test readiness
- implementation review

Each checklist should reinforce the methodology, not duplicate the full methodology document.

## Examples Requirements

Examples should demonstrate the methodology, not just describe it.

Each example should show:

1. the starting spec,
2. the classification decision,
3. any required contract/doc template,
4. tests that should be written,
5. expected initial failure,
6. implementation notes,
7. what not to do.

Include at least these examples:

- reusable non-UI API,
- REST API,
- reusable UI component,
- one-off application UI,
- operational document deliverable.

The operational document example is important because it demonstrates the exception where doc-content/process checks are appropriate.

## Comparison Document

Create `comparisons.md` explaining how this methodology relates to:

- Test-Driven Development,
- Behavior-Driven Development,
- Acceptance-Test-Driven Development,
- Spec-Driven Development,
- API-first / contract-first development,
- Design-driven development,
- README/documentation-driven development,
- Spec Kit-style workflows.

The comparison should emphasize that this methodology is designed for **agentic implementation safety** and **behavioral validation**, not documentation theater.

## README Requirements

The README should quickly answer:

- What is this?
- Who is it for?
- What problem does it solve?
- How is it different from Spec Kit-style workflows?
- How do I use it with an AI coding agent?
- What is the minimum workflow?
- Where are the templates?
- What should agents never do?

Suggested README tagline:

> Spec-first. Behavior-tested. Agent-safe.

## Future Tooling Ideas

Do not implement these initially, but design docs/templates so they can support tooling later.

Possible future CLI commands:

```bash
spec-guard init
spec-guard new spec
spec-guard classify
spec-guard check
spec-guard blocker
spec-guard scope-discovery
spec-guard review
```

Future validations could check:

- spec has no unresolved required fields,
- work classification is selected,
- UI work references mockups and component library docs,
- reusable APIs include contract docs,
- tests are identified before implementation,
- blockers are not ignored,
- scope discoveries are recorded.

## Agent Instructions for First Pass

When continuing this repo:

1. Refine `README.md` if needed.
2. Keep `methodology.md` as the canonical human-readable methodology and `agent-instructions.md` as the paste-ready agent operating contract.
3. Create `agent-instructions.md` as a concise paste-ready variant if needed.
4. Create templates.
5. Create checklists.
6. Create examples.
7. Create `comparisons.md`.
8. Create `CONTRIBUTING.md` explaining how to evolve the methodology without weakening it.
9. Do not build a CLI yet.

## Quality Bar

The repository should be usable by a human who wants to paste instructions into an agent and get safer software implementation behavior.

The repository should make it difficult for agents to:

- skip specs,
- invent UI,
- test prose instead of behavior,
- silently expand scope,
- test internals instead of contracts,
- ignore bad specs,
- implement before tests.

## Final Instruction to Agent

Optimize this repository for clarity, enforceability, and practical use by coding agents.

Prefer short, imperative documents over long essays where the target audience is an agent.

Prefer examples that demonstrate correct behavior over abstract explanation.

Do not add automation until the methodology and templates are stable.
