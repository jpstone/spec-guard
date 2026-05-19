# Work Classification Guide

Classify every task before implementation. The classification determines required documentation and tests.

## Decision Table

| If the task creates or changes... | Classify as | Required documentation | Required test/check |
| --- | --- | --- | --- |
| Shared package/module behavior, validation, adapter, service object, persistence interface, or CLI helper | Reusable non-UI API | API contract if durable | Unit tests against documented/exported surface |
| HTTP endpoint, webhook, RPC, or cross-service boundary | REST/service API | REST/service API contract | API/integration tests against contract |
| Shared UI component used across screens/apps/packages | Reusable UI component | Component contract | Unit/component tests against documented component API |
| Single-use screen, page form, dashboard, or workflow | One-off application UI | No reusable docs unless reusable surface emerges | Browser automation for user-visible behavior |
| Behavior through existing API/UI surfaces with no new durable contract | Direct behavior with no new API or UI | None by default | Smallest behavioral test with confidence |
| Runbook, policy, release checklist, help page, compliance artifact, or other document as product | Operational/document deliverable | The deliverable document | Process/document checks |

## Classification Rules

- Choose one primary classification before implementation.
- If multiple classifications apply, split the work or identify the primary deliverable first.
- If classification changes during implementation, stop and surface the change.
- Do not create contract documentation for one-off work unless a reusable surface emerges.
- Do not use document checks for product features.

## Ambiguous Cases

### Internal helper extracted during implementation

Do not classify as a reusable API unless other code or agents are expected to depend on it. Test through the public behavior that required the helper.

### Page-specific component

Classify as one-off application UI unless it is intended as a shared component with a documented API.

### Existing endpoint behavior change

Classify as REST/service API because the durable service contract changes.

### Existing reusable component behavior change

Classify as reusable UI component because the component contract changes.

### README update for a library API

If the README defines the durable API contract, classify the underlying work as reusable non-UI API. Test the API behavior, not README wording.

### Runbook or policy requested as the final artifact

Classify as operational/document deliverable. Document/process checks are appropriate because the document itself is the product.
