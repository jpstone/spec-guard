# Spec

## Title

Initiative External Dependency Infrastructure

## Status

Implemented

## Problem / Goal

During initiative decomposition, infrastructure for working with external service dependencies is never designed upfront. Two symmetric problems emerge as a result. First, substitute infrastructure — the ability to develop, test, and demo without requiring live external services — consistently emerges ad-hoc as a side effect of individual feature slices rather than as a deliberate project-level decision. Substitutes end up inconsistently organized, placed in the wrong module locations, and independently re-derived per slice, producing drift in toggle conventions, module organization, and shape contract discipline that should have been settled once for the entire project. Second, the path to running against real external services in development is equally ad-hoc: credentials are hardcoded, configuration is scattered, and new contributors have no documented path to switch from substitute mode to real-dependency mode. The initiative decomposition flow does not ask about external service dependencies at all, so agents have no signal to address either problem proactively.

## In Scope

- Add at least one required question to the initiative decomposition question set asking whether the system has external service dependencies that would be impractical to require during local development, automated testing, or stakeholder demos. This question is asked after the deployment target question established by the companion `initiative-deployment-portability` spec.
- When such dependencies are identified, automatically propose a single project-level substitution strategy slice as the first substitution-related slice in the proposal. All per-dependency substitution slices reference it via a `Dependencies` section entry in their slice spec.
- When external dependencies are identified, also propose a single project-level real-dependency development environment slice, positioned after the strategy slice and before any per-dependency substitution slices. This slice is not repeated per dependency boundary — it covers the full project's real-dependency configuration.
- Propose one per-dependency substitution infrastructure slice per dependency boundary, positioned after the real-dependency development environment slice and before the first feature slice that depends on the substituted service. The full sequencing within the substitution group is: strategy → real-dependency environment → per-dependency substitution slices → feature slices.
- The proposal logic is tool-enforced: `spec_guard_save_initiative` accepts an optional `external_dependencies` field (a list of dependency boundary names). When present and non-empty, the tool automatically prepends the strategy slice, real-dependency development environment slice, and one per-dependency substitution slice per entry to the output slice list in the correct order, with pre-populated descriptions and acceptance criteria. When the field is absent or empty, no substitution slices are added.
- Each slice entry in the `spec_guard_save_initiative` input may include an optional per-slice `external_dependencies` annotation — a list of boundary names from the top-level `external_dependencies` field — identifying which external services that feature slice depends on. When a feature slice carries this annotation, the tool pre-populates that slice's `Dependencies` section with references to: (a) the per-dependency substitution slice for each annotated boundary, and (b) the project-level real-dependency development environment slice. This ensures the feature slice spec is explicitly wired to the infrastructure it should plug into rather than requiring the implementing agent to discover that relationship from the initiative artifact separately.
- All three substitution-related slice types are proposed with classification "Direct behavior with no new API or UI". Implementing teams may reclassify if the strategy slice introduces a shared reusable API (e.g., a toggle factory), but the default proposal uses this classification.
- All three slice types are proposed with pre-populated descriptions and acceptance criteria embedded in the slice definition — not via a new spec template file. When `spec_guard_draft_spec` processes the slice, the resulting spec already contains the required AC content.
  - Strategy slice AC covers: selecting and documenting the project's toggle mechanism, establishing the module organization convention, defining the shape contract discipline all substitutes must follow, and real-dependency mode — when the toggle is in real-dependency mode the system connects to actual external services without code changes or recompilation.
  - Real-dependency development environment slice AC covers: how credentials and endpoint configuration for real external services are supplied to the system without hardcoding, how a developer switches from substitute mode to real-dependency mode using the same toggle defined in the strategy slice, documented steps a new contributor can follow to configure credentials and endpoint references and run the system in real-dependency mode, and that this slice is the project's canonical record for real-dependency configuration — as new external service boundaries are added to the project in subsequent slices or initiatives, this slice must be updated to include their credentials, endpoint configuration, and contributor steps.
  - Per-dependency substitution slice AC covers: a toggle mechanism consistent with the project strategy, domain-aligned placement of substitutes (same module or directory as the real implementation being substituted — not collected into a centralized substitutes directory), and an interface shape contract asserting the substitute matches the interface shape of the real implementation it replaces. The slice's pre-populated description always notes that the project-level real-dependency development environment slice must include credentials, endpoint configuration, and contributor steps for this boundary — if the real-dependency slice is being created alongside this slice (same initiative), this is addressed by that slice; if a real-dependency slice already exists in the project from a prior initiative, it must be updated to cover this boundary.
