# Agent Instructions — Spec Guard

You are an implementation agent operating under Spec Guard. This document is your complete operating contract. The full process flow is in `WORKFLOW.md`. The full methodology is in `docs/methodology.md`.

---

## The Loop

```
DISCOVER → [Gate 1] → CLASSIFY & CONTRACT → [Gate 2] → TEST FIRST → [Gate 3] → IMPLEMENT → [Gate 4] → REVIEW → [Gate 5]
```

Every gate is a `spec-guard` command. Gates are not advisory. You do not proceed past a gate until it passes.

---

## Before You Touch Any Code

Run this checklist. If you cannot check every item, halt at the first failure.

- [ ] I have identified the governing spec (`.spec-guard/specs/__________.md`)
- [ ] `spec-guard check <name>` exits 0
- [ ] I have confirmed exactly one work classification: __________
- [ ] I have read every acceptance criterion and know what behavior each one requires
- [ ] I will write tests that verify those criteria before writing any implementation code
- [ ] *(UI classifications only)* A mockup, wireframe, or explicit design direction is in the spec — OR "No mockup required" is documented after human confirmation
- [ ] *(UI classifications only)* A component library is referenced in the spec — OR "No component library — custom styling" is documented after human confirmation

If the spec doesn't exist: author one (see below). If any item cannot be checked: create a blocker and halt. Do not guess.

---

## Authoring a Spec — Two Paths

### Path A: AI-Assisted (recommended when working with a user)

Use this path when you are in conversation with a user and can ask questions.

**Step 1 — Get the question list:**
```
spec_guard_interview_questions()
// or: spec_guard_interview_questions({ classification: "REST/service API" }) if already known
```

**Step 2 — Ask the user each required question from the result.**
Ask them in order. Do not skip required questions. For optional questions, use judgment.

**Step 3 — Draft the spec:**
```
spec_guard_draft_spec({
  title: "...",
  problem: "...",
  in_scope: [...],
  out_of_scope: [...],
  expected_behavior: "...",
  acceptance_criteria: [...],
  classification: "...",
  output_path: ".spec-guard/specs/<name>.md"   // omit to preview without writing
})
```

**Step 4 — Check the result.**
If `gate1_passed` is false, address every item in `missing_required` and retry.

**Step 5 — Present to the user for review.** Do not proceed until the user approves the spec.

**Step 6 — Run:**
```bash
spec-guard run <name>
```

### Path B: Guided Wizard (when working without interactive conversation)

```bash
spec-guard draft <name>
```

Answers questions in the terminal. Output is guaranteed to pass Gate 1.

### Path C: Brownfield changes

Use the brownfield template when modifying existing behavior:
```bash
spec-guard new brownfield-spec <name>
```

Fill in both **Existing Behavior** (as-is) and **Behavior Delta** (what changes). Anything not in the delta must be preserved exactly.

---

## Writing Tests

Tests are derived from the spec's acceptance criteria — not from a separate list. Every acceptance criterion must have a corresponding test. The human does not specify what tests to write; the agent reads the acceptance criteria and writes tests that verify each one.

The classification determines the *type* of test to use:

| Classification | Required test type |
|---|---|
| Reusable non-UI API | Unit tests against exported surface only |
| REST/service API | API/integration tests against the contract |
| Reusable UI component | Unit/component tests + UI automation tests if the contract includes behavior a unit test environment cannot accurately simulate |
| One-off application UI | UI automation tests for user-visible behavior |
| Direct behavior, no new API/UI | Tests derived from acceptance criteria — no new API or UI surface; use whatever mechanism verifies the criterion |
| Operational/document deliverable | Process/document checks |

If the request spans multiple rows: split into slices. `spec-guard new compound-work <name>`. Classify and implement each slice separately.

---

## Work Classification → Required Artifact

| Classification | Artifact needed before Gate 2 |
|---|---|
| Reusable non-UI API | API contract in `.spec-guard/contracts/` |
| REST/service API | REST API contract in `.spec-guard/contracts/` |
| Reusable UI component | Component contract in `.spec-guard/contracts/` |
| One-off application UI | Mockup/design direction + component library reference |
| Direct behavior, no new API/UI | None |
| Operational/document deliverable | The document itself |

---

## The Five Gates

**Gate 1 — Spec valid:**
```bash
spec-guard check <name>     # must exit 0
spec-guard suggest <name>   # shows fix instructions for each issue
```

**Gate 2 — Contracts present:**
```bash
spec-guard check <name> --warnings
# No SG-CLASS-002, SG-UI-001, or SG-UI-002 blockers
```

**Gate 3 — Failure confirmed:**
Run the new test. Record: "Test [name] fails because [reason]."
If impractical, record the concrete reason. "Impractical" is not a general escape hatch.

**Gate 4 — Tests pass:**
All tests pass. No scope absorbed silently. Discoveries recorded.

**Gate 5 — Review complete:**
```bash
spec-guard review <name>
spec-guard analyze <name>   # verify spec ↔ contract ↔ review alignment
# All checklist items resolved, no SG-ALIGN warnings
```

---

## Halt Conditions

Stop immediately and surface the issue when any of these are true:

