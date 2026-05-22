/**
 * MCP server tool handler tests.
 * Tests the tool logic directly without the stdio transport.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Helper: run MCP server with a single JSON-RPC message via stdin
function mcpCall(method, params) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) + '\n';
  const result = spawnSync(process.execPath, [join(root, 'mcp', 'server.js')], {
    input: msg + '\n',
    encoding: 'utf8',
    timeout: 5000,
  });
  const lines = result.stdout.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return null;
  return JSON.parse(lines[0]);
}

function mcpTool(name, args) {
  return mcpCall('tools/call', { name, arguments: args });
}

function tempSpec(content) {
  const dir = mkdtempSync(join(tmpdir(), 'sg-mcp-'));
  const path = join(dir, 'spec.md');
  writeFileSync(path, content);
  return { dir, path };
}

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

// ─── initialize ───────────────────────────────────────────────────────────────

test('MCP: initialize returns server info', () => {
  const response = mcpCall('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
  assert.equal(response.result.serverInfo.name, 'spec-guard');
  assert.equal(response.result.protocolVersion, '2024-11-05');
});

// ─── tools/list ──────────────────────────────────────────────────────────────

test('MCP: tools/list returns all tools', () => {
  const response = mcpCall('tools/list', {});
  const names = response.result.tools.map(t => t.name);
  assert(names.includes('spec_guard_check'));
  assert(names.includes('spec_guard_gate_status'));
  assert(names.includes('spec_guard_classify'));
  assert(names.includes('spec_guard_workflow_next_step'));
  assert(names.includes('spec_guard_create_artifact'));
  assert(names.length >= 9);
});

// ─── spec_guard_check ─────────────────────────────────────────────────────────

test('MCP: spec_guard_check passes for valid spec', () => {
  const { path } = tempSpec(validSpec);
  const response = mcpTool('spec_guard_check', { spec_path: path });
  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.gate1_passed, true);
  assert.equal(result.blocker_count, 0);
});

test('MCP: spec_guard_check fails for invalid spec', () => {
  const { path } = tempSpec('# Just a title\n\n## Problem / Goal\n\nGoal.\n');
  const response = mcpTool('spec_guard_check', { spec_path: path });
  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.gate1_passed, false);
  assert(result.blocker_count > 0);
});

test('MCP: spec_guard_check returns error for missing file', () => {
  const response = mcpTool('spec_guard_check', { spec_path: '/nonexistent/spec.md' });
  const result = JSON.parse(response.result.content[0].text);
  assert(result.error);
  assert.equal(result.valid, false);
});

// ─── spec_guard_classify ──────────────────────────────────────────────────────

test('MCP: spec_guard_classify returns classification', () => {
  const { path } = tempSpec(validSpec);
  const response = mcpTool('spec_guard_classify', { spec_path: path });
  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.valid, true);
  assert.equal(result.classification, 'Direct behavior with no new API or UI');
  assert(result.test_guidance);
});

// ─── spec_guard_test_guidance ─────────────────────────────────────────────────

test('MCP: spec_guard_test_guidance returns guidance for each classification', () => {
  const classifications = [
    'Reusable non-UI API',
    'REST/service API',
    'One-off application UI',
    'Direct behavior with no new API or UI',
    'Bugfix',
  ];
  for (const c of classifications) {
    const response = mcpTool('spec_guard_test_guidance', { classification: c });
    const result = JSON.parse(response.result.content[0].text);
    assert.equal(result.classification, c);
    assert(result.test_guidance.length > 10);
  }
});

test('MCP: spec_guard_test_guidance flags contract requirement for API', () => {
  const response = mcpTool('spec_guard_test_guidance', { classification: 'Reusable non-UI API' });
  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.contract_required, true);
  assert(result.gate2_checklist.length > 0);
});

test('MCP: spec_guard_test_guidance flags UI inputs for UI work', () => {
  const response = mcpTool('spec_guard_test_guidance', { classification: 'One-off application UI' });
  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.ui_inputs_required, true);
  assert(result.gate2_checklist.some(item => /mockup|wireframe/i.test(item)));
});

// ─── spec_guard_workflow_next_step ────────────────────────────────────────────

test('MCP: workflow_next_step says fix spec when gate1 not passed', () => {
  const { path } = tempSpec('# Spec\n\n## Problem / Goal\n\nGoal.\n');
  const response = mcpTool('spec_guard_workflow_next_step', {
    spec_path: path,
    gates_passed: [],
  });
  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.next_action, 'fix_spec');
  assert.equal(result.gate_target, 'gate1');
  assert(result.blockers.length > 0);
});

test('MCP: workflow_next_step says confirm planning when gates 1 and 2 passed', () => {
  const { path } = tempSpec(validSpec);
  const response = mcpTool('spec_guard_workflow_next_step', {
    spec_path: path,
    gates_passed: ['gate1', 'gate2'],
  });
  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.next_action, 'confirm_gate3');
  assert.equal(result.gate_target, 'gate3');
});

test('MCP: workflow_next_step says write tests when gate3 passed', () => {
  const { path } = tempSpec(validSpec);
  const response = mcpTool('spec_guard_workflow_next_step', {
    spec_path: path,
    gates_passed: ['gate1', 'gate2', 'gate3'],
  });
  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.next_action, 'write_failing_tests');
  assert.equal(result.gate_target, 'gate4');
});

test('MCP: workflow_next_step says complete when all gates passed', () => {
  const { path } = tempSpec(validSpec);
  const response = mcpTool('spec_guard_workflow_next_step', {
    spec_path: path,
    gates_passed: ['gate1', 'gate2', 'gate3', 'gate4', 'gate5', 'gate6'],
  });
  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.next_action, 'complete');
  assert.equal(result.complete, true);
});

// ─── spec_guard_create_artifact ───────────────────────────────────────────────

test('MCP: spec_guard_create_artifact creates a spec', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sg-artifact-'));
  const outputPath = join(dir, 'new-spec.md');
  const response = mcpTool('spec_guard_create_artifact', { kind: 'spec', output_path: outputPath });
  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.success, true);
  assert.equal(result.kind, 'spec');
});

test('MCP: spec_guard_create_artifact refuses to overwrite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sg-artifact-'));
  const outputPath = join(dir, 'existing.md');
  writeFileSync(outputPath, 'existing content');
  const response = mcpTool('spec_guard_create_artifact', { kind: 'spec', output_path: outputPath });
  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.success, false);
  assert(result.error.includes('already exists'));
});

test('MCP: spec_guard_create_artifact creates a blocker', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sg-artifact-'));
  const outputPath = join(dir, 'blocker.md');
  const response = mcpTool('spec_guard_create_artifact', { kind: 'blocker', output_path: outputPath });
  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.success, true);
});

test('MCP: spec_guard_create_artifact records a direct link in the originating spec', () => {
  const { dir, path: specPath } = tempSpec(`${validSpec}\n## Documentation Requirements\n\n- None.\n`);
  const outputPath = join(dir, '.spec-guard', 'reviews', 'review.md');
  const response = mcpTool('spec_guard_create_artifact', {
    kind: 'review',
    output_path: outputPath,
    spec_path: specPath,
  });
  const result = JSON.parse(response.result.content[0].text);

  assert.equal(result.success, true);
  const spec = readFileSync(specPath, 'utf8');
  assert.match(spec, /## Related Artifacts/);
  assert.match(spec, /\.spec-guard\/reviews\/review\.md/);
  assert.match(spec, /## Documentation Requirements\s+- None\./);
});

// ─── spec_guard_gate_status ──────────────────────────────────────────────────

test('MCP: spec_guard_gate_status returns all 6 gates', () => {
  const { path } = tempSpec(validSpec);
  const response = mcpTool('spec_guard_gate_status', { spec_path: path });
  const result = JSON.parse(response.result.content[0].text);
  assert(result.gate1);
  assert(result.gate2);
  assert(result.gate3);
  assert(result.gate4);
  assert(result.gate5);
  assert(result.gate6);
  assert.equal(result.gate1.passed, true);
  assert.equal(result.ready_to_implement, false);
});

// ─── spec_guard_draft_spec ────────────────────────────────────────────────────

const draftArgs = {
  title: 'User login',
  problem: 'Users cannot authenticate without a login page.',
  in_scope: ['Login form with email and password', 'Session creation on success'],
  out_of_scope: ['Password reset', 'OAuth'],
  expected_behavior: 'User submits credentials and is redirected to dashboard on success.',
  acceptance_criteria: ['Login form renders correctly', 'Invalid credentials show an error'],
  classification: 'One-off application UI',
};

test('MCP: spec_guard_draft_spec — full input passes Gate 1', () => {
  const response = mcpTool('spec_guard_draft_spec', {
    ...draftArgs,
    // Add UI requirements so SG-UI-001 doesn't block
    expected_behavior: 'User submits credentials. See Figma mockup. Uses the design system component library.',
  });
  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.gate1_passed, true, `Unexpected blockers: ${result.missing_required?.join(', ')}`);
  assert.equal(result.blocker_count, 0);
  assert(result.spec_text.includes('## Problem / Goal'));
});

test('MCP: spec_guard_draft_spec — returns spec_text', () => {
  const response = mcpTool('spec_guard_draft_spec', draftArgs);
  const result = JSON.parse(response.result.content[0].text);
  assert(typeof result.spec_text === 'string');
  assert(result.spec_text.includes('User login'));
  assert(result.spec_text.includes('One-off application UI'));
});

test('MCP: spec_guard_draft_spec — missing required fields produce blockers', () => {
  const response = mcpTool('spec_guard_draft_spec', { title: 'Incomplete' });
  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.gate1_passed, false);
  assert(result.blocker_count > 0);
  assert(result.missing_required.length > 0);
});

test('MCP: spec_guard_draft_spec — returns test_guidance when classification provided', () => {
  const response = mcpTool('spec_guard_draft_spec', {
    classification: 'Direct behavior with no new API or UI',
  });
  const result = JSON.parse(response.result.content[0].text);
  assert(result.test_guidance);
  assert(result.test_guidance.length > 10);
});

test('MCP: spec_guard_draft_spec — writes file when output_path given', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sg-draft-'));
  const outputPath = join(dir, 'draft.md');
  const response = mcpTool('spec_guard_draft_spec', {
    ...draftArgs,
    expected_behavior: 'User submits credentials. See Figma mockup. Uses the design system component library.',
    output_path: outputPath,
  });
  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.written_to, outputPath);
  assert(!result.write_error);
});

test('MCP: spec_guard_draft_spec — refuses to overwrite existing file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sg-draft-'));
  const outputPath = join(dir, 'existing.md');
  writeFileSync(outputPath, 'existing');
  const response = mcpTool('spec_guard_draft_spec', {
    ...draftArgs,
    output_path: outputPath,
  });
  const result = JSON.parse(response.result.content[0].text);
  assert(result.write_error);
  assert(result.write_error.includes('already exists'));
});

test('MCP: tools/list includes spec_guard_draft_spec', () => {
  const response = mcpCall('tools/list', {});
  const names = response.result.tools.map(t => t.name);
  assert(names.includes('spec_guard_draft_spec'));
  assert(names.length >= 10);
});

// ─── spec_guard_suggest ───────────────────────────────────────────────────────

test('MCP: spec_guard_suggest — returns annotated diagnostics for invalid spec', () => {
  const { path } = tempSpec('# Spec\n\n## Problem / Goal\n\nGoal.\n');
  const response = mcpTool('spec_guard_suggest', { spec_path: path });
  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.gate1_passed, false);
  assert(result.issue_count > 0);
  assert(result.diagnostics.length > 0);
  // Every diagnostic must have a suggestion field
  for (const d of result.diagnostics) {
    assert('suggestion' in d, `Missing suggestion on diagnostic: ${d.ruleId}`);
    assert(d.suggestion.length > 10);
  }
});

test('MCP: spec_guard_suggest — clean spec returns no issues', () => {
  const { path } = tempSpec(validSpec);
  const response = mcpTool('spec_guard_suggest', { spec_path: path });
  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.gate1_passed, true);
  assert.equal(result.issue_count, 0);
});

test('MCP: spec_guard_suggest — returns error for missing file', () => {
  const response = mcpTool('spec_guard_suggest', { spec_path: '/no/such/file.md' });
  const result = JSON.parse(response.result.content[0].text);
  assert(result.error);
});

// ─── spec_guard_analyze ───────────────────────────────────────────────────────

test('MCP: spec_guard_analyze — clean when no contract or review given', () => {
  const { path } = tempSpec(validSpec);
  const response = mcpTool('spec_guard_analyze', { spec_path: path });
  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.error, undefined);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.clean, true);
});

test('MCP: spec_guard_analyze — BLOCKER when contract path does not exist', () => {
  const { path } = tempSpec(validSpec);
  const response = mcpTool('spec_guard_analyze', {
    spec_path: path,
    contract_path: '/nonexistent/contract.md',
  });
  const result = JSON.parse(response.result.content[0].text);
  const blockers = result.diagnostics.filter(d => d.severity === 'BLOCKER');
  assert(blockers.length > 0);
  assert.equal(blockers[0].ruleId, 'SG-ALIGN-003');
});

test('MCP: spec_guard_analyze — returns error when spec not found', () => {
  const response = mcpTool('spec_guard_analyze', { spec_path: '/no/spec.md' });
  const result = JSON.parse(response.result.content[0].text);
  assert(result.error);
});

// ─── spec_guard_interview_questions ───────────────────────────────────────────

test('MCP: spec_guard_interview_questions — returns pre_classification questions', () => {
  const response = mcpTool('spec_guard_interview_questions', {});
  const result = JSON.parse(response.result.content[0].text);
  assert(Array.isArray(result.pre_classification));
  assert(result.pre_classification.length >= 5);
  // All required questions must have required: true
  const required = result.pre_classification.filter(q => q.required);
  assert(required.length >= 4);
  // Every question must have field and question fields
  for (const q of result.pre_classification) {
    assert(q.field, `Missing field: ${JSON.stringify(q)}`);
    assert(q.question, `Missing question: ${JSON.stringify(q)}`);
  }
});

test('MCP: spec_guard_interview_questions — returns protocol steps', () => {
  const response = mcpTool('spec_guard_interview_questions', {});
  const result = JSON.parse(response.result.content[0].text);
  assert(typeof result.protocol === 'string');
  assert(result.protocol.includes('spec_guard_draft_spec'));
  assert.equal(result.next_tool, 'spec_guard_draft_spec');
});

test('MCP: spec_guard_interview_questions — classification-specific question for One-off application UI includes mockup', () => {
  const response = mcpTool('spec_guard_interview_questions', { classification: 'One-off application UI' });
  const result = JSON.parse(response.result.content[0].text);
  assert(Array.isArray(result.classification_specific));
  assert(result.classification_specific.length > 0);
  const mockupQuestion = result.classification_specific.find(q => q.field === 'expected_behavior');
  assert(mockupQuestion, 'Expected mockup/design direction question for One-off application UI');
});

test('MCP: spec_guard_interview_questions — REST/service API has no classification-specific questions', () => {
  const response = mcpTool('spec_guard_interview_questions', { classification: 'REST/service API' });
  const result = JSON.parse(response.result.content[0].text);
  assert(Array.isArray(result.classification_specific));
  assert.equal(result.classification_specific.length, 0);
});

test('MCP: spec_guard_interview_questions — all 13 tools in tools/list', () => {
  const response = mcpCall('tools/list', {});
  const names = response.result.tools.map(t => t.name);
  assert(names.includes('spec_guard_interview_questions'));
  assert(names.includes('spec_guard_suggest'));
  assert(names.includes('spec_guard_analyze'));
  assert(names.length >= 13);
});
