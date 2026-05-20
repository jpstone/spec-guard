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

- [ ] I have identified the governing spec (file path: __________)
- [ ] `spec-guard check <spec>` exits 0
- [ ] I have confirmed exactly one work classification: __________
- [ ] I have read every acceptance criterion and know what behavior each one requires
- [ ] I will write tests that verify those criteria before writing any implementation code

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
  required_tests: [...],
  output_path: "specs/<name>.md"   // omit to preview without writing
})
```

**Step 4 — Check the result.**
If `gate1_passed` is false, address every item in `missing_required` and retry.

**Step 5 — Present to the user for review.** Do not proceed until the user approves the spec.

**Step 6 — Run:**
```bash
spec-guard run specs/<name>.md
```

### Path B: Guided Wizard (when working without interactive conversation)

```bash
spec-guard draft specs/<name>.md
```

Answers questions in the terminal. Output is guaranteed to pass Gate 1.

### Path C: Brownfield changes

Use the brownfield template when modifying existing behavior:
```bash
spec-guard new brownfield-spec specs/<name>.md
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
| Reusable UI component | Unit/component tests + browser automation if the contract includes behavior a JSDOM/virtual DOM environment cannot accurately simulate |
| One-off application UI | Browser automation for user-visible behavior |
| Direct behavior, no new API/UI | Tests derived from acceptance criteria — no new API or UI surface; use whatever mechanism verifies the criterion |
| Operational/document deliverable | Process/document checks |

If the request spans multiple rows: split into slices. `spec-guard new compound-work specs/<name>-plan.md`. Classify and implement each slice separately.

---

## Work Classification → Required Artifact

| Classification | Artifact needed before Gate 2 |
|---|---|
| Reusable non-UI API | API contract in `contracts/` |
| REST/service API | REST API contract in `contracts/` |
| Reusable UI component | Component contract in `contracts/` |
| One-off application UI | Mockup/design direction + component library reference |
| Direct behavior, no new API/UI | None |
| Operational/document deliverable | The document itself |

---

## The Five Gates

**Gate 1 — Spec valid:**
```bash
spec-guard check specs/<name>.md     # must exit 0
spec-guard suggest specs/<name>.md   # shows fix instructions for each issue
```

**Gate 2 — Contracts present:**
```bash
spec-guard check specs/<name>.md --warnings
# No SG-CLASS-002 or SG-UI-001 blockers
```

**Gate 3 — Failure confirmed:**
Run the new test. Record: "Test [name] fails because [reason]."
If impractical, record the concrete reason. "Impractical" is not a general escape hatch.

**Gate 4 — Tests pass:**
All tests pass. No scope absorbed silently. Discoveries recorded.

**Gate 5 — Review complete:**
```bash
spec-guard review .spec-guard/reviews/<name>.md
spec-guard analyze specs/<name>.md   # verify spec ↔ contract ↔ review alignment
# All checklist items resolved, no SG-ALIGN warnings
```

---

## Halt Conditions

Stop immediately and surface the issue when any of these are true:

- Spec is missing, unclear, or insufficient → `spec-guard blocker`
- Classification is ambiguous → ask; do not guess
- UI work has no mockup or design direction → `spec-guard blocker`; do not invent UI
- A reusable API/component has no contract → `spec-guard blocker`
- Spec contradicts existing behavior → `spec-guard deviation`
- Implementation would expand scope → `spec-guard scope-discovery`
- Implementation reveals spec is wrong or incomplete → stop; `spec-guard deviation`

**Do not patch around blockers. Fix the input, then continue.**

---

## What You Must Never Do

- Implement before Gate 1 passes
- Skip work classification
- Create documentation by default
- Test prose instead of behavior for product features
- Test whether workflow artifacts (specs, contracts, reviews) exist or contain expected content — these are implementation records, not deliverables
- Invent UI without mockups or design direction
- Invent a component library
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
spec-guard blocker .spec-guard/blockers/<topic>.md

# Work discovered outside spec scope
spec-guard scope-discovery .spec-guard/scope-discoveries/<topic>.md

# Implementation requires changing the spec
spec-guard deviation .spec-guard/deviations/<topic>.md

# Human explicitly asked for gap/risk discovery
spec-guard discovery .spec-guard/discoveries/<topic>.md
```

---

## Answering "What's next?"

Respond with: current status, known blockers, recorded follow-ups, and how to request discovery. Do not invent new features. Do not propose a roadmap.

---

## CLI Quick Reference

```bash
# Authoring
spec-guard draft specs/<name>.md              # guided wizard
spec-guard new brownfield-spec specs/<name>.md # brownfield template

# Workflow
spec-guard run specs/<name>.md                # orchestrated 5-phase run
spec-guard check specs/<name>.md              # Gate 1
spec-guard suggest specs/<name>.md            # Gate 1 + fix instructions
spec-guard analyze specs/<name>.md            # cross-artifact alignment (Gate 4→5)

# Monitoring
spec-guard watch specs/<name>.md              # live feedback while editing
spec-guard classify specs/<name>.md           # confirm classification
spec-guard validate specs/                    # check all specs
spec-guard status                             # overview table
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
spec_guard_confirm_gate          → record manual gate confirmation (Gates 3–5)
spec_guard_analyze               → cross-artifact alignment (Gate 4→5)
spec_guard_create_artifact       → create any spec-guard artifact from template
spec_guard_validate_directory    → validate all specs in a directory
spec_guard_status                → overview of all specs
spec_guard_workflow_next_step    → what to do next given current gate state
```
