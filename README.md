# Spec Guard

**Spec-first. Behavior-tested. Agent-safe.**

Spec Guard is a methodology, workflow runner, and MCP server for **agent-driven software development**. The model is simple: humans write specs, agents write all code. Five mechanical gates enforce the boundary between human intent and agent execution.

> Specs guide implementation, but tests validate running behavior and durable contracts — not prose.

---

## Three layers, one system

| Layer | What it is | Who uses it |
|---|---|---|
| **`WORKFLOW.md` + `AGENTS.md`** | Process flow document + compact agent instructions | Agents that load project files as context, or humans reviewing the process |
| **`spec-guard run`** | Interactive CLI that walks a spec through all 5 gates | Agents executing CLI commands |
| **MCP server** | Structured tool calls for all Spec Guard operations | MCP-compatible agents (Claude Code, Cursor, etc.) |

Each layer enforces the same 5 gates. Pick the one that fits your agent's capabilities — or use all three.

---

## The 5 Gates

```
DISCOVER → [Gate 1] → CLASSIFY & CONTRACT → [Gate 2] → TEST FIRST → [Gate 3] → IMPLEMENT → [Gate 4] → REVIEW → [Gate 5]
```

| Gate | Check | How it's confirmed |
|---|---|---|
| 1 | Spec valid (required headings, content, classification) | `spec-guard check` — must exit 0 |
| 2 | Contracts present (API/UI inputs exist and are referenced) | `spec-guard check --warnings` |
| 3 | Failure-first confirmed (test runs and fails for expected reason) | Agent runs tests, records failure, calls `spec_guard_confirm_gate` |
| 4 | Tests pass (no scope silently absorbed) | Agent runs tests until passing, calls `spec_guard_confirm_gate` |
| 5 | Review complete + cross-artifact analysis clean | `spec-guard review` then `spec-guard analyze` |

---

## Quick start

```bash
npm install --save-dev spec-guard

# Initialize project
npx spec-guard init

# Author a spec (guided wizard)
npx spec-guard draft my-feature

# Orchestrated workflow (recommended)
npx spec-guard run my-feature

# Just validate
npx spec-guard check my-feature

# See all specs
npx spec-guard status
```

## Wiring an agent to Spec Guard

Agents don't inherently know the Spec Guard workflow. Without it, they'll implement normally — no gates, no classification, no halt conditions. There are three ways to give an agent the operating contract:

**MCP server (preferred)** — Connect the MCP server and the agent receives structured guidance at each step via tool calls. No upfront loading required. `spec_guard_workflow_next_step` always tells the agent what to do next. Works with any MCP-compatible agent (Claude Code, Cursor, Copilot, etc.).

