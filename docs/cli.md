# CLI Reference

## Commands

### `analyze`

```bash
spec-guard analyze [--contract path] [--review path] [--json] <spec>
```

Cross-artifact consistency check. Compares the spec against its contract and implementation review:

- Contract file exists and contains actual interface definitions (not just a blank template)
- Every acceptance criterion from the spec appears in the implementation review
- No unchecked boxes remain in the review

If `--contract` or `--review` are not given, Spec Guard infers the paths from the spec filename.

**Flags:**

- `--contract path` — explicit contract file path
- `--review path` — explicit review file path
- `--json` — output diagnostics as NDJSON

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

- `0` — no blockers
- `1` — one or more blockers
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
spec-guard draft <name>
```

Interactive guided wizard for writing a spec from scratch. Asks questions (problem, scope, expected behavior, acceptance criteria, work classification, and optional fields), then writes a spec file that passes Gate 1. Loops on required fields until they are filled.

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
spec-guard init
```

Creates the recommended directory structure in the current directory:

```text
.spec-guard/
  specs/
    example.md
  contracts/
  initiatives/
  blockers/
  scope-discoveries/
  reviews/
  deviations/
  discoveries/
  runs/
AGENTS.md
WORKFLOW.md
.github/
  workflows/
    spec-guard.yml      ← ready-to-use CI workflow
```

All files and directories are created only if they don't already exist. `AGENTS.md` and `WORKFLOW.md` are placed at the project root so agents that auto-load project context files pick them up automatically.

---

### `initiative`

```bash
spec-guard initiative <name>
```

Interactive wizard for decomposing a multi-feature initiative. Collects initiative name, title, description, and a list of feature slices (each with name, title, description, and classification). Writes the artifact to `.spec-guard/initiatives/<name>.md`.

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

### `new`

```bash
spec-guard new <kind> <name>
```

Creates a new artifact from a template. Defaults to the appropriate `.spec-guard/` subdirectory for bare names. Pass a full path to write elsewhere. Refuses to overwrite.

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
spec-guard blocker <name>           # → .spec-guard/blockers/<name>.md
spec-guard deviation <name>         # → .spec-guard/deviations/<name>.md
spec-guard review <name>            # → .spec-guard/reviews/<name>.md
spec-guard scope-discovery <name>   # → .spec-guard/scope-discoveries/<name>.md
```

Pass a full path to write elsewhere.

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
