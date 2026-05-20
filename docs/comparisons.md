# Comparisons

Spec Guard overlaps with several established software methods, but its focus is narrower: agentic implementation safety through spec-first, behavior-tested workflows.

## Test-Driven Development

TDD says to write tests before implementation.

Spec Guard adopts that rule and adds:

- explicit spec identification before tests,
- work classification before choosing test type,
- halt rules for ambiguity and scope creep,
- contract-focused testing for reusable surfaces.

## Behavior-Driven Development

BDD emphasizes behavior described in user/business language.

Spec Guard aligns with BDD when validating user-visible behavior, but does not require a specific scenario syntax. It prefers the smallest practical test that proves the specified behavior.

## Acceptance-Test-Driven Development

ATDD validates that implementation satisfies acceptance criteria.

Spec Guard uses acceptance criteria as inputs, but distinguishes between:

- API contract tests,
- integration tests,
- browser automation,
- process checks for document deliverables.

## Spec-Driven Development

Spec-driven development treats specifications as the source of implementation truth.

Spec Guard agrees, but rejects documentation theater. Specs guide implementation; tests validate running behavior and durable contracts.

## API-First / Contract-First Development

API-first methods define service or package contracts before implementation.

Spec Guard applies this principle to reusable non-UI APIs, REST/service APIs, and reusable UI components. It requires tests against the documented/exported contract, not private internals.

## Design-Driven Development

Design-driven workflows start from mockups, prototypes, or design systems.

Spec Guard requires design inputs for UI work. Agents must not invent UI. One-off UI requires mockups or explicit design direction, component-library references, and browser automation for user-visible behavior.

## README / Documentation-Driven Development

Documentation-driven workflows use docs to shape implementation.

Spec Guard allows docs when they define durable contracts or are themselves the deliverable. It does not allow tests that merely verify prose for ordinary product features.

## Spec Kit-Style Workflows

Spec Kit-style workflows are useful for structured specifications, planning, traceability, and generated task flows.

Spec Guard is more opinionated about implementation safety:

- classify the work before implementation,
- write tests before code,
- observe failure first,
- test behavior/contracts/UI, not prose,
- halt on missing specs, missing UI inputs, bad specs, and scope creep,
- avoid testing undocumented internals,
- avoid invented UI.

Spec Guard can support tooling later, but its first priority is enforceable behavior for human-directed coding agents.

## Summary

Spec Guard is not a replacement for every planning methodology. It is a guardrail system for turning specs into safe, minimal, test-backed implementation work.
