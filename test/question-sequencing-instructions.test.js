import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const agents = readFileSync('AGENTS.md', 'utf8');
const workflow = readFileSync('WORKFLOW.md', 'utf8');
const combined = `${agents}\n${workflow}`;

test('Spec Guard question flows list multiple known questions before stepping through them', () => {
  assert.match(combined, /multiple known questions/i);
  assert.match(combined, /list .*questions up front/i);
  assert.match(combined, /walked through .*one at a time/i);
});

test('Spec Guard question flows ask only the first question after listing multiple questions', () => {
  assert.match(combined, /ask only the first question/i);
  assert.match(combined, /wait for the user's answer before asking the next/i);
});

test('single-question Spec Guard prompts may be asked directly', () => {
  assert.match(combined, /only one question/i);
  assert.match(combined, /ask it directly/i);
});

test('Spec Guard question flows include suggested answers when available without requiring them', () => {
  assert.match(combined, /suggested answers/i);
  assert.match(combined, /provide (?:their|a) (?:own|custom) answer/i);
});

test('question sequencing guidance is scoped to Spec Guard workflows only', () => {
  assert.match(combined, /Spec Guard workflow question flows/i);
  assert.match(combined, /does not govern unrelated agent questions outside a Spec Guard flow/i);
});
