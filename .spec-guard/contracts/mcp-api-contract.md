# API Contract: spec-guard MCP Server

## Package / Module

`mcp/server.js`

## Purpose

The spec-guard MCP server exposes the Spec Guard workflow as MCP tools that AI agents can call directly without shelling out to the CLI. It is the primary integration surface for AI-native clients (Claude, Cursor, etc.). Every tool maps 1:1 to a CLI command or a programmatic operation; tool inputs and outputs are JSON-structured.

## Exported Surface

### Tools

| Tool | Purpose |
|---|---|
| `spec_guard_check` | Gate 1 — validate a spec file; return diagnostics |
| `spec_guard_gate_status` | Return pass/fail state of all gates for a spec |
| `spec_guard_classify` | Return the selected work classification for a spec |
| `spec_guard_test_guidance` | Return required test type and guidance for a classification |
| `spec_guard_confirm_gate` | Record agent-confirmed gate (3, 4, 5, or 6) |
| `spec_guard_create_artifact` | Create a Spec Guard artifact from a template |
| `spec_guard_validate_directory` | Validate all specs in a directory |
| `spec_guard_status` | Return status overview of all specs |
| `spec_guard_draft_spec` | Build a spec from structured answers; runs Gate 1 |
| `spec_guard_analyze` | Cross-artifact alignment check (spec ↔ contract ↔ review) |
| `spec_guard_interview_questions` | Return question list for single-spec authoring |
| `spec_guard_suggest` | Gate 1 validation with per-diagnostic fix instructions |
| `spec_guard_workflow_next_step` | Return the next required action given current gate state |
| `spec_guard_initiative_questions` | Return question list for initiative decomposition |
| `spec_guard_save_initiative` | Validate and save an initiative artifact |

---

### `spec_guard_check`

```
Input:  { spec_path: string, include_warnings?: boolean }
Output: { diagnostics: Diagnostic[], blocker_count: number, warning_count: number }
```

`include_warnings` defaults to false (BLOCKERs only). A spec must reach `blocker_count === 0` before Gate 1 passes.

---

### `spec_guard_gate_status`

```
Input:  { spec_path: string }
Output: { gate1: boolean, gate2: boolean, gate3: boolean, gate4: boolean, gate5: boolean,
          classification: string | null, test_guidance: string | null }
```

Gates 1 and 2 are computed live. Gates 3–6 are read from the saved run state (`.spec-guard/runs/<name>-run.json`).

---

### `spec_guard_classify`

```
Input:  { spec_path: string }
Output: { classification: string } | { diagnostic: Diagnostic }
```

Returns a BLOCKER diagnostic when zero or multiple classifications are checked.

---

### `spec_guard_test_guidance`

```
Input:  { classification: string }
Output: { test_type: string, guidance: string }
```

Valid classification values: `Reusable non-UI API` | `REST/service API` | `Reusable UI component` | `One-off application UI` | `Direct behavior with no new API or UI` | `Operational/document deliverable` | `Bugfix`.

---

### `spec_guard_confirm_gate`

```
Input:  { spec_path: string, gate: 3|4|5|6, confirmed: boolean, evidence?: string }
Output: { recorded: boolean, gates_passed: string[] }
```

`evidence` is required for Gate 4 (failure-first). `confirmed: false` records that the gate is not yet confirmed. Writes to `.spec-guard/runs/<name>-run.json`.

---

### `spec_guard_create_artifact`

```
Input:  { kind: string, output_path: string, spec_path?: string }
Output: { path: string } | { error: string }
```

Valid kinds: `spec` | `api-contract` | `rest-api-contract` | `component-contract` | `one-off-ui` | `operational-document` | `task-plan` | `compound-work` | `blocker` | `scope-discovery` | `review` | `discovery` | `deviation`.

When `spec_path` is supplied for contract kinds, links the new artifact back to the spec under `Related Artifacts`.

---

### `spec_guard_validate_directory`

```
Input:  { directory?: string, include_warnings?: boolean }
Output: { total: number, clean: number, with_issues: number, with_blockers: number,
          files: [{ path, diagnostics: Diagnostic[] }] }
```

`directory` defaults to `.spec-guard/specs/`.

---

### `spec_guard_status`

```
Input:  { directory?: string }
Output: { specs: [{ path, title, status, classification, blocker_count, warning_count }] }
```

`directory` defaults to `.spec-guard/specs/`.

---

### `spec_guard_draft_spec`

