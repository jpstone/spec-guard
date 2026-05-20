# Changelog

## 0.9.1

### Bug fixes

- `spec-guard draft` and `spec-guard initiative` now exit 2 with a clear error when stdin is not a TTY, instead of crashing with exit code 13; message points to `--from-json` and the relevant `*-questions --json` command
- `spec-guard interview-questions` now accepts `--classification <type>` and passes it to the question builder, returning classification-specific follow-up questions; previously the flag was silently ignored
- `parseFlags` now handles `--classification <value>` as a space-separated pair

---

## 0.9.0

### CLI invocation guidance

- `AGENTS.md` — added note that `npx spec-guard` should be used when `spec-guard` is not on PATH; fixes agents in projects where the package is a local dev dependency

### MCP documentation

- `mcp/README.md` — added `spec_guard_initiative_questions` and `spec_guard_save_initiative` entries with example payloads; added initiative decomposition workflow to Typical Agent Workflow section; updated `spec_guard_analyze` description to include SG-ALIGN-005 and SG-ALIGN-006

### CLI documentation

- `docs/cli.md` — added `interview-questions` entry; added `--from-json` flag documentation to `draft` and `initiative` entries with example JSON payloads

---

## 0.8.0

### CLI/MCP parity for non-interactive agents

- `spec-guard interview-questions [--json]` — mirrors `spec_guard_interview_questions`; prints structured question list or returns JSON with `pre_classification`, `classification_specific`, and `universal_optional` arrays
- `spec-guard draft [--from-json <path>|-] <name>` — `--from-json` flag accepts a JSON file path or `-` for stdin; non-interactive path for CLI agents that cannot drive a TTY wizard
- `spec-guard initiative [--from-json <path>|-] <name>` — same non-interactive flag for initiative creation
- `readJsonInput()` helper in `bin/spec-guard.js` — shared stdin/file JSON reader used by both `--from-json` paths
- `interviewQuestions()` extracted from `mcp/server.js` into `src/discover.js` — single source for CLI and MCP

### Review completeness enforcement

- `templates/implementation-review.md` — added `Linked Contract`, `Implementation Files`, `Test Files`, `Summary of Change`, and `Linked Documentation` sections; added Documentation Updates checkbox requiring all linked docs are confirmed updated
- `templates/spec.md` — added `Prior Implementation Review` field for changes to existing features
- `templates/brownfield-spec.md` — added `Previous Implementation Review` field
- `AGENTS.md` — added "Before Starting Any Work on an Existing Feature" instruction to check the prior review
- `SG-ALIGN-005` — WARNING when `Implementation Files` section is blank in a review (skipped for `Operational/document deliverable`)
- `SG-ALIGN-006` — WARNING when `Test Files` section is blank in a review (skipped for `Operational/document deliverable`)

## 0.7.2

### Internal

- MCP server now reads version from `package.json` at startup — single source of truth

## 0.7.1

### Documentation

- `docs/cli.md` — added `initiative-questions` and `initiative` command entries; added `initiatives/` to `init` directory tree
- `docs/glossary.md` — added "Initiative" definition
- `docs/quickstart.md` — added "Starting from a broad app idea" section
- `README.md` — added `spec_guard_initiative_questions` and `spec_guard_save_initiative` to MCP tools table
- `.gitignore` — added `.spec-guard/runs/` (ephemeral gate state, not a project artifact)

## 0.7.0

### Initiative decomposition

- `spec_guard_initiative_questions` MCP tool — returns structured question list (required + optional) for gathering context before decomposing a broad app into feature slices
- `spec_guard_save_initiative` MCP tool — validates and writes `.spec-guard/initiatives/<name>.md`; returns slice names and suggested spec paths for use with `spec_guard_draft_spec`
- `spec-guard initiative-questions [--json]` CLI command — mirrors `spec_guard_initiative_questions`
- `spec-guard initiative <name>` CLI command — interactive wizard; mirrors `spec_guard_save_initiative`; exits 1 (SG-USAGE-002) if file already exists
- `spec-guard init` now creates `.spec-guard/initiatives/` directory
- `templates/initiative.md` — initiative artifact template
- `AGENTS.md` — added "Initiative Decomposition — When to Use It" section with agent signal guidance; updated directory structure and tool references

