# Spec: Spec Guard Bypass

## Status

Draft

## Problem / Goal

There are one-off instances where the user does not want a requested codebase change, feature, bugfix, or similar task to be bound to the full Spec Guard flow. The goal is to provide an explicit user choice at the start of each new task so the user can decide whether Spec Guard should govern that task.

## In Scope

- Update agent workflow instructions so every new codebase change request prompts the user to choose whether to use Spec Guard for that task.
- Define that answering yes requires the existing full Spec Guard workflow.
- Define that answering no bypasses Spec Guard entirely for the current task.
- Define that bypass must come from the user's explicit answer to the prompt.
- Define that the choice applies only to the current task or instruction.

## Out of Scope

- Spec Guard deciding which tasks should be bypassed.
- The model or agent inferring bypass eligibility from task size, file type, perceived risk, or any other heuristic.
- Changing the Spec Guard gates, validation rules, CLI behavior, or MCP tool behavior.
- Permanently disabling Spec Guard for future tasks unless the user explicitly answers no for those tasks.
- Removing or weakening the existing workflow when the user chooses to use Spec Guard.

## Expected Behavior

For every new requested codebase change, feature, bugfix, or similar task, the agent asks: "Do you want to use Spec Guard for this task?" If the user answers yes, the agent follows the existing full Spec Guard workflow. If the user answers no, the agent bypasses Spec Guard entirely for that task and may complete the requested work without drafting specs, running gates, or creating Spec Guard artifacts. The agent must not infer bypass eligibility; bypass only occurs from the user's explicit answer, and the answer applies only to the current task or instruction.

## Acceptance Criteria

- [ ] Agent instructions require asking whether to use Spec Guard at the start of every new codebase change request.
- [ ] Agent instructions state that a yes answer requires the existing full Spec Guard workflow.
- [ ] Agent instructions state that a no answer allows the agent to complete the current task without drafting specs, running gates, or creating Spec Guard artifacts.
- [ ] Agent instructions state that bypass must not be inferred from task size, file type, perceived risk, or any other heuristic.
- [ ] Agent instructions state that the user's answer applies only to the current task or instruction.
- [ ] Existing Spec Guard requirements remain unchanged when the user chooses to use Spec Guard.

## Dependencies

None.

## Open Questions

None.

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [ ] Direct behavior with no new API or UI
- [x] Operational/document deliverable
- [ ] Bugfix
