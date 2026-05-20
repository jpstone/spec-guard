# Glossary

## Spec

The human-approved description of required behavior, acceptance criteria, scope, and constraints.

## Work Classification

The primary category of implementation work. Classification determines required documentation and test strategy.

## Durable Contract

A stable interface or behavior that other code, users, agents, services, or operators depend on.

## Reusable Non-UI API

A shared package, module, service object, adapter, validation rule, CLI helper, or other non-UI interface intended for reuse.

## REST / Service API

An HTTP endpoint, webhook handler, RPC interface, or cross-service contract.

## Reusable UI Component

A UI component used across screens, apps, packages, or platform code. Treat it as an API.

## One-Off Application UI

A screen, form, dashboard, or workflow built for a specific application use case rather than reuse as a shared component.

## Operational / Document Deliverable

A document that is itself the product, such as a runbook, release checklist, policy, compliance artifact, or public help page.

## Direct Behavior, No New API/UI

A change that alters observable behavior without introducing a new API surface or UI. Tests are derived from the acceptance criteria using whatever mechanism verifies the behavioral change.

## Gate

A hard checkpoint in the workflow. Each gate has a specific pass condition enforced by `spec-guard` tooling. Gates are not advisory — execution does not proceed past a gate until it passes.

## Contract

A document defining the durable interface or behavior of a reusable API or component. Stored in `.spec-guard/contracts/`. Required before Gate 2 for reusable non-UI APIs, REST/service APIs, and reusable UI components.

## Brownfield Spec

A spec for modifying existing behavior. Records both the current behavior (as-is) and the behavior delta (what changes). Anything not in the delta must be preserved exactly.

## Deviation

A recorded divergence between the spec and what implementation requires. Created with `spec-guard deviation` when implementation reveals the spec is wrong, incomplete, or contradictory. Requires human resolution before work continues.

## Discovery

A structured gap or risk analysis entered only when the human explicitly requests it. Distinct from implementation — findings do not authorize implementation. Tracked with `spec-guard discovery`.

## Run State

The persisted gate confirmation data for a spec, stored in `.spec-guard/runs/<name>-run.json`. Records which gates have passed, failure-first evidence, and confirmation timestamps for gates 3–5.

## Failure-First Testing

The practice of running a newly written test before implementation and observing it fail for the expected reason.

## Scope Discovery

Work discovered during implementation that may be required for the current spec or may be additive follow-up work.

## Blocker

A missing, unclear, or contradictory input that prevents safe implementation.
