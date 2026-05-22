import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkSpecText } from '../src/check.js';
import { PHASES } from '../src/run.js';

const baseSpec = `# Spec

## Problem / Goal

Build a browser-based project management application.

## In Scope

- Project task list behavior

## Out of Scope

- Mobile native application delivery

## Expected Behavior

Users can manage project tasks in a browser.

## Acceptance Criteria

- [ ] Project tasks can be listed in a browser.

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [x] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
- [ ] Bugfix
`;

test('workflow includes implementation planning between classify/contract and test first', () => {
  const ids = PHASES.map(phase => phase.id);
  assert.deepEqual(ids, ['discover', 'contract', 'planning', 'test-first', 'implement', 'review']);
  const planning = PHASES.find(phase => phase.id === 'planning');
  assert.match(planning.label, /Implementation Planning/i);
  assert.match(planning.gate, /Planning Confirmed/i);
});

test('spec template can record required and confirmed implementation planning details', () => {
  const template = readFileSync('templates/spec.md', 'utf8');
  assert.match(template, /^## Implementation Planning$/m);
  assert.match(template, /Planning Required/i);
  assert.match(template, /Confirmed Plan/i);
  assert.match(template, /stack/i);
  assert.match(template, /layer/i);
});

test('planning-required spec without confirmed plan reports a planning diagnostic', () => {
  const text = `${baseSpec}\n## Implementation Planning\n\nPlanning Required: Yes\n\nConfirmed Plan:\n- \n`;
  const diagnostics = checkSpecText(text, 'planning-missing.md');
  const planningDiagnostic = diagnostics.find(d => d.ruleId === 'SG-PLAN-001');
  assert(planningDiagnostic);
  assert.equal(planningDiagnostic.severity, 'BLOCKER');
  assert.match(planningDiagnostic.message, /implementation planning/i);
});

test('planning-required spec with confirmed stack-layer details passes planning validation', () => {
  const text = `${baseSpec}\n## Implementation Planning\n\nPlanning Required: Yes\n\nConfirmed Plan:\n- Web frontend layer: React with Vite, accepted by the human.\n- Backend layer: Fastify, accepted by the human.\n`;
  const diagnostics = checkSpecText(text, 'planning-present.md');
  assert(!diagnostics.some(d => d.ruleId === 'SG-PLAN-001'));
});

test('UI mockup and component-library blockers remain separate from planning validation', () => {
  const uiSpec = baseSpec
    .replace('Build a browser-based project management application.', 'Build a login screen.')
    .replace('Users can manage project tasks in a browser.', 'User can log in.')
    .replace('- [x] Direct behavior with no new API or UI', '- [ ] Direct behavior with no new API or UI')
    .replace('- [ ] One-off application UI', '- [x] One-off application UI') +
    '\n## Implementation Planning\n\nPlanning Required: Yes\n\nConfirmed Plan:\n- Web frontend layer: React with Vite, accepted by the human.\n';

  const diagnostics = checkSpecText(uiSpec, 'ui-planning.md');
  assert(diagnostics.some(d => d.ruleId === 'SG-UI-001'));
  assert(!diagnostics.some(d => d.ruleId === 'SG-PLAN-001'));
});

test('agent instructions require suggesting a context-appropriate stack or layer with human override', () => {
  const agents = readFileSync('AGENTS.md', 'utf8');
  assert.match(agents, /implementation planning/i);
  assert.match(agents, /suggest/i);
  assert.match(agents, /context-appropriate/i);
  assert.match(agents, /stack\/layer|stack or layer/i);
  assert.match(agents, /accept|override|provide their own/i);
});
