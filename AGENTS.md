# Agent Instructions — Spec Guard

You are an implementation agent operating under Spec Guard. **Read `WORKFLOW.md` before any task** — it defines the step-by-step process and all imperatives in it apply to you. This document is the compact rules reference. `docs/philosophy.md` has the design philosophy and rationale.

---

## Spec Guard Use Prompt

At the start of every new codebase change request, ask the user:

> Do you want to use Spec Guard for this task?

If the user answers yes, follow the full Spec Guard workflow below. If the user answers no, the agent may complete the current task without drafting specs, running gates, or creating Spec Guard artifacts.

The agent must not infer bypass eligibility from task size, file type, perceived risk, or any other heuristic. Bypass must come from the user's explicit answer, and that answer applies only to the current task or instruction. Existing Spec Guard requirements remain unchanged when the user chooses to use Spec Guard.

---

## Spec Guard Question Sequencing

This guidance applies only to Spec Guard workflow question flows used by agents, including spec interviews, initiative decomposition, classification clarification, blocker/deviation clarification, and similar Spec Guard-driven user-question sequences; it does not govern unrelated agent questions outside a Spec Guard flow.

When a Spec Guard flow requires multiple known questions:

1. List the multiple known questions up front.
2. Tell the user they will be walked through the questions one at a time.
3. Ask only the first question, then wait for the user's answer before asking the next question.

When only one question is needed, ask it directly without a question-list preface.

When suggested answers are reasonably knowable from existing context, offer those suggested answers with the question and make clear the user may accept one or provide their own answer.

---

## The Loop

```
DISCOVER → [Gate 1] → CLASSIFY & CONTRACT → [Gate 2] → IMPLEMENTATION PLANNING → [Gate 3] → TEST FIRST → [Gate 4] → IMPLEMENT → [Gate 5] → REVIEW → [Gate 6]
```

Every gate is a `spec-guard` command. Gates are not advisory. You do not proceed past a gate until it passes.

> **Invoking the CLI:** Use `npx spec-guard <command>` unless `spec-guard` resolves on your PATH (e.g. globally installed or the project has a `spec-guard` npm script). If the bare command fails with "not found", prefix every command with `npx`.

---

## Before Starting Any Work on an Existing Feature

Check `.spec-guard/reviews/<feature-name>.md` before authoring a spec or writing any code. The review contains:

- **Implementation Files** — source files to modify
- **Test Files** — test files to update
- **Linked Contract** — the contract to keep in sync
- **Linked Documentation** — user-facing docs to update

Reference the review in the spec's `Prior Implementation Review` field so the full context is carried forward.

---

## Documentation Requirements Integrity

For the governing spec currently being implemented, verify 100% of that spec's documentation obligations. Use the spec's `Documentation Requirements` section as the source of truth for docs the current spec requires to be created, updated, linked, or validated. Also account for obligations from the linked contract, work classification, and prior implementation review.

Any documentation file created or updated for the current spec must be listed in the spec's `Documentation Requirements` section as a direct repository-relative link, and the same file must appear in the implementation review's `Linked Documentation` section. If no documentation changes are required, the spec or review must explicitly say so. Do not audit unrelated repository documentation.

---

## Pre-Implementation Checklist

Run before writing any implementation code. All items must be checked. If any cannot be checked, halt.

- [ ] Governing spec identified: `.spec-guard/specs/<name>.md`
- [ ] Gate 1 — `spec-guard check <name>` exits 0
- [ ] Exactly one work classification confirmed: __________
- [ ] Every acceptance criterion read and understood
- [ ] Documentation Requirements section read; all current-spec documentation obligations identified or explicitly marked not applicable
- [ ] Gate 2 — `spec-guard check <name> --warnings` exits 0
- [ ] Implementation Planning section read; if planning is required, a context-appropriate stack/layer has been suggested and the human accepted it or provided their own confirmed plan
- [ ] Gate 3 — implementation planning confirmed; no SG-PLAN-001 blocker
- [ ] Gate 4 — tests written from acceptance criteria, run, and confirmed failing
- [ ] *(UI only)* Mockup/design direction in spec — or "No mockup required" confirmed by human
- [ ] *(UI only)* Component library in spec — or "No component library — custom styling" confirmed by human

If the spec doesn't exist: author one (see below). Do not guess.

---

## Initiative Decomposition — When to Use It

Use the initiative flow when a developer describes a **multi-feature app or product** rather than a single capability. Signals include:

- "I want to build an app that does X, Y, and Z"
- "We're launching a new product with these features…"
- "Here's the full scope of what this project needs to do"
- The description implies more than two or three distinct user-facing capabilities

Use the standard spec flow (below) when the request is a **single feature, change, or deliverable** — even a complex one.

**If you are unsure:** ask — "Is this a single feature, or a larger initiative with multiple independent parts?"

### Initiative flow:

**Step 1 — Get the question list:**
```
spec_guard_initiative_questions()
```

**Step 2 — Ask the user the required questions** using Spec Guard Question Sequencing above, then propose a slice breakdown (one slice per independently deliverable feature area). Present the breakdown for human review before saving.

**Step 3 — Save the initiative:**
```
spec_guard_save_initiative({
  name: "my-app",
  title: "My App",
  description: "...",
  slices: [
    { name: "user-auth", title: "User Authentication", description: "...", classification: "REST/service API" },
    ...
  ]
})
```

**Step 4 — Proceed spec-by-spec.** For each slice returned, call `spec_guard_draft_spec` and follow the standard 5-gate workflow for that slice independently.

---

## Authoring a Spec

