import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLASSIFICATIONS, checkSpecText, formatDiagnostic, getSelectedClassifications, getSpecStatus, getSpecTitle } from '../src/check.js';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

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
`;

const uiSpec = `# Spec

## Problem / Goal

Build a login screen.

## In Scope

- Login form

## Out of Scope

- Password reset

## Expected Behavior

User can log in. See Figma mockup at /designs/login.fig. Uses the design system component library.

## Acceptance Criteria

- [ ] Login form renders.

## UI Mockup AC Suggestion Tracking

- [x] One or more mockups/design inputs were provided.
- [x] Mockup-derived acceptance criteria were suggested to the human.

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [x] One-off application UI
- [ ] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
`;

// ─── SG-SPEC-002: Required headings ──────────────────────────────────────────

test('valid spec has no blockers', () => {
  const diagnostics = checkSpecText(validSpec, 'valid.md');
  const blockers = diagnostics.filter(d => d.severity === 'BLOCKER');
  assert.deepEqual(blockers, []);
});

test('reports missing required headings', () => {
  const diagnostics = checkSpecText('# Spec\n\n## Problem / Goal\n\nGoal.\n', 'missing.md');
  assert(diagnostics.some((d) => d.ruleId === 'SG-SPEC-002'));
  assert(diagnostics.some((d) => d.message.includes('In Scope')));
});

// ─── SG-SPEC-004: Required section content ───────────────────────────────────

test('reports empty required sections', () => {
  const text = validSpec.replace('## Problem / Goal\n\nGoal.', '## Problem / Goal\n\n<!-- Describe the goal. -->\n\n- ');
  const diagnostics = checkSpecText(text, 'empty-section.md');
  assert(diagnostics.some(d => d.ruleId === 'SG-SPEC-004'));
});

// ─── SG-SPEC-003: Open questions ─────────────────────────────────────────────

test('warns on unresolved open questions', () => {
  const text = validSpec + '\n## Open Questions\n\n- What about edge case X?\n';
  const diagnostics = checkSpecText(text, 'open.md');
  assert(diagnostics.some(d => d.ruleId === 'SG-SPEC-003' && d.severity === 'WARNING'));
});

test('no warning when open questions are empty', () => {
  const text = validSpec + '\n## Open Questions\n\n- \n';
  const diagnostics = checkSpecText(text, 'no-open.md');
  assert(!diagnostics.some(d => d.ruleId === 'SG-SPEC-003'));
});

test('no warning when open questions are marked N/A', () => {
  const text = validSpec + '\n## Open Questions\n\n- N/A\n';
  const diagnostics = checkSpecText(text, 'na.md');
  assert(!diagnostics.some(d => d.ruleId === 'SG-SPEC-003'));
});

// ─── SG-SPEC-005: Acceptance criteria format ─────────────────────────────────

test('warns when acceptance criteria use plain bullets instead of checkboxes', () => {
  const text = validSpec.replace('- [x] Criteria.', '- Criteria without checkbox.');
  const diagnostics = checkSpecText(text, 'no-checkbox.md');
  assert(diagnostics.some(d => d.ruleId === 'SG-SPEC-005' && d.severity === 'WARNING'));
});

test('no warning when acceptance criteria use checkbox format', () => {
  const diagnostics = checkSpecText(validSpec, 'valid.md');
  assert(!diagnostics.some(d => d.ruleId === 'SG-SPEC-005'));
});

// ─── SG-CLASS-001: Classification ────────────────────────────────────────────

test('reports no selected classification', () => {
  const text = validSpec.replace('- [x] Direct behavior with no new API or UI', '- [ ] Direct behavior with no new API or UI');
  const diagnostics = checkSpecText(text, 'none.md');
  assert(diagnostics.some(d => d.ruleId === 'SG-CLASS-001'));
});

test('reports multiple selected classifications', () => {
  const text = validSpec.replace('- [ ] REST/service API', '- [x] REST/service API');
  const diagnostics = checkSpecText(text, 'multiple.md');
  assert(diagnostics.some(d => d.ruleId === 'SG-CLASS-001'));
});

test('uppercase X is a valid classification selection', () => {
  const text = validSpec.replace('- [x] Direct behavior', '- [X] Direct behavior');
  const blockers = checkSpecText(text, 'uppercase.md').filter(d => d.severity === 'BLOCKER');
  assert.deepEqual(blockers, []);
});

test('Bugfix is a valid classification choice and passes validation', () => {
  assert(CLASSIFICATIONS.includes('Bugfix'));
  const text = validSpec
    .replace('- [x] Direct behavior with no new API or UI', '- [ ] Direct behavior with no new API or UI')
    .replace('- [ ] Operational/document deliverable', '- [ ] Operational/document deliverable\n- [x] Bugfix')
    + '\n## Test Evidence\n\n- [x] Permanent regression coverage.\n- [ ] Temporary — remove after: \n';
  const diagnostics = checkSpecText(text, 'bugfix.md');
  const blockers = diagnostics.filter(d => d.severity === 'BLOCKER');
  assert.deepEqual(blockers, []);
  assert.deepEqual(getSelectedClassifications(text), ['Bugfix']);
});

// ─── SG-CLASS-002: Contract requirement ──────────────────────────────────────

test('warns when API classification has no contract reference', () => {
  const text = validSpec
    .replace('- [x] Direct behavior with no new API or UI', '- [ ] Direct behavior with no new API or UI')
    .replace('- [ ] Reusable non-UI API', '- [x] Reusable non-UI API');
  const diagnostics = checkSpecText(text, 'api-no-contract.md');
  assert(diagnostics.some(d => d.ruleId === 'SG-CLASS-002' && d.severity === 'WARNING'));
});

test('no contract warning when contract is referenced in dependencies', () => {
  const text = validSpec
    .replace('- [x] Direct behavior with no new API or UI', '- [ ] Direct behavior with no new API or UI')
    .replace('- [ ] Reusable non-UI API', '- [x] Reusable non-UI API') +
    '\n## Dependencies\n\n- See contracts/api-contract.md\n';
  const diagnostics = checkSpecText(text, 'api-with-contract.md');
  assert(!diagnostics.some(d => d.ruleId === 'SG-CLASS-002'));
});

// ─── SG-UI-001: UI design anchor ─────────────────────────────────────────────

test('no UI blockers for a spec with design direction and component library', () => {
  const diagnostics = checkSpecText(uiSpec, 'ui-valid.md');
  assert(!diagnostics.some(d => d.ruleId === 'SG-UI-001'));
});

test('no UI blocker when only mockup is referenced', () => {
  const text = uiSpec.replace('Uses the design system component library.', '');
  const diagnostics = checkSpecText(text, 'ui-mockup-only.md');
  assert(!diagnostics.some(d => d.ruleId === 'SG-UI-001'));
});

test('blocks UI work with no mockup even when component library is referenced', () => {
  const text = uiSpec
    .replace('See Figma mockup at /designs/login.fig.', '')
    .replace('- [x] One or more mockups/design inputs were provided.', '- [ ] One or more mockups/design inputs were provided.');
  const diagnostics = checkSpecText(text, 'ui-lib-only.md');
  const blocker = diagnostics.find(d => d.ruleId === 'SG-UI-001' && d.severity === 'BLOCKER');
  assert(blocker);
  assert.match(blocker.message, /component library is referenced/);
  assert(!diagnostics.some(d => d.ruleId === 'SG-UI-002'));
});

test('blocks UI work with no component library even when mockup is referenced', () => {
  const text = uiSpec.replace('Uses the design system component library.', '');
  const diagnostics = checkSpecText(text, 'ui-mockup-only.md');
  const blocker = diagnostics.find(d => d.ruleId === 'SG-UI-002' && d.severity === 'BLOCKER');
  assert(blocker);
  assert(!diagnostics.some(d => d.ruleId === 'SG-UI-001'));
});

test('blocks UI work with neither mockup nor component library — SG-UI-001 only', () => {
  const text = uiSpec
    .replace('See Figma mockup at /designs/login.fig. Uses the design system component library.', 'User can log in.')
    .replace('- [x] One or more mockups/design inputs were provided.', '- [ ] One or more mockups/design inputs were provided.');
  const diagnostics = checkSpecText(text, 'ui-no-anchor.md');
  const blocker = diagnostics.find(d => d.ruleId === 'SG-UI-001' && d.severity === 'BLOCKER');
  assert(blocker);
  assert(!blocker.message.includes('component library is referenced'));
  assert(!diagnostics.some(d => d.ruleId === 'SG-UI-002'));
});

test('non-UI work does not trigger UI rules', () => {
  const diagnostics = checkSpecText(validSpec, 'non-ui.md');
  assert(!diagnostics.some(d => d.ruleId === 'SG-UI-001'));
});

// ─── SG-UI-003: Mockup-derived AC suggestion marker ─────────────────────────

test('blocks UI spec when mockup input is marked provided but mockup-derived AC suggestion is unchecked', () => {
  const text = uiSpec.replace(
    '- [x] Mockup-derived acceptance criteria were suggested to the human.',
    '- [ ] Mockup-derived acceptance criteria were suggested to the human.',
  );
  const diagnostics = checkSpecText(text, 'ui-mockup-ac-unchecked.md');
  const blocker = diagnostics.find(d => d.ruleId === 'SG-UI-003' && d.severity === 'BLOCKER');
  assert(blocker);
  assert.match(blocker.message, /Mockup-derived acceptance criteria were suggested/);
});

test('blocks UI spec when mockup input is marked provided but mockup-derived AC suggestion marker is missing', () => {
  const text = uiSpec.replace('- [x] Mockup-derived acceptance criteria were suggested to the human.\n', '');
  const diagnostics = checkSpecText(text, 'ui-mockup-ac-missing.md');
  assert(diagnostics.some(d => d.ruleId === 'SG-UI-003' && d.severity === 'BLOCKER'));
});

test('does not require mockup-derived AC suggestion when mockup input is not marked provided', () => {
  const text = uiSpec
    .replace('See Figma mockup at /designs/login.fig. ', 'Use the documented design direction. ')
    .replace('- [x] One or more mockups/design inputs were provided.', '- [ ] One or more mockups/design inputs were provided.')
    .replace('- [x] Mockup-derived acceptance criteria were suggested to the human.', '- [ ] Mockup-derived acceptance criteria were suggested to the human.');
  const diagnostics = checkSpecText(text, 'ui-no-mockup-input-provided.md');
  assert(!diagnostics.some(d => d.ruleId === 'SG-UI-003'));
});

test('non-UI classifications are not affected by mockup AC suggestion marker validation', () => {
  const text = validSpec + '\n## UI Mockup AC Suggestion Tracking\n\n- [x] One or more mockups/design inputs were provided.\n- [ ] Mockup-derived acceptance criteria were suggested to the human.\n';
  const diagnostics = checkSpecText(text, 'non-ui-mockup-marker.md');
  assert(!diagnostics.some(d => d.ruleId === 'SG-UI-003'));
});

test('spec template includes UI mockup AC suggestion tracking markers', () => {
  const template = readFileSync('templates/spec.md', 'utf8');
  assert.match(template, /One or more mockups\/design inputs were provided/);
  assert.match(template, /Mockup-derived acceptance criteria were suggested to the human/);
});

test('one-off UI template includes UI mockup AC suggestion tracking markers', () => {
  const template = readFileSync('templates/one-off-ui.md', 'utf8');
  assert.match(template, /One or more mockups\/design inputs were provided/);
  assert.match(template, /Mockup-derived acceptance criteria were suggested to the human/);
});

test('AGENTS.md explains mockup AC suggestion marker records offered suggestions, not accepted ACs', () => {
  const agents = readFileSync('AGENTS.md', 'utf8');
  assert.match(agents, /Mockup-derived acceptance criteria were suggested to the human/);
  assert.match(agents, /records? that suggestions were offered/i);
  assert.match(agents, /not that the human accepted/i);
});

// ─── getSelectedClassifications ──────────────────────────────────────────────

test('getSelectedClassifications returns selected items', () => {
  const selected = getSelectedClassifications(validSpec);
  assert.deepEqual(selected, ['Direct behavior with no new API or UI']);
});

test('getSelectedClassifications returns empty array when section is missing', () => {
  assert.deepEqual(getSelectedClassifications('# No classification here'), []);
});

// ─── getSpecStatus / getSpecTitle ─────────────────────────────────────────────

test('getSpecStatus returns status value', () => {
  const text = validSpec + '\n## Status\n\nReady\n';
  assert.equal(getSpecStatus(text), 'Ready');
});

test('getSpecStatus returns null when section is absent', () => {
  assert.equal(getSpecStatus(validSpec), null);
});

test('getSpecTitle returns title from heading', () => {
  const title = getSpecTitle(validSpec);
  assert.equal(title, 'Spec');
});

// ─── CRLF ─────────────────────────────────────────────────────────────────────

test('supports CRLF line endings', () => {
  const crlf = validSpec.replaceAll('\n', '\r\n');
  const blockers = checkSpecText(crlf, 'crlf.md').filter(d => d.severity === 'BLOCKER');
  assert.deepEqual(blockers, []);
});

// ─── formatDiagnostic ────────────────────────────────────────────────────────

// ─── SG-SPEC-007: vague acceptance criteria ───────────────────────────────────

test('SG-SPEC-007 flags vague criteria (INFO)', () => {
  const spec = validSpec.replace(
    '- [x] Criteria.',
    '- [ ] The feature works correctly\n- [ ] Performance is fast and efficient'
  );
  const diags = checkSpecText(spec, 'test.md').filter(d => d.ruleId === 'SG-SPEC-007');
  assert.ok(diags.length >= 2, `Expected at least 2 SG-SPEC-007 diagnostics, got ${diags.length}`);
  assert.equal(diags[0].severity, 'INFO');
});

test('SG-SPEC-007 does not flag specific criteria', () => {
  const spec = validSpec.replace(
    '- [x] Criteria.',
    '- [ ] Returns HTTP 200 with the created resource\n- [ ] Shows error message when email is missing'
  );
  const diags = checkSpecText(spec, 'test.md').filter(d => d.ruleId === 'SG-SPEC-007');
  assert.equal(diags.length, 0);
});

// ─── SG-SPEC-008: brief scope items ─────────────────────────────────────────

test('SG-SPEC-008 flags single-word scope items (INFO)', () => {
  const spec = validSpec
    .replace('- A\n', '- API\n')
    .replace('- B\n', '- Frontend\n');
  const diags = checkSpecText(spec, 'test.md').filter(d => d.ruleId === 'SG-SPEC-008');
  assert.ok(diags.length >= 2, `Expected at least 2 SG-SPEC-008 diagnostics, got ${diags.length}`);
  assert.equal(diags[0].severity, 'INFO');
});

test('SG-SPEC-008 does not flag descriptive scope items', () => {
  const spec = validSpec
    .replace('- A\n', '- User authentication via email and password\n')
    .replace('- B\n', '- Password reset and email verification flows\n');
  const diags = checkSpecText(spec, 'test.md').filter(d => d.ruleId === 'SG-SPEC-008');
  assert.equal(diags.length, 0);
});

test('SG-SPEC-008 does not flag two-word items', () => {
  const spec = validSpec
    .replace('- A\n', '- Login form\n')
    .replace('- B\n', '- Password reset\n');
  // Two-word items (word count == 2) should warn
  const diags = checkSpecText(spec, 'test.md').filter(d => d.ruleId === 'SG-SPEC-008');
  assert.ok(diags.length >= 1);
});

// ─── formatDiagnostic ────────────────────────────────────────────────────────

test('formats diagnostics as plain text', () => {
  const text = formatDiagnostic({
    severity: 'BLOCKER',
    ruleId: 'SG-CLASS-001',
    path: 'specs/login.md',
    message: 'exactly one work classification must be selected',
  });

  assert.equal(text, '[BLOCKER] SG-CLASS-001 specs/login.md: exactly one work classification must be selected');
});

// ─── spec-status-deferred: SG-SPEC-006 / Deferred status ─────────────────────

// AC: spec-guard check accepts Deferred as a valid status value and does not
//     report SG-SPEC-006 when ## Status contains "Deferred".
test('checkSpecText does not flag Deferred as invalid status (no SG-SPEC-006)', () => {
  const spec = validSpec + '\n## Status\n\nDeferred\n';
  const diags = checkSpecText(spec, 'test.md').filter(d => d.ruleId === 'SG-SPEC-006');
  assert.equal(diags.length, 0, 'Deferred should not produce SG-SPEC-006');
});

// AC: existing valid statuses remain valid.
test('checkSpecText does not flag Draft, Blocked, Implemented as invalid', () => {
  for (const status of ['Draft', 'Blocked', 'Implemented']) {
    const spec = validSpec + `\n## Status\n\n${status}\n`;
    const diags = checkSpecText(spec, 'test.md').filter(d => d.ruleId === 'SG-SPEC-006');
    assert.equal(diags.length, 0, `${status} should be a valid status`);
  }
});

