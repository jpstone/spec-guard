# CLI Reference

## Commands

### `analyze`

```bash
spec-guard analyze [--contract path] [--review path] [--json] path/to/spec.md
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
spec-guard check [--json] [--warnings] path/to/spec.md
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
spec-guard classify [--json] path/to/spec.md
```

Prints the selected work classification, or reports a blocker if zero or multiple are selected.

---

### `discovery`

```bash
spec-guard discovery path/to/discovery-request.md
```

Creates a discovery-request artifact from the template. Use this **only** when a human explicitly asks for gap analysis, risk review, or "what did we miss?" — never speculatively.

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
spec-guard draft path/to/spec.md
```

Interactive guided wizard for writing a spec from scratch. Asks questions (problem, scope, expected behavior, acceptance criteria, work classification, and optional fields), then writes a spec file that passes Gate 1. Loops on required fields until they are filled.

Refuses to overwrite an existing file.

**Exit codes:**

- `0` — spec written successfully
- `1` — output file already exists
- `2` — usage error (no path given, too many arguments)

---

### `init`

```bash
spec-guard init [directory]
```

Creates the recommended directory structure:

```text
specs/
  example.md
contracts/
.spec-guard/
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

All files and directories are created only if they don't already exist. The CI workflow validates specs on every push and pull request that touches `specs/**`.

---

### `new`

```bash
spec-guard new <kind> path/to/file.md
```

Creates a new artifact from a template. Refuses to overwrite.

Available kinds:

| Kind | Template | Use for |
|---|---|---|
| `spec` | `templates/spec.md` | New feature or behavior spec |
| `brownfield-spec` | `templates/brownfield-spec.md` | Changes to existing systems |
| `api-contract` | `templates/api-contract.md` | Reusable non-UI API contract |
| `rest-api-contract` | `templates/rest-api-contract.md` | REST/service API contract |
| `component-contract` | `templates/component-contract.md` | Reusable UI component contract |
| `one-off-ui` | `templates/one-off-ui.md` | One-off UI spec supplement |
| `operational-document` | `templates/operational-document.md` | Operational deliverable |
| `task-plan` | `templates/task-plan.md` | Implementation task plan |
| `compound-work` | `templates/compound-work.md` | Multi-classification work plan |

---

### `status`

```bash
spec-guard status [--json] [specs-directory]
```

Prints a summary table of all specs in a directory. Columns: Status, Classification, Issues (blockers/warnings), Path.

With `--json`, outputs an array of objects.

---

### `suggest`

```bash
spec-guard suggest [--json] path/to/spec.md
```

Runs `check` and annotates every diagnostic with a concrete, multi-line fix instruction. Includes before/after examples for most rules.

Use this instead of `check` when you want to know exactly what to change, not just that something is wrong. Agents should prefer `spec_guard_suggest` over `spec_guard_check` for the same reason.

**Flags:**

- `--json` — output annotated diagnostics as NDJSON

**Exit codes:** same as `check`.

---

### `validate`

```bash
spec-guard validate [--json] [--warnings] [specs-directory]
```

Runs `check` on every `.md` file (excluding README.md) in a directory, recursively. Defaults to `specs/`.

Prints a summary line: `Validated N spec(s): X clean, Y with issues (Z with blockers)`.

---

### `watch`

```bash
spec-guard watch path/to/spec.md
```

Watches a single spec file and re-runs `check` on every save. Clears the terminal on each run. Useful while writing a spec.

---

### Artifact commands

All artifact commands create a file from a template and refuse to overwrite existing files.

```bash
spec-guard blocker path/to/blocker.md
spec-guard deviation path/to/deviation.md
spec-guard review path/to/review.md
spec-guard scope-discovery path/to/scope-discovery.md
```

---

## Diagnostic format

```text
[SEVERITY] RULE_ID path: message
```

Example:

```text
[BLOCKER] SG-CLASS-001 specs/login.md: exactly one work classification must be selected; found none
[WARNING] SG-SPEC-003 specs/login.md: 2 open question(s) may affect implementation — resolve or mark N/A before proceeding
[INFO] SG-SPEC-007 specs/login.md: acceptance criterion uses a vague qualifier: "the feature works correctly"
```

With `--json`:

```json
{"severity":"BLOCKER","ruleId":"SG-CLASS-001","path":"specs/login.md","message":"exactly one work classification must be selected; found none"}
```

`suggest` adds a `suggestion` field:

```json
{"severity":"BLOCKER","ruleId":"SG-CLASS-001","path":"specs/login.md","message":"...","suggestion":"In the Work Classification section, check exactly one box..."}
```

## CI usage

```yaml
- name: Validate specs
  run: npx spec-guard validate specs/ --json

- name: Cross-artifact check (before Gate 5)
  run: npx spec-guard analyze specs/my-feature.md --json
```

Exit 1 fails the CI step when blockers are found.
