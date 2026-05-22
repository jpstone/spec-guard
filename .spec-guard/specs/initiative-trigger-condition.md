# Spec

## Title

Initiative Trigger Condition

## Status

Draft

## Problem / Goal

The initiative flow is currently triggered by agent signal-recognition — heuristic pattern-matching against example phrases in AGENTS.md. This is unreliable: agents can miss broad-scope requests that don't match the example phrases, apply the rule inconsistently across different agents and contexts, and spend judgment on a question that the project itself already answers. The correct signal is already present on disk: if no specs exist, the project is starting from scratch and the initiative flow is the right entry point. If specs already exist, the work is a targeted addition or change to an established project and the standard single-spec flow applies. Replacing the heuristic with this deterministic condition makes the trigger reliable, consistent, and machine-verifiable.

## In Scope

- Replace the signal-based initiative trigger guidance in AGENTS.md with a single deterministic rule: use the initiative flow when `.spec-guard/specs/` contains no spec files; use the standard single-spec flow when one or more spec files exist.
- Remove the example-phrase signal list and the "if you are unsure: ask" guidance from the AGENTS.md initiative trigger section — the condition is deterministic and requires no judgment call.
- `spec_guard_save_initiative` and `spec-guard initiative <name>` enforce this at the tool level: both return an error if `.spec-guard/specs/` already contains one or more spec files at the time of the call. This prevents the initiative flow from being used to add slices to an established project and makes the condition testable.
- `spec_guard_initiative_questions` and `spec-guard initiative-questions` include a `specs_exist` boolean in their response. When `true`, the response indicates the caller should use the standard spec flow instead. These commands do not hard-error — they surface the signal so the agent can act on it before investing in the full question sequence.
- Update AGENTS.md initiative flow section to reflect the new deterministic trigger condition.

## Out of Scope

- An override mechanism to force the initiative flow on a project with existing specs — if new broad-scope work needs to be decomposed on an established project, the standard spec flow handles each new slice independently.
- Changing the initiative flow itself (questions, slice proposals, artifact format, sequencing) — this spec governs the trigger condition only.
- Any new CLI command, API surface, or UI beyond the `specs_exist` field addition to `spec_guard_initiative_questions` and `spec-guard initiative-questions`.
- Changes to the standard single-spec interview flow.

## Users / Actors

- Agents starting a new project with no existing specs — they receive a clear, deterministic signal to use the initiative flow
- Agents working on an established project — they receive a clear, deterministic signal to use the standard spec flow without needing to assess request breadth
- Developers — they benefit from consistent agent behavior regardless of which agent or context is driving the workflow

## Expected Behavior

An agent receiving any request on a project with no existing specs in `.spec-guard/specs/` uses the initiative flow. An agent receiving any request on a project with one or more existing specs uses the standard single-spec flow, regardless of how broad the request appears. If an agent attempts to call `spec_guard_save_initiative` or `spec-guard initiative` on a project that already has specs, the tool returns an error and writes nothing.

## Acceptance Criteria

- [ ] `spec_guard_save_initiative` returns an error and writes no initiative artifact if `.spec-guard/specs/` contains one or more spec files at the time of the call.
- [ ] `spec-guard initiative <name>` exits with a non-zero error code and writes nothing if `.spec-guard/specs/` contains one or more spec files.
- [ ] `spec_guard_initiative_questions` response includes a `specs_exist` boolean field; when `true`, the response message advises using the standard spec flow instead of the initiative flow.
- [ ] `spec-guard initiative-questions` output includes a `specs_exist` indicator; when specs exist, the output advises using the standard spec flow.
- [ ] AGENTS.md initiative flow section states the deterministic trigger condition: use the initiative flow when `.spec-guard/specs/` is empty; use the standard spec flow when specs exist.
- [ ] AGENTS.md initiative flow section no longer contains signal-based example phrases or an "if you are unsure: ask" instruction for the trigger decision.

## Edge Cases

- `.spec-guard/specs/` does not exist (project not yet initialized): treat as empty — initiative flow is permitted; `specs_exist` is `false`.
- `.spec-guard/specs/` exists but contains no `.md` files: treat as empty — initiative flow is permitted; `specs_exist` is `false`.
- All existing specs have `Status: Implemented`: specs still exist — standard flow applies; spec status does not affect the trigger condition.
- Non-`.md` files present in `.spec-guard/specs/` (e.g., a `.gitkeep`): ignored — only `.md` files count toward the specs-exist check.
- Agent receives a request that sounds like a multi-feature initiative but specs already exist: use the standard spec flow for each capability independently; the trigger condition is not overridden by the apparent breadth of the request.

## Documentation Requirements

- [AGENTS.md](../../AGENTS.md) — replace signal-based initiative trigger section with the deterministic condition; remove example phrases and "if unsure: ask" guidance.

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