// AC: spec-guard check accepts Pending Approval as a valid status value.
test('checkSpecText does not flag Pending Approval as invalid (no SG-SPEC-006)', () => {
  const spec = validSpec + '\n## Status\n\nPending Approval\n';
  const diags = checkSpecText(spec, 'test.md').filter(d => d.ruleId === 'SG-SPEC-006');
  assert.equal(diags.length, 0, 'Pending Approval should be a valid status');
});

// AC: spec-guard check accepts Ready for Implementation as a valid status value.
test('checkSpecText does not flag Ready for Implementation as invalid (no SG-SPEC-006)', () => {
  const spec = validSpec + '\n## Status\n\nReady for Implementation\n';
  const diags = checkSpecText(spec, 'test.md').filter(d => d.ruleId === 'SG-SPEC-006');
  assert.equal(diags.length, 0, 'Ready for Implementation should be a valid status');
});

// AC: spec-guard check accepts Implementation Active as a valid status value.
test('checkSpecText does not flag Implementation Active as invalid (no SG-SPEC-006)', () => {
  const spec = validSpec + '\n## Status\n\nImplementation Active\n';
  const diags = checkSpecText(spec, 'test.md').filter(d => d.ruleId === 'SG-SPEC-006');
  assert.equal(diags.length, 0, 'Implementation Active should be a valid status');
});

