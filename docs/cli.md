# CLI Reference

## Commands

### `analyze`

```bash
spec-guard analyze [--contract path] [--review path] [--dry-run] [--json] <spec>
```

Cross-artifact consistency check. Compares the spec against its contract and implementation review:

- Contract file exists and contains actual interface definitions (not just a blank template)
- Every acceptance criterion from the spec appears in the implementation review
- No unchecked boxes remain in the review

If `--contract` or `--review` are not given, Spec Guard infers the paths from the spec filename.

**Flags:**

- `--contract path` — explicit contract file path
- `--review path` — explicit review file path
- `--dry-run` — pre-implementation contract-only check; skips all review rules; always exits 0 (advisory). Also invoked automatically by `spec-guard run` at Phase 3 when a contract is present.
- `--json` — output diagnostics as NDJSON; includes `dry_run: true` when `--dry-run` is used

**Exit codes:**

- `0` — no blockers
- `1` — one or more blockers or warnings
- `2` — usage error

---

### `check`

```bash
spec-guard check [--json] [--warnings] <spec>
```

Validates one Markdown spec file. Reports:

- missing required headings (BLOCKER)
- required sections with only placeholder content (BLOCKER)
- missing or multiple work classifications (BLOCKER)
- unresolved open questions (WARNING)
- missing UI design inputs for UI work (BLOCKER)
- missing component library reference for UI work (WARNING)
- missing contract reference for API/component work (WARNING)
- vague qualifiers in acceptance criteria (INFO)
- scope items too brief to prevent misinterpretation (INFO)
- non-standard Status value (INFO)

Does not modify files.

**Flags:**

- `--json` — output each diagnostic as a JSON object on its own line (NDJSON)
- `--warnings` — include WARNING and INFO diagnostics (default: BLOCKERs only)

**Exit codes:**

- `0` — no blockers (and no warnings when `--warnings` is used)
- `1` — one or more blockers; or one or more warnings when `--warnings` is used
- `2` — usage error or unreadable file

---

### `classify`

```bash
spec-guard classify [--json] <spec>
```

Prints the selected work classification and the corresponding test guidance, or reports a blocker if zero or multiple are selected. With `--json`, returns `{ classification, test_guidance }`.

---

### `confirm-gate`

```bash
spec-guard confirm-gate <spec> <gate> [--evidence=<text>] [--no-confirm]
```

Records an agent-confirmed gate (3, 4, or 5) to the run state file. Gates 1 and 2 are automated — use `check` for those.

- `--evidence`: required for gate 3; describe what test failed and why.
- `--no-confirm`: record that the gate is not yet confirmed (problem encountered).

Example:
```bash
spec-guard confirm-gate auth-flow 3 --evidence="test auth.test.js:42 fails — returns 401, expected 403"
```

---

### `discovery`

```bash
spec-guard discovery <name>
```

Creates a discovery-request artifact at `.spec-guard/discoveries/<name>.md`. Use this **only** when a human explicitly asks for gap analysis, risk review, or "what did we miss?" — never speculatively.

Discovery mode is distinct from implementation. It produces findings; it does not authorize implementing them. Any work identified during discovery requires a separate spec before implementation can begin.

Typical triggers:
- "What did we miss?"
- "What risks remain?"
- "What should we build next?"
- "Review for security/accessibility/reliability gaps."

**Not** a trigger: completing an implementation task and deciding to look for follow-up work unprompted.

**Exit codes:**

- `0` — file created
- `1` — output file already exists
- `2` — usage error

---

### `draft`

```bash
spec-guard draft [--from-json <path>|-] <name>
```

Guided wizard for writing a spec from scratch. Asks questions (problem, scope, expected behavior, acceptance criteria, work classification, and optional fields), then writes a spec file that passes Gate 1. Loops on required fields until they are filled.