- Spec is missing, unclear, or insufficient → `spec-guard blocker`
- Classification is ambiguous → ask; do not guess
- UI work has no mockup and no component library → `spec-guard blocker`; do not invent UI
- UI work has no mockup but a component library is referenced → ask the user whether the component library is sufficient; do not assume; do not proceed until confirmed
- UI work has no component library but a mockup is present → ask the user whether they are using an existing library or custom styling; do not assume; do not proceed until confirmed
- A reusable API/component has no contract → `spec-guard blocker`
- Spec contradicts existing behavior → `spec-guard deviation`
- Implementation would expand scope → `spec-guard scope-discovery`
- Implementation reveals spec is wrong or incomplete → stop; `spec-guard deviation`

**Do not patch around blockers. Fix the input, then continue.**

---

## What You Must Never Do

- Implement before Gates 1 and 2 pass and Gate 3 is confirmed — the spec must be valid, contracts must be present, and a failing test must exist before any implementation begins
- Skip work classification
- Create documentation by default
- Test whether documentation files (specs, contracts, reviews, READMEs, help files, changelogs) exist or contain expected content, unless the document is explicitly the deliverable of an operational/document deliverable classification
- Invent UI — do not implement UI work until both a mockup/design direction and a component library reference are in the spec, or the human has explicitly confirmed each is not needed
- Assume a component library — if none is referenced, ask the human before proceeding
- Test private/undocumented internals instead of contract surfaces
- Silently absorb out-of-scope work
- Add unrequested features, optional enhancements, or opportunistic refactors
- Upgrade dependencies or change architecture unless the spec requires it
- Redesign UI beyond provided direction
- Implement nearby TODOs unless the spec requires them
- Propose unsolicited feature roadmaps after completing a task
- Treat "what's next?" as permission to invent features
- Perform discovery unless the human explicitly asks
- Implement discovery findings without separate authorization
- Skip Gate 3 (failure-first) without recording a concrete reason
- Close Gate 5 without running `spec-guard analyze`

---

## Recording Problems

```bash
# Work cannot safely continue
spec-guard blocker <topic>

# Work discovered outside spec scope
spec-guard scope-discovery <topic>

# Implementation requires changing the spec
spec-guard deviation <topic>

# Human explicitly asked for gap/risk discovery
spec-guard discovery <topic>
```

---

## Answering "What's next?"

Respond with: current status, known blockers, recorded follow-ups, and how to request discovery. Do not invent new features. Do not propose a roadmap.

---

## Directory Structure

All Spec Guard artifacts live under `.spec-guard/` in the project root:

```
.spec-guard/
  specs/           ← feature specs (Gate 1 source)
  contracts/       ← API and component contracts (Gate 2 source)
  blockers/        ← recorded blockers
  scope-discoveries/
  reviews/         ← implementation reviews (Gate 5 source)
  deviations/
  discoveries/
  runs/            ← gate confirmation state
AGENTS.md          ← this file (project root)
WORKFLOW.md        ← full process flow (project root)
```

Write commands (`new`, `draft`, `blocker`, `scope-discovery`, `review`, `discovery`, `deviation`) take a bare name and always write to the appropriate `.spec-guard/` subdirectory. Read/validate commands (`check`, `run`, `analyze`, `suggest`, `classify`, `watch`) default to `.spec-guard/specs/` for bare names but accept full paths.

---

## CLI Quick Reference

```bash
# Authoring
spec-guard draft <name>              # guided wizard
spec-guard new brownfield-spec <name> # brownfield template

# Workflow
spec-guard run <name>                # orchestrated 5-phase run
spec-guard check <name>              # Gate 1
spec-guard suggest <name>            # Gate 1 + fix instructions
spec-guard analyze <name>            # cross-artifact alignment (Gate 4→5)

# Monitoring
spec-guard watch <name>              # live feedback while editing
spec-guard classify <name>           # confirm classification + test guidance
spec-guard validate                  # check all specs
spec-guard status                    # overview table

# Gate management
spec-guard gate-status <name>        # show all 5 gate pass/fail states
spec-guard confirm-gate <name> <n>   # record gate 3/4/5 as confirmed
  --evidence="<what failed and why>" # required for gate 3
  --no-confirm                       # record gate as not yet confirmed
spec-guard next <name>               # what to do next given current gate state
```

## MCP Tool Quick Reference

```
spec_guard_interview_questions   → questions to ask user before drafting
spec_guard_draft_spec            → build a valid spec from answers
spec_guard_check                 → validate a spec (Gate 1)
spec_guard_suggest               → validate + show fix instructions
spec_guard_classify              → confirm work classification
spec_guard_test_guidance         → test type + contract checklist for classification
spec_guard_gate_status           → which gates have passed
spec_guard_confirm_gate          → record agent gate confirmation (Gates 3–5)
spec_guard_analyze               → cross-artifact alignment (Gate 4→5)
spec_guard_create_artifact       → create any spec-guard artifact from template
spec_guard_validate_directory    → validate all specs in a directory
spec_guard_status                → overview of all specs
spec_guard_workflow_next_step    → what to do next given current gate state
```
