# Changelog

## 1.1.0

### Pre-implementation contract check (`analyze --dry-run`)

- `spec-guard analyze <name> --dry-run` runs contract alignment checks only (SG-ALIGN-003, SG-ALIGN-008), skips all review-dependent rules, and always exits 0 — results are advisory, never blocking.
- Output is labeled as a pre-implementation check to distinguish it from the full Gate 6 run.
- `spec_guard_analyze` MCP tool accepts `dry_run: true` with the same behavior; result includes `dry_run: true` field.
- `spec-guard run` orchestrator auto-invokes dry-run analysis at Phase 3 when a contract is inferred, printing any diagnostics as advisory output before Phase 4 begins.
- Added `REVIEW_RULES` constant set to `src/analyze.js`; SG-STALE-001 and all review-dependent rules are members and are skipped in dry-run mode.
- Updated `AGENTS.md` and `docs/cli.md` to document the flag and auto-invocation behavior.

---

## 1.0.1

### Bugfix: artifact backlink paths broken on GitHub

- `addArtifactLinkToSpec` in both `bin/spec-guard.js` and `mcp/server.js` computed artifact link paths relative to `process.cwd()` (repo root). GitHub resolves relative markdown links relative to the file containing the link, so links like `.spec-guard/reviews/foo.md` written into `.spec-guard/specs/foo.md` resolved to non-existent paths.
- Fixed by anchoring to `dirname(resolvedSpec)` instead — links now produce correct relative paths (e.g. `../reviews/foo.md`) that work in GitHub.

### Bugfix evidence permanence enforcement

- Added `SG-BUG-001` (BLOCKER) to `spec-guard check`: fires when a spec is classified as `Bugfix` and the `Test Evidence` section is absent or has neither option checked.
- Added `## Test Evidence` section to `templates/spec.md` with permanent and temporary checkbox options (Bugfix classification only).
- `buildSpecFromAnswers` accepts a new `testEvidence` parameter (`'permanent'` | `'temporary'`) and outputs the section for Bugfix specs.
- Updated `AGENTS.md` Bugfix row to require the `Test Evidence` field before Gate 4.
- Added `SG-BUG-001` fix instruction to `spec-guard suggest`.
- Added `SG-BUG-001` to `docs/validation-rules.md`.

---

## 1.0.0

### Spec artifact backlinks

- Creating a spec-linked artifact (contract, implementation review, blocker, deviation, scope discovery, or discovery) now records a direct repository-relative link to that artifact in the originating spec's `Related Artifacts` section.
- Link recording is idempotent — re-running artifact creation or link recording does not duplicate existing links.
- Artifact creation commands that have no identifiable originating spec preserve prior behavior.
- Updated `AGENTS.md`, `WORKFLOW.md`, and `docs/cli.md` to document the lifecycle traceability requirement.

### Implementation planning phase

- Added a dedicated implementation planning phase between Classify & Contract and Test First — the workflow is now a six-gate loop.
- Specs record whether implementation planning is required and, when required, the human-confirmed stack or tech-layer choice (`Confirmed Plan`).
- Agent instructions require suggesting a context-appropriate stack or layer when planning is required, then waiting for the human to accept or override before proceeding.
- **SG-PLAN-001** — BLOCKER reported by `spec-guard check` when a spec requires implementation planning but `Confirmed Plan` is not recorded.
- `templates/spec.md` updated with `Implementation Planning` section fields.
- Updated `AGENTS.md`, `WORKFLOW.md`, and `README.md` to describe the new gate, agent obligations, and six-gate workflow.

---

## 0.14.0

### Spec status transitions

- Specs now transition from `Draft` to `Ready` when Gate 3 is confirmed and to `Implemented` when Gate 5 is confirmed.
- `blocker --spec <spec> <topic>` and `deviation --spec <spec> <topic>` mark the referenced spec as `Blocked`.
- `gate-status` now reports the current spec file status while gate/run state remains authoritative.
- Workflow documentation now describes status transitions and clarifies that status does not replace gate confirmations.

---

## 0.13.0

### Documentation integrity workflow

- Added spec-level `Documentation Requirements` support so docs required by the current spec are tracked up front with direct repository-relative links.
- Added `SG-ALIGN-009` analysis checks to keep spec documentation requirements aligned with implementation review `Linked Documentation` entries.
- Updated workflow, agent, spec, and review templates so agents verify current-spec documentation obligations without auditing unrelated repository docs.

### API contract end-user docs

- API and REST API contract creation now creates a corresponding end-user API doc, persists its repository-relative path in the contract, and validates that the file exists.
- End-user API docs are placed in an obvious existing docs location when available, falling back to `docs/`.
- Suggested end-user API doc filenames use `api` instead of `contract`.

### README maintenance preference

- Added repo-scoped README maintenance preference persistence under `.spec-guard/`.
- Interactive workflows can ask once whether Spec Guard should create and maintain a README when none exists.
- README updates are kept concise and link to deeper docs; persisted opt-out prevents README creation or updates.

---

## 0.12.0

### Bugfix work classification

- Added `Bugfix` as a valid work classification in specs, templates, CLI/MCP validation, and test guidance.
- Bugfix work keeps failure-first validation while allowing the user to choose permanent or temporary test evidence.
- Temporary Bugfix tests/checks may be removed after passing only after human confirmation that the reported bug is fixed and no longer reproduces.

### Spec Guard bypass prompt

- Agent instructions now require asking `Do you want to use Spec Guard for this task?` at the start of every new codebase change request.
- If the user answers yes, the full Spec Guard workflow remains required.
- If the user answers no, the current task may bypass specs, gates, and Spec Guard artifacts entirely.
- Bypass cannot be inferred from task size, file type, perceived risk, or any other heuristic; it requires the user's explicit answer and applies only to the current task.

---

## 0.11.0

### Dependency integration table enforcement

- `SG-ALIGN-007` — BLOCKER in `spec-guard analyze` when classification is `One-off application UI` and a contract is present: fires if the `Dependency Integration` table is missing, unpopulated (placeholder dashes), or its confirmation checkbox is unchecked; all three conditions are checked independently
- `templates/implementation-review.md` — `Dependency Integration` section is now a structured table: `Dependency | Integration code | Test`; the agent must name the dependency, link the exact file/location that wires it at runtime (proxy config, middleware, dev server script), and name the test that exercises it through that real code path — test-only URL overrides and mocked routes do not satisfy the requirement; followed by a single confirmation checkbox
- `src/run.js` — `One-off application UI` test guidance now requires: identify the integration code, write a test that fails (404) before the wiring exists, implement the wiring, confirm it returns 200; explicitly calls out test-only URL overrides and mocked routes as non-compliant
- `src/suggest.js` — SG-ALIGN-007 fix instruction updated with table example and step-by-step wiring TDD loop

---

## 0.10.0

### Cross-slice integration enforcement

- `SG-ALIGN-007` (initial) — BLOCKER in `spec-guard analyze` when classification is `One-off application UI`, a contract is present, and the `Dependency Integration` checkbox is not checked
- `templates/implementation-review.md` — added `Dependency Integration` section with a single checkbox; remove the section if there is genuinely no runtime dependency
- `src/suggest.js` — added fix instruction for SG-ALIGN-007
- `src/run.js` — `One-off application UI` test guidance states that at least one test must exercise each API dependency without mocking; a fully-mocked suite does not satisfy Gate 3
- `src/initiative.js` — initiative artifact includes a `Cross-Slice Integration` section when slices include both a UI classification and an API classification

---

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