**Non-interactive mode:** pass `--from-json <path>` to read answers from a JSON file instead of prompting. Use `-` to read from stdin. The JSON must include `problem`, `in_scope`, `out_of_scope`, `expected_behavior`, `acceptance_criteria`, and `classification`. Optional fields: `title`, `users`, `open_questions`.

```json
{
  "title": "Login Feature",
  "problem": "Users cannot authenticate",
  "in_scope": ["Login form", "JWT issuance"],
  "out_of_scope": ["OAuth", "SSO"],
  "users": ["End user"],
  "expected_behavior": "User submits credentials and receives a token",
  "acceptance_criteria": ["Valid credentials return 200 with token"],
  "open_questions": [],
  "classification": "Reusable non-UI API"
}
```

Defaults to `.spec-guard/specs/<name>.md`. Pass a full path to write elsewhere.

Refuses to overwrite an existing file.

**Exit codes:**

- `0` — spec written successfully
- `1` — output file already exists
- `2` — usage error (no name given, too many arguments)

---

### `gate-status`

```bash
spec-guard gate-status [--json] <spec>
```

Shows the pass/fail state of all five gates for a spec. Gates 1 and 2 are checked live; gates 3–5 are read from the saved run state (`.spec-guard/runs/<name>-run.json`).

---

### `init`

```bash
spec-guard init [--no-readme]
```

Creates the recommended directory structure in the current directory:

```text
.spec-guard/
  specs/
  contracts/
  initiatives/
  blockers/
  scope-discoveries/
  reviews/
  deviations/
  discoveries/
  runs/
  README.md             ← artifact index (auto-maintained)
AGENTS.md
WORKFLOW.md
README.md               ← project README with Spec Guard section
.github/
  workflows/
    spec-guard.yml      ← ready-to-use CI workflow
```

All files and directories are created only if they don't already exist. `AGENTS.md` and `WORKFLOW.md` are placed at the project root so agents that auto-load project context files pick them up automatically.

**README.md behavior:**

`spec-guard init` creates `README.md` at the project root if it does not exist. The created file contains only the Spec Guard section:

```md
## Spec Guard

This project uses [Spec Guard](https://github.com/jpstone/spec-guard)

[Spec Guard Artifacts](.spec-guard/README.md)
```

If `README.md` already exists without a `## Spec Guard` section, the section is appended at the bottom. If the section already exists, init makes no change (idempotent). The workflow (`spec-guard run`) then prepends project-level content above the Spec Guard section on each run — the Spec Guard section always remains at the bottom.

**Flags:**

- `--no-readme` — skip README creation entirely. No `README.md` is created or modified during init. The workflow also skips README operations for the life of the project (since no README will exist unless the developer creates one manually). This is the only mechanism to opt out of README maintenance; there is no stored preference — the flag is a one-time instruction, not a persistent setting.

**`.spec-guard/README.md` artifact index:**

`spec-guard init` also creates `.spec-guard/README.md`, an automatically maintained index of all `.spec-guard` artifacts. This file is regenerated from disk state by every artifact-write command (`draft`, `blocker`, `review`, `initiative`, etc.) and always reflects current artifact contents. Do not manually edit it.

---

### `initiative`

```bash
spec-guard initiative [--from-json <path>|-] <name>
```

Wizard for decomposing a multi-feature initiative. Collects initiative name, title, description, and a list of feature slices (each with name, title, description, and classification). Writes the artifact to `.spec-guard/initiatives/<name>.md`.

**Non-interactive mode:** pass `--from-json <path>` to read answers from a JSON file instead of prompting. Use `-` to read from stdin. The JSON must include `title`, `description`, and `slices` (array of `{ name, title, description, classification }`).

```json
{
  "title": "My App",
  "description": "A task management application",
  "slices": [
    { "name": "user-auth", "title": "User Auth", "description": "Sign up and login", "classification": "REST/service API" },
    { "name": "todo-ui",   "title": "Todo UI",   "description": "Main task list",    "classification": "One-off application UI" }
  ]
}
```

