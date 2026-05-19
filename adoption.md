# Adoption Guide

Use this guide to apply Spec Guard in an existing software project.

## Minimal Adoption

1. Copy or link `agent-instructions.md` into your coding-agent context.
2. Keep `methodology.md` available as the canonical reference.
3. Put new specs in a predictable project location, such as `specs/`.
4. Use `templates/spec.md` for new work.
5. Require agents to identify the governing spec before implementation.

## Recommended Project Layout

```text
/specs/
  feature-name.md
/contracts/
  api-name.md
/spec-guard/
  blockers/
  scope-discoveries/
  reviews/
```

This layout is optional. Use project conventions if they already exist.

## Agent Prompt Starter

```text
Follow Spec Guard. Before implementation, identify the governing spec, classify the work, write the appropriate tests/checks, run them and observe failure, then implement. Halt on missing specs, unclear UI inputs, bad specs, or scope creep.
```

## Per-Task Workflow

1. Link the governing spec.
2. Classify the work using `work-classification.md`.
3. Fill only the required template.
4. Run the relevant checklist.
5. Write the tests/checks first.
6. Observe failure.
7. Implement the smallest change.
8. Run tests until passing.
9. Complete an implementation review for non-trivial changes.

## Team Policy Options

Teams may choose to require:

- every task links to a spec,
- every reusable API has a contract document,
- every UI task references design input,
- every one-off UI change includes browser automation,
- every scope discovery is recorded outside the implementation diff,
- every skipped failure-first run names a concrete reason.

## What Not To Do

- Do not copy every template into every task.
- Do not require documentation for direct behavior changes that create no durable contract.
- Do not let agents invent UI to keep moving.
- Do not treat document checks as product tests.
- Do not use Spec Guard as a reason to expand scope.
