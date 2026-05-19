# Spec Guard vs Spec Kit-Style Workflows

This document compares Spec Guard with Spec Kit-style workflows in objective, observable terms.

Spec Kit-style workflows are useful for structuring requirements, plans, and implementation tasks. Spec Guard is narrower and stricter: it is optimized for agentic implementation safety.

## Objective Comparison

| Capability | Spec Kit-style workflow | Spec Guard |
| --- | --- | --- |
| Structured specs | Yes | Yes |
| Task planning | Yes | Yes |
| Explicit work classification before implementation | Not always required | Required |
| Tests/checks named before implementation | Often recommended | Required |
| Failure-first confirmation | Not always enforced | Required or concrete exception recorded |
| Behavior over prose testing | Depends on project discipline | Core rule |
| Doc-content tests limited to document deliverables | Not always explicit | Explicit rule |
| Reusable API contract testing | Project-dependent | Required for durable APIs |
| Reusable UI treated as an API | Project-dependent | Required |
| One-off UI requires browser automation | Project-dependent | Required for user-visible behavior |
| UI work halts without design/component-library inputs | Project-dependent | Required |
| Bad specs halt implementation | Project-dependent | Required |
| Scope discoveries recorded instead of absorbed | Project-dependent | Required |
| Tests against private internals discouraged | Project-dependent | Explicitly disallowed as substitute for contract tests |
| Minimal CLI validation for spec readiness | Varies | Implemented |

## Where Spec Guard Is Intentionally Better

Spec Guard is better for coding-agent safety when the goal is to prevent unsafe implementation, not merely produce a polished planning document.

It provides objective gates that can be reviewed or automated:

- required spec sections must exist,
- required spec sections must contain concrete content,
- exactly one work classification must be selected,
- required tests/checks must be identified,
- UI work must have design inputs,
- blockers and scope discoveries have dedicated templates,
- CLI diagnostics have stable rule IDs and exit codes.

## Where Spec Kit-Style Workflows May Still Be Better

Spec Kit-style workflows may be better when a team wants:

- broad product planning ceremonies,
- generated implementation plans,
- larger multi-phase traceability systems,
- a more general specification process not focused on coding-agent risk.

Spec Guard does not try to replace every planning workflow. It can be layered on top of them as an implementation-safety gate.

## Practical Recommendation

Use Spec Kit-style tools for broad planning if they help your team.

Use Spec Guard when an AI coding agent is about to implement work and you need enforceable answers to:

1. What spec governs this change?
2. What kind of work is it?
3. What test/check must fail first?
4. What inputs are missing?
5. What must the agent halt on?
6. How do we know scope did not silently expand?

## Non-Negotiable Difference

Spec Guard rejects documentation theater.

A spec is not proof that software works. A plan is not proof that contracts hold. A document-content test is not proof that a product feature behaves correctly.

Spec Guard requires behavior, contract, UI, or deliverable checks tied directly to the classified work.
