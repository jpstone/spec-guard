import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { regenerateArtifactIndex } from '../src/artifact-index.js';

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
  return mkdtempSync(join(tmpdir(), 'sg-artifact-index-'));
}

function sgDir(dir) {
  return join(dir, '.spec-guard');
}

function writeSpec(dir, name, { title, status } = {}) {
  const specDir = join(sgDir(dir), 'specs');
  mkdirSync(specDir, { recursive: true });
  const content = `# Spec\n\n## Title\n\n${title || name}\n\n## Status\n\n${status || 'Draft'}\n`;
  writeFileSync(join(specDir, `${name}.md`), content);
}

function writeArtifact(dir, subdir, name, title) {
  const d = join(sgDir(dir), subdir);
  mkdirSync(d, { recursive: true });
  const content = title ? `# Artifact\n\n## Title\n\n${title}\n` : `# Artifact\n`;
  writeFileSync(join(d, `${name}.md`), content);
}

// ─── AC1: spec-guard init creates .spec-guard/README.md ──────────────────────

test('spec-guard init creates .spec-guard/README.md', () => {
  const dir = tempDir();
  runCli(['init', '--no-readme'], { cwd: dir });
  assert.ok(existsSync(join(sgDir(dir), 'README.md')), '.spec-guard/README.md should exist after init');
});

test('spec-guard init README.md contains all 8 artifact type headings', () => {
  const dir = tempDir();
  runCli(['init', '--no-readme'], { cwd: dir });
  const content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  for (const heading of ['## Specs', '## Contracts', '## Reviews', '## Initiatives',
    '## Blockers', '## Deviations', '## Scope Discoveries', '## Discoveries']) {
    assert.ok(content.includes(heading), `missing heading: ${heading}`);
  }
});

test('spec-guard init README.md headings appear in the correct fixed order', () => {
  const dir = tempDir();
  runCli(['init', '--no-readme'], { cwd: dir });
  const content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  const order = ['## Specs', '## Contracts', '## Reviews', '## Initiatives',
    '## Blockers', '## Deviations', '## Scope Discoveries', '## Discoveries'];
  const positions = order.map(h => content.indexOf(h));
  for (let i = 1; i < positions.length; i++) {
    assert.ok(positions[i] > positions[i - 1],
      `${order[i]} should appear after ${order[i - 1]}`);
  }
});

// ─── AC1b: Specs heading has 7 H3 status sub-headers ─────────────────────────

test('spec-guard init README.md Specs heading has all 7 H3 status sub-headers', () => {
  const dir = tempDir();
  runCli(['init', '--no-readme'], { cwd: dir });
  const content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  for (const sub of ['### Draft', '### Pending Approval', '### Ready for Implementation', '### Implementation Active', '### Blocked', '### Implemented', '### Deferred']) {
    assert.ok(content.includes(sub), `missing sub-header: ${sub}`);
  }
  assert.ok(!content.includes('### Implementation Approved'), '### Implementation Approved should no longer appear');
});

test('Specs status sub-headers appear in order: Draft, Pending Approval, Ready for Implementation, Implementation Active, Blocked, Implemented, Deferred', () => {
  const dir = tempDir();
  runCli(['init', '--no-readme'], { cwd: dir });
  const content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  const order = ['### Draft', '### Pending Approval', '### Ready for Implementation', '### Implementation Active', '### Blocked', '### Implemented', '### Deferred'];
  const positions = order.map(h => content.indexOf(h));
  for (let i = 1; i < positions.length; i++) {
    assert.ok(positions[i] > positions[i - 1],
      `${order[i]} should appear after ${order[i - 1]}`);
  }
});

// ─── AC2: artifact write command regenerates the index ────────────────────────

test('spec-guard draft regenerates .spec-guard/README.md', () => {
  const dir = tempDir();
  runCli(['init', '--no-readme'], { cwd: dir });
  const before = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');

  // Write a spec via draft --from-json
  const jsonPath = join(dir, 'spec.json');
  writeFileSync(jsonPath, JSON.stringify({
    title: 'My New Feature',
    problem: 'Need feature.',
    in_scope: ['Feature A'],
    out_of_scope: ['Feature B'],
    expected_behavior: 'It works.',
    acceptance_criteria: ['Feature works'],
    classification: 'Direct behavior with no new API or UI',
  }));
  runCli(['draft', '--from-json', jsonPath, 'my-new-feature'], { cwd: dir });

  const after = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  assert.notEqual(before, after, 'README.md should be updated after draft');
  assert.ok(after.includes('My New Feature'), 'index should contain new spec title');
});

