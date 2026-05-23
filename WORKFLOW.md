# Spec Guard Workflow

This document is addressed to the agent. All imperatives are instructions you must follow. The human's role is noted where it applies; everything else is your responsibility. Every gate is a hard checkpoint — you do not proceed past a gate until it passes.

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
│  PHASE 3: IMPLEMENTATION PLANNING                       │
│  Confirm required stack/layer decisions before testing. │
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
│  PHASE 4: TEST FIRST                                    │
│  Write the right test. Run it. Observe failure.         │
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
│  PHASE 5: IMPLEMENT                                     │
│  Smallest change. Spec is the boundary.                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
              ┌─────────────┐
              │  GATE 5     │  spec-guard review
              │  Review     │  spec-guard analyze
              │  complete?  │  All checklist items resolved
              └─────────────┘
```

---

## Phase 1: Discover

**Triggered by:** The human brings a request — a feature, task, change, or bug fix they want built — and explicitly answers yes when asked: "Do you want to use Spec Guard for this task?"

**Spec Guard workflow question flows:** When an agent must ask multiple known questions in a Spec Guard flow, list the questions up front, tell the user they will be walked through them one at a time, ask only the first question, and wait for the user's answer before asking the next. When only one question is needed, the agent may ask it directly. When suggested answers are reasonably knowable, offer those suggested answers while allowing the user to provide their own answer. This applies to Spec Guard workflow question flows only and does not govern unrelated agent questions outside a Spec Guard flow.

**Goal:** Produce a spec that is complete enough to classify, test, and implement.

If the human answers no to the Spec Guard prompt, this workflow is bypassed entirely for the current task only. Do not infer bypass eligibility; bypass requires the user's explicit answer.

**Steps:**

1. Identify whether a governing spec already exists in `.spec-guard/specs/`. If it does, skip to Gate 1.
2. If the request is a fresh task, author a spec. There are three paths:
   - **Guided wizard** (recommended) — asks required questions interactively and writes a Gate 1-valid spec:
     ```bash
     spec-guard draft <feature-name>
     ```
   - **AI-assisted** — the agent asks the human each required question, then calls `spec_guard_draft_spec` to build the spec. See `AGENTS.md` for the question sequence.
   - **Manual** — create the template and fill it in:
     ```bash
     spec-guard new spec <feature-name>
     ```

3. Fill in every required section. Draft from human input — do not invent scope, acceptance criteria, or design direction. Required sections:
   - `Problem / Goal` — what problem this solves and what outcome is required
   - `In Scope` — what is explicitly included
   - `Out of Scope` — what is explicitly excluded (prevents silent scope absorption)
   - `Expected Behavior` — observable behavior, not implementation details
   - `Acceptance Criteria` — measurable, checkbox-format criteria
   - `Documentation Requirements` — direct repository-relative links to docs the current spec requires to be created, updated, linked, or validated; explicitly state when no documentation changes are required
   - `Work Classification` — agent selects the most appropriate classification; human confirms during spec review

4. Present the draft to the human for review and approval before proceeding to Gate 1. If multiple review questions are needed, use the Spec Guard workflow question flow rule above.

5. If the request is too vague to fill these sections, do not guess. Ask for clarification or create a discovery request:
   ```bash
   spec-guard discovery <topic>
   ```

6. Watch the spec as you write it:
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

**Triggered by:** Gate 1 passes. Agent-driven.

**Goal:** Confirm the work type and produce any required contract artifact.

| Classification | Required artifact | Command |
|---|---|---|
| Reusable non-UI API | API contract | `spec-guard new api-contract --spec <feature-name> <name>` |
| REST/service API | REST API contract | `spec-guard new rest-api-contract --spec <feature-name> <name>` |
| Reusable UI component | Component contract | `spec-guard new component-contract --spec <feature-name> <name>` |
| One-off application UI | Mockup/design direction + component library reference in spec | Add to spec Dependencies section |
| Direct behavior, no new API/UI | No contract required | — |
| Bugfix | No contract required | — |
| Operational/document deliverable | The document itself | Create the deliverable document |

Confirm the classification and reference the contract in the spec's `Dependencies` section once created:
```bash
spec-guard classify <feature-name>
```

**Halt conditions in this phase:**
- Classification is ambiguous → halt and ask
- Classification changes from what was in the spec → acknowledge and record the change before continuing (SG-CLASS-003)
- Required contract artifact cannot be defined yet (missing inputs) → create a blocker

---

## Gate 2: Contracts Present

```bash
spec-guard check <feature-name> --warnings
```

**Required:** No `SG-CLASS-002`, `SG-UI-001`, or `SG-UI-002` blockers.

---

## Phase 3: Implementation Planning

**Triggered by:** Gate 2 passes. Agent-driven.

**Goal:** Confirm implementation decisions that must be known before tests or implementation, without silently inventing architecture.

Read the spec's `Implementation Planning` section. If planning is required, identify whether the needed decision is a full tech stack or a narrower stack/layer choice such as platform/runtime, web framework, backend framework, desktop shell/native target, game engine, data layer, integration layer, or similar implementation boundary.

When planning is required, suggest the context-appropriate stack/layer based on repository evidence and the approved spec. Ask the human to accept the suggestion or provide their own choice. Record the accepted choice in the spec's `Implementation Planning` section under `Confirmed Plan` before proceeding.

Implementation planning does not replace existing UI inputs: UI work still requires mockup/design direction and component-library/custom-styling confirmation where the UI rules require them.

**Halt conditions in this phase:**
- Implementation planning is required and no confirmed plan is recorded → halt, ask the human to accept or override the suggested stack/layer, and record the accepted plan.
- A required stack/layer choice contradicts the approved spec or existing architecture → record a deviation and halt.

---

## Gate 3: Planning Confirmed

```bash
spec-guard check <feature-name>
```

**Required:** If `Implementation Planning` says planning is required, no `SG-PLAN-001` blocker is present.

---

## Phase 4: Test First

**Triggered by:** Gate 3 passes. Agent-driven.

**Goal:** Write the right test for the classification. Run it. Watch it fail.

Select the test type based on classification:

| Classification | Test type | What to test |
|---|---|---|
| Reusable non-UI API | Unit tests | Documented/exported API surface only |
| REST/service API | API/integration tests | Documented contract: routes, status codes, error shapes |
| Reusable UI component | Unit/component tests | Documented props, states, callbacks, accessibility |
| One-off application UI | UI automation | User-visible behavior, form flows, navigation, permission states |
| Direct behavior, no new API/UI | Tests derived from acceptance criteria | Observable change in behavior — no new API or UI surface to test against specifically |
| Bugfix | Failure-first bug reproduction | Reproduce the reported bug before implementation. Ask whether evidence should be permanent or temporary; temporary tests/checks may be removed only after passing and human confirmation: "Have you verified that the reported bug is fixed and no longer reproduces?" |
| Operational/document deliverable | Process/document checks | Required sections, links, document-specific checks |

**Steps:**

1. Write tests that verify every acceptance criterion in the spec. The classification determines the test type (see table above).
2. Run the test suite.
3. Confirm the new test(s) fail for the expected reason.
4. Record the failure:
   ```
   Expected failure: [test name] fails because [function/endpoint/component] does not yet exist
   ```

**If you cannot run the test yet**, you must record a concrete reason before proceeding — missing infrastructure, irreversible side effect, etc. A vague "impractical" without specifics does not qualify.
```
Failure-first impractical: [concrete reason]
```

**Halt conditions in this phase:**
- Cannot write a test without making implementation assumptions → spec is unclear; return to Phase 1
- Test would require changing existing passing tests → scope has expanded; record a scope discovery

---

## Gate 4: Failure Confirmed

**Required:** One of:
- Test run output showing the new test failing for the expected reason
- Written record of why running the test was impractical, with a concrete reason

No implementation may begin until one of these exists. Gate 4 does not change the spec's `Status`; the spec remains `Implementation Active` throughout. Gate/run state remains authoritative.

---

## Phase 5: Implement

**Triggered by:** Gate 4 confirmed — required implementation planning is recorded and a failing test exists for the expected reason. Agent-driven.

**Goal:** Make the failing test pass. Nothing more.

**Documentation integrity for the current spec:** Identify documentation obligations from the current spec's `Documentation Requirements` section, linked contract, classification, and prior implementation review. Create or update every required doc for the current spec, verify required links, and validate those docs against the implemented behavior. Any doc created or updated for the current spec must be directly linked from the spec's `Documentation Requirements` section and listed in the review's `Linked Documentation` section. If no documentation changes are required, record that explicitly. Do not audit unrelated repository documentation.

**Rules:**
- Change only what is required to make the spec's tests pass
- Do not add unrequested features, optional enhancements, or opportunistic refactors
- Do not upgrade dependencies or change architecture unless the spec requires it
- Do not implement nearby TODOs
- Do not invent UI beyond what design direction specifies

**If a spec problem surfaces during implementation:**
1. Stop immediately
2. Classify it: ambiguity, gap, or conflict?
3. Create a spec deviation request and link it to the governing spec:
   ```bash
   spec-guard deviation --spec <feature-name> <topic>
   ```
4. Halt until the human resolves it

**If out-of-scope work is discovered:**
1. Record it and link it to the governing spec:
   ```bash
   spec-guard scope-discovery --spec <feature-name> <topic>
   ```
2. Classify it: required for this spec, or additive?
3. If required: ask for acknowledgment before continuing
4. If additive: record and do not implement

---

## Gate 5: Tests Pass

**Required:**
- All tests pass
- No scope was silently absorbed
- Any scope discoveries are recorded
- Any spec deviations are recorded and resolved

---

## Phase 6: Review

**Triggered by:** Gate 5 passes — all tests pass and no scope was silently absorbed. Agent-driven.

**Goal:** Confirm the change is traceable, complete, and clean.

Create an implementation review and link it to the governing spec:
```bash
spec-guard review --spec <feature-name> <feature-name>
```

Complete the review checklist:
- [ ] Change traces to the governing spec
- [ ] Tests were written before implementation
- [ ] Failure-first was confirmed or reason was recorded
- [ ] Behavior/contract was validated, not prose
- [ ] Current-spec documentation obligations were fully satisfied, directly linked from `Documentation Requirements`, and listed in `Linked Documentation`, or explicitly marked not applicable
- [ ] No unrelated repository documentation was audited or changed
- [ ] No out-of-scope work was absorbed silently
- [ ] Scope discoveries were recorded
- [ ] Durable documentation updated only if contract changed
- [ ] No unrequested features or refactors included

Then run the cross-artifact alignment check:
```bash
spec-guard analyze <feature-name>
```

Gate 6 cannot close until `spec-guard analyze` reports no `SG-ALIGN` warnings.

---

## Gate 6: Review Complete

**Required:**
- All review checklist items checked
- `spec-guard analyze` reports no `SG-ALIGN` warnings

When Gate 6 is confirmed, Spec Guard updates the spec's `Status` to `Implemented`; gate/run state remains authoritative.

---

## Compound Work

If a request spans multiple work classifications, split it. Do not implement multiple classifications as one task.

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
# or, when blocking a specific spec:
spec-guard blocker --spec <spec-name> <topic>
```

When a blocker or unresolved deviation is recorded for a specific spec, Spec Guard updates that spec's `Status` to `Blocked`; gate/run state remains authoritative.

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

Discovery is separate from implementation. Enter only when the human explicitly requests it (gap analysis, risk review, "what should we build next?", etc.).

In discovery mode:
1. Confirm the discovery scope
2. Produce evidence-based findings
3. Distinguish required gaps from optional enhancements
4. Recommend blocker, spec change, follow-up spec, or no action
5. Do not implement anything unless separately authorized

Create a discovery request to track it. If the discovery is associated with a governing spec, link it to that spec:
```bash
spec-guard discovery --spec <feature-name> <topic>
```
