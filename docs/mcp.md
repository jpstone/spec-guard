# MCP Tool Reference

The spec-guard MCP server (`mcp/server.js`) exposes all Spec Guard operations as structured tool calls. See [`mcp/README.md`](../mcp/README.md) for setup and configuration.

---

## Tools

### `spec_guard_check`

Validate a spec file against all Spec Guard rules. Gate 1 check.

**Input**

| Field | Type | Required | Description |
|---|---|---|---|
| `spec_path` | string | ✓ | Path to the spec markdown file |
| `include_warnings` | boolean | | Include WARNING and INFO diagnostics (default: false — BLOCKERs only) |

**Output**

```json
{
  "diagnostics": [{ "severity": "BLOCKER", "ruleId": "SG-SPEC-001", "path": "...", "message": "..." }],
  "blocker_count": 1,
  "warning_count": 0
}
```

A spec must reach `blocker_count === 0` before Gate 1 passes.

---

### `spec_guard_suggest`

Gate 1 validation with a concrete, multi-line fix instruction for each diagnostic. Prefer this over `spec_guard_check` when the agent needs to know how to fix issues, not just that they exist.

**Input**

| Field | Type | Required | Description |
|---|---|---|---|
| `spec_path` | string | ✓ | Path to the spec markdown file |
| `include_warnings` | boolean | | Include WARNING and INFO diagnostics (default: false) |

**Output**

Same shape as `spec_guard_check`, with an additional `suggestion` field on each diagnostic:

```json
{
  "diagnostics": [{ "severity": "BLOCKER", "ruleId": "...", "message": "...", "suggestion": "In the Work Classification section, check exactly one box..." }],
  "blocker_count": 1
}
```

---

### `spec_guard_gate_status`

Return the pass/fail state of all gates for a spec. Gates 1 and 2 are computed live; Gates 3–6 are read from saved run state.

**Input**

| Field | Type | Required | Description |
|---|---|---|---|
| `spec_path` | string | ✓ | Path to the spec markdown file |

**Output**

```json
{
  "gate1": true,
  "gate2": false,
  "gate3": false,
  "gate4": false,
  "gate5": false,
  "gate6": false,
  "classification": "Reusable non-UI API",
  "test_guidance": "Unit tests against exported surface only"
}
```

---

### `spec_guard_classify`

Return the selected work classification for a spec.

**Input**

| Field | Type | Required | Description |
|---|---|---|---|
| `spec_path` | string | ✓ | Path to the spec markdown file |

**Output** — success:

```json
{ "classification": "Reusable non-UI API" }
```

**Output** — zero or multiple classifications checked:

```json
{ "diagnostic": { "severity": "BLOCKER", "ruleId": "SG-CLASS-001", "message": "..." } }
```

---

### `spec_guard_test_guidance`

Return the required test type and guidance for a given work classification.

**Input**

| Field | Type | Required | Description |
|---|---|---|---|
| `classification` | string | ✓ | One of the 7 valid classifications (see below) |

Valid values: `Reusable non-UI API` · `REST/service API` · `Reusable UI component` · `One-off application UI` · `Direct behavior with no new API or UI` · `Operational/document deliverable` · `Bugfix`

**Output**

```json
{ "test_type": "Unit tests", "guidance": "Test only the documented/exported surface..." }
```

---

### `spec_guard_analyze`

Cross-artifact alignment check: spec ↔ contract ↔ implementation review. Run before closing Gate 6.

**Input**

| Field | Type | Required | Description |
|---|---|---|---|
| `spec_path` | string | ✓ | Path to the spec |
| `contract_path` | string | | Explicit contract path (auto-discovered if omitted) |
| `review_path` | string | | Explicit review path (auto-discovered if omitted) |
| `dry_run` | boolean | | Contract-only check; skips review rules; always returns clean (advisory) |

**Output**

```json
{
  "diagnostics": [],
  "clean": true,
  "dry_run": false
}
```

Pass `dry_run: true` for a pre-implementation contract-only check at Gate 3. In dry-run mode the result is always `clean: true` regardless of findings — it is advisory only.

---

### `spec_guard_confirm_gate`

Record an agent-confirmed gate (3, 4, 5, or 6). Writes to `.spec-guard/runs/<name>-run.json`.

**Input**