**Project file context** — `spec-guard init` puts `AGENTS.md` in the project root. Agents that automatically ingest project-level instruction files (Claude Code's `CLAUDE.md` pattern, Cursor rules, etc.) will pick it up without any manual step. Point the agent at the project and it reads the contract on its own.

**Manual paste** — For agents without MCP support or automatic file ingestion, paste the contents of `AGENTS.md` at the start of a session. The agent then operates under the full Spec Guard contract for that session.

`WORKFLOW.md` has the full phase-by-phase process flow. `AGENTS.md` is the compact operating contract an agent needs to execute it.

---

## CLI

```bash
spec-guard draft <name>                          # guided spec wizard (interactive)
spec-guard run [--check-only] <name>             # 5-phase orchestrated workflow
spec-guard check [--json] [--warnings] <name>
spec-guard suggest [--warnings] <name>           # check + actionable fix instructions
spec-guard analyze [--contract path] [--review path] <name>  # cross-artifact check
spec-guard validate [--json] [--warnings]
spec-guard status [--json]
spec-guard watch <name>
spec-guard init
spec-guard classify [--json] <name>

# Create artifacts
spec-guard new spec|brownfield-spec|api-contract|rest-api-contract|component-contract|
              one-off-ui|operational-document|task-plan|compound-work <name>

# Record problems
spec-guard blocker <name>
spec-guard scope-discovery <name>
spec-guard deviation <name>
spec-guard review <name>
spec-guard discovery <name>
```

### `spec-guard draft`

Guided wizard for writing a spec from scratch. Asks questions interactively and writes a valid spec file that passes Gate 1. Refuses to overwrite an existing file.

### `spec-guard suggest`

Runs `check` and returns each diagnostic annotated with a concrete, multi-line fix instruction. Use this instead of plain `check` when you want to know exactly what to change, not just that something is wrong.

### `spec-guard analyze`

Cross-artifact consistency check that compares the spec against its contract and implementation review:

- Contract exists and contains actual interface definitions (not just a blank template)
- Every acceptance criterion from the spec appears in the review
- Every acceptance criterion from the spec appears in the review
- No unchecked boxes remain in the review

Required before Gate 5 can be considered complete.

### `spec-guard run`

The primary command. Walks a spec through all 5 phases interactively:

- Checks Gate 1 automatically; blocks until spec is valid
- Identifies classification and prints test guidance
- Prompts for contract artifact if required by classification
- Checks Gate 2 automatically
- Guides failure-first confirmation with prompts
- Records failure evidence
- Guides implementation and scope control
- Creates and validates the implementation review
- Saves run state to `.spec-guard/runs/`

With `--check-only`: non-interactive, reports gate 1 and 2 status only (useful for CI).

---

## MCP Server

Exposes all Spec Guard operations as structured tools for MCP-compatible agents.

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

### Available tools

| Tool | What it does |
|---|---|
| `spec_guard_check` | Validate a spec; returns diagnostics |
| `spec_guard_suggest` | Check + return each diagnostic with a concrete fix instruction |
| `spec_guard_gate_status` | Status of all 5 gates for a spec |
| `spec_guard_classify` | Get classification + test guidance |
| `spec_guard_test_guidance` | Get test type and Gate 2 checklist for a classification |
| `spec_guard_confirm_gate` | Record gate 3/4/5 confirmation with evidence |
| `spec_guard_create_artifact` | Create any artifact from a template |
| `spec_guard_validate_directory` | Check all specs in a directory |
| `spec_guard_status` | Overview of all specs |
| `spec_guard_interview_questions` | Get structured question list for AI-assisted spec authoring |
| `spec_guard_draft_spec` | Turn interview answers into a valid spec (passes Gate 1) |
| `spec_guard_analyze` | Cross-artifact consistency check (spec ↔ contract ↔ review) |
| `spec_guard_workflow_next_step` | **Given gates passed → what to do next** |

`spec_guard_workflow_next_step` is the key tool for agents: call it after each action and it returns a structured `next_action` + `instruction` so the agent always knows what step comes next without reading docs.

See `mcp/README.md` for full setup and usage.

---

## What `init` creates

```
.spec-guard/
  specs/
    example.md
  contracts/
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
    spec-guard.yml
```

---

## What agents must never do

- Implement before Gate 1 passes
- Skip work classification
- Create documentation by default
- Test whether documentation files (specs, contracts, reviews, READMEs, help files, changelogs) exist or contain expected content, unless the document is explicitly the deliverable of an operational/document deliverable classification
- Invent UI without design direction
- Silently absorb out-of-scope work
- Skip Gate 3 (failure-first) without recording a concrete reason
- Close Gate 5 without running `spec-guard analyze`
- Propose unsolicited feature roadmaps
- Perform discovery unless the human explicitly asks

---

## Documentation

| Doc | What it covers |
|---|---|
| [Quickstart](docs/quickstart.md) | Minimum workflow, live validation, CI setup |
| [CLI Reference](docs/cli.md) | All commands, flags, exit codes, diagnostic format |
| [Validation Rules](docs/validation-rules.md) | Every rule ID with severity and description |
| [Quality Gates](docs/quality-gates.md) | Gate-by-gate breakdown and pass conditions |
| [Work Classification](docs/work-classification.md) | How to choose the right classification |
| [Methodology](docs/methodology.md) | Core principles and design rationale |
| [Adoption Guide](docs/adoption.md) | Applying Spec Guard to an existing project |
| [Comparisons](docs/comparisons.md) | How Spec Guard differs from other tools |
| [Principles](docs/principles.md) | Foundational rules the methodology is built on |
| [Glossary](docs/glossary.md) | Term definitions |

---

## Development

```bash
npm test                        # 142 tests across check, run, MCP, CLI, discover, analyze, and suggest
npm run check:example           # gate 1 smoke check
npm run run:example             # gate 1+2 non-interactive check
```

---

## License

MIT.