Multiple initiatives coexist as separate named files in `.spec-guard/initiatives/`.

## 0.6.0

### New CLI commands — CLI/MCP parity complete

- `spec-guard gate-status <name>` — shows pass/fail for all 5 gates; gates 1–2 checked live, gates 3–5 from run state; supports `--json`
- `spec-guard confirm-gate <name> <3|4|5>` — records agent gate confirmation; gate 3 requires `--evidence="<what failed and why>"`; `--no-confirm` records a failed confirmation
- `spec-guard next <name>` — returns the next action given current gate state, mirrors `spec_guard_workflow_next_step`
- `spec-guard classify` now includes test guidance in output, matching `spec_guard_classify` MCP behavior

Every MCP tool now has a CLI equivalent.

### Documentation

- Renamed `docs/methodology.md` → `docs/philosophy.md`; rewrote as human-facing design philosophy
- Deleted `docs/adoption.md`, `docs/comparisons.md`, `docs/principles.md`
- Deleted `checklists/` (superseded by mechanical gates and `AGENTS.md`)
- `AGENTS.md` — pre-implementation checklist now includes Gates 2 and 3; optimized for agent consumption
- `WORKFLOW.md` — added "Triggered by" lines for each phase; optimized for agent consumption
- `docs/quality-gates.md` — added correct `confirm-gate` commands for gates 3–5
- `docs/validation-rules.md` — fixed default filter description; corrected SG-ALIGN-001 section reference
- `docs/work-classification.md` — one-off UI row now documents design input requirement; reusable UI component test requirement updated

### Examples

- Replaced per-classification example directories with a single end-to-end walkthrough: developer request → spec authoring → Gates 1–5 → complete

### Tests

- Added coverage for all 7 previously untested `new <kind>` template types
- 161 tests (was 154)

---

## 0.5.0

### Cross-artifact analysis

- `spec-guard analyze` — compares spec against its contract and implementation review; checks contract structure, review coverage of all acceptance criteria and required tests, and unchecked review items
- `spec_guard_analyze` MCP tool — same check callable by agents
- Gate 5 now requires `spec-guard analyze` to be clean before review is considered complete
- SG-ALIGN-001/002/003/004 rules detect acceptance criteria not covered in review, required tests not covered in review, contract file issues, and unchecked review items

### Actionable feedback

- `spec-guard suggest` — runs `check` and annotates each diagnostic with a concrete, multi-line fix instruction with before/after examples
- `spec_guard_suggest` MCP tool — same for agents
- Every rule ID now has a mapped fix instruction in `src/suggest.js`

### AI-assisted spec authoring

- `spec_guard_interview_questions` MCP tool — returns a structured question list and authoring protocol that agents use to guide spec authoring conversations; classification-specific follow-up questions
- `spec_guard_draft_spec` MCP tool — turns structured interview answers into a valid spec that passes Gate 1
- `spec-guard discover` enhanced with context about AI-assisted path

### Brownfield support

- `templates/brownfield-spec.md` — spec template for changes to existing systems; adds `Existing Behavior` (as-is baseline) and `Behavior Delta` (BEFORE → AFTER format) sections
- `spec-guard new brownfield-spec` creates from this template

### New quality rules

- **SG-SPEC-007** (INFO) — flags vague qualifiers in acceptance criteria ("correctly", "fast", "properly", etc.)
- **SG-SPEC-008** (INFO) — flags scope items with ≤2 words as too brief to prevent misinterpretation

### AGENTS.md rewrite

