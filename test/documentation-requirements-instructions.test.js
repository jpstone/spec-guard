import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const specTemplate = readFileSync('templates/spec.md', 'utf8');
const workflow = readFileSync('WORKFLOW.md', 'utf8');
const agents = readFileSync('AGENTS.md', 'utf8');

test('spec template includes Documentation Requirements section', () => {
  assert.match(specTemplate, /## Documentation Requirements/);
  assert.match(specTemplate, /direct repository-relative link/i);
});

test('workflow requires identifying documentation obligations for the current spec only', () => {
  assert.match(workflow, /documentation obligations/i);
  assert.match(workflow, /current spec/i);
  assert.match(workflow, /linked contract/i);
  assert.match(workflow, /prior implementation review/i);
  assert.match(workflow, /not audit unrelated/i);
});

test('agent instructions require direct links for docs created or updated by the current spec', () => {
  assert.match(agents, /Documentation Requirements/i);
  assert.match(agents, /created or updated/i);
  assert.match(agents, /direct repository-relative link/i);
});