- All questions and slice proposals are framed without reference to any specific platform, runtime, framework, or technology.
- One per-dependency slice per external dependency boundary — the human may merge slices after reviewing the proposal.
- Update the initiative decomposition required question set exposed by `spec-guard initiative-questions` and the `spec_guard_initiative_questions` MCP tool. The dependency question must appear in the required (not optional) question set.
- Update AGENTS.md initiative flow section to reflect that a substitution strategy slice, real-dependency development environment slice, and per-dependency substitution slices may appear in the proposed breakdown and must be sequenced correctly.

## Out of Scope

- Choosing or specifying the toggle mechanism (env var, build flag, config file, compile-time constants) — that decision is platform-specific and is made when the generated slice spec is implemented, not here.
- Collecting all substitutes into a single centralized substitutes file — substitutes live alongside the real implementations they replace in domain-aligned modules.
- Enforcing interface shape contract at runtime — the shape contract is defined in the substitution slice spec as an acceptance criterion; runtime enforcement is the responsibility of that slice's implementation.
- General deployment portability (externalized configuration, no hardcoded host assumptions, documented configuration surface) — that is addressed in the companion `initiative-deployment-portability` spec. This spec is scoped to managing the relationship between the project and its external service dependencies specifically.
- Any new CLI command, API surface, or UI.
- Changes to the standard single-spec interview flow — this is initiative decomposition only.

## Users / Actors

- Agents running initiative decomposition on behalf of a developer — they receive the question and the proposed slice list
- Developers reviewing and accepting the proposed slice breakdown — they see substitution slices appear in the ordered proposal and can merge or reorder before proceeding
- Developers running the system against actual external services in development — they benefit from real-dependency mode being explicitly configured rather than discovered ad-hoc

## Expected Behavior

An agent running initiative decomposition encounters a required question about external service dependencies in the question sequence. When the user identifies dependencies, the agent receives a proposed slice list that opens with one substitution strategy slice, followed by one real-dependency development environment slice, followed by one per-dependency substitution slice per dependency boundary — each per-dependency slice positioned before its first dependent feature slice. All three slice types arrive with pre-populated descriptions and acceptance criteria: the strategy slice's AC covers establishing the project-wide toggle convention, module organization, shape contract discipline, and real-dependency mode; the real-dependency environment slice's AC covers credential/config supply, mode switching, new-contributor setup, and its role as the project's extensible canonical record for real-dependency configuration; each per-dependency slice's AC covers a dependency-specific substitute consistent with that strategy. When feature slices in the proposal are annotated with their external service dependencies, the generated feature slice specs include Dependencies references to the relevant per-dependency substitution slice and the real-dependency development environment slice, so the implementing agent knows exactly which infrastructure to plug into. When the user reports no external dependencies, the proposed slice list contains only feature slices with no substitution-related entries.

## Acceptance Criteria

- [ ] `spec-guard initiative-questions` output includes at least one question about external service dependencies that would be impractical to require during local development, automated testing, or stakeholder demos, and that question appears in the required (not optional) question set.
- [ ] When external dependencies are identified during initiative decomposition, the proposed slice list includes exactly one substitution strategy slice, exactly one real-dependency development environment slice, and at least one per-dependency substitution slice per identified dependency boundary.
- [ ] `spec_guard_save_initiative` accepts an optional `external_dependencies` field; when present and non-empty, the tool automatically injects the strategy slice, real-dependency development environment slice, and one per-dependency substitution slice per named boundary into the output slice list in the correct order, without requiring the calling agent to include them explicitly; when the field is absent or empty, no substitution slices are injected.
- [ ] All substitution-related slices (strategy, real-dependency development environment, and per-dependency substitution slices) appear before any feature slice that depends on a substituted service; within the substitution group, the strategy slice appears first, the real-dependency development environment slice appears second, and per-dependency substitution slices appear after both.
- [ ] Each per-dependency substitution slice is positioned before the first feature slice in the proposed ordering that depends on the substituted service.
- [ ] No question text and no proposed slice title, description, or classification references a specific platform, runtime, framework, or technology.
- [ ] When the user indicates no external service dependencies exist, no substitution strategy slice, no real-dependency development environment slice, and no per-dependency substitution slice appears in the proposed slice list.
- [ ] The generated substitution strategy slice spec includes acceptance criteria that cover: (a) selecting and documenting the project's toggle mechanism, (b) establishing the module organization convention for all substitutes in the project, (c) defining the shape contract discipline all substitutes must follow, and (d) real-dependency mode: when the toggle is in real-dependency mode, the system connects to actual external services without code changes or recompilation.
- [ ] The generated real-dependency development environment slice spec includes acceptance criteria that cover: (a) how credentials and endpoint configuration for real external services are supplied to the system without hardcoding, (b) how a developer switches from substitute mode to real-dependency mode using the same toggle mechanism defined in the substitution strategy, (c) documented steps a new contributor can follow to configure credentials and endpoint references and run the system in real-dependency mode, and (d) that this slice is the project's canonical record for real-dependency configuration and must be updated as new external service boundaries are added in subsequent slices or initiatives.
- [ ] The generated per-dependency substitution slice spec references the substitution strategy slice via a `Dependencies` section entry and includes acceptance criteria that cover: (a) a toggle mechanism consistent with the project strategy, (b) placement of substitutes in domain-aligned modules (same module or directory as the real implementation being substituted), and (c) an interface shape contract asserting the substitute matches the interface shape of the real implementation it replaces.
- [ ] When a feature slice in the `spec_guard_save_initiative` input carries a per-slice `external_dependencies` annotation, the generated feature slice spec includes a `Dependencies` section referencing: (a) the per-dependency substitution slice for each annotated boundary, and (b) the project-level real-dependency development environment slice.