Refuses to overwrite an existing file.

**Exit codes:**

- `0` — artifact written successfully
- `1` — output file already exists, or no slices defined
- `2` — usage error

---

### `initiative-questions`

```bash
spec-guard initiative-questions [--json]
```

Returns the structured question list for gathering context before decomposing a broad app or product idea into individual feature slices. Use this when a developer describes a multi-feature initiative rather than a single capability.

With `--json`, outputs `{ required, optional }` as JSON.

---

### `interview-questions`

```bash
spec-guard interview-questions [--classification <type>] [--json]
```

Returns the structured question list for guiding a spec authoring conversation. Use this before calling `draft` — ask the user these questions, collect answers, then pass them to `draft --from-json`.

Pass `--classification` to get classification-specific follow-up questions in addition to the base list.

With `--json`, outputs `{ pre_classification, classification_specific, universal_optional, protocol, next_tool }` as JSON. `pre_classification` is the required question list; `universal_optional` contains optional questions (title, open questions).

---

### `new`

```bash
spec-guard new <kind> [--spec <spec>] <name>
```

Creates a new artifact from a template. Defaults to the appropriate `.spec-guard/` subdirectory for bare names. Pass a full path to write elsewhere. Refuses to overwrite.

When `--spec <spec>` is supplied for a contract kind (`api-contract`, `rest-api-contract`, or `component-contract`), Spec Guard updates the originating spec with one direct repository-relative link to the created contract under `Related Artifacts`. Existing spec sections and existing links are preserved, and repeated link-recording paths do not duplicate the link.

Available kinds:

| Kind | Default location | Use for |
|---|---|---|
| `spec` | `.spec-guard/specs/` | New feature or behavior spec |
| `brownfield-spec` | `.spec-guard/specs/` | Changes to existing systems |
| `api-contract` | `.spec-guard/contracts/` | Reusable non-UI API contract |
| `rest-api-contract` | `.spec-guard/contracts/` | REST/service API contract |
| `component-contract` | `.spec-guard/contracts/` | Reusable UI component contract |
| `one-off-ui` | `.spec-guard/specs/` | One-off UI spec supplement |
| `operational-document` | `.spec-guard/specs/` | Operational deliverable |
| `task-plan` | `.spec-guard/specs/` | Implementation task plan |
| `compound-work` | `.spec-guard/specs/` | Multi-classification work plan |

---

### `next`

```bash
spec-guard next [--json] <spec>
```

Prints the next action required given the current gate state. Reads saved run state to determine which gates have been confirmed, then checks gates 1 and 2 live. Exits 0 only when all 5 gates are complete.

---

### `set-status`

```bash
spec-guard set-status <spec> <status>
```

Updates the spec's `Status` field to the given value and regenerates the artifact index atomically. Always use this command instead of editing the spec file directly — direct edits leave the artifact index stale.

Valid status values: `Draft`, `Pending Approval`, `Ready for Implementation`, `Implementation Active`, `Blocked`, `Implemented`, `Deferred`.

**Status lifecycle during spec authoring:**

| When | Status to set |
|---|---|
| Presenting spec to the user for review | `Pending Approval` |
| User approves the spec | `Ready for Implementation` |
| User explicitly authorizes implementation | `Implementation Active` (set before confirming Gate 3) |

**Exit codes:**

- `0` — updated successfully
- `1` — invalid status value or file error
- `2` — usage error

---

### `serve`

```bash
spec-guard serve [--port <n>] [--no-open]
```

Starts a local HTTP server that renders all `.md` files in the repo as styled HTML. Useful for browsing spec artifacts without pushing to GitHub.