| Field | Type | Required | Description |
|---|---|---|---|
| `spec_path` | string | ✓ | Path to the spec |
| `gate` | number | ✓ | Which gate: `3`, `4`, `5`, or `6` |
| `confirmed` | boolean | ✓ | Whether the gate condition is met |
| `evidence` | string | | Required for Gate 4 — describe what test failed and why |

**Output**

```json
{ "recorded": true, "gates_passed": ["gate3", "gate4"] }
```

---

### `spec_guard_create_artifact`

Create a Spec Guard artifact from a template. Refuses to overwrite an existing file.

**Input**

| Field | Type | Required | Description |
|---|---|---|---|
| `kind` | string | ✓ | Artifact type (see table below) |
| `output_path` | string | ✓ | Path to write the artifact |
| `spec_path` | string | | Originating spec to update with a backlink under `Related Artifacts` |

Valid kinds:

| Kind | Default location | Use for |
|---|---|---|
| `spec` | `.spec-guard/specs/` | New feature or behavior spec |
| `api-contract` | `.spec-guard/contracts/` | Reusable non-UI API contract |
| `rest-api-contract` | `.spec-guard/contracts/` | REST/service API contract |
| `component-contract` | `.spec-guard/contracts/` | Reusable UI component contract |
| `one-off-ui` | `.spec-guard/specs/` | One-off UI spec supplement |
| `operational-document` | `.spec-guard/specs/` | Operational deliverable |
| `task-plan` | `.spec-guard/specs/` | Implementation task plan |
| `compound-work` | `.spec-guard/specs/` | Multi-classification work plan |
| `blocker` | `.spec-guard/blockers/` | Blocker artifact |
| `scope-discovery` | `.spec-guard/scope-discoveries/` | Scope discovery |
| `review` | `.spec-guard/reviews/` | Implementation review |
| `discovery` | `.spec-guard/discoveries/` | Discovery request |
| `deviation` | `.spec-guard/deviations/` | Spec deviation |

**Output**

```json
{ "path": ".spec-guard/blockers/missing-mockup.md" }
```

---

### `spec_guard_validate_directory`

Validate all spec files in a directory. Returns a summary with per-file diagnostics.

**Input**

| Field | Type | Required | Description |
|---|---|---|---|
| `directory` | string | | Directory to scan (default: `.spec-guard/specs/`) |
| `include_warnings` | boolean | | Include WARNING diagnostics |

**Output**

```json
{
  "total": 10,
  "clean": 8,
  "with_issues": 2,
  "with_blockers": 1,
  "files": [{ "path": "...", "diagnostics": [] }]
}
```

---

### `spec_guard_status`

Return a status overview of all specs in a directory.

**Input**

| Field | Type | Required | Description |
|---|---|---|---|
| `directory` | string | | Directory to scan (default: `.spec-guard/specs/`) |

**Output**

```json
{
  "specs": [
    { "path": "...", "title": "User Login", "status": "Implementation Active", "classification": "REST/service API", "blocker_count": 0, "warning_count": 1 }
  ]
}
```

---

### `spec_guard_draft_spec`

Build a spec from structured answers and run Gate 1 validation. Optionally write the file to disk.

**Input**

| Field | Type | Required | Description |
|---|---|---|---|
| `problem` | string | ✓ | What problem is being solved? |
| `in_scope` | string[] | ✓ | What is explicitly included? |
| `out_of_scope` | string[] | ✓ | What is explicitly excluded? |
| `expected_behavior` | string | ✓ | Observable behavior when working correctly |
| `acceptance_criteria` | string[] | ✓ | Specific, testable conditions |
| `classification` | string | ✓ | One of the 7 valid classifications |
| `title` | string | | Short feature name |
| `users` | string[] | | Who uses or invokes this? |
| `open_questions` | string[] | | Unresolved questions |
| `design_direction` | string | | Required for One-off application UI |
| `component_library` | string | | Required for One-off application UI |
| `dependencies` | string[] | | External dependencies |
| `output_path` | string | | Write the spec to this path (refuses to overwrite) |

**Output**

```json
{
  "gate1_passed": true,
  "missing_required": [],
  "spec_text": "# Spec\n\n## Title\n...",
  "path": ".spec-guard/specs/my-feature.md"
}
```

`path` is only present when `output_path` was given and the file was written.

---

### `spec_guard_interview_questions`

Return the structured question list for AI-assisted spec authoring. Call this before `spec_guard_draft_spec`.

**Input**

