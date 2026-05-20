# Todo App Agent Simulation

This example shows how an implementation agent should use Spec Guard when a developer asks for a todo app.

## Mock Developer Input

```text
Use Spec Guard from this repo as your reference. Build me a todo app.
```

## Agent Preflight Result

The request is not implementation-ready.

Reasons:

- No governing spec is linked or filled out.
- UI direction is missing.
- Component library expectations are missing.
- Persistence expectations are missing: local-only, file, database, API, or browser storage.
- Acceptance criteria are missing.
- The request likely spans multiple classifications.

Correct response:

```text
I need a governing spec before implementation. This request likely spans one-off UI plus persistence behavior, and possibly REST/service API or reusable component work.

Please confirm:
1. Is this local-only or persisted?
2. Is there a required framework/component library?
3. Do you have a mockup, wireframe, or explicit design direction?
4. What actions are in scope: add, edit, complete, delete, filter, clear completed?
5. What acceptance criteria should tests validate?
```

## Better Developer Input

```text
Build a local-only todo app screen.
Use existing app components only. No backend/API. No reusable components unless necessary.
Design direction: single page titled "Todos". Include a text input labeled "New todo", an "Add todo" button, a list of todos with checkboxes, and a delete button for each todo. Completed todos should remain visible with their checkbox checked. Show "No todos yet" when empty.
Acceptance criteria:
- user can add a todo,
- empty todo text is not added,
- user can mark a todo complete/incomplete,
- user can delete a todo,
- empty state appears when no todos exist.
Use UI automation tests first.
```

## Classification

Primary classification: one-off application UI.

No REST/service API because persistence is local-only.

No reusable UI component unless a shared component requirement emerges.

No reusable non-UI API unless state logic is exported as a durable contract.

## Required Templates

- `templates/spec.md`
- `templates/one-off-ui.md`
- optional `templates/compound-work.md` if the developer later adds backend/API or reusable component requirements.

## Tests (derived from acceptance criteria)

The agent writes UI automation tests before implementation. One test per acceptance criterion:

```text
page exposes heading "Todos"
empty list shows "No todos yet"
user adds "Buy milk" through "New todo" and "Add todo"
empty todo text is not added
user marks "Buy milk" complete and incomplete
user deletes "Buy milk"
```

## Expected Initial Failure

The route/page and controls do not exist yet.

## What Not To Do

- Do not invent visual design beyond the explicit design direction.
- Do not add backend persistence.
- Do not add authentication.
- Do not create reusable components without a durable reuse requirement.
- Do not test private state helpers instead of user-visible behavior.
- Do not skip UI automation tests because this is UI work.
