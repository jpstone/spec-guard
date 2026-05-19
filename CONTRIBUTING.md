# Contributing

Spec Guard should evolve without weakening its core safety rules.

## Contribution Goals

Contributions should make the methodology:

- clearer,
- harder to misuse,
- easier to apply with coding agents,
- more enforceable through tests, templates, or checklists,
- more practical for real implementation work.

## Do Not Weaken These Rules

Do not change the methodology to allow agents to:

- implement before identifying a spec,
- skip work classification,
- create docs by default,
- test prose instead of behavior for product features,
- invent UI without required inputs,
- test private internals as a substitute for contract tests,
- patch around bad specs,
- silently absorb scope creep,
- skip failure-first testing without a concrete reason.

## Preferred Changes

Prefer changes that:

- shorten or clarify agent-facing instructions,
- make halt conditions more explicit,
- improve templates without adding ceremony,
- add examples that demonstrate correct behavior,
- distinguish durable contracts from incidental implementation details,
- improve future toolability without adding premature automation.

## Documentation Standards

Agent-facing documents should be concise and imperative.

Templates should include only fields that help make work implementation-ready.

Examples should show decisions and expected failures, not just describe the method.

## Adding Templates or Checklists

When adding a template or checklist, explain:

1. what work classification it supports,
2. what unsafe agent behavior it prevents,
3. what test or review decision it enables.

## Adding Examples

Each example should include:

1. starting spec,
2. classification decision,
3. required contract or deliverable document,
4. tests to write before implementation,
5. expected initial failure,
6. implementation notes,
7. what not to do.

## Tooling Policy

Do not add CLI or automation until the methodology, templates, and examples are stable.

Future tooling should validate the methodology. It should not replace human judgment about ambiguous specs, UI design, or scope changes.