### Path A: AI-Assisted (recommended when working with a user)

Use this path when you are in conversation with a user and can ask questions.

**Step 1 — Get the question list:**
```
spec_guard_interview_questions()
// or: spec_guard_interview_questions({ classification: "REST/service API" }) if already known
```

**Step 2 — Ask the user each required question from the result using Spec Guard Question Sequencing above.**
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

## Implementation Planning

After Gate 2 and before writing tests, read the spec's `Implementation Planning` section. If planning is required, identify the required decision level: full tech stack, platform/runtime, framework, engine, backend layer, frontend layer, data layer, integration layer, or another stack/layer needed before tests or implementation can be written safely.

When planning is required, suggest the context-appropriate stack/layer based on repository evidence and the approved spec, and explicitly ask the human to accept the suggestion or override it with their own choice. Record the accepted choice in the spec's `Implementation Planning` section under `Confirmed Plan`. Do not proceed while `spec-guard check <name>` reports SG-PLAN-001.

Implementation planning does not replace UI requirements. UI work still needs mockup/design direction and component-library/custom-styling confirmation under the UI rules.

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
| Bugfix | Failure-first bug reproduction; ask whether evidence should be permanent or temporary and record the answer in the spec's `Test Evidence` section before Gate 4 (`spec-guard check` will report SG-BUG-001 if it is missing or unchecked); temporary tests/checks may be removed only after passing and human confirmation: "Have you verified that the reported bug is fixed and no longer reproduces?" |
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
| Bugfix | None |
| Operational/document deliverable | The document itself |

---

## The Six Gates

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

**Gate 3 — Planning confirmed:**
If `Implementation Planning` says planning is required, `Confirmed Plan` records the human-accepted stack/layer choice. `spec-guard check <name>` must report no SG-PLAN-001 blocker.

**Gate 4 — Failure confirmed:**
Run the new test. Record: "Test [name] fails because [reason]."
If impractical, record the concrete reason. "Impractical" is not a general escape hatch.

**Gate 5 — Tests pass:**
All tests pass. No scope absorbed silently. Discoveries recorded.

**Gate 6 — Review complete:**
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
- Implementation planning is required but no confirmed stack/layer choice is recorded → suggest a context-appropriate stack/layer, ask the human to accept or override it, and do not proceed until recorded
- A reusable API/component has no contract → `spec-guard blocker`
- Spec contradicts existing behavior → `spec-guard deviation`
- Implementation would expand scope → `spec-guard scope-discovery`
- Implementation reveals spec is wrong or incomplete → stop; `spec-guard deviation`

**Do not patch around blockers. Fix the input, then continue.**

---

## What You Must Never Do

- Implement before Gates 1, 2, 3, and 4 pass — the spec must be valid, contracts must be present, required implementation planning must be confirmed, and a failing test must exist before any implementation begins
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
- Skip Gate 4 (failure-first) without recording a concrete reason
- Close Gate 6 without running `spec-guard analyze`

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
  initiatives/     ← initiative decomposition artifacts
  blockers/        ← recorded blockers
  scope-discoveries/
  reviews/         ← implementation reviews (Gate 6 source)
  deviations/
  discoveries/
  runs/            ← gate confirmation state
AGENTS.md          ← this file (project root)
WORKFLOW.md        ← full process flow — required reading (project root)
```

Write commands (`new`, `draft`, `blocker`, `scope-discovery`, `review`, `discovery`, `deviation`) take a bare name and always write to the appropriate `.spec-guard/` subdirectory. When creating an artifact for a governing spec, pass `--spec <spec-name>` where the command supports it so the originating spec records a direct repository-relative link to the new artifact under `Related Artifacts`. Read/validate commands (`check`, `run`, `analyze`, `suggest`, `classify`, `watch`) default to `.spec-guard/specs/` for bare names but accept full paths.

---

## CLI Quick Reference

```bash
# Initiative decomposition
spec-guard initiative-questions      # list questions for broad app decomposition
spec-guard initiative <name>         # interactive wizard — decompose app into slices

# Authoring
spec-guard draft <name>              # guided wizard
spec-guard new brownfield-spec <name> # brownfield template

# Workflow
spec-guard run <name>                # orchestrated 6-phase run
spec-guard check <name>              # Gate 1
spec-guard suggest <name>            # Gate 1 + fix instructions
spec-guard analyze <name>            # cross-artifact alignment (Gate 5→6)
spec-guard analyze <name> --dry-run  # pre-implementation contract check (advisory, auto-runs at Phase 3)

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
spec_guard_initiative_questions  → questions for broad app decomposition (use before spec_guard_save_initiative)
spec_guard_save_initiative       → validate and save initiative; returns slice names for spec_guard_draft_spec
spec_guard_interview_questions   → questions to ask user before drafting a single spec
spec_guard_draft_spec            → build a valid spec from answers
spec_guard_check                 → validate a spec (Gate 1)
spec_guard_suggest               → validate + show fix instructions
spec_guard_classify              → confirm work classification
spec_guard_test_guidance         → test type + contract checklist for classification
spec_guard_gate_status           → which gates have passed
spec_guard_confirm_gate          → record agent gate confirmation (Gates 3–5)
spec_guard_analyze               → cross-artifact alignment (Gate 5→6); pass dry_run: true for pre-implementation contract-only check (advisory)
spec_guard_create_artifact       → create any spec-guard artifact from template
spec_guard_validate_directory    → validate all specs in a directory
spec_guard_status                → overview of all specs
spec_guard_workflow_next_step    → what to do next given current gate state
```
