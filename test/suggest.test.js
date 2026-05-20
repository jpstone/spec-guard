import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestFix, annotateDiagnostics } from '../src/suggest.js';

function diag(ruleId, message, severity = 'BLOCKER') {
  return { severity, ruleId, path: 'spec.md', message };
}

// ─── suggestFix coverage ──────────────────────────────────────────────────────

test('suggestFix — returns a non-empty string for every known rule', () => {
  const rules = [
    'SG-SPEC-002', 'SG-SPEC-003', 'SG-SPEC-004', 'SG-SPEC-005', 'SG-SPEC-006',
    'SG-SPEC-007', 'SG-SPEC-008', 'SG-CLASS-001', 'SG-CLASS-002', 'SG-UI-001', 'SG-UI-002',
    'SG-STALE-001',
    'SG-ALIGN-001', 'SG-ALIGN-002', 'SG-ALIGN-003', 'SG-ALIGN-004',
  ];
  for (const ruleId of rules) {
    const suggestion = suggestFix(diag(ruleId, `test message for ${ruleId}`));
    assert.ok(suggestion.length > 20, `Suggestion for ${ruleId} is too short: "${suggestion}"`);
  }
});

test('suggestFix — returns fallback for unknown rule', () => {
  const suggestion = suggestFix(diag('SG-UNKNOWN-999', 'some message'));
  assert.ok(suggestion.length > 0);
});

// ─── SG-SPEC-002 ──────────────────────────────────────────────────────────────

test('suggestFix SG-SPEC-002 — includes the missing heading name', () => {
  const d = diag('SG-SPEC-002', 'missing required heading: In Scope');
  const s = suggestFix(d);
  assert.ok(s.includes('In Scope'), `Expected heading in suggestion: ${s}`);
});

// ─── SG-SPEC-007 ─────────────────────────────────────────────────────────────

test('suggestFix SG-SPEC-007 — includes the vague criterion text', () => {
  const d = diag('SG-SPEC-007', 'acceptance criterion uses a vague qualifier: "loads quickly"', 'INFO');
  const s = suggestFix(d);
  assert.ok(s.includes('loads quickly'), `Expected criterion in suggestion: ${s}`);
  assert.ok(s.includes('measurable') || s.includes('concrete'), `Expected guidance in suggestion: ${s}`);
});

// ─── SG-CLASS-002 ─────────────────────────────────────────────────────────────

test('suggestFix SG-CLASS-002 — includes REST contract command for REST classification', () => {
  const d = diag('SG-CLASS-002', 'classification "REST/service API" typically requires a contract document');
  const s = suggestFix(d);
  assert.ok(s.includes('rest-api-contract'), `Expected rest-api-contract in: ${s}`);
});

test('suggestFix SG-CLASS-002 — includes component-contract for UI component', () => {
  const d = diag('SG-CLASS-002', 'classification "Reusable UI component" typically requires a contract document');
  const s = suggestFix(d);
  assert.ok(s.includes('component-contract'), `Expected component-contract in: ${s}`);
});

// ─── SG-ALIGN-001 ─────────────────────────────────────────────────────────────

test('suggestFix SG-ALIGN-001 — includes the missing criterion text', () => {
  const d = diag('SG-ALIGN-001', 'acceptance criterion not found in review: "login form renders"', 'WARNING');
  const s = suggestFix(d);
  assert.ok(s.includes('login form renders'), `Expected criterion in suggestion: ${s}`);
});

// ─── SG-ALIGN-003 ─────────────────────────────────────────────────────────────

test('suggestFix SG-ALIGN-003 — advises to create contract when not found', () => {
  const d = diag('SG-ALIGN-003', 'contract file not found: contracts/api.md', 'BLOCKER');
  const s = suggestFix(d);
  assert.ok(s.includes('Create') || s.includes('template'), `Expected creation guidance: ${s}`);
});

test('suggestFix SG-ALIGN-003 — advises to fill in blank template', () => {
  const d = diag('SG-ALIGN-003', 'contract appears to be a blank or near-empty template', 'WARNING');
  const s = suggestFix(d);
  assert.ok(s.includes('Fill') || s.includes('template'), `Expected fill-in guidance: ${s}`);
});

// ─── annotateDiagnostics ──────────────────────────────────────────────────────

test('annotateDiagnostics — adds suggestion field to each diagnostic', () => {
  const diagnostics = [
    diag('SG-SPEC-002', 'missing required heading: In Scope'),
    diag('SG-CLASS-001', 'exactly one work classification must be selected; found none'),
  ];
  const annotated = annotateDiagnostics(diagnostics);
  assert.equal(annotated.length, 2);
  for (const d of annotated) {
    assert.ok('suggestion' in d, 'Missing suggestion field');
    assert.ok(d.suggestion.length > 10);
    // Original fields preserved
    assert.ok('severity' in d);
    assert.ok('ruleId' in d);
    assert.ok('message' in d);
  }
});

test('annotateDiagnostics — does not mutate input array', () => {
  const diagnostics = [diag('SG-TEST-001', 'required tests/checks must be identified')];
  const original = { ...diagnostics[0] };
  annotateDiagnostics(diagnostics);
  assert.deepEqual(diagnostics[0], original);
});
