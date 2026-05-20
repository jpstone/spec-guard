# Spec Guard Methodology

Spec Guard is a spec-first, test-driven methodology for AI-assisted software development.

Its purpose is to make implementation by coding agents safer, more traceable, and easier to review.

Core idea:

> Specs guide implementation, but tests validate running behavior and durable contracts — not prose.

## Prime Directive

Work proceeds in this order:

```text
identify spec → classify work → write tests/checks → observe failure → implement → pass tests/checks
```

Do not invert this order.

Tests/checks validate code behavior, API contracts, user-visible behavior, or document deliverables. They do not validate document content unless the document itself is the deliverable.

## Core Principles

- Specs define intended behavior; tests prove running behavior.
- Work must be classified before choosing documentation or test/check strategy.
- Durable contracts should be documented and tested through public behavior.
- Documentation is created only for durable contracts or document deliverables.
- Tests should target public/exported behavior, not private internals.
- Missing specs, unclear UI inputs, bad specs, and scope creep are halt conditions.
- Changes should be minimal, traceable, and tied directly to the spec.

## Required Decision Flow

Before implementation, answer:

1. What spec defines the required behavior?
2. Is the spec sufficient to begin?
3. What is the primary work classification?
4. Does this change create or modify a durable API, service, UI, or document deliverable?
5. What documentation, if any, is required by that classification?
6. What is the smallest test/check that validates the required behavior, contract, UI, or deliverable?
7. Can the test/check be run and observed failing before implementation?

A human request may serve as the governing spec only if it contains enough concrete behavior, scope, acceptance criteria, and required inputs to support implementation and tests/checks. If not, create or request a spec before implementation.

If the spec is missing or unclear, the correct outcome is a blocker, not implementation based on assumptions.

Outside explicit discovery mode, the spec is the complete boundary of authorized work. Agents should not add, improve, refactor, upgrade, restyle, redesign, or generalize anything unless required by the spec or separately authorized by the human.

## Work Classification

Every task should have one primary classification.

1. **Reusable non-UI API** — shared libraries, domain services, validation modules, adapters, persistence interfaces, or CLI helpers.
2. **REST/service API** — HTTP endpoints, webhook handlers, RPC interfaces, or cross-service contracts.
3. **Reusable UI component** — shared components used within an app, across apps, or by platform code.
4. **One-off application UI** — single-use screens, page-specific forms, dashboards, or app-specific workflows.
5. **Direct behavior with no new API or UI** — behavior implemented through existing surfaces without creating a new durable contract.
6. **Operational/document deliverable** — runbooks, policies, release checklists, public help, compliance material, or other documents that are themselves the deliverable.

Classification determines required documentation and test/check strategy.

If classification is ambiguous or changes during implementation, work should halt until the classification is clarified.

## Compound Work

Some user requests span multiple classifications. For example, "build a todo app" may include one-off UI, persistence behavior, reusable state logic, REST/service APIs, or reusable UI components.

Do not force compound work into one classification and implement everything at once.

For compound work:

1. identify the primary user outcome,
2. split the request into implementation slices,
3. classify each slice separately,
4. identify required templates and tests/checks for each slice,
5. implement only slices required for the current spec,
6. record additive slices as follow-up work.

If the human asked for a broad product but did not provide UI direction, persistence expectations, auth rules, or API requirements, halt and request the missing inputs before implementation.

## Documentation Rules

Create or update documentation only when it defines a durable contract or is itself the deliverable.

Durable contract documentation is appropriate for:

- reusable package APIs,
- REST/service APIs,
- provider adapter contracts,
- persistence contracts,
- reusable UI components,
- shared platform behavior other agents or apps depend on.

Do not create documentation merely to satisfy process when the existing spec already defines the work.

## Documentation Testing Policy

Do not write tests that check whether docs exist or contain specific phrases for ordinary product features.

Doc-content or process checks are appropriate only when the document itself is the deliverable, such as:

- release checklists,
- operational runbooks,
- security/privacy policies,
- compliance gates,
- public help or legal content,
- README/index/link coverage,
- support procedures.

For product features, test running code or API behavior, not documentation text.

## Failure-First Testing Rule

Every newly written test/check should be run and observed failing before implementation.

Observing failure is impractical only when:

- the test/check environment cannot be run at this stage,
- a required dependency or infrastructure does not yet exist,
- running the test/check would cause irreversible side effects in a live system.

