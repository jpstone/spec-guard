import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gate1, gate2, gate5, runCheck, TEST_GUIDANCE, PHASES } from '../src/run.js';

function tempSpec(content) {
  const dir = mkdtempSync(join(tmpdir(), 'sg-run-'));
  const path = join(dir, 'spec.md');
  writeFileSync(path, content);
  return path;
}

const validSpec = `# Spec

## Problem / Goal

Goal.

## In Scope

- A

## Out of Scope

- B

## Expected Behavior

Behavior.

## Acceptance Criteria

- [x] Criteria.

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [x] Direct behavior with no new API or UI
- [ ] Operational/document deliverable

## Required Tests / Checks

- Test it.
`;

const invalidSpec = `# Spec

## Problem / Goal

Goal.
`;

// ─── PHASES ──────────────────────────────────────────────────────────────────

test('PHASES has 5 entries', () => {
  assert.equal(PHASES.length, 5);
  assert.equal(PHASES[0].id, 'discover');
  assert.equal(PHASES[4].id, 'review');
});

// ─── gate1 ────────────────────────────────────────────────────────────────────

test('gate1 passes for valid spec', async () => {
  const path = tempSpec(validSpec);
  const result = await gate1(path);
  assert.equal(result.passed, true);
  assert.equal(result.blockers.length, 0);
});

test('gate1 fails for spec with missing headings', async () => {
  const path = tempSpec(invalidSpec);
  const result = await gate1(path);
  assert.equal(result.passed, false);
  assert(result.blockers.length > 0);
  assert(result.blockers.some(d => d.ruleId === 'SG-SPEC-002'));
});

// ─── gate2 ────────────────────────────────────────────────────────────────────

test('gate2 passes for direct behavior classification (no contract needed)', async () => {
  const path = tempSpec(validSpec);
  const result = await gate2(path);
  assert.equal(result.passed, true);
});

test('gate2 warns API classification without contract reference (SG-CLASS-002 is a warning)', async () => {
  const apiSpec = validSpec
    .replace('- [x] Direct behavior with no new API or UI', '- [ ] Direct behavior with no new API or UI')
    .replace('- [ ] Reusable non-UI API', '- [x] Reusable non-UI API');
  const path = tempSpec(apiSpec);
  const result = await gate2(path);
  // SG-CLASS-002 is WARNING severity — gate2 still passes but the warning is present
  assert.equal(result.passed, true);
  assert(result.diagnostics.some(d => d.ruleId === 'SG-CLASS-002' && d.severity === 'WARNING'));
});

test('gate2 passes for API classification with contract referenced', async () => {
  const apiSpec = validSpec
    .replace('- [x] Direct behavior with no new API or UI', '- [ ] Direct behavior with no new API or UI')
    .replace('- [ ] Reusable non-UI API', '- [x] Reusable non-UI API') +
    '\n## Dependencies\n\n- See contracts/api-contract.md\n';
  const path = tempSpec(apiSpec);
  const result = await gate2(path);
  assert.equal(result.passed, true);
});

// ─── gate5 ───────────────────────────────────────────────────────────────────

test('gate5 fails when no review file exists', async () => {
  const result = await gate5('/nonexistent/review.md');
  assert.equal(result.passed, false);
});

test('gate5 passes when review has no unchecked boxes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sg-gate5-'));
  const reviewPath = join(dir, 'review.md');
  writeFileSync(reviewPath, '# Review\n\n- [x] Tests written first.\n- [x] No scope absorbed.\n');
  const result = await gate5(reviewPath);
  assert.equal(result.passed, true);
  assert.equal(result.unchecked, 0);
});

test('gate5 fails when review has unchecked boxes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sg-gate5-'));
  const reviewPath = join(dir, 'review.md');
  writeFileSync(reviewPath, '# Review\n\n- [x] Tests written first.\n- [ ] No scope absorbed.\n');
  const result = await gate5(reviewPath);
  assert.equal(result.passed, false);
  assert.equal(result.unchecked, 1);
});

// ─── runCheck ─────────────────────────────────────────────────────────────────

test('runCheck returns gate1 and gate2 for valid spec', async () => {
  const path = tempSpec(validSpec);
  const result = await runCheck(path);
  assert.equal(result.gate1.passed, true);
  assert.equal(result.gate2.passed, true);
  assert.equal(result.classification, 'Direct behavior with no new API or UI');
});

test('runCheck returns error for missing spec', async () => {
  const result = await runCheck('/nonexistent/spec.md');
  assert.equal(result.exitCode, 2);
  assert(result.error.includes('not found'));
});

// ─── TEST_GUIDANCE ────────────────────────────────────────────────────────────

test('TEST_GUIDANCE covers all 6 classifications', () => {
  const classifications = [
    'Reusable non-UI API',
    'REST/service API',
    'Reusable UI component',
    'One-off application UI',
    'Direct behavior with no new API or UI',
    'Operational/document deliverable',
  ];
  for (const c of classifications) {
    assert(TEST_GUIDANCE[c], `Missing guidance for: ${c}`);
    assert(TEST_GUIDANCE[c].length > 10, `Guidance too short for: ${c}`);
  }
});
