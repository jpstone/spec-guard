import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSpecText, formatDiagnostic } from '../src/check.js';

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

- [ ] Criteria.

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

test('valid spec has no diagnostics', () => {
  assert.deepEqual(checkSpecText(validSpec, 'valid.md'), []);
});

test('reports missing required headings', () => {
  const diagnostics = checkSpecText('# Spec\n\n## Problem / Goal\n\nGoal.\n', 'missing.md');
  assert(diagnostics.some((diagnostic) => diagnostic.ruleId === 'SG-SPEC-002'));
  assert(diagnostics.some((diagnostic) => diagnostic.message.includes('In Scope')));
});

test('reports empty required sections', () => {
  const diagnostics = checkSpecText(validSpec.replace('## Problem / Goal\n\nGoal.', '## Problem / Goal\n\n<!-- Describe the goal. -->\n\n- '), 'empty-section.md');
  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.ruleId), ['SG-SPEC-004']);
});

test('reports no selected classification', () => {
  const diagnostics = checkSpecText(validSpec.replace('- [x] Direct behavior with no new API or UI', '- [ ] Direct behavior with no new API or UI'), 'none.md');
  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.ruleId), ['SG-CLASS-001']);
});

test('reports multiple selected classifications', () => {
  const diagnostics = checkSpecText(validSpec.replace('- [ ] REST/service API', '- [x] REST/service API'), 'multiple.md');
  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.ruleId), ['SG-CLASS-001']);
});

test('reports missing required tests/checks', () => {
  const diagnostics = checkSpecText(validSpec.replace('## Required Tests / Checks\n\n- Test it.', '## Required Tests / Checks\n\n'), 'tests.md');
  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.ruleId), ['SG-TEST-001']);
});

test('empty bullets do not count as identified tests/checks', () => {
  const diagnostics = checkSpecText(validSpec.replace('## Required Tests / Checks\n\n- Test it.', '## Required Tests / Checks\n\n<!-- Identify tests. -->\n\n- '), 'empty-bullet.md');
  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.ruleId), ['SG-TEST-001']);
});

test('supports CRLF line endings', () => {
  const crlf = validSpec.replaceAll('\n', '\r\n');
  assert.deepEqual(checkSpecText(crlf, 'crlf.md'), []);
});

test('formats diagnostics as plain text contract', () => {
  const text = formatDiagnostic({
    severity: 'BLOCKER',
    ruleId: 'SG-CLASS-001',
    path: 'specs/login.md',
    message: 'exactly one work classification must be selected',
  });

  assert.equal(text, '[BLOCKER] SG-CLASS-001 specs/login.md: exactly one work classification must be selected');
});
