# Checklists

Use checklists as operational gates. They should reinforce the methodology without replacing judgment.

## Before Implementation

- `preflight.md` — confirm spec, classification, docs, tests, and blockers.
- `api-contract-readiness.md` — confirm reusable API contract readiness.
- `ui-readiness.md` — confirm UI inputs exist before UI work begins.
- `reusable-ui-readiness.md` — confirm shared component contract readiness.
- `browser-test-readiness.md` — confirm browser tests can validate user-visible behavior safely.
- `document-deliverable-readiness.md` — confirm document deliverable checks are appropriate.

## Before Implementation After Tests Are Written

- `failure-first.md` — confirm newly written tests/checks fail for the expected reason.

## Discovery

- `discovery-readiness.md` — use only when the human explicitly asks for risk/gap/feature discovery.

## During Implementation and Review

- `spec-adherence.md` — confirm work stayed inside the governing spec and did not drift.

## Before Completion

- `implementation-review.md` — confirm the change stayed spec-bound, tested, and minimal.

## Usage Rule

Use only the checklist that applies to the work classification. If a checklist exposes missing inputs, document a blocker and halt.
