import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { initiativeQuestions, saveInitiative } from '../src/initiative.js';

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
  return mkdtempSync(join(tmpdir(), 'sg-initiative-'));
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

// ─── initiativeQuestions ──────────────────────────────────────────────────────

test('initiativeQuestions returns required and optional question arrays', () => {
  const result = initiativeQuestions();
  assert.ok(Array.isArray(result.required), 'required should be an array');
  assert.ok(Array.isArray(result.optional), 'optional should be an array');
});

test('initiativeQuestions required questions have id, question, and notes fields', () => {
  const { required } = initiativeQuestions();
  assert.ok(required.length > 0, 'should have at least one required question');
  for (const q of required) {
    assert.ok(typeof q.id === 'string' && q.id.length > 0, `question missing id: ${JSON.stringify(q)}`);
    assert.ok(typeof q.question === 'string' && q.question.length > 0, `question missing question text: ${JSON.stringify(q)}`);
    assert.ok(typeof q.notes === 'string', `question missing notes: ${JSON.stringify(q)}`);
  }
});

test('initiativeQuestions covers app purpose, users, feature areas, integrations, out-of-scope', () => {
  const { required } = initiativeQuestions();
  const ids = required.map(q => q.id);
  assert.ok(ids.some(id => /purpose|goal|problem/.test(id)), 'should have a purpose/goal question');
  assert.ok(ids.some(id => /user|actor/.test(id)), 'should have a users/actors question');
  assert.ok(ids.some(id => /feature|area|slice/.test(id)), 'should have a feature areas question');
  assert.ok(ids.some(id => /scope/.test(id)), 'should have an out-of-scope question');
});

// ─── saveInitiative ───────────────────────────────────────────────────────────

const validSlices = [
  { name: 'user-auth', title: 'User Authentication', description: 'Sign up and login flows', classification: 'REST/service API' },
  { name: 'todo-screen', title: 'Todo Screen', description: 'Main task list UI', classification: 'One-off application UI' },
];

test('saveInitiative writes initiative artifact to initiatives directory', async () => {
  const dir = tempDir();
  const result = await saveInitiative({
    name: 'my-app',
    title: 'My App',
    description: 'A simple task management app',
    slices: validSlices,
    dir,
  });
  assert.ok(!result.error, `unexpected error: ${result.error}`);
  assert.ok(existsSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md')));
});

test('saveInitiative returns path and slice info', async () => {
  const dir = tempDir();
  const result = await saveInitiative({
    name: 'my-app',
    title: 'My App',
    description: 'A task management app',
    slices: validSlices,
    dir,
  });
  assert.ok(result.path, 'should return path');
  assert.ok(Array.isArray(result.slices), 'should return slices array');
  assert.equal(result.slices.length, validSlices.length);
  for (const s of result.slices) {
    assert.ok(s.name, 'slice should have name');
    assert.ok(s.suggestedSpecPath, 'slice should have suggestedSpecPath');
  }
});

test('saveInitiative returns error for unrecognized classification', async () => {
  const dir = tempDir();
  const result = await saveInitiative({
    name: 'my-app',
    title: 'My App',
    description: 'desc',
    slices: [{ name: 'bad-slice', title: 'Bad', description: 'desc', classification: 'Invalid Classification' }],
    dir,
  });
  assert.ok(result.error, 'should return error for invalid classification');
  assert.match(result.error, /classification/i);
});

test('saveInitiative returns error for non-URL-safe slice name', async () => {
  const dir = tempDir();
  const result = await saveInitiative({
    name: 'my-app',
    title: 'My App',
    description: 'desc',
    slices: [{ name: 'bad name!', title: 'Bad', description: 'desc', classification: 'REST/service API' }],
    dir,
  });
  assert.ok(result.error, 'should return error for invalid slice name');
  assert.match(result.error, /name/i);
});

test('saveInitiative returns error if slice name conflicts with existing spec', async () => {
  const dir = tempDir();
  mkdirSync(join(dir, '.spec-guard', 'specs'), { recursive: true });
  writeFileSync(join(dir, '.spec-guard', 'specs', 'user-auth.md'), '# existing spec');
  const result = await saveInitiative({
    name: 'my-app',
    title: 'My App',
    description: 'desc',
    slices: [{ name: 'user-auth', title: 'Auth', description: 'desc', classification: 'REST/service API' }],
    dir,
  });
  assert.ok(result.error, 'should return error for conflicting slice name');
  assert.match(result.error, /conflict|exists/i);
});

test('saveInitiative initiative artifact lists each slice with name, title, and classification', async () => {
  const dir = tempDir();
  await saveInitiative({
    name: 'my-app',
    title: 'My App',
    description: 'A task management app',
    slices: validSlices,
    dir,
  });
  const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), 'utf8');
  assert.ok(content.includes('user-auth'), 'should include slice name');
  assert.ok(content.includes('REST/service API'), 'should include classification');
  assert.ok(content.includes('todo-screen'), 'should include second slice name');
});

