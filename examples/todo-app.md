# Example: Todo App — Initiative to Feature

Two walkthroughs in one file. The first builds a new web app from scratch using the full initiative flow. The second adds a single feature to the finished app using the standard spec flow.

---

## Creating a New Todo App

> **You:** I want to build a simple web-based todo app.

**Agent:** Do you want to use Spec Guard for this task?

> **You:** Yes.

No specs exist yet, so this is treated as a greenfield initiative. The agent walks through the initiative questions one at a time before proposing a slice breakdown.

**Agent:** I have a few questions to understand the scope before proposing a breakdown. I'll go one at a time.

What problem does this solve, and who uses it? Suggestions based on what you've described:
- *A personal browser-based task list — one user, no accounts needed*
- *A lightweight shared task tracker for a small team*

> **You:** The first one — just me, no accounts.

**Agent:** What functionality should the app include? Suggestions:
- *Add tasks and view all tasks — keep it minimal for now*
- *Add, view, and mark tasks as complete*

> **You:** Just add and view for now.

**Agent:** What's explicitly out of scope? Suggestions based on what you've said:
- *User authentication or multi-user support*
- *Editing or deleting tasks, due dates, categories, priority*
- *Mobile app or native client*

> **You:** All of those.

**Agent:** Will tasks need to persist when the server restarts — is there a database or other external dependency in scope? Suggestions:
- *No — in-memory only is fine for now*
- *Yes — a database like PostgreSQL or SQLite*

> **You:** In-memory only is fine.

**Agent:** Where will this run? Suggestions:
- *Local development only*
- *A hosting platform like Railway or Render*

> **You:** Local for now.

**Agent:** Based on your answers, here's how I'd break this down. Does this look right?

| # | Slice | Description | Classification |
|---|---|---|---|
| 1 | `deployment-portability` | No hardcoded hosts, ports, or paths — all configuration driven by environment variables | Direct behavior with no new API or UI |
| 2 | `task-api` | REST endpoints to create and retrieve tasks, backed by in-memory storage | REST/service API |
| 3 | `task-ui` | A single web page with an input to add tasks and a list to view them | One-off application UI |

> **You:** Yes, that works.

The agent saves the initiative and drafts all three specs for review before any implementation begins.

---

### Spec Review — All Slices

#### Slice 1 — Deployment Portability

**Agent:** Here's the spec for `deployment-portability`. Does this look right?

**In scope:** Server port read from `process.env.PORT` with a sensible default; no hardcoded `localhost` URLs anywhere in client or server source files; a `.env.example` file at the repo root documenting every required environment variable.

**Out of scope:** Multi-environment configuration (staging, production); secrets management; containerization or deployment scripts.

**Acceptance criteria:**
- The server binds to `process.env.PORT` if set, falling back to a default port if not
- No literal `localhost` or hardcoded port numbers appear in client-side source files
- A `.env.example` file exists at the repo root listing every required environment variable

> **You:** Yes.

---

#### Slice 2 — Task API

**Agent:** Here's the spec for `task-api`. Does this look right?

**In scope:** `POST /tasks` to create a task with a `text` field; `GET /tasks` to retrieve all tasks; tasks held in an in-memory array for this iteration.

**Out of scope:** Updating or deleting tasks; persistent storage; authentication; pagination.

**Acceptance criteria:**
- `POST /tasks` with a valid `text` body returns `201` with the created task including a generated `id`
- `GET /tasks` returns `200` with all tasks in the current session
- `POST /tasks` with a missing or empty `text` body returns `400`

> **You:** Yes.

---

#### Slice 3 — Task UI

**Agent:** Here's the spec for `task-ui`. Does this look right?

**In scope:** A single HTML page served by the Express app; a text input and submit button that calls `POST /tasks`; a task list below that fetches from `GET /tasks` on page load; tasks displayed as a simple list.

**Out of scope:** Marking tasks as done; filtering or sorting; any UI beyond the add form and task list; a frontend build step or framework.

**Acceptance criteria:**
- Submitting the form with a non-empty input adds the task via the API and appends it to the list without a page reload
- Submitting the form with an empty input does nothing
- The task list is populated from `GET /tasks` on page load

> **You:** Yes.

---

All three specs are approved. The agent now begins implementing slice by slice, asking for authorization before each one.

---

### Implementation — Slice 1: Deployment Portability

**Agent:** Should I go ahead and begin implementing `deployment-portability`?

> **You:** Yes.

Gate 1 passes. Classification is `Direct behavior with no new API or UI` — no contract required. Gate 2 passes. No significant planning decisions are needed; the agent notes this in the spec and Gate 3 passes. The agent writes three tests — all fail — Gate 4 is confirmed. The implementation is straightforward; tests pass and Gate 5 is confirmed. The agent creates the review, runs the alignment check, and Gate 6 passes.

**Slice 1 complete.**

---

### Implementation — Slice 2: Task API

**Agent:** Should I go ahead and begin implementing `task-api`?

> **You:** Yes.

Gate 1 passes.

**Gate 2 — Contract:** Classification is `REST/service API` — a contract is required. The agent creates `.spec-guard/contracts/task-api-rest-contract.md` documenting both endpoints, their request and response shapes, status codes, and error conditions. Gate 2 passes.

**Gate 3 — Implementation Planning:**

**Agent:** For this slice I'd suggest the following plan — let me know if you'd like to change anything:

