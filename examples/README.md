# Example: Slugify Utility — End to End

This walkthrough follows a single feature from a developer's initial request through all five Spec Guard gates to a completed implementation. The developer knows what they want. The agent handles classification, contracts, tests, and gates.

---

## Setup

In a fresh repository:

```bash
npm install --save-dev spec-guard
npx spec-guard init
```

`init` creates `.spec-guard/`, `AGENTS.md`, `WORKFLOW.md`, and `.github/workflows/spec-guard.yml`. The agent reads `AGENTS.md` (and `WORKFLOW.md`) automatically if using Claude Code, Cursor, or any tool that ingests project instruction files.

---

## The Request

The developer gives the agent this prompt:

```
We need a shared slugify function for turning article titles into URL-safe strings.
Different parts of the codebase are doing this inconsistently. Use Spec Guard.
```

The agent does not implement. It starts the spec authoring flow.

---

## Phase 1 — Spec (Gate 1)

**Via MCP (recommended):** the agent calls `spec_guard_interview_questions`, asks the developer each required question, then calls `spec_guard_draft_spec` with the answers. The result is written to `.spec-guard/specs/slugify.md`.

**Via CLI:** `npx spec-guard draft slugify` — interactive wizard, same output.

The resulting spec:

```markdown
# Spec: Article Slug Generator

## Status

Draft

## Problem / Goal

Article titles need URL-safe slugs for routing and permalinks. Each feature currently
generates them differently, producing inconsistent output. A shared utility will
normalize behavior across the codebase.

## In Scope

- Convert a title string to a lowercase, hyphen-separated URL-safe slug
- Replace spaces and punctuation with hyphens
- Collapse consecutive separators to a single hyphen
- Strip leading and trailing hyphens from the result

## Out of Scope

- Slug uniqueness checks or database lookups
- Handling non-ASCII or Unicode characters beyond ASCII letters and digits
- Reversing a slug back to a title

## Expected Behavior

Given a title string, `slugify` returns a lowercase string containing only ASCII
letters, digits, and hyphens. Multiple spaces or punctuation collapse to a single
hyphen. Leading and trailing hyphens are stripped.

## Acceptance Criteria

- [ ] `slugify("Hello World")` returns `"hello-world"`
- [ ] `slugify("  Leading and trailing spaces  ")` returns `"leading-and-trailing-spaces"`
- [ ] `slugify("It's a Test!")` returns `"its-a-test"`
- [ ] `slugify("Multiple   Spaces")` returns `"multiple-spaces"`
- [ ] `slugify("")` returns `""`

## Dependencies

- Contract: `.spec-guard/contracts/slugify-api-contract.md`

## Open Questions

## Work Classification

- [x] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [ ] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
```

The agent presents this to the developer for approval, then runs Gate 1:

```bash
$ npx spec-guard check slugify
# no output — exit 0
```

**Gate 1 passes.**

---

## Phase 2 — Classification and Contract (Gate 2)

The agent confirms classification and gets test guidance:

```bash
$ npx spec-guard classify slugify
Reusable non-UI API

  Test guidance: Unit tests against exported surface only
```

Classification is `Reusable non-UI API` — a contract is required before Gate 2 passes. The agent creates one:

```bash
npx spec-guard new api-contract slugify
```

It fills in `.spec-guard/contracts/slugify-api-contract.md`:

```markdown
# API Contract: `slugify`

## Module

`@app/utils/slug`

## Exported Surface

    export function slugify(title: string): string

## Behavior

- Lowercases all characters
- Removes non-alphanumeric characters (except hyphens)
- Collapses consecutive spaces and hyphens to a single hyphen
- Trims leading and trailing hyphens

## Errors

Does not throw. Returns empty string for empty input.

## Side Effects

None.
```

Gate 2 check:

```bash
$ npx spec-guard check slugify --warnings
# no output — exit 0
```

**Gate 2 passes.**

---

## Phase 3 — Failing Tests (Gate 3)

The agent writes one test per acceptance criterion. No implementation exists yet.

```ts
// src/utils/slug.test.ts
import { slugify } from './slug';

test('basic title becomes lowercase hyphenated slug', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
});

test('trims leading and trailing spaces', () => {
  assert.equal(slugify('  Leading and trailing spaces  '), 'leading-and-trailing-spaces');
});

test('strips punctuation', () => {
  assert.equal(slugify("It's a Test!"), 'its-a-test');
});

test('collapses multiple spaces to one hyphen', () => {
  assert.equal(slugify('Multiple   Spaces'), 'multiple-spaces');
});

test('empty string returns empty string', () => {
  assert.equal(slugify(''), '');
});
```

The agent runs the tests. All 5 fail:

```
Error: Cannot find module './slug'
```

Gate 3 confirmation:

```bash
npx spec-guard confirm-gate slugify 3 --evidence="All 5 tests fail: Cannot find module './slug' — function does not exist yet"
```

**Gate 3 passes.**

---

## Phase 4 — Implementation (Gate 4)

The agent implements the smallest code that satisfies the contract:

```ts
// src/utils/slug.ts
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
```

All 5 tests pass. No scope was absorbed — no extra options, no async variant, no normalization beyond what the spec required.

```bash
npx spec-guard confirm-gate slugify 4
```

**Gate 4 passes.**

---

## Phase 5 — Review (Gate 5)

The agent creates the implementation review:

```bash
npx spec-guard review slugify
```

It fills in `.spec-guard/reviews/slugify.md` — tracing each changed file to the spec, confirming tests were written before implementation, and checking every acceptance criterion.

Cross-artifact alignment check:

```bash
$ npx spec-guard analyze slugify

Spec Guard Analysis: Article Slug Generator
  Spec:           .spec-guard/specs/slugify.md
  Contract:       .spec-guard/contracts/slugify-api-contract.md
  Review:         .spec-guard/reviews/slugify.md
  Classification: Reusable non-UI API
  Criteria: 5   Required tests: 0

  ✓  All artifacts aligned.
```

Gate 5 confirmation:

```bash
npx spec-guard confirm-gate slugify 5
```

Final status:

```bash
$ npx spec-guard gate-status slugify

Spec: .spec-guard/specs/slugify.md
Classification: Reusable non-UI API

  Gate 1 [✓] Spec valid
  Gate 2 [✓] Contracts present
  Gate 3 [✓] Failure confirmed  (agent-confirmed — use spec-guard confirm-gate)
  Gate 4 [✓] Tests pass         (agent-confirmed — use spec-guard confirm-gate)
  Gate 5 [✓] Review complete    (agent-confirmed — use spec-guard confirm-gate)
```

**All five gates pass. Implementation is complete.**

---

## What the agent never did

- Implemented before Gates 1, 2, and 3 were confirmed
- Invented the classification — it was determined from the spec content
- Added URL encoding, Unicode normalization, or other behavior not in the spec
- Wrote tests for private implementation details instead of the exported surface
- Created documentation beyond the required contract