// AC: spec-guard check flags Implementation Approved as an unrecognized status (replaced by Implementation Active).
test('checkSpecText flags Implementation Approved as invalid status (SG-SPEC-006)', () => {
  const spec = validSpec + '\n## Status\n\nImplementation Approved\n';
  const diags = checkSpecText(spec, 'test.md').filter(d => d.ruleId === 'SG-SPEC-006');
  assert.equal(diags.length, 1, 'Implementation Approved should produce SG-SPEC-006 after replacement');
  assert.equal(diags[0].severity, 'INFO');
});

// AC: spec-guard check flags Ready as an unrecognized status (no longer valid after rename).
test('checkSpecText flags Ready as invalid status (SG-SPEC-006)', () => {
  const spec = validSpec + '\n## Status\n\nReady\n';
  const diags = checkSpecText(spec, 'test.md').filter(d => d.ruleId === 'SG-SPEC-006');
  assert.equal(diags.length, 1, 'Ready should produce SG-SPEC-006 after rename');
  assert.equal(diags[0].severity, 'INFO');
});

// AC: unrecognized status still produces SG-SPEC-006.
test('checkSpecText flags unknown status with SG-SPEC-006', () => {
  const spec = validSpec + '\n## Status\n\nPending\n';
  const diags = checkSpecText(spec, 'test.md').filter(d => d.ruleId === 'SG-SPEC-006');
  assert.equal(diags.length, 1, 'Unknown status should produce SG-SPEC-006');
  assert.equal(diags[0].severity, 'INFO');
});

// ─── spec-status-deferred: documentation ACs ─────────────────────────────────

// AC: templates/spec.md documents Deferred as a valid status value.
test('templates/spec.md status comment includes Deferred', () => {
  const template = readFileSync('templates/spec.md', 'utf8');
  assert.match(template, /Deferred/, 'spec template should document Deferred as a valid status');
});

// AC: AGENTS.md documents Deferred status and when to apply it.
test('AGENTS.md documents Deferred status with definition and when to use it', () => {
  const agents = readFileSync('AGENTS.md', 'utf8');
  assert.match(agents, /Deferred/,
    'AGENTS.md should document the Deferred status');
  assert.match(agents, /indefinitely|on hold|parked|no current intention/i,
    'AGENTS.md should describe when to use Deferred');
  assert.match(agents, /Draft.*reactivate|back to.*Draft|status back/i,
    'AGENTS.md should explain that changing status back to Draft reactivates the spec');
});
