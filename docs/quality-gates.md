# Quality Gates

Spec Guard enforces five mechanical gates. Work cannot proceed past a gate until it passes.

---

## Gate 1: Spec Valid

```bash
spec-guard check path/to/spec.md   # must exit 0
```

Required evidence:

- A governing spec exists.
- The spec has concrete content for problem/goal, scope, expected behavior, acceptance criteria, classification, and required tests/checks.
- `spec-guard check` exits 0 (no blockers).

---

## Gate 2: Contracts Present

```bash
spec-guard check path/to/spec.md --warnings
# No SG-CLASS-002, SG-UI-001, or SG-UI-002 blockers
```

Required evidence:

- Exactly one work classification is selected.
- The required contract artifact exists and is referenced in the spec (API contract, REST API contract, or component contract, depending on classification).

Why this is stricter than generic spec workflows: the same implementation request may require unit tests, API/integration tests, browser automation, or document checks. Classification prevents agents from applying one generic plan to every task.

---

## Gate 3: Failure Confirmed

Required evidence — one of:

- New tests/checks were run before implementation and fail for the expected reason.
- A concrete reason is recorded explaining why running them was impractical (missing infrastructure, irreversible side effects in a live system, or environment not yet available).

Disallowed evidence:

- tests that only check prose for product features,
- tests against undocumented private internals,
- vague statements such as "add tests" without naming what must fail,
- "impractical" without a concrete reason.

---

## Gate 4: Tests Pass

Required evidence:

- All tests pass.
- No scope was silently absorbed.
- Any discovered out-of-scope work is recorded as a scope discovery.
- Any spec deviation required during implementation is recorded and resolved.

---

## Gate 5: Review Complete

```bash
spec-guard review .spec-guard/reviews/<name>.md
spec-guard analyze path/to/spec.md   # must exit 0
```

Required evidence:

- Implementation review is complete with all checklist items resolved.
- `spec-guard analyze` exits 0 (no SG-ALIGN warnings).
- Every changed file traces to the governing spec or an explicitly authorized deviation.
- Tests/checks were written before implementation.
- Durable documentation was updated only when the durable contract changed.

---

## Halt Conditions (Apply Throughout Execution)

These are not gates — they are conditions that halt work immediately at any point:

**UI work without design inputs:** If a UI task has no mockup, wireframe, or explicit design direction, work halts. Create a blocker. Do not invent UI.

**Bad spec discovered during implementation:** If an ambiguity, gap, or conflict is found in the spec, work halts. Record a spec deviation. Do not patch around it.

**Spec adherence broken:** Any implementation that adds unrequested features, optional enhancements, opportunistic refactors, dependency upgrades, or nearby TODOs not required by the spec is a halt condition. Record a scope discovery and stop.

**Discovery without explicit request:** Discovery mode (gap analysis, risk review, "what's next?") is only entered when the human explicitly asks. A generic "what's next?" after implementation is not permission to produce a roadmap or invent features.

---

## Objective Differentiators

Spec Guard is stronger than a generic spec/template workflow when it can answer yes to all of these:

- Did a tool or checklist reject specs with missing required content?
- Was exactly one work classification selected?
- Did the classification drive the test strategy?
- Were behavior/contract/UI tests named before implementation?
- Was failure observed before implementation?
- Did UI work halt without design inputs?
- Were bad specs and scope creep recorded instead of absorbed?
- Did every change trace to the spec or an authorized deviation?
- Did the agent avoid unrequested features, optional enhancements, and opportunistic refactors?
- Did the agent avoid unsolicited roadmap generation?
- Were discovery findings only produced after explicit human request?
- Were product features tested through behavior rather than prose?