test('saveInitiative includes cross-slice integration note when UI and API slices coexist', async () => {
  const dir = tempDir();
  await saveInitiative({
    name: 'my-app',
    title: 'My App',
    description: 'A task management app',
    slices: validSlices, // includes REST/service API + One-off application UI
    dir,
  });
  const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), 'utf8');
  assert.ok(content.includes('Cross-Slice Integration'), 'should include cross-slice integration section');
  assert.ok(content.includes('without mocking'), 'should mention no-mock requirement');
});

test('saveInitiative omits cross-slice integration note when only API slices', async () => {
  const dir = tempDir();
  await saveInitiative({
    name: 'api-only',
    title: 'API Only',
    description: 'Only API slices',
    slices: [
      { name: 'user-auth', title: 'User Auth', description: 'Auth API', classification: 'REST/service API' },
      { name: 'todo-api', title: 'Todo API', description: 'Todo API', classification: 'Reusable non-UI API' },
    ],
    dir,
  });
  const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'api-only.md'), 'utf8');
  assert.ok(!content.includes('Cross-Slice Integration'), 'should not include cross-slice section for API-only initiative');
});

// ─── CLI: initiative-questions ────────────────────────────────────────────────

test('initiative-questions prints question list', () => {
  const result = runCli(['initiative-questions']);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.length > 0);
});

test('initiative-questions --json returns parseable JSON', () => {
  const result = runCli(['initiative-questions', '--json']);
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.ok(Array.isArray(parsed.required));
  assert.ok(Array.isArray(parsed.optional));
});

// ─── CLI: initiative <name> ───────────────────────────────────────────────────

test('initiative refuses to overwrite existing file', () => {
  const dir = tempDir();
  mkdirSync(join(dir, '.spec-guard', 'initiatives'), { recursive: true });
  writeFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), '# existing');
  const result = runCli(['initiative', 'my-app'], { cwd: dir });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SG-USAGE-002/);
});

test('initiative --from-json creates initiative file from JSON', () => {
  const dir = tempDir();
  runCli(['init'], { cwd: dir });
  const jsonPath = join(dir, 'init.json');
  writeFileSync(jsonPath, JSON.stringify({
    title: 'My App',
    description: 'A simple task management app',
    slices: [
      { name: 'user-auth', title: 'User Auth', description: 'Sign up and login', classification: 'REST/service API' },
      { name: 'todo-ui', title: 'Todo UI', description: 'Main task list', classification: 'One-off application UI' },
    ],
  }));
  const result = runCli(['initiative', '--from-json', jsonPath, 'my-app'], { cwd: dir });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md')));
});

test('initiative --from-json with stdin (-) creates initiative file', () => {
  const dir = tempDir();
  runCli(['init'], { cwd: dir });
  const json = JSON.stringify({
    title: 'Another App',
    description: 'An e-commerce platform',
    slices: [
      { name: 'product-api', title: 'Product API', description: 'CRUD for products', classification: 'REST/service API' },
    ],
  });
  const result = spawnSync(process.execPath, [cli, 'initiative', '--from-json', '-', 'another-app'], {
    cwd: dir,
    input: json,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(dir, '.spec-guard', 'initiatives', 'another-app.md')));
});

// ─── CLI: init creates initiatives directory ──────────────────────────────────

test('init creates .spec-guard/initiatives/ directory', () => {
  const dir = tempDir();
  const result = runCli(['init'], { cwd: dir });
  assert.equal(result.status, 0);
  assert.ok(existsSync(join(dir, '.spec-guard', 'initiatives')));
});

// ─── MCP: spec_guard_initiative_questions ─────────────────────────────────────

test('spec_guard_initiative_questions MCP tool returns question list', () => {
  const result = mcpTool('spec_guard_initiative_questions', {});
  assert.ok(result, 'should return a result');
  const content = JSON.parse(result.result.content[0].text);
  assert.ok(Array.isArray(content.required));
  assert.ok(Array.isArray(content.optional));
});

// ─── MCP: spec_guard_save_initiative ─────────────────────────────────────────

test('spec_guard_save_initiative MCP tool saves initiative and returns slice paths', () => {
  const dir = tempDir();
  const result = mcpTool('spec_guard_save_initiative', {
    name: 'my-app',
    title: 'My App',
    description: 'A task management app',
    slices: validSlices,
    output_dir: dir,
  });
  assert.ok(result, 'should return a result');
  const content = JSON.parse(result.result.content[0].text);
  assert.ok(!content.error, `unexpected error: ${content.error}`);
  assert.ok(content.path);
  assert.ok(Array.isArray(content.slices));
});

test('spec_guard_save_initiative MCP tool returns error for invalid classification', () => {
  const dir = tempDir();
  const result = mcpTool('spec_guard_save_initiative', {
    name: 'my-app',
    title: 'My App',
    description: 'desc',
    slices: [{ name: 'bad', title: 'Bad', description: 'desc', classification: 'Not A Classification' }],
    output_dir: dir,
  });
  const content = JSON.parse(result.result.content[0].text);
  assert.ok(content.error, 'should return error');
});