```
Input: {
  title?: string,
  problem: string,
  in_scope: string[],
  out_of_scope: string[],
  users?: string[],
  expected_behavior: string,
  acceptance_criteria: string[],
  open_questions?: string[],
  classification: string,
  design_direction?: string,
  component_library?: string,
  dependencies?: string[],
  output_path?: string
}
Output: {
  gate1_passed: boolean,
  missing_required: string[],
  spec_text: string,
  path?: string      // present when output_path was provided and file was written
}
```

When all required fields are present and valid, `gate1_passed` is true. When `output_path` is given and the file does not yet exist, the spec is written to disk and `path` is returned. Refuses to overwrite an existing file.

---

### `spec_guard_analyze`

```
Input:  { spec_path: string, contract_path?: string, review_path?: string, dry_run?: boolean }
Output: { diagnostics: Diagnostic[], clean: boolean, dry_run: boolean }
```

`dry_run: true` skips all review rules and always returns `clean: true` (advisory). Paths are auto-discovered from the spec filename when omitted.

---

### `spec_guard_interview_questions`

```
Input:  { classification?: string }
Output: {
  protocol: string,
  questions: Question[],
  next_tool: string
}

Question {
  field: string,
  required: boolean,
  question: string,
  hint: string
}
```

Returns base required questions plus classification-specific follow-ups when `classification` is provided. `next_tool` is always `"spec_guard_draft_spec"`.

---

### `spec_guard_suggest`

```
Input:  { spec_path: string, include_warnings?: boolean }
Output: { diagnostics: AnnotatedDiagnostic[], blocker_count: number }

AnnotatedDiagnostic extends Diagnostic {
  suggestion: string   // concrete, multi-line fix instruction
}
```

---

### `spec_guard_workflow_next_step`

```
Input:  { spec_path: string, gates_passed?: ('gate1'|'gate2'|'gate3'|'gate4'|'gate5')[] }
Output: { next_step: string, gate: string | null, action: string }
```

---

### `spec_guard_initiative_questions`

```
Input:  {}
Output: {
  specs_exist: boolean,
  questions: { required: Question[], optional: Question[] }
}
```

`specs_exist: true` means `.spec-guard/specs/` already contains specs — the initiative flow should not be used.

---

### `spec_guard_save_initiative`

```
Input: {
  name: string,
  title: string,
  description: string,
  slices: Slice[],
  output_dir?: string,
  deployment_target?: string,
  external_dependencies?: string[]
}

Slice {
  name: string,
  title: string,
  description: string,
  classification: string
}

Output (success): {
  path: string,
  slices: [{ name: string, suggestedSpecPath: string }]
}

Output (error): {
  error: string
}
```

Returns `{ error }` without writing when: `name` or any slice `name` contains characters outside `[a-z0-9-]`; any `classification` is not one of the 7 known values; any slice `name` conflicts with an existing spec file.

---

## Inputs

All tools accept JSON objects. Required fields are documented per-tool above. Unknown fields are ignored.

## Outputs

### `Diagnostic`

```json
{
  "severity": "BLOCKER" | "WARNING" | "INFO",
  "ruleId": "SG-XXXX-NNN",
  "path": "string",
  "message": "string"
}
```

## Errors

Tools do not throw. All error conditions return `{ error: string }` or a `diagnostics` array with BLOCKER severity. The MCP transport returns a standard MCP error response for protocol-level failures (malformed JSON, unknown tool name).

## Side Effects

Write tools (`spec_guard_draft_spec`, `spec_guard_create_artifact`, `spec_guard_confirm_gate`, `spec_guard_save_initiative`) write files under `.spec-guard/` and may update `.spec-guard/README.md`.

Read tools (`spec_guard_check`, `spec_guard_gate_status`, `spec_guard_classify`, `spec_guard_test_guidance`, `spec_guard_validate_directory`, `spec_guard_status`, `spec_guard_analyze`, `spec_guard_interview_questions`, `spec_guard_suggest`, `spec_guard_workflow_next_step`, `spec_guard_initiative_questions`) do not modify files.

## Versioning / Backward Compatibility

- Tool names (`spec_guard_*`) are stable identifiers. Renaming is a breaking change.
- Required input fields will not be removed without a major version bump.
- Output fields are additive; new fields may appear without notice.
- `ruleId` values (`SG-*`) are stable; new rule IDs may be added but existing ones will not be renumbered.

## End-User API Documentation

- Documentation Path: `docs/mcp.md`