When failure-first execution is impractical, record the concrete reason. "Impractical" is not a general escape hatch.

## Mid-Implementation Spec Failure Handling

If implementation reveals that the spec is wrong, incomplete, ambiguous, or contradicted by existing behavior, stop immediately.

Record:

1. what was discovered,
2. where it was discovered,
3. whether it is an ambiguity, gap, or conflict,
4. what clarification or correction is needed.

Do not patch around a bad spec. The spec should be corrected or clarified before implementation continues.

## Scope Creep Handling

If implementation reveals additional work outside the original scope, do not absorb it silently.

Record:

1. what work was discovered,
2. where it was discovered,
3. whether it is required for the current spec,
4. whether it should be handled now or as follow-up.

Required scope expansion needs acknowledgment before continuing. Additive work should become follow-up work.

## Spec Adherence and Drift Prevention

Outside explicit discovery mode, implementation must stick to the governing spec, period.

The following are drift unless explicitly required by the spec or separately authorized:

- unrequested features,
- optional enhancements,
- opportunistic refactors,
- dependency upgrades,
- framework or architecture changes,
- UI redesign beyond provided direction,
- new abstractions or reusable surfaces,
- behavior changes because they seem better than the spec,
- implementing nearby TODOs,
- adding undocumented API/UI surface.

If the spec appears unsafe, impossible, technically incompatible, or harmful, the correct action is to halt and record a blocker or spec deviation request. Agents must not self-authorize a better path.

## Discovery Mode

Discovery is separate from implementation.

Agents should not propose unsolicited feature roadmaps after completing a task. A prompt like "what's next?" should be answered with current status, known blockers, recorded follow-ups, and instructions for requesting discovery. It is not permission to invent new features.

Discovery mode is appropriate only when the human explicitly asks questions such as:

- "What did we miss?"
- "What risks remain?"
- "What features does this project need?"
- "Review for security/legal/accessibility/reliability gaps."

In discovery mode, the agent should:

1. confirm discovery scope,
2. identify the discovery type,
3. produce evidence-based findings,
4. distinguish required gaps from optional enhancements,
5. state whether each finding is required for the current spec,
6. recommend blocker, spec change, follow-up spec, or no action,
7. avoid implementation unless separately authorized.

Discovery may identify security, privacy/legal/compliance, accessibility, reliability, product, test coverage, or technical debt gaps. It must not become unsolicited feature invention.

## Workflow: Reusable Non-UI API

Use for shared libraries, domain services, validation modules, provider adapters, persistence interfaces, and CLI helpers.

1. Before writing any implementation code, create an API contract document (`spec-guard new api-contract contracts/<name>.md`) and fill it in from the spec's acceptance criteria. The agent produces this — it is not a human deliverable. If the acceptance criteria are too vague to define inputs, outputs, or error behavior, that is a spec problem: halt and surface the gap.
2. Document purpose, inputs, outputs, errors, edge cases, security/tenant rules, stability expectations, versioning, and backward compatibility.
3. Write unit tests against the documented/exported API surface only.
5. Run tests and observe failure, or record why this is impractical.
6. Implement until tests pass.
7. Refactor freely without changing the documented contract.

Do not test private helper functions as a substitute for public contract tests.

## Workflow: REST or Service API

Use for HTTP endpoints, webhook handlers, RPC interfaces, and cross-service contracts.

1. Before writing any implementation code, create a REST API contract document (`spec-guard new rest-api-contract contracts/<name>.md`) and fill it in from the spec's acceptance criteria. The agent produces this — it is not a human deliverable. If the acceptance criteria are too vague to derive a contract (missing route, payload, or response shape), that is a spec problem: halt and surface the gap.
2. Document route/method, authentication, authorization, request shape, response shape, status codes, error responses, tenant isolation, versioning, deprecation, and audit/logging expectations.
3. Write API/integration tests against the documented contract.
4. Run tests and observe failure, or record why this is impractical.
5. Implement until tests pass.

## Workflow: Reusable UI Component

Use for components shared within an app, across apps, or by platform code.

1. Treat the component as an API.
2. Create/update component documentation if this is a durable contract.
3. Document purpose, props/API surface, rendered states, callbacks/events, accessibility expectations, styling/theming constraints, composition rules, and examples.
4. Write unit/component tests against the documented component API only.
5. Run tests and observe failure, or record why this is impractical.
6. Implement in the shared UI component library.
7. Implement until tests pass.

