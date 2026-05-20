# Quickstart

## Minimum workflow

```bash
# 1. Install
npm install --save-dev spec-guard

# 2. Initialize project structure
npx spec-guard init

# 3. Create a spec (two options)

#   Option A: guided wizard
npx spec-guard draft my-feature

#   Option B: from template, then edit
npx spec-guard new spec my-feature
# Use: npx spec-guard watch my-feature
# to see live validation as you write

# 4. Validate the spec
npx spec-guard check my-feature

# 5. Get fix instructions if there are issues
npx spec-guard suggest my-feature

# 6. When the spec is clean (exit 0), write tests, observe failure, implement
```

Bare names resolve to `.spec-guard/specs/<name>.md`. Pass a full path to write elsewhere.

## For an AI coding agent

Add `AGENTS.md` (created by `init`) to your agent context.

One-line prompt starter:

```text
Follow Spec Guard (see AGENTS.md). Before any implementation: identify the spec, classify the work, write tests, observe failure, then implement. Halt on missing specs, unclear UI, bad specs, or scope creep.
```

For MCP-compatible agents, the `spec_guard_interview_questions` → `spec_guard_draft_spec` flow produces a valid spec without any manual editing.

## What a ready spec looks like

A spec is ready to implement when `spec-guard check` exits 0 with no blockers:

```bash
$ npx spec-guard check my-feature
# (no output, exit 0 = ready)
```

With warnings shown:

```bash
$ npx spec-guard check --warnings my-feature
[WARNING] SG-SPEC-003 .spec-guard/specs/my-feature.md: 1 open question(s) may affect implementation
[INFO] SG-SPEC-007 .spec-guard/specs/my-feature.md: acceptance criterion uses a vague qualifier: "works correctly"
```

## Get actionable fix instructions

```bash
npx spec-guard suggest my-feature
```

Each diagnostic includes a `suggestion` field with a concrete, multi-line fix.

## Check all specs at once

```bash
npx spec-guard validate
```

## See status of all specs

```bash
npx spec-guard status

Spec Guard Status

Status      Classification                        Issues    Path
──────────────────────────────────────────────────────────────────────
Ready       Direct behavior with no new API or UI clean     .spec-guard/specs/add-search.md
Draft       REST/service API                      1B 0W     .spec-guard/specs/auth-api.md
Blocked     One-off application UI                2B 1W     .spec-guard/specs/login-screen.md
```

## Cross-artifact check before Gate 5

```bash
npx spec-guard analyze my-feature
```

Verifies that the contract is non-blank, every acceptance criterion appears in the implementation review, and no review checkboxes remain unchecked.

## Record a blocker

```bash
npx spec-guard blocker missing-ui-direction
# Edit .spec-guard/blockers/missing-ui-direction.md to describe what's blocking
```

## Record scope creep

```bash
npx spec-guard scope-discovery auth-refactor
```

## CI usage

```yaml
- name: Validate specs
  run: npx spec-guard validate --json
```

Exits 1 (fails the build) if any spec has a BLOCKER.
