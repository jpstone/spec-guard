# Implementation Review

## Linked Spec

`.spec-guard/specs/initiative-decomposition.md`

## Classification

Reusable non-UI API

## Summary of Change

- Added `src/initiative.js` exporting `initiativeQuestions()`, `saveInitiative()`, and `initiativeInteractive()`
- Added `spec-guard initiative-questions` and `spec-guard initiative <name>` CLI commands
- Added `spec_guard_initiative_questions` and `spec_guard_save_initiative` MCP tools
- Updated `spec-guard init` to create `.spec-guard/initiatives/` directory
- Added `templates/initiative.md` initiative artifact template
- Updated AGENTS.md with initiative decomposition guidance and tool references

## Tests Written First

- `test/initiative.test.js` — 16 tests covering `initiativeQuestions()`, `saveInitiative()` (6 validation cases), CLI commands, and MCP tools

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.
- [x] All 16 tests failed with "Cannot find module '../src/initiative.js'" before `src/initiative.js` was written. Confirmed at Gate 3.

## Behavior / Contract Validated

- `spec_guard_initiative_questions` returns a structured question list with required and optional questions covering app purpose, users, feature areas, integrations, and out-of-scope items
- `spec_guard_save_initiative` writes a valid initiative artifact to `.spec-guard/initiatives/<name>.md` given name, title, description, and a slices array (each slice: name, title, description, classification)
- `spec_guard_save_initiative` returns each slice's name and suggested spec path for use with `spec_guard_draft_spec`
- `spec_guard_save_initiative` returns an error if any slice has an unrecognized classification
- `spec_guard_save_initiative` returns an error if any slice name is not URL-safe (contains characters invalid for a filename)
- `spec_guard_save_initiative` returns an error if a slice name would conflict with an existing spec in `.spec-guard/specs/`
- `spec-guard initiative-questions` prints the same structured question list as `spec_guard_initiative_questions`; supports `--json`
- `spec-guard initiative <name>` runs an interactive wizard collecting initiative context and slices, then saves the artifact; exits 1 if file already exists
- `spec-guard initiative <name>` applies the same validation as `spec_guard_save_initiative` (classifications, filename safety, conflict detection)
- `spec-guard init` creates the `.spec-guard/initiatives/` directory

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] Durable contract documentation was updated. (`AGENTS.md` updated with initiative flow, directory structure, CLI and MCP references)

## Remaining Risks / Follow-Ups

- None
