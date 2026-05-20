# Spec Guard Workflow

This document defines the complete process flow for spec-first, behavior-tested, agent-safe development. Every gate in this workflow is enforced by `spec-guard` tooling. Gates are not advisory — they are checkpoints an agent must pass before proceeding.

---

## The Workflow at a Glance

```
┌─────────────────────────────────────────────────────────┐
│  PHASE 1: DISCOVER                                      │
│  Understand the work. Write the spec.                   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
              ┌─────────────┐
              │  GATE 1     │  spec-guard check
              │  Spec valid?│  Exit 0 required
              └──────┬──────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 2: CLASSIFY & CONTRACT                           │
│  Pick one work type. Produce the right artifact.        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
              ┌─────────────┐
              │  GATE 2     │  spec-guard check --warnings
              │  Contracts  │  No SG-CLASS-002, SG-UI-001,
              │  present?   │  or SG-UI-002 blockers
              └──────┬──────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 3: TEST FIRST                                    │
│  Write the right test. Run it. Observe failure.         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
              ┌─────────────┐
              │  GATE 3     │  Failure-first confirmed
              │  Test fails │  Record reason if impractical
              │  as expected│
              └──────┬──────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 4: IMPLEMENT                                     │
│  Smallest change. Spec is the boundary.                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
              ┌─────────────┐
              │  GATE 4     │  Tests pass
              │  Tests pass?│  No scope absorbed silently
              └──────┬──────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 5: REVIEW                                        │
│  Confirm traceability. Record follow-ups.               │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
              ┌─────────────┐
              │  GATE 5     │  spec-guard review
              │  Review     │  All checklist items resolved
              │  complete?  │
              └─────────────┘
```

---

## Phase 1: Discover

**Goal:** Produce a spec that is complete enough to classify, test, and implement.

**Steps:**

1. Identify whether a governing spec already exists in `.spec-guard/specs/`. If it does, skip to Gate 1.
2. If the request is a fresh task, create a spec:
   ```bash
   spec-guard new spec <feature-name>
   ```
3. Fill in every required section. Required sections are:
   - `Problem / Goal` — what problem this solves and what outcome is required
   - `In Scope` — what is explicitly included
   - `Out of Scope` — what is explicitly excluded (prevents silent scope absorption)
   - `Expected Behavior` — observable behavior, not implementation details
   - `Acceptance Criteria` — measurable, checkbox-format criteria
   - `Work Classification` — exactly one selected

4. If the request is too vague to fill these sections, do not guess. Ask for clarification or create a `Discovery Request`:
   ```bash
   spec-guard discovery <topic>
   ```

5. Watch the spec as you write it:
   ```bash
   spec-guard watch <feature-name>
   ```

**Halt conditions in this phase:**
- Request is too vague to produce concrete scope or acceptance criteria → ask for clarification
- UI work has no mockup or design direction → create a blocker, halt
- Multiple work types are entangled → split into slices (see Compound Work below)

---

## Gate 1: Spec Valid

```bash
spec-guard check <feature-name>
```

**Required:** Exit 0 (no blockers).

Do not proceed to Phase 2 until this passes. Common blockers at this gate:

| Blocker | Fix |
|---|---|
| `SG-SPEC-002` missing heading | Fill in the missing section |
| `SG-SPEC-004` empty section | Replace placeholder with concrete content |
| `SG-CLASS-001` no classification | Select exactly one classification checkbox |
| `SG-UI-001` UI work, no mockup | Add mockup reference or create a blocker |

---

## Phase 2: Classify & Contract

**Goal:** Confirm the work type and produce any required contract artifact.

The classification selected in Gate 1 determines what happens next:

| Classification | Required artifact | Command |
|---|---|---|
| Reusable non-UI API | API contract | `spec-guard new api-contract <name>` |
| REST/service API | REST API contract | `spec-guard new rest-api-contract <name>` |
| Reusable UI component | Component contract | `spec-guard new component-contract <name>` |
| One-off application UI | One-off UI doc | `spec-guard new one-off-ui <name>` |
| Direct behavior, no new API/UI | No contract required | — |
| Operational/document deliverable | The document itself | Create the deliverable document |

Print the classification to confirm:
```bash
spec-guard classify <feature-name>
```

**Halt conditions in this phase:**
- Classification is ambiguous → halt and ask
- Classification changes from what was in the spec → record a blocker, do not proceed
- Required contract artifact cannot be defined yet (missing inputs) → create a blocker

---

## Gate 2: Contracts Present

```bash
spec-guard check <feature-name> --warnings
```

**Required:** No `SG-CLASS-002`, `SG-UI-001`, or `SG-UI-002` blockers.

Add the contract reference to the `Dependencies` section of the spec once the contract file exists.

---

## Phase 3: Test First

**Goal:** Write the right test for the classification. Run it. Watch it fail.

