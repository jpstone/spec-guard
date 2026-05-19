# Quality Gates

Spec Guard is designed to be measurably stricter than documentation-only spec workflows.

A task is not ready for implementation until these gates pass.

## Gate 1: Spec Exists

Required evidence:

- A governing spec is linked or created.
- The spec has concrete content for problem/goal, scope, expected behavior, acceptance criteria, classification, and required tests/checks.

CLI support:

```bash
spec-guard check path/to/spec.md
```

## Gate 2: Work Is Classified

Required evidence:

- Exactly one primary work classification is selected.
- Classification-specific documentation/test strategy is known.

Why this is stricter than generic spec workflows:

- The same implementation request may require unit tests, API/integration tests, browser automation, or document checks.
- Classification prevents agents from applying one generic plan to every task.

## Gate 3: Correct Test/Check Is Named Before Implementation

Required evidence:

- Required tests/checks are identified before code changes.
- Tests target behavior, contracts, user-visible UI, or document deliverables.

Disallowed evidence:

- tests that only check prose for product features,
- tests against undocumented private internals,
- vague statements such as "add tests" without naming what must fail.

## Gate 4: Failure-First Is Confirmed

Required evidence:

- New tests/checks are run before implementation and fail for the expected reason.
- If they cannot be run, the concrete reason is recorded.

## Gate 5: UI Inputs Exist Before UI Work

Required evidence for UI work:

- mockup, wireframe, or explicit design direction,
- component library reference,
- accessibility and automation expectations.

If missing, the correct output is a blocker, not invented UI.

## Gate 6: Bad Specs Halt Work

Required evidence when a spec problem is discovered:

- ambiguity, gap, or conflict is recorded,
- work halts until clarification or correction.

Agents must not patch around a bad spec.

## Gate 7: Scope Discoveries Are Recorded

Required evidence:

- discovered work is recorded,
- required vs additive is stated,
- additive work is not silently implemented in the current change.

## Gate 8: Implementation Review Confirms Traceability

Required evidence:

- change traces to spec,
- tests/checks were written first,
- blockers/scope discoveries were handled,
- durable docs changed only when durable contracts changed.

## Objective Differentiators

Spec Guard is stronger than a generic spec/template workflow when it can answer yes to these questions:

- Did a tool or checklist reject specs with missing required content?
- Was exactly one work classification selected?
- Did the classification drive the test strategy?
- Were behavior/contract/UI tests named before implementation?
- Was failure observed before implementation?
- Did UI work halt without design inputs?
- Were bad specs and scope creep recorded instead of absorbed?
- Were product features tested through behavior rather than prose?
