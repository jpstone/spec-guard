# Spec Guard

Spec-first. Behavior-tested. Agent-safe.

Spec Guard is a practical methodology for AI-assisted software development that turns specs into behavior tests, contract tests, and safe implementation workflows.

## What is this?

Spec Guard is a methodology and future starter kit for working with coding agents safely and predictably.

It is designed around one core idea:

> Specs guide implementation, but tests validate running behavior and durable contracts — not prose.

## Who is it for?

Spec Guard is for teams or individuals using AI coding agents to build software and who want agents to:

- identify the spec before implementation,
- classify the type of work,
- write the right tests before code,
- validate behavior instead of documentation text,
- avoid inventing UI,
- avoid testing internal implementation details,
- halt on unclear specs,
- avoid silently absorbing scope creep.

## What problem does it solve?

AI coding agents can be useful, but they often drift into unsafe patterns:

- implementing before requirements are clear,
- creating documentation just to satisfy process,
- testing that docs exist instead of testing code behavior,
- inventing UI without mockups,
- writing brittle unit tests against internals,
- expanding scope silently,
- patching around bad or incomplete specs.

Spec Guard exists to prevent those patterns.

## How is this different from Spec Kit-style workflows?

Spec Kit-style workflows are useful for structured specification, planning, and traceability.

Spec Guard focuses more narrowly on **agentic implementation safety**:

- tests should validate code behavior, API contracts, or user-visible behavior,
- doc-content tests are only appropriate when the document itself is the deliverable,
- reusable APIs get documented contracts and unit tests,
- reusable UI is treated as an API,
- one-off UI requires mockups/component-library docs and browser automation,
- agents must halt on missing specs, bad specs, missing UI inputs, and scope creep.

Spec Guard can eventually adopt tooling and templates similar to Spec Kit, but its first priority is enforceable agent behavior.

## Minimum workflow

```text
1. Identify the spec.
2. Classify the work.
3. Decide whether docs/sub-specs are truly needed.
4. Write the correct behavior/API/UI test.
5. Run it and observe failure.
6. Implement.
7. Run tests until passing.
8. Update durable docs/context only if needed.
```

## How do I use this with an AI coding agent?

For applying Spec Guard to a software project, give the agent `methodology.md` as its operating contract.

When this repository includes `agent-instructions.md`, prefer that as the paste-ready agent version.

`next-steps-agent-plan.md` is not a general project-use instruction file. It is the internal implementation plan for evolving this repository into a complete methodology/template starter kit.

The agent should follow the methodology before touching code.

## What agents should never do

Agents must not:

- implement before identifying the spec,
- create documentation by default for every change,
- write doc-content tests as a substitute for behavior tests,
- invent UI without mockups or design direction,
- invent a UI component library when one is required but absent,
- write unit tests for undocumented internals,
- work around bad or incomplete specs,
- absorb out-of-scope work silently,
- skip failure-first testing without a concrete reason,
- produce placeholder UI unless explicitly authorized by a human and marked as unreviewed.

## Current files

- `methodology.md` — canonical agent-facing methodology.
- `next-steps-agent-plan.md` — plan for building this into a complete methodology/template repository.

## Project status

This repository is intentionally starting as documentation-first methodology work.

Do not build a CLI yet. First refine the methodology, templates, examples, and checklists until they are stable.