// ─── AC3: each artifact appears with relative link and title ─────────────────

test('regenerateArtifactIndex entries use paths relative to .spec-guard/', async () => {
  const dir = tempDir();
  writeSpec(dir, 'my-feature', { title: 'My Feature', status: 'Draft' });
  await regenerateArtifactIndex({ dir });
  const content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  assert.ok(content.includes('[My Feature](specs/my-feature.md)'),
    'link should be relative to .spec-guard/');
});

// ─── AC4: each spec appears under the correct status sub-header ──────────────

test('spec under Draft status appears under ### Draft sub-header', async () => {
  const dir = tempDir();
  writeSpec(dir, 'draft-spec', { title: 'Draft Feature', status: 'Draft' });
  await regenerateArtifactIndex({ dir });
  const content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  const draftIdx = content.indexOf('### Draft');
  const pendingApprovalIdx = content.indexOf('### Pending Approval');
  const linkIdx = content.indexOf('[Draft Feature]');
  assert.ok(linkIdx > draftIdx && linkIdx < pendingApprovalIdx,
    'Draft spec should appear between ### Draft and ### Pending Approval');
});

// AC: artifact index includes ### Pending Approval sub-header and routes specs correctly.
test('spec under Pending Approval status appears under ### Pending Approval sub-header', async () => {
  const dir = tempDir();
  writeSpec(dir, 'pending-spec', { title: 'Pending Feature', status: 'Pending Approval' });
  await regenerateArtifactIndex({ dir });
  const content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  const pendingApprovalIdx = content.indexOf('### Pending Approval');
  const readyForImplIdx = content.indexOf('### Ready for Implementation');
  const linkIdx = content.indexOf('[Pending Feature]');
  assert.ok(linkIdx > pendingApprovalIdx && linkIdx < readyForImplIdx,
    'Pending Approval spec should appear between ### Pending Approval and ### Ready for Implementation');
});

// AC: artifact index includes ### Ready for Implementation sub-header and routes specs correctly.
test('spec under Ready for Implementation status appears under ### Ready for Implementation sub-header', async () => {
  const dir = tempDir();
  writeSpec(dir, 'ready-spec', { title: 'Ready Feature', status: 'Ready for Implementation' });
  await regenerateArtifactIndex({ dir });
  const content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  const readyForImplIdx = content.indexOf('### Ready for Implementation');
  const implActiveIdx = content.indexOf('### Implementation Active');
  const linkIdx = content.indexOf('[Ready Feature]');
  assert.ok(linkIdx > readyForImplIdx && linkIdx < implActiveIdx,
    'Ready for Implementation spec should appear between ### Ready for Implementation and ### Implementation Active');
});

// AC: artifact index includes ### Implementation Active sub-header and routes specs correctly.
test('spec under Implementation Active status appears under ### Implementation Active sub-header', async () => {
  const dir = tempDir();
  writeSpec(dir, 'active-spec', { title: 'Active Feature', status: 'Implementation Active' });
  await regenerateArtifactIndex({ dir });
  const content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  const implActiveIdx = content.indexOf('### Implementation Active');
  const blockedIdx = content.indexOf('### Blocked');
  const linkIdx = content.indexOf('[Active Feature]');
  assert.ok(linkIdx > implActiveIdx && linkIdx < blockedIdx,
    'Implementation Active spec should appear between ### Implementation Active and ### Blocked');
});

test('spec under Implemented status appears under ### Implemented sub-header', async () => {
  const dir = tempDir();
  writeSpec(dir, 'done-spec', { title: 'Done Feature', status: 'Implemented' });
  await regenerateArtifactIndex({ dir });
  const content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  const implIdx = content.indexOf('### Implemented');
  const deferIdx = content.indexOf('### Deferred');
  const linkIdx = content.indexOf('[Done Feature]');
  assert.ok(linkIdx > implIdx && linkIdx < deferIdx,
    'Implemented spec should appear between ### Implemented and ### Deferred');
});

test('spec under Deferred status appears under ### Deferred sub-header', async () => {
  const dir = tempDir();
  writeSpec(dir, 'deferred-spec', { title: 'Parked Feature', status: 'Deferred' });
  await regenerateArtifactIndex({ dir });
  const content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  const deferIdx = content.indexOf('### Deferred');
  const contractIdx = content.indexOf('## Contracts');
  const linkIdx = content.indexOf('[Parked Feature]');
  assert.ok(linkIdx > deferIdx && linkIdx < contractIdx,
    'Deferred spec should appear between ### Deferred and ## Contracts');
});

