# Changelog

## 0.1.0

Initial functional baseline.

Includes:

- Spec Guard methodology and agent instructions.
- Work classification guide.
- Templates for specs, plans, contracts, UI work, blockers, scope discoveries, implementation reviews, and document deliverables.
- Operational checklists.
- Examples for reusable APIs, REST APIs, reusable UI, one-off UI, and document deliverables.
- CLI command: `spec-guard check path/to/spec.md`.
- CLI validation for required spec headings, concrete required-section content, exactly one selected classification, and required tests/checks.
- Template/scaffolding commands: `init`, `new spec`, `classify`, `blocker`, `scope-discovery`, `review`, `discovery`, and `deviation`.
- Objective quality gates and Spec Kit-style workflow comparison.
- Explicit discovery mode to prevent unsolicited feature roadmaps and separate risk/gap discovery from implementation.
- Explicit spec deviation flow to prevent agents from changing, expanding, relaxing, or contradicting specs without authorization.
- Cross-platform Node test workflow.
