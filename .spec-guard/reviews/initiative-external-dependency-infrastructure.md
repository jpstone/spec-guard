# Implementation Review

## Linked Spec

[initiative-external-dependency-infrastructure](../specs/initiative-external-dependency-infrastructure.md)

## Linked Contract

<!-- Direct behavior with no new API or UI — no contract required. -->

## Classification

Direct behavior with no new API or UI

## Implementation Files

- `src/initiative.js` — `buildInjectedSlices()` injects substitution infrastructure when `external_dependencies` is non-empty: one `substitution-strategy` slice, one `real-dep-env` slice, and one per-dependency `${slug}-substitution` slice per unique dependency boundary; each per-dep slice carries `dependencies: ['substitution-strategy']`; all slices include pre-populated `acceptance_criteria` arrays covering toggle mechanism, module organization, shape contract, and real-dependency mode (strategy); credentials/config, mode switching, contributor steps, and canonical record (real-dep-env); per-dep: toggle, domain-aligned placement, shape contract
- `src/initiative.js` — per-slice annotation (AC11): after building injected slices, `saveInitiative` maps over user-provided slices and, for any slice that carries an `external_dependencies` annotation, populates a `dependencies` field referencing the relevant `${dep}-substitution` and `real-dep-env` slice names; unannotated slices are unchanged
- `src/initiative.js` — `INITIATIVE_QUESTIONS.required` includes `external_dependencies` question at position 5 (after `deployment_target`); question text is technology-agnostic
- `src/initiative.js` — `saveInitiative` return value includes full slice data: `name`, `title`, `description`, `acceptance_criteria`, `dependencies`, and `suggestedSpecPath` for all slices including injected ones
- `src/initiative.js` — duplicate `external_dependencies` entries are deduplicated before generating slices
- `src/initiative.js` — `buildInitiativeArtifact` renders injected slices in `## Infrastructure Slices` section with per-slice ACs; feature slices in the table include a Dependencies cell when `slice.dependencies` is non-empty
- `AGENTS.md` — `### Proposed Slice Ordering` documents substitution strategy → real-dep-env → per-dep order; `### Feature Slices with Existing Substitution Infrastructure` guidance instructs agents to check the initiative artifact and reference existing infra slices in a feature slice's Dependencies section

## Test Files

- `test/initiative.test.js` — 13 new tests covering: no substitution slices when external_dependencies absent; substitution slices injected when external_dependencies provided; duplicate deps deduplicated; infra slices appear before feature slices; substitution-strategy AC covers toggle/module-org/shape-contract/real-dep-mode; real-dep-env AC covers credentials/contributor-steps/canonical-record; per-dep slice AC covers domain-aligned placement and shape contract; per-dep result includes dependencies referencing substitution-strategy; artifact shows Dependencies: substitution-strategy; feature slice with annotation gets dependencies field; unannotated slice gets no dependencies; per-slice annotation appears in artifact; external_dependencies in required not optional; AGENTS.md documents substitution infra and sequencing; AGENTS.md guides agents to reference infra in Dependencies section

## Summary of Change

- `buildInjectedSlices` gained the full substitution infrastructure injection path: when `external_dependencies` is non-empty, three slice types are generated (strategy, real-dep-env, per-dep) with rich pre-populated descriptions and ACs. All three are prepended after the portability slice and before user-provided slices.
- Per-dep slices include `dependencies: ['substitution-strategy']` in both the returned slice data and the rendered artifact.
- The per-slice annotation pass (`enrichedSlices` mapping) reads each user slice's optional `external_dependencies` field and, when it references any known top-level dependency, populates a `dependencies` array with `${dep}-substitution` and `real-dep-env` references.
- `external_dependencies` moved to `required` in `INITIATIVE_QUESTIONS`, positioned after `deployment_target`.
- AGENTS.md received two new subsections documenting the ordering and the agent guidance for existing substitution infrastructure.

## Tests Written First

- All 13 external-dependency-infrastructure tests were written before the corresponding implementation changes.
- Key TDD sequences: `substitution-strategy AC covers toggle/module-org/shape-contract/real-dep-mode` drove the `substitution-strategy` slice's AC content; `per-dep slice result includes dependencies referencing substitution-strategy` (AC10) drove the `dependencies` field on per-dep slices; `feature slice with annotation gets dependencies field` (AC11) drove the `enrichedSlices` mapping pass.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.

## Behavior / Contract Validated

- `spec-guard initiative-questions` output includes at least one question about external service dependencies that would be impractical to require during local development, automated testing, or stakeholder demos, and that question appears in the required (not optional) question set.
- When external dependencies are identified during initiative decomposition, the proposed slice list includes exactly one substitution strategy slice, exactly one real-dependency development environment slice, and at least one per-dependency substitution slice per identified dependency boundary.
- `spec_guard_save_initiative` accepts an optional `external_dependencies` field; when present and non-empty, the tool automatically injects the strategy slice, real-dependency development environment slice, and one per-dependency substitution slice per named boundary into the output slice list in the correct order, without requiring the calling agent to include them explicitly; when the field is absent or empty, no substitution slices are injected.
- All substitution-related slices (strategy, real-dependency development environment, and per-dependency substitution slices) appear before any feature slice that depends on a substituted service; within the substitution group, the strategy slice appears first, the real-dependency development environment slice appears second, and per-dependency substitution slices appear after both.
- Each per-dependency substitution slice is positioned before the first feature slice in the proposed ordering that depends on the substituted service.
- No question text and no proposed slice title, description, or classification references a specific platform, runtime, framework, or technology.
- When the user indicates no external service dependencies exist, no substitution strategy slice, no real-dependency development environment slice, and no per-dependency substitution slice appears in the proposed slice list.
- The generated substitution strategy slice spec includes acceptance criteria that cover: (a) selecting and documenting the project's toggle mechanism, (b) establishing the module organization convention for all substitutes in the project, (c) defining the shape contract discipline all substitutes must follow, and (d) real-dependency mode: when the toggle is in real-dependency mode, the system connects to actual external services without code changes or recompilation.
- The generated real-dependency development environment slice spec includes acceptance criteria that cover: (a) how credentials and endpoint configuration for real external services are supplied to the system without hardcoding, (b) how a developer switches from substitute mode to real-dependency mode using the same toggle mechanism defined in the substitution strategy, (c) documented steps a new contributor can follow to configure credentials and endpoint references and run the system in real-dependency mode, and (d) that this slice is the project's canonical record for real-dependency configuration and must be updated as new external service boundaries are added in subsequent slices or initiatives.
- The generated per-dependency substitution slice spec references the substitution strategy slice via a `Dependencies` section entry and includes acceptance criteria that cover: (a) a toggle mechanism consistent with the project strategy, (b) placement of substitutes in domain-aligned modules (same module or directory as the real implementation being substituted), and (c) an interface shape contract asserting the substitute matches the interface shape of the real implementation it replaces.
- When a feature slice in the `spec_guard_save_initiative` input carries a per-slice `external_dependencies` annotation, the generated feature slice spec includes a `Dependencies` section referencing: (a) the per-dependency substitution slice for each annotated boundary, and (b) the project-level real-dependency development environment slice.

## Linked Documentation

- [AGENTS.md](../../AGENTS.md) — Proposed Slice Ordering and Feature Slices with Existing Substitution Infrastructure sections added

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
