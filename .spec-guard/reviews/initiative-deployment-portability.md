# Implementation Review

## Linked Spec

[initiative-deployment-portability](../specs/initiative-deployment-portability.md)

## Linked Contract

<!-- Direct behavior with no new API or UI — no contract required. -->

## Classification

Direct behavior with no new API or UI

## Implementation Files

- `src/initiative.js` — `buildInjectedSlices()` always prepends a `deployment-portability` slice as the first injected slice; the slice is rendered with classification `"Direct behavior with no new API or UI"`; when `deployment_target` is present and non-empty (not TBD/unknown), the slice description and AC array include the known-target constraints; when absent/TBD, the AC uses universal framing (externalized config, no undeclared host assumptions, documented configuration surface)
- `src/initiative.js` — `INITIATIVE_QUESTIONS.required` includes `deployment_target` question at position 4 (before `external_dependencies`); question text is technology-agnostic
- `src/initiative.js` — `buildInitiativeArtifact()` renders injected slices in a `## Infrastructure Slices` section with full descriptions and ACs displayed; the deployment portability slice always appears first in that section
- `AGENTS.md` — `### Proposed Slice Ordering` subsection documents that Deployment Portability is always injected first, before substitution slices and before feature slices

## Test Files

- `test/initiative.test.js` — 9 new tests covering: always injects deployment-portability slice; portability appears before user slices; portability content mentions known target; TBD framing when no target; ACs cover externalized config / ambient deps / config surface; known-target AC in artifact; portability classification correct; deployment_target in required not optional; deployment_target question appears before external_dependencies

## Summary of Change

- `buildInjectedSlices` was refactored to always prepend the `deployment-portability` slice unconditionally as the first entry. The slice carries two AC variants: a 4-item list when the target is known (including target-specific constraints), and a 3-item list for TBD/unknown framing. Both variants include ACs covering (a) externalized config, (b) declared ambient dependencies, and (c) documented configuration surface.
- The `deployment_target` field moved from `optional` to `required` in `INITIATIVE_QUESTIONS`, placed before `external_dependencies` in the required array.
- `buildInitiativeArtifact` separates injected slices from feature slices: injected slices appear in a new `## Infrastructure Slices` H2 section with per-slice H3 subsections showing title, classification, description, and ACs. Feature slices remain in the table but gain a Dependencies column when annotated.
- AGENTS.md documents the slice ordering: Deployment Portability always comes first.

## Tests Written First

- All 9 deployment-portability tests were written before the implementation was adjusted.
- Key TDD sequences: `portability slice artifact includes pre-populated ACs covering externalized config` drove the AC content; `portability slice with known target includes target-specific AC` drove the two-variant branching; `deployment_target in required not optional` drove moving the question.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.

## Behavior / Contract Validated

- `spec-guard initiative-questions` output includes at least one required question about whether the deployment target and process are known, TBD, or not yet considered.
- `spec_guard_save_initiative` always injects a deployment portability slice as the first entry in the output slice list regardless of whether `deployment_target` is provided; when `deployment_target` is present and non-empty the pre-populated slice description and AC include the known deployment constraints; when `deployment_target` is absent, empty, or TBD/unknown the AC uses the universal framing covering externalized configuration, no undeclared host assumptions, and documented configuration surface.
- The deployment portability slice appears before any substitution-related slices and before any feature slices in the proposed ordering.
- No question text and no proposed slice title, description, or classification references a specific platform, runtime, framework, or technology.
- The deployment portability slice is proposed with classification "Direct behavior with no new API or UI".
- The generated deployment portability slice spec includes acceptance criteria that cover: (a) all environment-specific configuration is externalized and not hardcoded, (b) any required ambient service, runtime version, or filesystem dependency is explicitly declared in the project's dependency manifest or equivalent, and (c) a documented configuration surface listing what a deployer must provide to run the system in any target environment; when the deployment target is known, the AC additionally covers (d) the specific constraints imposed by that target (artifact format, runtime expectations, host-provided services).

## Linked Documentation

- [AGENTS.md](../../AGENTS.md) — Proposed Slice Ordering section documents that Deployment Portability always appears first

## Dependency Integration

| Dependency | Integration code | Test |
|------------|-----------------|------|
| -          | -               | -    |

N/A — no external dependencies.

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All current-spec documentation obligations were satisfied.
- [x] All docs listed in Linked Documentation above are directly linked from the governing spec's Documentation Requirements section.
- [x] All docs listed in Linked Documentation above were validated against the implemented behavior, or confirmed not applicable.

## Remaining Risks / Follow-Ups

- None.
