# Spec

## Title

Initiative Deployment Portability

## Status

Draft

## Problem / Goal

During initiative decomposition, no question prompts teams to consider where and how the project will eventually be deployed. As a result, implementation decisions routinely embed environment-specific assumptions — hardcoded hostnames, ports, file paths, ambient services, or runtime version dependencies — that only surface as constraints when the project reaches deployment. By that point they are expensive to undo. This concern is orthogonal to whether the project has external service dependencies: even a project with no external services can bake in host assumptions that block deployment. The initiative decomposition flow should surface this concern upfront and propose a slice that ensures the implementation makes no assumptions that would block deployment to any target environment.

## In Scope

- Add at least one required question to the initiative decomposition question set asking whether the deployment target and process are known, TBD, or not yet considered.
- Always propose a single deployment portability slice as the first slice in the initiative proposal, regardless of the answer — before any substitution slices and before any feature slices.
- The proposal logic is tool-enforced: `spec_guard_save_initiative` unconditionally injects the deployment portability slice as the first entry in the output slice list — the slice is always present regardless of input. Unlike `external_dependencies`, which controls whether substitution slices are injected at all, `deployment_target` is a content-only field: its value shapes the pre-populated description and AC of the always-injected slice. When `deployment_target` is present and non-empty, the pre-populated slice description and AC include the known constraints the implementation must satisfy. When `deployment_target` is absent, empty, or explicitly TBD/unknown, the pre-populated description and AC focus on making no environment-specific assumptions and documenting the full configuration surface.
- The deployment portability slice is proposed with classification "Direct behavior with no new API or UI".
- The slice is proposed with a pre-populated description and acceptance criteria embedded in the slice definition — not via a new spec template file. When `spec_guard_draft_spec` processes the slice, the resulting spec already contains the required AC content.
  - When deployment target is known: AC covers (a) all environment-specific configuration is externalized and not hardcoded, (b) any required ambient service, runtime version, or filesystem dependency is explicitly declared in the project's dependency manifest or equivalent, (c) a documented configuration surface listing what a deployer must provide to run the system in any target environment, and (d) the specific constraints imposed by the known deployment target (artifact format, runtime expectations, host-provided services).
  - When TBD or unknown: AC covers (a) all environment-specific configuration (hostnames, ports, credentials, feature flags, runtime paths) is externalized and not hardcoded anywhere in the implementation, (b) no undeclared assumptions about the host environment — any required ambient service, runtime version, or filesystem layout is declared explicitly in the project's dependency manifest or equivalent, and (c) a documented configuration surface: the complete inventory of what any deployer must provide to run the system in a new environment.
- All questions and slice proposals are framed without reference to any specific platform, runtime, framework, or technology.
- Update the initiative decomposition required question set exposed by `spec-guard initiative-questions` and the `spec_guard_initiative_questions` MCP tool. The deployment question must appear in the required (not optional) question set.
- Update AGENTS.md initiative flow section to reflect that a deployment portability slice always appears first in the proposed breakdown.

## Out of Scope

- Designing or implementing the deployment process itself — CI/CD pipelines, container definitions, cloud provider configuration, or infrastructure-as-code. That work belongs in deployment-specific slices chosen by the team after the target is known.
- Specifying the externalization mechanism (environment variables, config files, secrets managers, compile-time constants) — that decision is platform-specific and is made when the generated slice spec is implemented.
- Enforcing configuration externalization at runtime — that is the responsibility of the portability slice's implementation.
- Per-feature-slice Dependencies references to the deployment portability slice — portability is a project-level concern enforced by the portability slice's implementation, not by individual feature slices referencing it. Feature slices inherit the portability discipline from the project; they do not cite it as a dependency.
- External service dependency management (substitutes, toggles, real-dependency mode) — that is addressed in the companion `initiative-external-dependency-infrastructure` spec.
- Any new CLI command, API surface, or UI.
- Changes to the standard single-spec interview flow — this is initiative decomposition only.

## Users / Actors

- Agents running initiative decomposition on behalf of a developer — they receive the question and the proposed slice list
- Developers reviewing and accepting the proposed slice breakdown — they see the deployment portability slice appear first in the ordered proposal
- Deployers who will eventually wire the project into a deployment process — they benefit from an implementation that makes no hidden assumptions

## Expected Behavior

An agent running initiative decomposition encounters a required question about the deployment target and process. Regardless of the answer, a deployment portability slice is proposed as the first slice in the output. When the target is known, the slice's pre-populated AC includes the specific deployment constraints. When TBD or unknown, the AC covers externalized configuration, no undeclared host assumptions, and a documented configuration surface. When both deployment portability and substitution infrastructure slices are proposed, the deployment portability slice always appears first.

## Acceptance Criteria

- [ ] `spec-guard initiative-questions` output includes at least one required question about whether the deployment target and process are known, TBD, or not yet considered.
- [ ] `spec_guard_save_initiative` always injects a deployment portability slice as the first entry in the output slice list regardless of whether `deployment_target` is provided; when `deployment_target` is present and non-empty the pre-populated slice description and AC include the known deployment constraints; when `deployment_target` is absent, empty, or TBD/unknown the AC uses the universal framing covering externalized configuration, no undeclared host assumptions, and documented configuration surface.
- [ ] The deployment portability slice appears before any substitution-related slices and before any feature slices in the proposed ordering.
- [ ] No question text and no proposed slice title, description, or classification references a specific platform, runtime, framework, or technology.
- [ ] The deployment portability slice is proposed with classification "Direct behavior with no new API or UI".
- [ ] The generated deployment portability slice spec includes acceptance criteria that cover: (a) all environment-specific configuration is externalized and not hardcoded, (b) any required ambient service, runtime version, or filesystem dependency is explicitly declared in the project's dependency manifest or equivalent, and (c) a documented configuration surface listing what a deployer must provide to run the system in any target environment; when the deployment target is known, the AC additionally covers (d) the specific constraints imposed by that target (artifact format, runtime expectations, host-provided services).

## Edge Cases

- Deployment target is known but process is TBD: treat as partially known — include the target constraints in the AC but frame the process portion as TBD/unknown.
- Initiative has only one feature slice: still propose the deployment portability slice first.
- Both deployment portability and substitution infrastructure slices are proposed in the same initiative: deployment portability appears first; the full proposed ordering is: deployment portability → substitution strategy → real-dependency development environment → per-dependency substitution slices → feature slices.
- Non-interactive mode (`spec-guard initiative --from-json` / `spec_guard_save_initiative` with a JSON payload): if the payload omits `deployment_target`, treat as unknown — inject the portability slice with TBD/unknown framing.
- Deployment target explicitly stated as "unknown" or "not yet decided": treated identically to an absent `deployment_target` field — TBD/unknown framing applies.
- Second initiative run on a project that already has a portability slice implemented: `spec_guard_save_initiative` still injects a portability slice unconditionally. The developer reviews the proposal and merges or replaces the existing portability slice spec if the constraints have changed; the tool does not attempt to detect whether a portability slice already exists.
- Question ordering relative to the external dependencies question: the deployment target question is asked before the external service dependency question in the required question sequence — deployment is the broader project-level concern and should be established first.

## Documentation Requirements

- [AGENTS.md](../../AGENTS.md) — update initiative flow section to reflect that a deployment portability slice always appears first in the proposed breakdown, before substitution slices and feature slices.

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
