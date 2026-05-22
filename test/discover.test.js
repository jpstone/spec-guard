import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSpecFromAnswers } from '../src/discover.js';
import { checkSpecText, CLASSIFICATIONS } from '../src/check.js';

// Full valid answers — the baseline that should always pass Gate 1.
const validAnswers = {
  title: 'User login',
  problem: 'Users cannot authenticate without a login page.',
  inScope: ['Login form with email and password', 'Session creation on success'],
  outOfScope: ['Password reset', 'OAuth'],
  users: ['End user'],
  expectedBehavior: 'User submits credentials and is redirected to dashboard. See Figma mockup at /designs/login.fig. Uses the design system component library.',
  acceptanceCriteria: ['Login form renders correctly', 'Invalid credentials show an error message'],
  classification: 'One-off application UI',
};

test('buildSpecFromAnswers — valid answers produce a spec that passes Gate 1', () => {
  const spec = buildSpecFromAnswers(validAnswers);
  const diagnostics = checkSpecText(spec, '<test>');
  const blockers = diagnostics.filter(d => d.severity === 'BLOCKER');
  assert.equal(blockers.length, 0, `Unexpected blockers: ${blockers.map(d => d.message).join(', ')}`);
});

test('buildSpecFromAnswers — output passes Gate 1 for every classification', () => {
  for (const classification of CLASSIFICATIONS) {
    const answers = {
      ...validAnswers,
      classification,
      // Provide UI inputs for UI classifications so SG-UI-001 doesn't block
      expectedBehavior: classification.includes('UI')
        ? 'See Figma mockup. Uses the design system component library.'
        : validAnswers.expectedBehavior,
      // Bugfix requires Test Evidence to be checked before Gate 4
      ...(classification === 'Bugfix' ? { testEvidence: 'permanent' } : {}),
    };
    const spec = buildSpecFromAnswers(answers);
    const diagnostics = checkSpecText(spec, '<test>');
    const blockers = diagnostics.filter(d => d.severity === 'BLOCKER');
    assert.equal(
      blockers.length, 0,
      `Classification "${classification}" produced blockers: ${blockers.map(d => d.message).join(', ')}`
    );
  }
});

test('buildSpecFromAnswers — exactly one classification is checked', () => {
  const spec = buildSpecFromAnswers(validAnswers);
  const checked = (spec.match(/^- \[x\]/gm) || []).length;
  assert.equal(checked, 1);
});

test('buildSpecFromAnswers — acceptance criteria use checkbox format', () => {
  const spec = buildSpecFromAnswers(validAnswers);
  for (const criterion of validAnswers.acceptanceCriteria) {
    assert.ok(spec.includes(`- [ ] ${criterion}`), `Missing checkbox for: ${criterion}`);
  }
});

test('buildSpecFromAnswers — acceptance criteria appear as checkboxes', () => {
  const spec = buildSpecFromAnswers(validAnswers);
  for (const c of validAnswers.acceptanceCriteria) {
    assert.ok(spec.includes(`- [ ] ${c}`), `Missing criterion: ${c}`);
  }
});

test('buildSpecFromAnswers — all required headings are present', () => {
  const spec = buildSpecFromAnswers(validAnswers);
  const requiredHeadings = [
    'Problem / Goal',
    'In Scope',
    'Out of Scope',
    'Expected Behavior',
    'Acceptance Criteria',
    'Work Classification',
  ];
  for (const heading of requiredHeadings) {
    assert.ok(spec.includes(`## ${heading}`), `Missing heading: ${heading}`);
  }
});

test('buildSpecFromAnswers — missing problem produces BLOCKER', () => {
  const spec = buildSpecFromAnswers({ ...validAnswers, problem: '' });
  const diagnostics = checkSpecText(spec, '<test>');
  const blockers = diagnostics.filter(d => d.severity === 'BLOCKER');
  assert.ok(blockers.length > 0, 'Expected blockers for empty problem');
});

test('buildSpecFromAnswers — empty inScope produces BLOCKER', () => {
  const spec = buildSpecFromAnswers({ ...validAnswers, inScope: [] });
  const diagnostics = checkSpecText(spec, '<test>');
  const blockers = diagnostics.filter(d => d.severity === 'BLOCKER');
  assert.ok(blockers.length > 0, 'Expected blockers for empty inScope');
});

test('buildSpecFromAnswers — null classification produces BLOCKER', () => {
  const spec = buildSpecFromAnswers({ ...validAnswers, classification: null });
  const diagnostics = checkSpecText(spec, '<test>');
  const blockers = diagnostics.filter(d => d.severity === 'BLOCKER');
  assert.ok(blockers.length > 0, 'Expected blocker for no classification');
});

test('buildSpecFromAnswers — strips leading dashes from input items', () => {
  const spec = buildSpecFromAnswers({
    ...validAnswers,
    inScope: ['- already a bullet', 'plain item'],
  });
  // Should not produce double dashes
  assert.ok(!spec.includes('- - '), 'Found double dash in output');
});

test('buildSpecFromAnswers — default call produces expected structure', () => {
  const spec = buildSpecFromAnswers();
  assert.ok(spec.includes('## Work Classification'));
  assert.ok(spec.includes('## Acceptance Criteria'));
});