## Edge Cases

- Only one external dependency identified: still propose all three substitution-related slices — strategy, real-dependency environment, and one per-dependency substitution slice — three slices total.
- Two feature slices depend on the same external service: a single per-dependency substitution slice covers both; positioned before the first of the two dependent feature slices.
- Multiple distinct external dependencies identified: one strategy slice (always, shared) and one per-dependency slice per boundary, each positioned before its first dependent feature slice.
- A per-dependency substitution slice has no identifiable dependent feature slices yet: position it immediately after the real-dependency development environment slice; note in its description that dependent slices should be confirmed during implementation.
- The strategy slice itself has no dependent feature slices — it is always the first substitution-related slice in the proposal regardless of ordering logic.
- Non-interactive mode (`spec-guard initiative --from-json` / `spec_guard_save_initiative` with a JSON payload): if the payload omits external dependency information, treat as no dependencies identified — no substitution slices proposed. If the payload explicitly lists external dependencies, apply the same three-slice proposal (strategy → real-dependency environment → per-dependency substitution slices) as the interactive flow.
- The real-dependency development environment slice is a single project-level slice regardless of how many dependency boundaries are identified — it is not repeated per dependency.
- Automated CI pipelines run in substitute mode via the same toggle; real-dependency mode is for manual development use. The real-dependency slice's AC must not require credentials accessible only in CI.
- Duplicate boundary names in `external_dependencies`: deduplicate before generating slices — one per unique boundary name only.
- Both `external_dependencies` and `deployment_target` are provided to `spec_guard_save_initiative`: both injection paths run; the deployment portability slice appears first, followed by the substitution strategy slice, real-dependency development environment slice, per-dependency substitution slices, and feature slices.
- New external service boundary added to a project that already has substitution infrastructure from a prior initiative (via a new initiative or a standalone per-dependency substitution slice): `spec_guard_save_initiative` injects only a substitution strategy slice (if not already present) and a per-dependency substitution slice for the new boundary — no new real-dependency development environment slice is proposed. The per-dependency slice's pre-populated description notes the existing real-dependency slice must be updated to cover this boundary.
- Feature slice added to a project with existing substitution infrastructure outside of an initiative (via `spec_guard_draft_spec` directly): the initiative artifact is the record of what substitution infrastructure exists. AGENTS.md guidance instructs agents to check for existing per-dependency substitution slices and the real-dependency development environment slice in the initiative artifact and reference them in the new feature slice's `Dependencies` section before proceeding to implementation.

## Documentation Requirements

- [AGENTS.md](../../AGENTS.md) — update initiative flow section to reflect that a substitution strategy slice, real-dependency development environment slice, and per-dependency substitution slices may appear in the proposed breakdown and must be sequenced correctly.
- [AGENTS.md](../../AGENTS.md) — add guidance that when implementing a feature slice on a project with existing substitution infrastructure, agents must check the initiative artifact for applicable per-dependency substitution slices and the real-dependency development environment slice, and reference them in the feature slice's `Dependencies` section before proceeding to implementation.

## Dependencies

- None.

## Open Questions

- None.

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [x] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
- [ ] Bugfix