- **Runtime:** Node.js
- **Framework:** Express
- **Storage:** In-memory array (consistent with the scope decision — no database this iteration)

Does this work, or would you prefer a different approach?

> **You:** That works.

Gate 3 passes. The agent writes three tests — all fail — Gate 4 is confirmed. The agent implements the two Express routes. All three tests pass and Gate 5 is confirmed.

```
Spec Guard Analysis: Task API
  Spec:           .spec-guard/specs/task-api.md
  Contract:       .spec-guard/contracts/task-api-rest-contract.md
  Review:         .spec-guard/reviews/task-api.md
  Classification: REST/service API
  Criteria: 3

  ✓  All artifacts aligned.
```

Gate 6 confirmed. **Slice 2 complete.**

---

### Implementation — Slice 3: Task UI

**Agent:** Should I go ahead and begin implementing `task-ui`?

> **You:** Yes.

Gate 1 passes.

**Gate 2 — Design Direction and Component Library:** Classification is `One-off application UI` — design direction and a component library reference are required.

**Agent:** For design direction, I'd suggest a centered card layout: text input and submit button at the top, tasks listed below. Simple, no decoration. Does that work, or do you have something different in mind?

> **You:** That works.

**Agent:** For the component library — since we're using vanilla HTML and JavaScript, there's no framework or library involved. I'll record "no component library — custom styling" in the spec. Confirmed?

> **You:** Yes.

Gate 2 passes.

**Gate 3 — Implementation Planning:**

**Agent:** For the frontend — plain HTML, CSS, and vanilla JavaScript served as a static file from Express. No build step. Does that work, or would you prefer something else?

> **You:** That works.

Gate 3 passes. The agent writes three tests — all fail — Gate 4 is confirmed. The agent implements a single HTML file. All three tests pass and Gate 5 is confirmed. The review is created, the alignment check passes, and Gate 6 is confirmed.

**Slice 3 complete.**

---

After three slices and eighteen confirmed gates, the user has a working web-based todo app. The server reads its port from the environment, the API has tested endpoints and a documented contract, and the UI connects to it from a single clean page. Every decision — scope, tech stack, design direction — was made explicitly before a line of code was written, and nothing outside those decisions was built.

---

## Adding a Feature to the Todo App

> **You:** I want to be able to mark a task as done.

**Agent:** Do you want to use Spec Guard for this task?

> **You:** Yes.

Specs exist, so the agent uses the standard single-spec flow and opens the spec interview.

**Agent:** I have a few questions. What problem does this solve — what can't you do today? Suggestion based on the existing app:
- *Tasks accumulate with no way to distinguish what's finished from what still needs attention*

> **You:** Exactly that.

**Agent:** What's in scope? Suggestions:
- *A checkbox on each task in the UI; a `PATCH /tasks/:id` endpoint to persist the completion status*
- *UI-only toggle — done state tracked client-side without persisting to the API*

> **You:** The first one — I want it to persist.

**Agent:** What's out of scope? Suggestions:
- *Hiding or deleting completed tasks*
- *Filtering the list to show only open or only done tasks*
- *Bulk actions like "mark all done"*

> **You:** All of those.

The agent drafts a spec and presents it for review.

**In scope:** `PATCH /tasks/:id` with `{ "done": true }` updates the task's completion status in memory; `GET /tasks` includes a `done` field on every task; the UI renders a checkbox per task that calls the endpoint on change and updates the visual state without a page reload.

**Out of scope:** Hiding or deleting completed tasks; filtering the list by status; bulk actions like "mark all done".

**Acceptance criteria:**
- `PATCH /tasks/:id` with `{ done: true }` returns `200` with the updated task
- `PATCH /tasks/:id` with an unknown `id` returns `404`
- `GET /tasks` includes a `done` field on every task
- The task list renders a checkbox for each task
- Checking the checkbox persists the change via the API and visually marks the task as done

**Agent:** Does this look right?

> **You:** Yes.

**Agent:** Should I go ahead and begin implementing `mark-task-done`?

> **You:** Yes.

Gate 1 passes. Classification is `Direct behavior with no new API or UI` — the new endpoint extends the existing REST surface, which is already governed by the `task-api` contract. No new contract is required, but the existing one is updated to include `PATCH /tasks/:id`. Gate 2 passes.

**Gate 3 — Implementation Planning:**

**Agent:** This slots into the existing Express app following the same patterns established in `task-api`. No new framework or data-layer decisions are needed. I'll note that in the spec and proceed unless you'd like to discuss anything.

> **You:** Go ahead.

Gate 3 passes. The agent writes five tests — one per acceptance criterion — and runs them. All fail. Gate 4 is confirmed with failure evidence. The agent implements the `PATCH` route and the checkbox behavior. All five tests pass. Gate 5 is confirmed.

```
Spec Guard Analysis: Mark Task as Done
  Spec:           .spec-guard/specs/mark-task-done.md
  Contract:       .spec-guard/contracts/task-api-rest-contract.md
  Review:         .spec-guard/reviews/mark-task-done.md
  Classification: Direct behavior with no new API or UI
  Criteria: 5

  ✓  All artifacts aligned.
```

Gate 6 confirmed. **The feature is complete.**

---

One feature, one spec, six gates. The scope was agreed in conversation before a line of code was written — no filtering, no hiding, no bulk actions. The existing REST contract was updated to reflect the new endpoint rather than a second contract being created, because the surface was already established. Five acceptance criteria, five tests, all passing.
