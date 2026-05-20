# Spec Guard MCP Server

The MCP server exposes all Spec Guard operations as structured tool calls for any MCP-compatible agent (Claude Code, Cursor, Windsurf, etc.).

## Setup

Add to your agent's MCP configuration:

### Claude Code (`~/.claude/mcp.json` or project `.claude/mcp.json`)

```json
{
  "mcpServers": {
    "spec-guard": {
      "command": "node",
      "args": ["/path/to/spec-guard/mcp/server.js"]
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "spec-guard": {
      "command": "node",
      "args": ["/path/to/spec-guard/mcp/server.js"]
    }
  }
}
```

### Using npx (after publishing)

```json
{
  "mcpServers": {
    "spec-guard": {
      "command": "npx",
      "args": ["spec-guard-mcp"]
    }
  }
}
```

---

## Available Tools

### `spec_guard_check`
Validate a spec file. Returns diagnostics with severity, rule IDs, and messages. Gate 1 check.

```json
{ "spec_path": ".spec-guard/specs/my-feature.md", "include_warnings": false }
```

### `spec_guard_suggest`
Run `check` and return each diagnostic annotated with a concrete, multi-line fix instruction. Prefer this over `spec_guard_check` when the agent needs to know how to fix issues, not just that they exist.

```json
{ "spec_path": ".spec-guard/specs/my-feature.md" }
```

### `spec_guard_interview_questions`
Get a structured question list and authoring protocol for AI-assisted spec authoring. Call this first, use the questions to interview the user, then call `spec_guard_draft_spec` with their answers.

```json
{ "classification": "REST/service API" }
```

Returns `pre_classification` questions (required for all specs), `classification_specific` follow-up questions (if classification provided), `universal_optional` fields, and a `protocol` string describing the 5-step authoring process.

### `spec_guard_draft_spec`
Turn structured interview answers into a valid spec that passes Gate 1. Optionally write to a file.

```json
{
  "title": "User login endpoint",
  "problem": "Users cannot authenticate via the API",
  "in_scope": ["POST /auth/login", "JWT token issuance"],
  "out_of_scope": ["OAuth flows", "MFA"],
  "expected_behavior": "Returns 200 with JWT on valid credentials, 401 on invalid",
  "acceptance_criteria": ["Returns 200 with token on valid credentials", "Returns 401 when password is wrong"],
  "classification": "REST/service API",
  "output_path": ".spec-guard/specs/user-login.md"
}
```

### `spec_guard_gate_status`
Get the status of all 5 gates for a spec. Returns which gates have passed and what's needed next.

```json
{ "spec_path": ".spec-guard/specs/my-feature.md" }
```

### `spec_guard_classify`
Get the work classification from a spec, plus test guidance for that classification.

```json
{ "spec_path": ".spec-guard/specs/my-feature.md" }
```

### `spec_guard_test_guidance`
Get test type, contract requirements, and Gate 2 checklist for a classification.

```json
{ "classification": "Reusable non-UI API" }
```

### `spec_guard_analyze`
Cross-artifact consistency check. Compares spec against contract and implementation review.

```json
{
  "spec_path": ".spec-guard/specs/my-feature.md",
  "contract_path": ".spec-guard/contracts/my-feature.md",
  "review_path": ".spec-guard/reviews/my-feature.md"
}
```

Returns diagnostics for: contract missing or blank (SG-ALIGN-003), acceptance criteria not covered in review (SG-ALIGN-001), contract structure issues, unchecked review items (SG-ALIGN-004). Required before Gate 5.

### `spec_guard_confirm_gate`
Record a gate confirmation (Gates 3–5 require agent/human evidence).

```json
{
  "spec_path": ".spec-guard/specs/my-feature.md",
  "gate": 3,
  "confirmed": true,
  "evidence": "test 'should return 404 for unknown user' fails with AssertionError: expected 200 to equal 404"
}
```

### `spec_guard_create_artifact`
Create any Spec Guard artifact from a template.

```json
{ "kind": "blocker", "name": "missing-mockup" }
```

Valid kinds: `spec`, `brownfield-spec`, `api-contract`, `rest-api-contract`, `component-contract`, `one-off-ui`, `operational-document`, `task-plan`, `compound-work`, `blocker`, `scope-discovery`, `review`, `discovery`, `deviation`

### `spec_guard_validate_directory`
Validate all specs in a directory. Returns per-file results and summary counts.

```json
{ "directory": ".spec-guard/specs", "include_warnings": true }
```

### `spec_guard_status`
Get a status overview of all specs: title, status, classification, gate 1 passed, blocker/warning counts.

```json
{ "directory": ".spec-guard/specs" }
```

### `spec_guard_workflow_next_step`
Given a spec and list of passed gates, return the next required action. This is the primary tool for an agent following the workflow — call it after each step to know what to do next.

```json
{
  "spec_path": ".spec-guard/specs/my-feature.md",
  "gates_passed": ["gate1", "gate2"]
}
```

Returns structured guidance:
```json
{
  "next_action": "write_failing_tests",
  "instruction": "Write tests that verify every acceptance criterion in the spec...",
  "gate_target": "gate3",
  "test_guidance": "Unit tests against the documented/exported API surface only..."
}
```

---

## Typical Agent Workflow Using MCP

### Starting a new spec (AI-assisted authoring)

```
1. spec_guard_interview_questions()
   → get question list and authoring protocol

2. [ask user the pre_classification questions]

3. spec_guard_interview_questions(classification="REST/service API")
   → get classification-specific follow-up questions

4. [ask classification-specific follow-up questions]

5. spec_guard_draft_spec(title, problem, in_scope, ..., output_path=".spec-guard/specs/...")
   → spec file written and passes Gate 1
```

### Implementing from an existing spec

```
1. spec_guard_suggest(spec_path)
   → if issues: fix them using the suggestion field, repeat
   → if clean: proceed

2. spec_guard_gate_status(spec_path)
   → understand what's needed for Gate 2

3. spec_guard_classify(spec_path)
   → get classification + test guidance

4. spec_guard_create_artifact(kind="api-contract", name="...")
   → create contract if required by classification

5. spec_guard_confirm_gate(gate=1, confirmed=true)
   spec_guard_confirm_gate(gate=2, confirmed=true)

6. [write tests, run them, observe failure]

7. spec_guard_confirm_gate(gate=3, confirmed=true, evidence="...")

8. [implement until tests pass]

9. spec_guard_confirm_gate(gate=4, confirmed=true)

10. spec_guard_analyze(spec_path, contract_path, review_path)
    → if issues: fix them, repeat analyze
    → if clean: proceed

11. spec_guard_create_artifact(kind="review", output_path=".spec-guard/reviews/...")
    [complete review]
    spec_guard_confirm_gate(gate=5, confirmed=true)
```

Or simply call `spec_guard_workflow_next_step` after each action to get directed guidance.
