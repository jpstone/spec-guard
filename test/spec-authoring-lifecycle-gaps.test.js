/**
 * Tests for spec-authoring-lifecycle-gaps bugfix:
 * - SG-STATUS-001: Draft status blocks Gate 2 (spec-guard check --warnings)
 * - spec-guard set-status: atomic status update + artifact index regeneration
 * - spec_guard_set_status: MCP tool equivalent
 * - AGENTS.md: set-status guidance for status transitions
 * - buildSpecFromAnswers: Operational/document deliverable uses placeholder in Documentation Requirements
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSpecText } from '../src/check.js';
import { buildSpecFromAnswers } from '../src/discover.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const cli = join(root, 'bin', 'spec-guard.js');

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
  });
}

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'sg-lifecycle-'));
  runCli(['init'], { cwd: dir });
  return dir;
}

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

const draftSpec = `# Spec

## Title

My Feature

## Status

Draft

## Problem / Goal

A concrete problem statement.

## In Scope

- Specific item A

## Out of Scope

- Specific item B

## Expected Behavior

Observable behavior described here.

## Acceptance Criteria

- [ ] Criterion one is met

## Work Classification

- [x] Direct behavior with no new API or UI
`;

const pendingApprovalSpec = draftSpec.replace('## Status\n\nDraft', '## Status\n\nPending Approval');
const readySpec = draftSpec.replace('## Status\n\nDraft', '## Status\n\nReady for Implementation');

// ─── SG-STATUS-001: Draft status triggers WARNING ──────────────────────────────

test('SG-STATUS-001 WARNING fires when spec status is Draft', () => {
  const diagnostics = checkSpecText(draftSpec, 'test.md');
  const rule = diagnostics.find(d => d.ruleId === 'SG-STATUS-001');
  assert.ok(rule, 'SG-STATUS-001 should be present for Draft status');
  assert.equal(rule.severity, 'WARNING');
});

test('SG-STATUS-001 does not fire when status is Pending Approval', () => {
  const diagnostics = checkSpecText(pendingApprovalSpec, 'test.md');
  const rule = diagnostics.find(d => d.ruleId === 'SG-STATUS-001');
  assert.equal(rule, undefined, 'SG-STATUS-001 should not fire for Pending Approval');
});

test('SG-STATUS-001 does not fire when status is Ready for Implementation', () => {
  const diagnostics = checkSpecText(readySpec, 'test.md');
  const rule = diagnostics.find(d => d.ruleId === 'SG-STATUS-001');
  assert.equal(rule, undefined, 'SG-STATUS-001 should not fire for Ready for Implementation');
});

test('Draft status does not produce a BLOCKER — Gate 1 still passes', () => {
  const diagnostics = checkSpecText(draftSpec, 'test.md');
  const blockers = diagnostics.filter(d => d.severity === 'BLOCKER');
  assert.equal(blockers.length, 0, 'Draft status should not produce a BLOCKER');
});

// ─── Gate 1 / Gate 2 CLI behavior ─────────────────────────────────────────────

test('spec-guard check (Gate 1) exits 0 for a Draft spec — no regression', () => {
  const dir = tempDir();
  const specPath = join(dir, '.spec-guard', 'specs', 'my-spec.md');
  writeFileSync(specPath, draftSpec);
  const result = runCli(['check', specPath]);
  assert.equal(result.status, 0, 'Gate 1 should pass for a valid Draft spec');
});

test('spec-guard check --warnings (Gate 2) exits non-zero for a Draft spec', () => {
  const dir = tempDir();
  const specPath = join(dir, '.spec-guard', 'specs', 'my-spec.md');
  writeFileSync(specPath, draftSpec);
  const result = runCli(['check', specPath, '--warnings']);
  assert.notEqual(result.status, 0, 'Gate 2 should fail when status is Draft');
  assert.match(result.stdout, /SG-STATUS-001/);
});

test('spec-guard check --warnings exits 0 when status is Pending Approval', () => {
  const dir = tempDir();
  const specPath = join(dir, '.spec-guard', 'specs', 'my-spec.md');
  writeFileSync(specPath, pendingApprovalSpec);
  const result = runCli(['check', specPath, '--warnings']);
  assert.equal(result.status, 0, 'Gate 2 should pass for Pending Approval status');
});

// ─── spec-guard set-status ─────────────────────────────────────────────────────

test('spec-guard set-status updates the spec Status field', () => {
  const dir = tempDir();
  const specPath = join(dir, '.spec-guard', 'specs', 'my-spec.md');
  writeFileSync(specPath, draftSpec);
  const result = runCli(['set-status', 'my-spec', 'Pending Approval'], { cwd: dir });
  assert.equal(result.status, 0, `Expected exit 0, got: ${result.stderr}`);
  const updated = readFileSync(specPath, 'utf8');
  assert.match(updated, /## Status\s+Pending Approval/);
});

test('spec-guard set-status regenerates the artifact index', () => {
  const dir = tempDir();
  const specPath = join(dir, '.spec-guard', 'specs', 'my-spec.md');
  writeFileSync(specPath, draftSpec);
  runCli(['set-status', 'my-spec', 'Pending Approval'], { cwd: dir });
  const readme = readFileSync(join(dir, '.spec-guard', 'README.md'), 'utf8');
  assert.match(readme, /Pending Approval/, 'artifact index should reflect updated status');
});

test('spec-guard set-status rejects invalid status values', () => {
  const dir = tempDir();
  const specPath = join(dir, '.spec-guard', 'specs', 'my-spec.md');
  writeFileSync(specPath, draftSpec);
  const result = runCli(['set-status', 'my-spec', 'Not A Status'], { cwd: dir });
  assert.notEqual(result.status, 0, 'Should exit non-zero for invalid status');
  assert.match(result.stderr, /invalid|not a valid|unknown/i);
});

test('spec-guard set-status exits 2 with usage error when spec arg is missing', () => {
  const result = runCli(['set-status']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage/i);
});

// ─── spec_guard_set_status MCP tool ───────────────────────────────────────────

test('spec_guard_set_status MCP tool updates spec status and returns updated status', () => {
  const dir = tempDir();
  const specPath = join(dir, '.spec-guard', 'specs', 'my-spec.md');
  writeFileSync(specPath, draftSpec);
  const response = mcpTool('spec_guard_set_status', { spec_path: specPath, status: 'Pending Approval' });
  assert.ok(response, 'MCP response should not be null');
  const content = JSON.parse(response.result.content[0].text);
  assert.ok(content.status === 'Pending Approval' || content.updated_status === 'Pending Approval', 'Response should include new status');
  const updated = readFileSync(specPath, 'utf8');
  assert.match(updated, /Pending Approval/);
});

test('spec_guard_set_status MCP tool returns error for invalid status', () => {
  const dir = tempDir();
  const specPath = join(dir, '.spec-guard', 'specs', 'my-spec.md');
  writeFileSync(specPath, draftSpec);
  const response = mcpTool('spec_guard_set_status', { spec_path: specPath, status: 'Not Valid' });
  const content = JSON.parse(response.result.content[0].text);
  assert.ok(content.error, 'Should return error for invalid status');
});

// ─── AGENTS.md: set-status guidance ───────────────────────────────────────────

test('AGENTS.md instructs agent to use set-status command for status changes', () => {
  const content = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  assert.match(content, /set-status/, 'AGENTS.md should reference spec-guard set-status');
});

test('AGENTS.md instructs agent to set Pending Approval when presenting a spec', () => {
  const content = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  assert.match(content, /Pending Approval/, 'AGENTS.md should mention Pending Approval status');
  assert.match(content, /present(ing)?.*spec|spec.*present(ing)?/i, 'AGENTS.md should link Pending Approval to presenting');
});

test('AGENTS.md instructs agent to set Ready for Implementation after approval', () => {
  const content = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  assert.match(content, /Ready for Implementation/, 'AGENTS.md should mention Ready for Implementation');
  assert.match(content, /approv/i, 'AGENTS.md should link Ready for Implementation to approval');
});

// ─── Operational/document deliverable Documentation Requirements ───────────────

test('buildSpecFromAnswers with Operational/document deliverable does not generate "No documentation changes required"', () => {
  const spec = buildSpecFromAnswers({
    problem: 'A problem',
    inScope: ['Item A'],
    outOfScope: ['Item B'],
    expectedBehavior: 'Some behavior',
    acceptanceCriteria: ['Criterion one'],
    classification: 'Operational/document deliverable',
  });
  assert.ok(
    !spec.includes('No documentation changes required'),
    'Operational/document deliverable should not default to "No documentation changes required"'
  );
});

test('buildSpecFromAnswers with Operational/document deliverable includes a placeholder in Documentation Requirements', () => {
  const spec = buildSpecFromAnswers({
    problem: 'A problem',
    inScope: ['Item A'],
    outOfScope: ['Item B'],
    expectedBehavior: 'Some behavior',
    acceptanceCriteria: ['Criterion one'],
    classification: 'Operational/document deliverable',
  });
  const docReqMatch = /## Documentation Requirements\s+([\s\S]+?)\s*##/.exec(spec);
  assert.ok(docReqMatch, 'Documentation Requirements section should exist');
  const section = docReqMatch[1].trim();
  assert.ok(section.length > 0, 'Documentation Requirements section should not be empty');
});

test('buildSpecFromAnswers with non-operational classification keeps "No documentation changes required" default', () => {
  const spec = buildSpecFromAnswers({
    problem: 'A problem',
    inScope: ['Item A'],
    outOfScope: ['Item B'],
    expectedBehavior: 'Some behavior',
    acceptanceCriteria: ['Criterion one'],
    classification: 'Direct behavior with no new API or UI',
  });
  assert.match(spec, /No documentation changes required/);
});