test('spec with unrecognized status falls back to ### Draft sub-header', async () => {
  const dir = tempDir();
  writeSpec(dir, 'weird-spec', { title: 'Weird Status', status: 'UnknownStatus' });
  await regenerateArtifactIndex({ dir });
  const content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  const draftIdx = content.indexOf('### Draft');
  const pendingApprovalIdx = content.indexOf('### Pending Approval');
  const linkIdx = content.indexOf('[Weird Status]');
  assert.ok(linkIdx > draftIdx && linkIdx < pendingApprovalIdx,
    'Spec with unrecognized status should fall back to Draft sub-header');
});

// ─── AC5: entries sorted alphabetically by title, case-insensitively ─────────

test('entries within each sub-header are sorted alphabetically by title', async () => {
  const dir = tempDir();
  writeSpec(dir, 'z-spec', { title: 'Zebra Feature', status: 'Draft' });
  writeSpec(dir, 'a-spec', { title: 'Alpha Feature', status: 'Draft' });
  writeSpec(dir, 'm-spec', { title: 'Middle Feature', status: 'Draft' });
  await regenerateArtifactIndex({ dir });
  const content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  const alphaIdx = content.indexOf('[Alpha Feature]');
  const middleIdx = content.indexOf('[Middle Feature]');
  const zebraIdx = content.indexOf('[Zebra Feature]');
  assert.ok(alphaIdx < middleIdx && middleIdx < zebraIdx,
    'entries should be sorted alphabetically: Alpha < Middle < Zebra');
});

// ─── AC6: all 7 status sub-headers always present even when empty ─────────────

test('all 7 status sub-headers appear even when no specs exist', async () => {
  const dir = tempDir();
  await regenerateArtifactIndex({ dir });
  const content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  for (const sub of ['### Draft', '### Pending Approval', '### Ready for Implementation', '### Implementation Active', '### Blocked', '### Implemented', '### Deferred']) {
    assert.ok(content.includes(sub), `${sub} should be present even with no specs`);
  }
  assert.ok(!content.includes('### Implementation Approved'), '### Implementation Approved should no longer appear');
});

// ─── AC7: review entries display as "Implementation Review: <Title>" ──────────

test('review entry displays as "Implementation Review: <spec title>"', async () => {
  const dir = tempDir();
  // Create a spec with a title
  writeSpec(dir, 'my-feature', { title: 'My Feature', status: 'Implemented' });
  // Create a review that references it
  const reviewDir = join(sgDir(dir), 'reviews');
  mkdirSync(reviewDir, { recursive: true });
  writeFileSync(join(reviewDir, 'my-feature.md'), `# Review\n\n## Linked Spec\n\n[my feature spec](../specs/my-feature.md)\n`);
  await regenerateArtifactIndex({ dir });
  const content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  assert.ok(content.includes('Implementation Review: My Feature'),
    'review entry should display as "Implementation Review: <spec title>"');
});

// ─── AC8: review fallback when linked spec can't be resolved ─────────────────

test('review falls back to "Implementation Review: <filename-as-title>" when spec not found', async () => {
  const dir = tempDir();
  const reviewDir = join(sgDir(dir), 'reviews');
  mkdirSync(reviewDir, { recursive: true });
  writeFileSync(join(reviewDir, 'missing-spec.md'), `# Review\n\n## Linked Spec\n\n[missing spec](../specs/does-not-exist.md)\n`);
  await regenerateArtifactIndex({ dir });
  const content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  assert.ok(content.includes('Implementation Review:'),
    'review should still appear with fallback title');
});

// ─── AC9: artifact with no ## Title falls back to filename-as-title ──────────

test('artifact without ## Title section falls back to kebab-case-to-Title-Case filename', async () => {
  const dir = tempDir();
  writeArtifact(dir, 'blockers', 'my-blocker-issue', null);
  await regenerateArtifactIndex({ dir });
  const content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  assert.ok(content.includes('My Blocker Issue'),
    'should fall back to Title Case filename when no ## Title section');
});

// ─── AC10: regeneration reflects current disk state ──────────────────────────

