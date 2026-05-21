import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const agents = readFileSync('AGENTS.md', 'utf8');

test('AGENTS requires prompting for Spec Guard use at the start of new codebase changes', () => {
  assert.match(agents, /Do you want to use Spec Guard for this task\?/);
  assert.match(agents, /start of every new codebase change request/i);
});

test('AGENTS requires full Spec Guard workflow when the user answers yes', () => {
  assert.match(agents, /If the user answers yes/i);
  assert.match(agents, /full Spec Guard workflow/i);
});

test('AGENTS allows bypassing specs, gates, and artifacts when the user answers no', () => {
  assert.match(agents, /If the user answers no/i);
  assert.match(agents, /without drafting specs, running gates, or creating Spec Guard artifacts/i);
});

test('AGENTS forbids inferred bypass and scopes the answer to the current task', () => {
  assert.match(agents, /must not infer bypass/i);
  assert.match(agents, /task size, file type, perceived risk/i);
  assert.match(agents, /applies only to the current task/i);
});
