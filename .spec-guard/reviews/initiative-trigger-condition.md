# Implementation Review

## Linked Spec

[initiative-trigger-condition](../specs/initiative-trigger-condition.md)

## Linked Contract

<!-- Direct behavior with no new API or UI — no contract required. -->

## Classification

Direct behavior with no new API or UI

## Implementation Files

- `src/initiative.js` — `specsExist()` helper returns `false` when `.spec-guard/specs/` is absent or has no `.md` files; `saveInitiative()` calls it and returns an error if specs already exist; `initiativeQuestionsWithContext()` returns `{ ...INITIATIVE_QUESTIONS, specs_exist: boolean }` by calling `specsExist()`
- `bin/spec-guard.js` — `initiativeCommand` propagates the error from `saveInitiative()` as a BLOCKER with exit code 1; `initiativeQuestionsCommand` exposes `specs_exist` in JSON output via `initiativeQuestionsWithContext()`
- `AGENTS.md` — replaced signal-based heuristic trigger section with the deterministic rule: use initiative flow when `.spec-guard/specs/` contains no `.md` files; removed example phrases and "if unsure: ask" guidance

## Test Files

- `test/initiative.test.js` — 8 new tests covering: saveInitiative error when specs exist; saveInitiative succeeds on greenfield; CLI initiative error when specs exist; non-.md files ignored by trigger; initiativeQuestionsWithContext returns specs_exist: false / true; CLI initiative-questions --json includes specs_exist boolean; MCP spec_guard_initiative_questions includes specs_exist; AGENTS.md deterministic trigger, no "if unsure: ask", no example phrases

## Summary of Change

- `saveInitiative()` enforces the trigger condition at the function level: if `.spec-guard/specs/` contains any `.md` files at call time, the function returns an error and writes nothing. This makes the condition testable independent of CLI/MCP routing.
- `initiativeQuestionsWithContext()` surfaced via both CLI (`initiative-questions --json`) and MCP (`spec_guard_initiative_questions`) adds a `specs_exist` boolean so agents can detect the trigger condition before investing in the full question sequence.
- `bin/spec-guard.js` propagates the error from `saveInitiative()` with exit code 1 for the `initiative --from-json` path; the interactive path checks `specsExist()` before the question loop.
- AGENTS.md now states: use the initiative flow when `.spec-guard/specs/` contains no `.md` files; use the standard single-spec flow when one or more specs exist. No example phrases or judgment-call guidance remain.

## Tests Written First

- `saveInitiative returns error when specs already exist (trigger condition)` — verifies the error path
- `saveInitiative succeeds when no specs exist (greenfield)` — verifies the happy path
- `CLI initiative --from-json returns error when specs already exist` — verifies CLI exit code 1
- `saveInitiative succeeds when specs dir contains only non-.md files` — edge case: `.gitkeep` et al. are ignored
- `initiativeQuestionsWithContext returns specs_exist: false when no specs` — AC for greenfield detection
- `initiativeQuestionsWithContext returns specs_exist: true when specs exist` — AC for established project detection
- `initiative-questions --json includes specs_exist boolean` — CLI surface
- `spec_guard_initiative_questions MCP tool includes specs_exist boolean` — MCP surface
- `AGENTS.md initiative section states the deterministic trigger condition` — documentation AC
- `AGENTS.md initiative section does not contain "if you are unsure: ask" guidance` — documentation AC
- `AGENTS.md initiative section does not list example trigger phrases` — documentation AC

## Failure-First Confirmation

- [x] If not run, the concrete reason is recorded here: Tests for the trigger condition AC were written alongside the implementation in the same session; the core `specsExist` guard was a pre-existing mechanism already in place (it was already called in `initiativeInteractive`). The new `initiativeQuestionsWithContext` function and the `specs_exist` field were added with tests written before the implementation in the same pass.

## Behavior / Contract Validated

- `spec_guard_save_initiative` returns an error and writes no initiative artifact if `.spec-guard/specs/` contains one or more spec files at the time of the call.
- `spec-guard initiative <name>` exits with a non-zero error code and writes nothing if `.spec-guard/specs/` contains one or more spec files.
- `spec_guard_initiative_questions` response includes a `specs_exist` boolean field; when `true`, the response message advises using the standard spec flow instead of the initiative flow.
- `spec-guard initiative-questions` output includes a `specs_exist` indicator; when specs exist, the output advises using the standard spec flow.
- AGENTS.md initiative flow section states the deterministic trigger condition: use the initiative flow when `.spec-guard/specs/` is empty; use the standard spec flow when specs exist.
- AGENTS.md initiative flow section no longer contains signal-based example phrases or an "if you are unsure: ask" instruction for the trigger decision.

## Linked Documentation

- [AGENTS.md](../../AGENTS.md) — initiative trigger section replaced with deterministic rule

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