- Serves `README.md` at the repo root as the default page, falling back to `.spec-guard/README.md` if the root README does not exist. Exits non-zero with a clear error if neither is found.
- Displays a navigation sidebar listing every `.md` file in the repo, organized by directory.
- Renders markdown using GitHub-style styling (`github-markdown-css`).
- Watches `.md` files for changes and pushes live updates to the browser via WebSocket (HMR) — no manual refresh needed.
- Passes through static assets (images, etc.) referenced from `.md` files.
- Returns a 404 page for unknown paths or non-`.md` requests.
- Exits non-zero with a human-readable error if the port is already in use.
- Prints a shutdown confirmation on Ctrl+C.

**Flags:**

- `--port <n>` — listen on port `n` instead of the default (7777)
- `--no-open` — start the server without auto-opening the browser

**Exit codes:**

- `0` — server started (exits when the server is stopped)
- `1` — no root file found, or port already in use
- `2` — usage error (invalid port)

---

### `status`

```bash
spec-guard status [--json]
```

Prints a summary table of all specs in `.spec-guard/specs/`. Columns: Status, Classification, Issues (blockers/warnings), Path.

With `--json`, outputs an array of objects.

---

### `suggest`

```bash
spec-guard suggest [--json] <spec>
```

Runs `check` and annotates every diagnostic with a concrete, multi-line fix instruction. Includes before/after examples for most rules.

Use this instead of `check` when you want to know exactly what to change, not just that something is wrong. Agents should prefer `spec_guard_suggest` over `spec_guard_check` for the same reason.

**Flags:**

- `--json` — output annotated diagnostics as NDJSON

**Exit codes:** same as `check`.

---

### `validate`

```bash
spec-guard validate [--json] [--warnings]
```

Runs `check` on every `.md` file (excluding README.md) in `.spec-guard/specs/`, recursively.

Prints a summary line: `Validated N spec(s): X clean, Y with issues (Z with blockers)`.

---

### `watch`

```bash
spec-guard watch <spec>
```

Watches a single spec file and re-runs `check` on every save. Clears the terminal on each run. Useful while writing a spec.

---

### Artifact commands

All artifact commands create a file from a template and refuse to overwrite existing files. Bare names default to the appropriate `.spec-guard/` subdirectory.

```bash
spec-guard blocker [--spec <spec>] <name>           # → .spec-guard/blockers/<name>.md
spec-guard deviation [--spec <spec>] <name>         # → .spec-guard/deviations/<name>.md
spec-guard discovery [--spec <spec>] <name>         # → .spec-guard/discoveries/<name>.md
spec-guard review [--spec <spec>] <name>            # → .spec-guard/reviews/<name>.md
spec-guard scope-discovery [--spec <spec>] <name>   # → .spec-guard/scope-discoveries/<name>.md
```

Pass a full path to write elsewhere. When `--spec <spec>` is supplied, Spec Guard updates the originating spec with one direct repository-relative link to the created artifact under `Related Artifacts`. Existing spec sections and links are preserved; existing links are not duplicated.

---

## Diagnostic format

```text
[SEVERITY] RULE_ID path: message
```

Example:

```text
[BLOCKER] SG-CLASS-001 .spec-guard/specs/login.md: exactly one work classification must be selected; found none
[WARNING] SG-SPEC-003 .spec-guard/specs/login.md: 2 open question(s) may affect implementation — resolve or mark N/A before proceeding
[INFO] SG-SPEC-007 .spec-guard/specs/login.md: acceptance criterion uses a vague qualifier: "the feature works correctly"
```

With `--json`:

```json
{"severity":"BLOCKER","ruleId":"SG-CLASS-001","path":".spec-guard/specs/login.md","message":"exactly one work classification must be selected; found none"}
```

`suggest` adds a `suggestion` field:

```json
{"severity":"BLOCKER","ruleId":"SG-CLASS-001","path":".spec-guard/specs/login.md","message":"...","suggestion":"In the Work Classification section, check exactly one box..."}
```

## CI usage

```yaml
- name: Validate specs
  run: npx spec-guard validate --json

- name: Cross-artifact check (before Gate 5)
  run: npx spec-guard analyze my-feature --json
```

Exit 1 fails the CI step when blockers are found.
