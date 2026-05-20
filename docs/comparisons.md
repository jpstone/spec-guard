# Comparisons

Spec Guard overlaps with several established software methods, but its focus is narrower: agentic implementation safety through spec-first, behavior-tested workflows with mechanical enforcement.

## Test-Driven Development

TDD says to write tests before implementation.

Spec Guard adopts that rule and adds:

- explicit spec identification before tests,
- work classification before choosing test type,
- halt rules for ambiguity and scope creep,
- contract-focused testing for reusable surfaces,
- a gate confirming tests fail for the expected reason before any implementation begins.

## Behavior-Driven Development

BDD emphasizes behavior described in user/business language.

Spec Guard aligns with BDD when validating user-visible behavior, but does not require a specific scenario syntax. It prefers the smallest practical test that proves the specified behavior.

## Acceptance-Test-Driven Development

ATDD validates that implementation satisfies acceptance criteria.

Spec Guard uses acceptance criteria as inputs, but distinguishes between:

- API contract tests,
- integration tests,
- UI automation tests,
- process checks for document deliverables.

## Spec-Driven Development

Spec-driven development treats specifications as the source of implementation truth.

Spec Guard agrees, but rejects documentation theater. Specs guide implementation; tests validate running behavior and durable contracts — not prose.

## API-First / Contract-First Development

API-first methods define service or package contracts before implementation.

Spec Guard applies this principle to reusable non-UI APIs, REST/service APIs, and reusable UI components. It requires tests against the documented/exported contract, not private internals.

## Design-Driven Development

Design-driven workflows start from mockups, prototypes, or design systems.

Spec Guard requires design inputs for UI work. Agents must not invent UI. One-off UI requires a mockup or explicit design direction and a component library reference before any implementation begins.

## README / Documentation-Driven Development

Documentation-driven workflows use docs to shape implementation.

Spec Guard allows docs when they define durable contracts or are themselves the deliverable. It does not allow tests that merely verify prose for ordinary product features.

---

## GitHub Spec Kit

[Spec Kit](https://github.com/github/spec-kit) is a spec-driven workflow framework. It covers spec generation, planning and task decomposition, TDD-oriented workflows, implementation orchestration, and review/validation structure. It is a well-designed system for bringing structure to agent-driven development.

**What Spec Kit provides:** A scaffold. It organizes the workflow around specs and gives agents a structured path from requirement to implementation. The quality of that path depends heavily on the capabilities of the paired coding agent.

**What Spec Kit does not natively provide:** A deterministic convergence loop — that is, a system that mechanically verifies the current state, enforces a constraint, and refuses to proceed until the constraint is satisfied. Spec Kit improves workflow structure and planning. The agent is still expected to enforce correctness on its own.

**Where Spec Guard is different:**

Spec Guard's primary concern is not organizing the workflow — it is enforcing constraints at each step. The distinction:

- **Spec Kit:** spec-first prompting. Structure and guidance are provided; the agent is expected to follow them.
- **Spec Guard:** constraint-driven gates. Each phase has a mechanical pass condition. The gate is not advisory — execution cannot proceed past it until it is satisfied by the tooling.

The specific constraints Spec Guard enforces that Spec Kit does not:

| Constraint | Spec Guard | Spec Kit |
|---|---|---|
| Spec must pass structural validation before implementation | Gate 1: `spec-guard check` must exit 0 | Not mechanically enforced |
| Contract artifact must exist for durable APIs/components | Gate 2: checked by `spec-guard check --warnings` | Not mechanically enforced |
| Tests must fail for the expected reason before implementation | Gate 3: failure-first confirmation required | Not natively enforced |
| All tests must pass before review begins | Gate 4: all tests must pass | Relies on agent |
| Cross-artifact alignment verified before close | Gate 5: `spec-guard analyze` must pass | Not natively enforced |

**The failure-first gate** (Gate 3) is the most architecturally significant distinction. Before any implementation code is written, Spec Guard requires evidence that the new test actually runs and fails for the expected reason. This prevents false-positive "green" states caused by:

- tests that pass vacuously because the assertion is never reached,
- skipped or misconfigured tests,
- tests exercising the wrong code path.

A test that was never observed to fail provides no proof that the implementation it is about to validate was actually needed. Failure-first enforcement closes that gap.

**Honest limits of the comparison:**

Spec Guard's gates are enforced at the tooling level, but the autonomous repair loop — the cycle of implement → test → observe failure → repair → retry until green — depends on the agent following the workflow. Spec Guard provides the framework and evidence-collection structure for that loop; it does not yet run the loop autonomously as a runtime. The value is in making the constraints explicit, machine-checkable, and non-bypassable rather than advisory.

Whether that distinction matters in practice depends on the agent. For a coding agent that reliably follows structured instructions, Spec Guard's gates add meaningful safety. For a one-shot generation system that ignores constraints, neither tool solves the core problem.

**When to use which:**

Spec Kit is likely a better fit for teams that want scaffolded workflow organization and spec traceability and are comfortable relying on the agent's own judgment for correctness enforcement. Spec Guard is a better fit when the priority is provable correctness — when "the agent said it works" is not sufficient and you need the gates to show it.

---

## Summary

Spec Guard is not a replacement for every planning methodology. It is a constraint enforcement system for turning specs into safe, minimal, test-backed implementation work — with mechanical gates that must pass rather than guidelines that can be skipped.
