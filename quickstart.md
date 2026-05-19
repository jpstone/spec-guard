# Quickstart

Use Spec Guard to make an AI coding-agent task safer in about 10 minutes.

## 1. Give the Agent the Rules

Paste `agent-instructions.md` into the agent context. Keep `methodology.md` available as the canonical human-readable reference.

## 2. Identify the Spec

Every task needs a governing spec. If none exists, create one from `templates/spec.md`.

Minimum viable spec fields:

- problem / goal,
- in scope,
- out of scope,
- expected behavior,
- acceptance criteria,
- work classification,
- required tests/checks.

If those fields cannot be filled in, the task is not ready for implementation.

## 3. Classify the Work

Use `work-classification.md`.

Pick one primary classification:

- reusable non-UI API,
- REST/service API,
- reusable UI component,
- one-off application UI,
- direct behavior with no new API or UI,
- operational/document deliverable.

If classification is ambiguous, halt and ask.

## 4. Add Only the Required Template

Use the smallest template set that makes the work implementation-ready:

- reusable non-UI API → `templates/api-contract.md`,
- REST/service API → `templates/rest-api-contract.md`,
- reusable UI component → `templates/reusable-ui-component.md`,
- one-off application UI → `templates/one-off-ui.md`,
- operational/document deliverable → `templates/operational-document.md`.

Do not create documents just to satisfy process.

## 5. Run the Relevant Checklist

Before implementation, use:

- `checklists/preflight.md` for every task,
- plus the readiness checklist matching the classification.

If the checklist exposes missing inputs, fill out `templates/blocker.md` and halt.

## 6. Write the Test or Check First

Write the smallest test or process check that validates the required behavior, contract, user-visible outcome, or document deliverable.

Then run it before implementation and observe failure.

If the test/check cannot be run, record the concrete reason.

## 7. Implement the Smallest Change

Implement only what the spec requires.

If new required work appears, record it using `templates/scope-discovery.md` and ask for acknowledgment before expanding scope.

## 8. Review Before Done

Use `templates/implementation-review.md` and `checklists/implementation-review.md`.

Confirm:

- the spec was followed,
- tests/checks were written first,
- failure was observed or a reason was recorded,
- no UI was invented,
- no scope creep was silently absorbed,
- durable docs changed only when durable contracts changed.
