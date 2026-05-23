import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const agents = readFileSync('AGENTS.md', 'utf8');
const workflow = readFileSync('WORKFLOW.md', 'utf8');

function assertMockupAcGuidance(content, fileName) {
  assert.match(
    content,
    /derive suggested acceptance criteria from the mockup/i,
    `${fileName} should instruct agents to derive suggested ACs from the mockup`,
  );
  assert.match(
    content,
    /each distinct element, interaction, or visible state/i,
    `${fileName} should require coverage for distinct mockup elements, interactions, and visible states`,
  );
  assert.match(
    content,
    /accept, modify, or replace/i,
    `${fileName} should state that mockup-derived ACs are suggestions the human may accept, modify, or replace`,
  );
}

test('AGENTS.md interview guidance derives suggested ACs from provided UI mockups', () => {
  assertMockupAcGuidance(agents, 'AGENTS.md');
});

test('WORKFLOW.md spec authoring guidance derives suggested ACs from provided UI mockups', () => {
  assertMockupAcGuidance(workflow, 'WORKFLOW.md');
});