test('regenerateArtifactIndex reflects files deleted since last generation', async () => {
  const dir = tempDir();
  writeSpec(dir, 'temp-spec', { title: 'Temp Spec', status: 'Draft' });
  await regenerateArtifactIndex({ dir });

  // Delete the spec and regenerate
  const { unlinkSync } = await import('node:fs');
  unlinkSync(join(sgDir(dir), 'specs', 'temp-spec.md'));
  await regenerateArtifactIndex({ dir });

  const content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  assert.ok(!content.includes('[Temp Spec]'),
    'deleted spec should not appear in regenerated index');
});

// ─── AC4 (extended): status change moves spec to correct sub-header ───────────

test('regenerateArtifactIndex moves spec entry when status changes', async () => {
  const dir = tempDir();
  writeSpec(dir, 'moving-spec', { title: 'Moving Feature', status: 'Draft' });
  await regenerateArtifactIndex({ dir });

  // Verify initially under Draft
  let content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  const draftIdx1 = content.indexOf('### Draft');
  const pendingApprovalIdx1 = content.indexOf('### Pending Approval');
  const link1 = content.indexOf('[Moving Feature]');
  assert.ok(link1 > draftIdx1 && link1 < pendingApprovalIdx1, 'should initially be under ### Draft');

  // Change status to Implemented
  const specPath = join(sgDir(dir), 'specs', 'moving-spec.md');
  const specContent = readFileSync(specPath, 'utf8');
  writeFileSync(specPath, specContent.replace('Draft', 'Implemented'));
  await regenerateArtifactIndex({ dir });

  // Verify now under Implemented
  content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  const implIdx = content.indexOf('### Implemented');
  const deferIdx = content.indexOf('### Deferred');
  const link2 = content.indexOf('[Moving Feature]');
  assert.ok(link2 > implIdx && link2 < deferIdx, 'should be under ### Implemented after status change');
  // And not under Draft anymore
  const draftIdx2 = content.indexOf('### Draft');
  const pendingApprovalIdx2 = content.indexOf('### Pending Approval');
  assert.ok(!(link2 > draftIdx2 && link2 < pendingApprovalIdx2), 'should no longer be under ### Draft');
});

// ─── AC2 (extended): initiative write command triggers regeneration ────────────

test('spec-guard initiative --from-json regenerates .spec-guard/README.md', () => {
  const dir = tempDir();
  mkdirSync(join(sgDir(dir), 'initiatives'), { recursive: true });

  const jsonPath = join(dir, 'init.json');
  writeFileSync(jsonPath, JSON.stringify({
    title: 'My App',
    description: 'A task management app',
    slices: [
      { name: 'user-auth', title: 'User Auth', description: 'Sign up and login', classification: 'REST/service API' },
    ],
  }));
  runCli(['initiative', '--from-json', jsonPath, 'my-app'], { cwd: dir });

  assert.ok(existsSync(join(sgDir(dir), 'README.md')),
    '.spec-guard/README.md should be created after initiative command');
  const content = readFileSync(join(sgDir(dir), 'README.md'), 'utf8');
  assert.ok(content.includes('## Initiatives'), 'index should contain Initiatives heading');
});

// ─── AC11: MCP spec_guard_draft_spec triggers regeneration ───────────────────

function mcpCallDirect(msg) {
  const result = spawnSync(process.execPath, [join(root, 'mcp', 'server.js')], {
    input: msg + '\n',
    encoding: 'utf8',
    timeout: 5000,
  });
  const lines = result.stdout.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return null;
  return JSON.parse(lines[0]);
}

test('spec_guard_draft_spec MCP tool triggers artifact index regeneration when output_path is in .spec-guard/', () => {
  const dir = tempDir();
  mkdirSync(join(sgDir(dir), 'specs'), { recursive: true });

  const outputPath = join(sgDir(dir), 'specs', 'mcp-spec.md');
  const msg = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: {
      name: 'spec_guard_draft_spec',
      arguments: {
        title: 'MCP Regeneration Test',
        problem: 'Need regeneration.',
        in_scope: ['Regeneration'],
        out_of_scope: ['Nothing'],
        expected_behavior: 'Index is regenerated.',
        acceptance_criteria: ['Index contains spec'],
        classification: 'Direct behavior with no new API or UI',
        output_path: outputPath,
      },
    },
  });

  const response = mcpCallDirect(msg);
  const content = JSON.parse(response.result.content[0].text);
  assert.ok(content.written_to, 'spec should have been written');
  assert.ok(existsSync(join(sgDir(dir), 'README.md')),
    '.spec-guard/README.md should be regenerated after spec_guard_draft_spec');
});
