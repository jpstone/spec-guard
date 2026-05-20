# Principles

## Spec-First

Identify the governing spec before implementation. If no sufficient spec exists, halt and ask.

## Behavior-Tested

Tests should validate running behavior, API contracts, or user-visible outcomes. Do not test prose unless the document itself is the deliverable.

## Classification Before Implementation

Classify the work before deciding whether documentation, contract updates, unit tests, integration tests, browser automation, or process checks are required.

## Contracts Over Internals

Reusable surfaces need durable contracts. Test documented/exported behavior, not private implementation details.

## Humans Own Ambiguity

Agents must not resolve missing requirements, unclear UI, bad specs, or scope expansion by guessing. Halt and surface the issue.

## Minimal, Traceable Change

Every implementation change should trace to the spec and required tests. Additive discoveries should become follow-up work unless explicitly acknowledged as required.