| Field | Type | Required | Description |
|---|---|---|---|
| `classification` | string | | If known, return classification-specific follow-up questions |

**Output**

```json
{
  "protocol": "1. Ask the user the required questions in order...",
  "questions": [
    { "field": "problem", "required": true, "question": "What problem are you solving?", "hint": "Focus on the problem, not the solution." }
  ],
  "next_tool": "spec_guard_draft_spec"
}
```

---

### `spec_guard_workflow_next_step`

Given a spec and the gates already confirmed, return the next required action. Use this after every action to know what to do next without reading the full workflow docs.

**Input**

| Field | Type | Required | Description |
|---|---|---|---|
| `spec_path` | string | ✓ | Path to the spec |
| `gates_passed` | string[] | | Gates already confirmed: `gate1` · `gate2` · `gate3` · `gate4` · `gate5` |

**Output**

```json
{
  "next_action": "write_failing_tests",
  "instruction": "Write tests that verify every acceptance criterion in the spec...",
  "gate_target": "gate4",
  "test_guidance": "Unit tests against the documented/exported API surface only..."
}
```

---

### `spec_guard_initiative_questions`

Return the structured question list for decomposing a broad app or product idea into individual feature slices. Use this when a developer describes a multi-feature initiative rather than a single spec.

**Input**

None.

**Output**

```json
{
  "specs_exist": false,
  "questions": {
    "required": [{ "id": "...", "question": "...", "notes": "..." }],
    "optional": []
  }
}
```

`specs_exist: true` means `.spec-guard/specs/` already has specs — use the standard single-spec flow instead.

---

### `spec_guard_save_initiative`

Validate and save an initiative decomposition artifact.

**Input**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✓ | URL-safe identifier (`[a-z0-9-]` only) |
| `title` | string | ✓ | Human-readable initiative title |
| `description` | string | ✓ | Brief summary |
| `slices` | Slice[] | ✓ | Feature slices (see below) |
| `output_dir` | string | | Directory for the artifact (default: current directory) |
| `deployment_target` | string | | Intended deployment target (e.g. `"Vercel + Supabase"`, or `"TBD"`) |
| `external_dependencies` | string[] | | External services needing substitutes (e.g. `["stripe"]`) |

Each `Slice`: `{ name: string, title: string, description: string, classification: string }`

**Output** — success:

```json
{
  "path": ".spec-guard/initiatives/my-app.md",
  "slices": [{ "name": "user-auth", "suggestedSpecPath": ".spec-guard/specs/user-auth.md" }]
}
```

**Output** — error (no file written):

```json
{ "error": "slice name 'User Auth' contains characters outside [a-z0-9-]" }
```

Returns `{ error }` when: any `name` contains characters outside `[a-z0-9-]`, any `classification` is invalid, or any slice `name` conflicts with an existing spec file.

---

### `spec_guard_set_status`

Update a spec's `Status` field and regenerate the artifact index atomically. Use this instead of editing the spec file directly — direct edits leave the artifact index stale.

**Input**

| Field | Type | Required | Description |
|---|---|---|---|
| `spec_path` | string | ✓ | Path to the spec markdown file |
| `status` | string | ✓ | New status value (see valid values below) |

Valid `status` values: `Draft`, `Pending Approval`, `Ready for Implementation`, `Implementation Active`, `Blocked`, `Implemented`, `Deferred`.

**Status lifecycle during spec authoring:**

| When | Status to set |
|---|---|
| Presenting spec to the user for review | `Pending Approval` |
| User approves the spec | `Ready for Implementation` |
| User explicitly authorizes implementation | `Implementation Active` (set before confirming Gate 3) |

**Output** — success:

```json
{ "status": "Pending Approval", "spec_path": ".spec-guard/specs/my-feature.md", "updated": true }
```

**Output** — error:

```json
{ "error": "\"Not Valid\" is not a valid spec status. Valid statuses: Draft, Pending Approval, ..." }
```

---

## Diagnostic format

All diagnostic objects share this shape:

```json
{
  "severity": "BLOCKER" | "WARNING" | "INFO",
  "ruleId": "SG-XXXX-NNN",
  "path": ".spec-guard/specs/my-feature.md",
  "message": "human-readable description"
}
```

`spec_guard_suggest` adds a `suggestion` field with a concrete, multi-line fix instruction.

See [`docs/validation-rules.md`](validation-rules.md) for the full rule ID reference.