- Documents three spec authoring paths: AI-assisted (interview_questions → draft_spec), guided wizard (discover), brownfield
- Full MCP Tool Quick Reference covering all 13 tools
- Adds "What You Must Never Do" including: close Gate 5 without running `spec-guard analyze`

---

## 0.4.0

### Guided spec authoring

- `spec-guard discover path/to/spec.md` — interactive 8-step wizard that asks questions and writes a valid spec; loops on required fields until they are filled; refuses to overwrite existing files
- `spec_guard_draft_spec` MCP tool — accepts structured answers and returns a spec that passes Gate 1; optionally writes to a file
- `buildSpecFromAnswers()` in `src/discover.js` — pure function that generates spec text from named fields

---

## 0.3.0

### Orchestrated workflow

- `spec-guard run [--check-only] path/to/spec.md` — 5-phase interactive workflow runner; blocks on gate failures; records gate confirmations to `.spec-guard/runs/`
- `PHASES` export from `src/run.js` for programmatic use
- `runCheck()` utility function

### MCP server (9 tools)

- `spec_guard_check`, `spec_guard_gate_status`, `spec_guard_classify`, `spec_guard_test_guidance`, `spec_guard_confirm_gate`, `spec_guard_create_artifact`, `spec_guard_validate_directory`, `spec_guard_status`, `spec_guard_workflow_next_step`
- `spec_guard_workflow_next_step` is the primary tool for agents: given a list of passed gates, returns a structured `next_action` + `instruction`

### Supporting documents

- `WORKFLOW.md` — full process flow with gates, phases, and decision points
- `AGENTS.md` — compact, table-driven agent instructions

---

## 0.2.0

### New CLI commands

- `validate [dir]` — runs `check` across an entire specs directory, prints a summary
- `status [dir]` — prints a table of all specs with status, classification, and issue count
- `watch <path>` — re-runs `check` on every file save; clears terminal between runs

### New CLI flags

- `--json` on `check`, `validate`, `classify`, `status` — NDJSON/JSON output for CI pipelines
- `--warnings` on `check` and `validate` — includes WARNING and INFO diagnostics (default: BLOCKERs only)

### New validations in `check`

- **SG-SPEC-003** (WARNING) — warns on unresolved items in `Open Questions`
- **SG-SPEC-005** (WARNING) — warns when Acceptance Criteria use plain bullets instead of checkbox format
- **SG-SPEC-006** (INFO) — notes non-standard `Status` values
- **SG-CLASS-002** (WARNING) — warns when API/component classification has no contract reference
- **SG-UI-001** (BLOCKER) — blocks UI work with no mockup, wireframe, or design direction reference
- **SG-UI-002** (WARNING) — warns on UI work with no component library reference

### `init` improvements

- Creates a starter `specs/example.md` from the spec template
- Creates `AGENTS.md` at the project root
- Creates `.spec-guard/deviations/` directory

---

## 0.1.0

Initial functional baseline.

Includes:

- Spec Guard methodology and agent instructions.
- Work classification guide.
- Templates for specs, plans, contracts, UI work, blockers, scope discoveries, implementation reviews, and document deliverables.
- Operational checklists.
- Examples for reusable APIs, REST APIs, reusable UI, one-off UI, and document deliverables.
- CLI command: `spec-guard check path/to/spec.md`.
- CLI validation for required spec headings (SG-SPEC-002), concrete required-section content (SG-SPEC-004), exactly one selected classification (SG-CLASS-001), and required tests/checks (SG-TEST-001).
- Template/scaffolding commands: `init`, `new spec`, `classify`, `blocker`, `scope-discovery`, `review`, `discovery`, and `deviation`.
- Objective quality gates and workflow comparison.
- Explicit discovery mode to prevent unsolicited feature roadmaps.
- Explicit spec deviation flow to prevent agents from silently changing specs.
- Cross-platform Node test workflow.
