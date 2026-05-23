# API Contract: spec-guard CLI

## Package / Module

`bin/spec-guard.js`

## Purpose

The `spec-guard` CLI is the primary human-facing and agent-facing interface for the Spec Guard workflow. It enforces the 6-gate development loop, validates spec artifacts, generates templates, and provides live feedback during spec authoring. Every gate is a CLI command; gates are not advisory.

## Exported Surface

### Commands

| Command | Purpose |
|---|---|
| `analyze <spec>` | Cross-artifact alignment check (spec ↔ contract ↔ review) |
| `blocker <name>` | Create a blocker artifact |
| `check <spec>` | Gate 1 — validate a spec file |
| `classify <spec>` | Confirm work classification and print test guidance |
| `confirm-gate <spec> <n>` | Record agent-confirmed gate (3, 4, or 5) |
| `deviation <name>` | Create a spec-deviation artifact |
| `discovery <name>` | Create a discovery-request artifact |
| `draft <name>` | Guided interactive wizard — write a spec from scratch |
| `gate-status <spec>` | Show pass/fail state of all gates |
| `init` | Create the `.spec-guard/` directory structure |
| `initiative <name>` | Wizard — decompose a multi-feature initiative into slices |
| `initiative-questions` | Return structured question list for initiative decomposition |
| `interview-questions` | Return structured question list for single-spec authoring |
| `new <kind> <name>` | Create an artifact from a template |
| `next <spec>` | Print the next required action given current gate state |
| `review <name>` | Create an implementation review artifact |
| `run <name>` | Orchestrated 6-phase run |
| `scope-discovery <name>` | Create a scope-discovery artifact |
| `serve` | Start local markdown viewer |
| `status` | Print summary table of all specs |
| `suggest <spec>` | Gate 1 validation annotated with fix instructions |
| `validate` | Run `check` on every spec in `.spec-guard/specs/` |
| `watch <spec>` | Live re-check on every save |

---

### `analyze`

```bash
spec-guard analyze <spec> [--contract <path>] [--review <path>] [--dry-run] [--json]
```

Compares spec ↔ contract ↔ implementation review for alignment. Flags missing contract content, unchecked review boxes, and ACs not reflected in the review.

- `--dry-run` — contract-only check; skips review rules; always exits 0 (advisory)
- `--json` — NDJSON diagnostic output

Exit codes: `0` clean, `1` blockers/warnings, `2` usage error.

---

### `check`

```bash
spec-guard check <spec> [--json] [--warnings]
```

Validates one spec file. Reports BLOCKERs by default; add `--warnings` for WARNING and INFO diagnostics. Does not modify files.

Exit codes: `0` no blockers, `1` one or more blockers, `2` usage error or unreadable file.

---

### `confirm-gate`

```bash
spec-guard confirm-gate <spec> <gate> [--evidence=<text>] [--no-confirm]
```

Records agent-confirmed gate (3, 4, or 5). `--evidence` is required for gate 3. `--no-confirm` marks the gate as not yet confirmed.

Exit codes: `0` recorded, `1` error (e.g. gate already confirmed), `2` usage error.

---

### `draft`

```bash
spec-guard draft [--from-json <path>|-] <name>
```

Interactive wizard that produces a spec file guaranteed to pass Gate 1. `--from-json` accepts answers as JSON (or `-` for stdin). JSON shape: `{ title?, problem, in_scope, out_of_scope, expected_behavior, acceptance_criteria, classification, users?, open_questions? }`.

Refuses to overwrite an existing file.

Exit codes: `0` written, `1` file exists, `2` usage error.

---

### `init`

```bash
spec-guard init [--no-readme]
```

Creates `.spec-guard/` subdirectories, `AGENTS.md`, `WORKFLOW.md`, `.spec-guard/README.md`, and optionally `README.md`. Idempotent — only creates missing items. `--no-readme` skips README creation entirely.

Exit codes: `0` success, `1` error.

---

### `new`

```bash
spec-guard new <kind> [--spec <spec>] <name>
```

Creates an artifact from a template. Refuses to overwrite. When `--spec` is supplied for contract kinds, links the contract back to the spec under `Related Artifacts`.

Available kinds: `spec`, `brownfield-spec`, `api-contract`, `rest-api-contract`, `component-contract`, `one-off-ui`, `operational-document`, `task-plan`, `compound-work`.

Exit codes: `0` written, `1` file exists, `2` usage error.

---

### `serve`

```bash
spec-guard serve [--port <n>] [--no-open]
```

Starts a local HTTP server. Serves `README.md` as root (falls back to `.spec-guard/README.md`). Sidebar lists all `.md` files. HMR via WebSocket at `/__hmr`. Default port: 7777.

Exit codes: `0` (exits when stopped), `1` no root file or port in use, `2` usage error.

---

### `suggest`

```bash
spec-guard suggest <spec> [--json]
```

Gate 1 validation with concrete, multi-line fix instructions for each diagnostic. Prefer over `check` when actionable guidance is needed.

Exit codes: same as `check`.

---

### `validate`

```bash
spec-guard validate [--json] [--warnings]
```

Runs `check` on every `.md` file in `.spec-guard/specs/` recursively. Prints summary: `Validated N spec(s): X clean, Y with issues (Z with blockers)`.

---

### `watch`

```bash
spec-guard watch <spec>
```

Watches one spec file and re-runs `check` on every save. Clears terminal on each run.

---

## Inputs

All commands accept a spec identifier as either a bare name (resolved against `.spec-guard/specs/<name>.md`) or a full path.

Flags follow POSIX convention. `--key=value` and `--key value` are both accepted for value flags. Boolean flags (`--json`, `--warnings`, `--dry-run`, `--no-open`, `--no-confirm`) take no argument.

## Outputs

**Default (human-readable):** One diagnostic per line in the format:
```
[SEVERITY] RULE_ID path: message
```

**`--json` (NDJSON):** One JSON object per line:
```json
{"severity":"BLOCKER","ruleId":"SG-CLASS-001","path":"...","message":"..."}
```

`suggest` adds a `suggestion` field to each JSON object.

`analyze` with `--json` includes `"dry_run": true` when `--dry-run` is used.

## Errors

- Exit code `2` — usage error (wrong number of arguments, unknown flag, unrecognized command). Prints usage to stderr.
- Exit code `1` — validation failure, file conflict, or runtime error. Prints human-readable message to stdout or stderr.
- Unhandled exceptions propagate and exit non-zero.

## Side Effects

Write commands (`init`, `draft`, `new`, `blocker`, `review`, `deviation`, `discovery`, `scope-discovery`, `confirm-gate`, `initiative`) write files under `.spec-guard/` and may update `.spec-guard/README.md` (artifact index).

Read/validate commands (`check`, `suggest`, `analyze`, `classify`, `gate-status`, `next`, `status`, `validate`, `watch`, `interview-questions`, `initiative-questions`) do not modify files.

`serve` starts a long-running HTTP server process; it does not exit until Ctrl+C or SIGTERM.

## Versioning / Backward Compatibility

- Flags that currently accept `--key=value` will continue to accept `--key=value` and `--key value`.
- New commands are additive and do not break existing scripts.
- Exit codes are stable; any change to exit code semantics is a breaking change.
- `--json` output field names are stable; new fields may be added without notice but existing fields will not be renamed or removed without a major version bump.

## End-User API Documentation

- Documentation Path: `docs/cli.md`
