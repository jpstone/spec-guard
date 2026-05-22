import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkSpecText } from '../src/check.js';

const bugfixSpec = `# Spec

## Problem / Goal

Fix a crash on login.

## In Scope

- Prevent null pointer on login path

## Out of Scope

- Login redesign

## Expected Behavior

Login does not crash.

## Acceptance Criteria

- [x] Login completes without error.

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [ ] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
- [x] Bugfix
`;

const directBehaviorSpec = `# Spec

## Problem / Goal

Add a feature.

## In Scope

- Feature behavior

## Out of Scope

- Unrelated work

## Expected Behavior

Feature works.

## Acceptance Criteria

- [x] Feature is present.

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [x] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
- [ ] Bugfix
`;

// ─── SG-BUG-001 ───────────────────────────────────────────────────────────────

test('Bugfix spec without Test Evidence section reports SG-BUG-001 BLOCKER', () => {
  const diagnostics = checkSpecText(bugfixSpec, 'missing-evidence.md');
  const d = diagnostics.find(d => d.ruleId === 'SG-BUG-001');
  assert(d, 'expected SG-BUG-001 diagnostic');
  assert.equal(d.severity, 'BLOCKER');
});

test('Bugfix spec with Test Evidence section but no option checked reports SG-BUG-001 BLOCKER', () => {
  const text = `${bugfixSpec}\n## Test Evidence\n\n- [ ] Permanent regression coverage.\n- [ ] Temporary — remove after: \n`;
  const diagnostics = checkSpecText(text, 'unchecked-evidence.md');
  const d = diagnostics.find(d => d.ruleId === 'SG-BUG-001');
  assert(d, 'expected SG-BUG-001 diagnostic');
  assert.equal(d.severity, 'BLOCKER');
});

test('Bugfix spec with permanent option checked passes SG-BUG-001', () => {
  const text = `${bugfixSpec}\n## Test Evidence\n\n- [x] Permanent regression coverage.\n- [ ] Temporary — remove after: \n`;
  const diagnostics = checkSpecText(text, 'permanent-evidence.md');
  assert(!diagnostics.some(d => d.ruleId === 'SG-BUG-001'), 'SG-BUG-001 should not fire');
});

test('Bugfix spec with temporary option checked passes SG-BUG-001', () => {
  const text = `${bugfixSpec}\n## Test Evidence\n\n- [ ] Permanent regression coverage.\n- [x] Temporary — remove after: bug confirmed fixed and no longer reproduces.\n`;
  const diagnostics = checkSpecText(text, 'temporary-evidence.md');
  assert(!diagnostics.some(d => d.ruleId === 'SG-BUG-001'), 'SG-BUG-001 should not fire');
});

test('Non-Bugfix spec is not affected by SG-BUG-001', () => {
  const diagnostics = checkSpecText(directBehaviorSpec, 'non-bugfix.md');
  assert(!diagnostics.some(d => d.ruleId === 'SG-BUG-001'), 'SG-BUG-001 should not fire for non-Bugfix');
});

// ─── Template and documentation ───────────────────────────────────────────────

test('spec template includes a Test Evidence section with permanent and temporary checkboxes', () => {
  const template = readFileSync('templates/spec.md', 'utf8');
  assert.match(template, /^## Test Evidence$/m);
  assert.match(template, /Permanent/i);
  assert.match(template, /Temporary/i);
});

test('AGENTS.md documents the Test Evidence field requirement for Bugfix specs before Gate 4', () => {
  const agents = readFileSync('AGENTS.md', 'utf8');
  assert.match(agents, /Test Evidence/i);
  assert.match(agents, /permanent|temporary/i);
});