Add browser automation when the component contract includes behavior that a JSDOM or virtual DOM environment cannot accurately simulate — such as focus management, keyboard navigation, scroll, viewport layout, popovers, file uploads, drag and drop, or hydration.

## Workflow: One-Off Application UI

Use for single-use screens, page-specific forms, dashboards, and app-specific workflows.

UI implementation should not begin without:

1. human-provided mockups, wireframes, or explicit design direction,
2. a documented UI component library,
3. accessibility and automation expectations.

Workflow:

1. Use the feature spec, mockups, and component library docs as the source of truth.
2. Do not create developer documentation unless a reusable API or component emerges.
3. Write browser automation tests for user-visible behavior and mechanically verifiable mockup fidelity.
4. Cover headings, labels, calls to action, forms, navigation, success/error states, permission-sensitive visibility, and key accessibility affordances.
5. Run tests and observe failure, or record why this is impractical.
6. Implement until tests pass.

Do not invent UI. Placeholder UI requires explicit human authorization and should be marked unreviewed.

## Workflow: Direct Behavior With No New API or UI

Use when behavior can be implemented without creating a reusable API, REST API, or UI surface.

1. Confirm the existing spec is sufficient.
2. Do not create new documentation by default.
3. Write tests that verify every acceptance criterion. There is no new API or UI surface — use whatever mechanism verifies the criterion (calling existing code, checking a value, observing a side effect).
4. Run the tests and observe failure, or record why this is impractical.
5. Implement until the tests pass.

## Workflow: Operational or Document Deliverable

Use when the document, checklist, policy, runbook, help content, or process artifact is itself the deliverable.

1. Confirm the document's audience, purpose, scope, and acceptance criteria.
2. Define required document structure or process checks.
3. Write checks that validate required sections, links, policy gates, or operational readiness.
4. Run checks and observe failure, or record why this is impractical.
5. Create or update the document until checks pass.
6. Do not use document checks as a substitute for product behavior tests.

## Test Selection Rules

Choose the smallest test/check that validates the behavior or contract with confidence.

**Unit tests** validate documented/exported API surfaces of reusable modules. Underlying pure functions, validation rules, and state transitions are implementation details — test them through the public API, not directly.

**API/integration tests** validate HTTP endpoints, persistence adapters, provider boundaries, auth/session behavior, or multi-module behavior.

**Browser automation tests** validate user-facing UI behavior, forms, navigation, permission-sensitive screens, browser-only interactions, and mechanically verifiable mockup fidelity.

**Release/process checks** validate operational readiness, required runbooks, deployment checklists, policy documentation deliverables, or other document deliverables.

## Agent Must / Must Not Rules

Agents using Spec Guard must:

- identify the spec before implementation,
- classify the work before implementation,
- write tests/checks before implementation,
- test behavior, contracts, user-visible outcomes, or document deliverables,
- halt on ambiguity instead of guessing,
- record scope discoveries,
- keep changes minimal and traceable.

Agents must not:

- implement before identifying the spec,
- create documentation by default,
- test prose instead of behavior for product features,
- invent UI,
- test undocumented internals as a substitute for contract tests,
- work around bad specs,
- silently expand scope,
- add unrequested features or optional enhancements,
- opportunistically refactor unrelated code,
- upgrade dependencies or change architecture unless required by the spec,
- redesign UI beyond provided direction,
- implement nearby TODOs unless required by the spec,
- propose unsolicited feature roadmaps,
- treat "what's next?" as permission to invent features,
- perform discovery unless the human explicitly asks for it,
- implement discovery findings without separate authorization,
- skip failure-first testing/checking without a concrete reason.

## Operating Loop

```text
1.  Identify spec. Missing or unclear → ask; if unresolved, document blocker and halt.
2.  Classify the work.
3.  Determine whether durable documentation or a sub-spec is required.
4.  Write the appropriate test/check against the documented contract, behavior, UI, or deliverable.
5.  Run the test/check and observe failure, or record why this is impractical.
6.  Implement the smallest change.
7.  If the spec proves wrong, halt and surface the issue.
8.  If out-of-scope work is discovered, record it and do not absorb it silently.
9.  Run tests/checks until passing.
10. Update durable documentation only if the durable contract changed.
```
