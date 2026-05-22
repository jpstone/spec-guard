# Spec

## Title

Implementation Planning Phase

## Status

Implemented

## Problem / Goal

Spec Guard currently jumps from spec/contract into tests and implementation without a dedicated planning step for implementation choices that must be known before coding, such as web technology stack, desktop app technology stack, game engine/platform, backend framework, or a narrower stack layer. The goal is to close this workflow and validation gap so agents identify, suggest, confirm, record, and validate required implementation-planning decisions before tests or implementation begin.

## In Scope

- Add a dedicated planning phase or checkpoint to the Spec Guard workflow before Test First / implementation.
- Require specs that depend on upfront implementation decisions to record those decisions, including full tech stack choices or narrower tech-layer choices.
- Define how agents identify when implementation planning is required.
- Require agents to suggest a context-appropriate stack, tech layer, or layer choice when planning is required, while allowing the human to accept the suggestion or provide a different choice.
- Define validation/gate behavior for missing required implementation-planning details.
- Update relevant docs, templates, CLI behavior, and tests so the workflow enforces the new planning requirement.

## Out of Scope

- Do not prescribe specific technology stacks or recommend React, Vite, Fastify, Express, Electron, Unity, Unreal, native desktop, or any other stack by default.
- Do not redesign existing work classifications unless required to support planning.
- Do not implement project scaffolding for any stack.
- Do not add UI design/mockup requirements beyond the existing UI workflow rules.
- Do not change implementation guidance unrelated to upfront planning.

## Expected Behavior

During the Spec Guard workflow, when a spec requires implementation-planning decisions, the agent identifies the required tech stack or tech-layer decision before tests or implementation. The agent suggests a stack or layer it believes best fits the project context and spec, while making clear that the human may accept it or provide a different choice. The chosen implementation plan is recorded in the governing Spec Guard artifacts and validated before proceeding. If required planning details are missing, the workflow blocks instead of allowing tests or implementation to begin.

## Acceptance Criteria

- [ ] A workflow phase or checkpoint exists between Classify & Contract and Test First for implementation planning.
- [ ] Specs or related artifacts can record required implementation-plan decisions, including full stack or stack-layer choices.
- [ ] Agent instructions require suggesting a context-appropriate stack/layer and asking the human to accept or override it when planning is required.
- [ ] Validation reports a blocker or warning when a spec that requires planning lacks the required plan details.
- [ ] Existing UI mockup/component-library requirements continue to work and are not replaced by the planning phase.
- [ ] Tests cover planning-required specs with and without recorded plan details.

## Prior Implementation Review

- No prior implementation review exists for an implementation-planning phase.

## Documentation Requirements

- [Agent Instructions](AGENTS.md) — document agent obligations for identifying required implementation planning, suggesting a context-appropriate stack/layer, and obtaining human acceptance or override.
- [Workflow](WORKFLOW.md) — document the new implementation-planning phase/checkpoint and gate placement before Test First.
- [Spec Template](templates/spec.md) — add fields for whether implementation planning is required and any confirmed implementation-plan details.
- [README](README.md) — update the public overview, gate list, MCP tool descriptions, agent prohibitions, and development test count for the six-gate workflow.

## Dependencies

None.

## Open Questions

None.

## Work Classification

<!-- Choose one primary classification. -->

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [x] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
- [ ] Bugfix
