# Spec

## Title

Spec Authoring Lifecycle Gaps

## Status

Implemented

## Problem / Goal

Two gaps in the spec authoring flow were observed. First, the spec status was not updated at each lifecycle stage — it stayed in Draft through presentation and human approval rather than advancing to Pending Approval when presented and Ready for Implementation when approved. No mechanical check enforced these transitions, so an agent could skip them silently. Second, for Operational/document deliverable classification, the draft tool generated 'No documentation changes required' in Documentation Requirements — which is incorrect since the deliverable of that classification is itself a documentation change.

## In Scope

- Add SG-STATUS-001 WARNING to spec-guard check --warnings that fires when spec status is still Draft — blocking Gate 2 until the agent updates status to at least Pending Approval
- Add a `spec-guard set-status <name> <status>` CLI command and matching `spec_guard_set_status` MCP tool that updates the spec's Status field and regenerates the artifact index atomically
- AGENTS.md instructs the agent to use `spec-guard set-status` (or `spec_guard_set_status`) for all status changes — never edit the spec file directly to change status — and to set Pending Approval when presenting, Ready for Implementation when approved
- For Operational/document deliverable classification, the draft tool's Documentation Requirements default is replaced with a placeholder prompting the agent to list the actual deliverable documents

## Out of Scope

- Mechanical gate enforcement of the Pending Approval to Ready for Implementation transition — SG-STATUS-001 only requires status be at least Pending Approval at Gate 2; the Ready for Implementation to Implementation Active transition is already enforced at Gate 3
- Changes to Documentation Requirements defaults for other classifications
- Changes to the status values themselves
- spec-guard check (Gate 1, no --warnings) blocking on Draft status
- A spec-guard check rule that detects when the status in the spec file diverges from the artifact index (the set-status command prevents this; detection is not required)

## Users / Actors

- User

## Expected Behavior

When an agent runs spec-guard check --warnings on a spec still in Draft status, SG-STATUS-001 fires and Gate 2 does not pass. The agent must update the status to Pending Approval (presented for review) or higher before Gate 2 can clear. For Operational/document deliverable specs, the draft tool generates a placeholder in Documentation Requirements that prompts the agent to list the actual deliverable documents rather than defaulting to 'No documentation changes required'.

## Acceptance Criteria

- [ ] spec-guard check --warnings emits SG-STATUS-001 WARNING when spec status is Draft
- [ ] A spec with status Draft cannot pass Gate 2 — spec-guard check --warnings exits non-zero
- [ ] A spec with status Pending Approval or higher passes the SG-STATUS-001 check
- [ ] `spec-guard set-status <name> <status>` updates the spec's Status field to the given value and regenerates the artifact index
- [ ] `spec-guard set-status` rejects invalid status values with a clear error
- [ ] `spec_guard_set_status` MCP tool accepts spec_path and status, performs the same update, and returns the updated status and artifact index path
- [ ] AGENTS.md instructs the agent to use `spec-guard set-status` or `spec_guard_set_status` for all status changes — never edit the spec file directly to change status
- [ ] AGENTS.md instructs the agent to call set-status to Pending Approval when presenting a spec for review, and Ready for Implementation after the human approves the spec
- [ ] For Operational/document deliverable classification, the draft tool's Documentation Requirements section generates a placeholder instructing the agent to list the deliverable documents instead of 'No documentation changes required'
- [ ] spec-guard check (Gate 1, without --warnings) continues to pass for specs in Draft status — no regression

## Edge Cases

- 

## Related Artifacts

- [implementation review](../reviews/spec-authoring-lifecycle-gaps.md)

## Documentation Requirements
- [AGENTS.md](../../AGENTS.md) — add status lifecycle guidance (use set-status command, Pending Approval on presentation, Ready for Implementation on approval)
- [docs/cli.md](../../docs/cli.md) — document spec-guard set-status command
- [docs/mcp.md](../../docs/mcp.md) — document spec_guard_set_status tool
- [.spec-guard/contracts/cli-api-contract.md](./../contracts/cli-api-contract.md) — add set-status to CLI contract
- [.spec-guard/contracts/mcp-api-contract.md](./../contracts/mcp-api-contract.md) — add spec_guard_set_status to MCP contract
- [docs/validation-rules.md](../../docs/validation-rules.md) — add SG-STATUS-001 rule entry

## Dependencies

- 

## Open Questions

- 

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [ ] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
- [x] Bugfix

## Test Evidence

- [x] Permanent regression coverage.