Select the test type based on classification:

| Classification | Test type | What to test |
|---|---|---|
| Reusable non-UI API | Unit tests | Documented/exported API surface only |
| REST/service API | API/integration tests | Documented contract: routes, status codes, error shapes |
| Reusable UI component | Unit/component tests | Documented props, states, callbacks, accessibility |
| One-off application UI | UI automation | User-visible behavior, form flows, navigation, permission states |
| Direct behavior, no new API/UI | Tests derived from acceptance criteria | Observable change in behavior — no new API or UI surface to test against specifically |
| Operational/document deliverable | Process/document checks | Required sections, links, policy gates |

**Steps:**

1. Write tests that verify every acceptance criterion in the spec. The classification determines the test type (see Phase 2 table).
2. Run the test suite.
3. Confirm the new test(s) fail for the expected reason.
4. Record the failure:
   ```
   Expected failure: [test name] fails because [function/endpoint/component] does not yet exist
   ```

**If you cannot run the test yet**, record the concrete reason before proceeding:
```
Failure-first impractical: [concrete reason — missing infrastructure, irreversible side effect, etc.]
```

`"Impractical"` is not a general escape hatch. If no concrete reason exists, running the test is required.

**Halt conditions in this phase:**
- Cannot write a test without making implementation assumptions → spec is unclear; return to Phase 1
- Test would require changing existing passing tests → scope has expanded; record a scope discovery

---

## Gate 3: Failure Confirmed

**Required:** One of:
- Test run output showing the new test failing for the expected reason
- Written record of why running the test was impractical, with a concrete reason

No implementation may begin until one of these exists.

---

## Phase 4: Implement

**Goal:** Make the failing test pass. Nothing more.

**Rules:**
- Change only what is required to make the spec's tests pass
- Do not add unrequested features, optional enhancements, or opportunistic refactors
- Do not upgrade dependencies or change architecture unless the spec requires it
- Do not implement nearby TODOs
- Do not invent UI beyond what design direction specifies

**If a spec problem surfaces during implementation:**
1. Stop immediately
2. Classify it: ambiguity, gap, or conflict?
3. Create a spec deviation request:
   ```bash
   spec-guard deviation <topic>
   ```
4. Halt until the human resolves it

**If out-of-scope work is discovered:**
1. Record it:
   ```bash
   spec-guard scope-discovery <topic>
   ```
2. Classify it: required for this spec, or additive?
3. If required: ask for acknowledgment before continuing
4. If additive: record and do not implement

---

## Gate 4: Tests Pass

**Required:**
- All tests pass
- No scope was silently absorbed
- Any scope discoveries are recorded
- Any spec deviations are recorded and resolved

---

## Phase 5: Review

**Goal:** Confirm the change is traceable, complete, and clean.

Create an implementation review:
```bash
spec-guard review <feature-name>
```

Complete the review checklist:
- [ ] Change traces to the governing spec
- [ ] Tests were written before implementation
- [ ] Failure-first was confirmed or reason was recorded
- [ ] Behavior/contract was validated, not prose
- [ ] No out-of-scope work was absorbed silently
- [ ] Scope discoveries were recorded
- [ ] Durable documentation updated only if contract changed
- [ ] No unrequested features or refactors included

---

## Gate 5: Review Complete

**Required:** All review checklist items checked or explicitly resolved.

---

## Compound Work

Some requests span multiple work classifications. Do not implement all of it as one undifferentiated task.

**When to split:**
- One request requires both API work and UI work
- One request creates both a reusable component and uses it in a page
- A broad product request ("build a todo app") implies multiple systems

**How to split:**
1. Create a compound work plan:
   ```bash
   spec-guard new compound-work <feature-name>-plan
   ```
2. Identify each slice and its classification
3. Create a separate spec for each slice
4. Run each slice through this workflow independently
5. Implement only the slices the current spec authorizes

---

## Handling Blockers

When work cannot safely continue, create a blocker record and halt:

```bash
spec-guard blocker <topic>
```

Blocker types:
- Missing spec or unclear spec
- Missing UI inputs (mockup, component library)
- Bad spec (contradicts existing behavior)
- Scope conflict
- Missing contract
- Unresolved open question that affects behavior

**Do not work around blockers.** The blocker must be resolved by a human before work resumes.

---

## Discovery Mode

Discovery is separate from implementation. Enter discovery mode only when the human explicitly asks:

- "What did we miss?"
- "What risks remain?"
- "What should we build next?"
- "Review for security/accessibility/reliability gaps."

In discovery mode:
1. Confirm the discovery scope
2. Produce evidence-based findings
3. Distinguish required gaps from optional enhancements
4. Recommend blocker, spec change, follow-up spec, or no action
5. Do not implement anything unless separately authorized

Create a discovery request to track it:
```bash
spec-guard discovery <topic>
```
