/**
 * Tests for the implementation-authorization-gap spec.
 * Validates that AGENTS.md has the required explicit-authorization guidance.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

const agentsContent = () => readFileSync(join(root, 'AGENTS.md'), 'utf8');

// AC: AGENTS.md defines explicit authorization with at least two concrete examples of responses that qualify
test('AGENTS.md defines explicit authorization with at least two qualifying example responses', () => {
  const content = agentsContent();
  // Must explicitly discuss what constitutes "explicit authorization"
  assert.match(
    content,
    /explicit authorization/i,
    'AGENTS.md must contain the phrase "explicit authorization"'
  );
  // Must include at least two concrete examples of qualifying responses — look for quoted examples
  // e.g. "yes", "go ahead", "implement it", etc.
  const quotedExamples = content.match(/"[^"]{1,60}"/g) ?? [];
  // Filter to examples that look like authorization phrases (short affirmatives / directives)
  const qualifyingExamples = quotedExamples.filter(q => {
    const lower = q.toLowerCase();
    return (
      lower.includes('yes') ||
      lower.includes('go ahead') ||
      lower.includes('implement') ||
      lower.includes('proceed') ||
      lower.includes('start') ||
      lower.includes('approved') ||
      lower.includes('do it')
    );
  });
  assert.ok(
    qualifyingExamples.length >= 2,
    `AGENTS.md must provide at least 2 concrete quoted examples of qualifying authorization responses; found: ${JSON.stringify(qualifyingExamples)}`
  );
});

// AC: AGENTS.md defines at least one example of an ambiguous response that does not qualify
//     and describes the required follow-up behavior
test('AGENTS.md defines at least one non-qualifying ambiguous response and required follow-up behavior', () => {
  const content = agentsContent();
  // Must contain at least one example of an ambiguous/non-qualifying response
  const hasAmbiguousExample =
    content.includes('are both approved') ||
    content.includes('is that ready') ||
    /ambiguous/i.test(content);
  assert.ok(
    hasAmbiguousExample,
    'AGENTS.md must contain at least one example of an ambiguous (non-qualifying) response (e.g. "are both approved?" or use the word "ambiguous")'
  );
  // Must describe the required follow-up behavior
  const hasFollowUp =
    /follow.?up/i.test(content) ||
    /ask.*direct/i.test(content) ||
    /direct.*yes.or.no/i.test(content) ||
    /yes.or.no.*question/i.test(content);
  assert.ok(
    hasFollowUp,
    'AGENTS.md must describe the required follow-up behavior when a response is ambiguous (ask a direct yes/no question)'
  );
});

// AC: AGENTS.md states that a question or conditional response is never sufficient authorization
test('AGENTS.md states that a question or conditional response is never sufficient authorization', () => {
  const content = agentsContent();
  // Must explicitly state that questions/conditional responses are not authorization
  const hasNeverQualifies =
    /question.*never/i.test(content) ||
    /never.*sufficient/i.test(content) ||
    /not.*authorization/i.test(content) ||
    /does not constitute/i.test(content) ||
    /never constitutes/i.test(content) ||
    /is not.*authorization/i.test(content);
  assert.ok(
    hasNeverQualifies,
    'AGENTS.md must state that a question or conditional response never constitutes explicit authorization'
  );
});
