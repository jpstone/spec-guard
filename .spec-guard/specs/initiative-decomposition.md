# Spec: Initiative Decomposition

## Status

Implemented

## Problem / Goal

Developers often have a broad app or product idea that spans many individual features. Spec Guard currently has no structured way to capture that top-level concept or guide an agent through decomposing it into individual specs. Without this, the agent has no systematic mechanism to break a large idea into properly classified, trackable feature slices â€” and no artifact records that the decomposition happened.

## In Scope

- `spec_guard_initiative_questions` MCP tool â€” returns a structured question list for gathering initiative context from the developer
- `spec_guard_save_initiative` MCP tool â€” accepts initiative name, title, description, and an approved slice list; validates classifications and names; writes `.spec-guard/initiatives/<name>.md`; returns slice info for use with `spec_guard_draft_spec`
- `spec-guard initiative-questions` CLI command â€” prints the structured initiative question list; mirrors `spec_guard_initiative_questions`
- `spec-guard initiative <name>` CLI command â€” interactive wizard that gathers initiative context and slice definitions, then saves the artifact; mirrors `spec_guard_save_initiative`; follows the same pattern as `spec-guard draft`
- `templates/initiative.md` â€” initiative artifact template
- `spec-guard init` updated to create the `.spec-guard/initiatives/` directory

## Out of Scope

- AI-powered automatic decomposition without human review and approval
- Dependency or priority ordering between slices
- Modifying or linking existing specs to an initiative after the fact
- Changes to the gate workflow for individual specs produced by the decomposition

## Expected Behavior

An agent calls `spec_guard_initiative_questions` to receive a structured list of questions covering app purpose, intended users, core feature areas, integrations, and explicit out-of-scope items. After gathering answers from the developer and proposing a breakdown, the agent calls `spec_guard_save_initiative` with the approved slice list. The tool validates each slice's classification and name, writes the initiative artifact to `.spec-guard/initiatives/<name>.md`, and returns the slice names so the agent can proceed to `spec_guard_draft_spec` for each one in sequence.

## Acceptance Criteria

- [ ] `spec_guard_initiative_questions` returns a structured question list with required and optional questions covering app purpose, users, feature areas, integrations, and out-of-scope items
- [ ] `spec_guard_save_initiative` writes a valid initiative artifact to `.spec-guard/initiatives/<name>.md` given name, title, description, and a slices array (each slice: name, title, description, classification)
- [ ] `spec_guard_save_initiative` returns each slice's name and suggested spec path for use with `spec_guard_draft_spec`
- [ ] `spec_guard_save_initiative` returns an error if any slice has an unrecognized classification
- [ ] `spec_guard_save_initiative` returns an error if any slice name is not URL-safe (contains characters invalid for a filename)
- [ ] `spec_guard_save_initiative` returns an error if a slice name would conflict with an existing spec in `.spec-guard/specs/`
- [ ] `spec-guard initiative-questions` prints the same structured question list as `spec_guard_initiative_questions`; supports `--json`
- [ ] `spec-guard initiative <name>` runs an interactive wizard collecting initiative context and slices, then saves the artifact; exits 1 if file already exists
- [ ] `spec-guard initiative <name>` applies the same validation as `spec_guard_save_initiative` (classifications, filename safety, conflict detection)
- [ ] `spec-guard init` creates the `.spec-guard/initiatives/` directory

## Dependencies

- Contract: `.spec-guard/contracts/initiative-api-contract.md`

## Open Questions

## Work Classification

- [x] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [ ] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
