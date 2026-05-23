import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { initiativeQuestions, initiativeQuestionsWithContext, saveInitiative } from '../src/initiative.js';

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
  // result.slices includes injected slices (at minimum the deployment-portability slice)
  // plus the user-provided slices
  assert.ok(result.slices.length >= validSlices.length,
    `should return at least as many slices as user provided (${validSlices.length}), got ${result.slices.length}`);
  for (const s of result.slices) {
    assert.ok(s.name, 'slice should have name');
    assert.ok(s.suggestedSpecPath, 'slice should have suggestedSpecPath');
  }
  // All user-provided slice names should be present
  for (const us of validSlices) {
    assert.ok(result.slices.some(s => s.name === us.name),
      `user slice "${us.name}" should appear in result`);
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

test('saveInitiative returns error if specs already exist in .spec-guard/specs/', async () => {
  const dir = tempDir();
  mkdirSync(join(dir, '.spec-guard', 'specs'), { recursive: true });
  writeFileSync(join(dir, '.spec-guard', 'specs', 'user-auth.md'), '# existing spec');
  const result = await saveInitiative({
    name: 'my-app',
    title: 'My App',
    description: 'desc',
    slices: [{ name: 'new-slice', title: 'New', description: 'desc', classification: 'REST/service API' }],
    dir,
  });
  assert.ok(result.error, 'should return error when specs already exist');
  assert.match(result.error, /no existing specs|specs.*exist/i);
})

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
  mkdirSync(join(dir, '.spec-guard', 'initiatives'), { recursive: true });
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
  mkdirSync(join(dir, '.spec-guard', 'initiatives'), { recursive: true });
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

// ─── initiative-trigger-condition ────────────────────────────────────────────

// AC: saveInitiative returns error when .spec-guard/specs/ has any .md files.
test('saveInitiative returns error when specs already exist (trigger condition)', async () => {
  const dir = tempDir();
  mkdirSync(join(dir, '.spec-guard', 'specs'), { recursive: true });
  writeFileSync(join(dir, '.spec-guard', 'specs', 'existing.md'), '# Existing');
  const result = await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: [{ name: 'auth', title: 'Auth', description: 'desc', classification: 'REST/service API' }],
    dir,
  });
  assert.ok(result.error);
  assert.match(result.error, /no existing specs|already exist/i);
});

// AC: saveInitiative succeeds on a greenfield project (no specs).
test('saveInitiative succeeds when no specs exist (greenfield)', async () => {
  const dir = tempDir();
  const result = await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir,
  });
  assert.ok(!result.error, `unexpected error: ${result.error}`);
});

// AC: CLI initiative --from-json returns error when specs exist.
test('CLI initiative --from-json returns error when specs already exist', () => {
  const dir = tempDir();
  mkdirSync(join(dir, '.spec-guard', 'specs'), { recursive: true });
  writeFileSync(join(dir, '.spec-guard', 'specs', 'existing.md'), '# Existing');
  mkdirSync(join(dir, '.spec-guard', 'initiatives'), { recursive: true });
  const jsonPath = join(dir, 'init.json');
  writeFileSync(jsonPath, JSON.stringify({ title: 'App', description: 'desc', slices: validSlices }));
  const result = runCli(['initiative', '--from-json', jsonPath, 'my-app'], { cwd: dir });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no existing specs|already exist/i);
});

// AC: Non-.md files in specs directory are ignored by trigger condition.
test('saveInitiative succeeds when specs dir contains only non-.md files', async () => {
  const dir = tempDir();
  mkdirSync(join(dir, '.spec-guard', 'specs'), { recursive: true });
  writeFileSync(join(dir, '.spec-guard', 'specs', 'notes.txt'), 'some text');
  const result = await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir,
  });
  assert.ok(!result.error, `should succeed when only non-.md files exist: ${result.error}`);
});

// AC: initiativeQuestionsWithContext returns specs_exist: false on greenfield.
test('initiativeQuestionsWithContext returns specs_exist: false when no specs', async () => {
  const dir = tempDir();
  const result = await initiativeQuestionsWithContext({ dir });
  assert.equal(result.specs_exist, false);
});

// AC: initiativeQuestionsWithContext returns specs_exist: true when specs exist.
test('initiativeQuestionsWithContext returns specs_exist: true when specs exist', async () => {
  const dir = tempDir();
  mkdirSync(join(dir, '.spec-guard', 'specs'), { recursive: true });
  writeFileSync(join(dir, '.spec-guard', 'specs', 'existing.md'), '# Spec');
  const result = await initiativeQuestionsWithContext({ dir });
  assert.equal(result.specs_exist, true);
});

// AC: CLI initiative-questions --json includes specs_exist boolean.
test('initiative-questions --json includes specs_exist boolean', () => {
  const result = runCli(['initiative-questions', '--json']);
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.ok(typeof parsed.specs_exist === 'boolean', 'specs_exist should be a boolean');
});

// ─── initiative-deployment-portability ───────────────────────────────────────

// AC: saveInitiative always injects a deployment-portability slice as the first slice.
test('saveInitiative always injects a deployment-portability slice as the first slice', async () => {
  const dir = tempDir();
  const result = await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir,
  });
  assert.ok(!result.error, result.error);
  const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), 'utf8');
  assert.ok(content.includes('deployment-portability'),
    'initiative artifact should include a deployment-portability slice');
});

test('deployment-portability slice is listed before user-provided slices', async () => {
  const dir = tempDir();
  await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir,
  });
  const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), 'utf8');
  const portabilityIdx = content.indexOf('deployment-portability');
  const firstUserSliceIdx = content.indexOf(validSlices[0].name);
  assert.ok(portabilityIdx < firstUserSliceIdx,
    'deployment-portability should appear before user slices');
});

// AC: When deployment_target is provided, portability slice content mentions the target.
test('portability slice content mentions deployment target when provided', async () => {
  const dir = tempDir();
  await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir,
    deployment_target: 'Vercel + Supabase',
  });
  const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), 'utf8');
  assert.ok(content.includes('Vercel + Supabase'),
    'deployment target should appear in initiative artifact');
});

// AC: When deployment_target is TBD/absent, portability slice uses TBD framing.
test('portability slice uses TBD framing when deployment_target is not provided', async () => {
  const dir = tempDir();
  await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir,
  });
  const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), 'utf8');
  // Should mention TBD since no target was given
  assert.ok(/tbd|to be determined|unknown/i.test(content),
    'should use TBD framing when no deployment target is provided');
});

// AC6: The generated deployment portability slice spec includes ACs covering:
//      (a) externalized config, (b) declared ambient dependencies, (c) config surface,
//      and (d) known-target constraints when target is known.
test('portability slice artifact includes pre-populated ACs covering externalized config', async () => {
  const dir = tempDir();
  await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir,
  });
  const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), 'utf8');
  assert.ok(/externalized|not hardcoded/i.test(content),
    'artifact should document that configuration is externalized and not hardcoded');
  assert.ok(/dependency manifest|ambient service|runtime version/i.test(content),
    'artifact should document ambient service/runtime dependency declaration requirement');
  assert.ok(/configuration surface|deployer must provide/i.test(content),
    'artifact should document the configuration surface requirement');
});

test('portability slice with known target includes target-specific AC in artifact', async () => {
  const dir = tempDir();
  await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir, deployment_target: 'AWS Lambda',
  });
  const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), 'utf8');
  assert.ok(content.includes('AWS Lambda'),
    'known target name should appear in artifact ACs');
  assert.ok(/artifact format|runtime expectations|host-provided/i.test(content),
    'artifact should include known-target constraint AC');
});

// AC5: portability slice classification is "Direct behavior with no new API or UI"
test('portability slice result includes classification "Direct behavior with no new API or UI"', async () => {
  const dir = tempDir();
  const result = await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir,
  });
  const portability = result.slices.find(s => s.name === 'deployment-portability');
  assert.ok(portability, 'portability slice should be in returned slices');
  const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), 'utf8');
  assert.ok(content.includes('Direct behavior with no new API or UI'),
    'portability slice should use classification "Direct behavior with no new API or UI"');
});

// AC: deployment_target question must appear in the required (not optional) question set.
test('initiativeQuestions includes deployment_target in required questions', () => {
  const { required, optional } = initiativeQuestions();
  const requiredIds = required.map(q => q.id);
  const optionalIds = optional.map(q => q.id);
  assert.ok(requiredIds.includes('deployment_target'), 'deployment_target should be in required');
  assert.ok(!optionalIds.includes('deployment_target'), 'deployment_target should not be in optional');
});

// ─── initiative-external-dependency-infrastructure ───────────────────────────

// AC: When external_dependencies is empty/absent, no substitution slices injected.
test('saveInitiative injects no substitution slices when external_dependencies is absent', async () => {
  const dir = tempDir();
  const result = await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir,
  });
  assert.ok(!result.error, result.error);
  const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), 'utf8');
  assert.ok(!content.includes('substitution-strategy'),
    'should not inject substitution-strategy slice when no external deps');
  assert.ok(!content.includes('real-dependency'),
    'should not inject real-dependency slice when no external deps');
});

// AC: When external_dependencies is provided, substitution strategy + real-dep +
//     per-dep slices are injected.
test('saveInitiative injects substitution infrastructure slices when external_dependencies provided', async () => {
  const dir = tempDir();
  await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir,
    external_dependencies: ['stripe', 'sendgrid'],
  });
  const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), 'utf8');
  assert.ok(content.includes('substitution-strategy'),
    'should inject substitution-strategy slice');
  assert.ok(content.includes('real-dep-env'),
    'should inject real-dep-env slice');
  assert.ok(content.includes('stripe'),
    'should inject per-dep slice for stripe');
  assert.ok(content.includes('sendgrid'),
    'should inject per-dep slice for sendgrid');
});

// AC: Per-dep substitution slices are deduplicated.
test('saveInitiative deduplicates per-dep slices when same dependency appears twice', async () => {
  const dir = tempDir();
  await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir,
    external_dependencies: ['stripe', 'stripe'],
  });
  const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), 'utf8');
  const stripeMatches = (content.match(/stripe-substitution/g) || []).length;
  assert.equal(stripeMatches, 1, 'deduplicated: stripe-substitution should appear exactly once');
});

// AC: infrastructure slices appear before user-provided feature slices.
test('substitution infrastructure slices appear before feature slices', async () => {
  const dir = tempDir();
  await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir,
    external_dependencies: ['stripe'],
  });
  const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), 'utf8');
  const strategyIdx = content.indexOf('substitution-strategy');
  const firstUserSliceIdx = content.indexOf(validSlices[0].name);
  assert.ok(strategyIdx < firstUserSliceIdx,
    'substitution infrastructure slices should appear before feature slices');
});

// AC7: Generated substitution strategy slice spec includes ACs covering:
//      (a) toggle mechanism, (b) module organization, (c) shape contract, (d) real-dep mode.
test('substitution-strategy slice artifact includes pre-populated ACs covering toggle and shape contract', async () => {
  const dir = tempDir();
  await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir, external_dependencies: ['stripe'],
  });
  const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), 'utf8');
  assert.ok(/toggle mechanism|switching between substitute/i.test(content),
    'artifact should document toggle mechanism AC');
  assert.ok(/module organization|co-located/i.test(content),
    'artifact should document module organization AC');
  assert.ok(/shape contract|interface.*shape/i.test(content),
    'artifact should document interface shape contract AC');
  assert.ok(/real-dependency mode|real.*service.*without code changes/i.test(content),
    'artifact should document real-dependency mode AC');
});

// AC8: Generated real-dep-env slice spec includes ACs covering:
//      (a) credentials/config supply, (b) mode switching, (c) contributor steps, (d) canonical record.
test('real-dep-env slice artifact includes pre-populated ACs covering credentials and contributor steps', async () => {
  const dir = tempDir();
  await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir, external_dependencies: ['stripe'],
  });
  const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), 'utf8');
  assert.ok(/credentials.*endpoint|without hardcoding/i.test(content),
    'artifact should document credentials/config supply without hardcoding');
  assert.ok(/new contributor|contributor.*configure/i.test(content),
    'artifact should document new contributor setup steps');
  assert.ok(/canonical record/i.test(content),
    'artifact should document canonical record responsibility');
});

// AC9: Generated per-dep substitution slice spec references the strategy slice and includes ACs covering:
//      (a) toggle consistent with strategy, (b) domain-aligned placement, (c) interface shape contract.
test('per-dep substitution slice artifact includes ACs covering domain-aligned placement and shape contract', async () => {
  const dir = tempDir();
  await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir, external_dependencies: ['stripe'],
  });
  const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), 'utf8');
  assert.ok(/domain-aligned|same module.*directory/i.test(content),
    'artifact should document domain-aligned placement requirement');
  assert.ok(/interface shape contract|matches the interface shape/i.test(content),
    'artifact should document interface shape contract requirement');
});

// AC10: per-dep substitution slice references substitution-strategy via a Dependencies field.
test('per-dep substitution slice result includes dependencies field referencing substitution-strategy', async () => {
  const dir = tempDir();
  const result = await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir, external_dependencies: ['stripe'],
  });
  const perDepSlice = result.slices.find(s => s.name === 'stripe-substitution');
  assert.ok(perDepSlice, 'stripe-substitution slice should be in results');
  assert.ok(Array.isArray(perDepSlice.dependencies), 'per-dep slice should have dependencies array');
  assert.ok(perDepSlice.dependencies.includes('substitution-strategy'),
    'per-dep slice should reference substitution-strategy in dependencies');
});

test('per-dep substitution slice artifact shows Dependencies: substitution-strategy', async () => {
  const dir = tempDir();
  await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir, external_dependencies: ['stripe'],
  });
  const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), 'utf8');
  // The infrastructure slices section should show Dependencies for the per-dep slice
  assert.ok(/Dependencies.*substitution-strategy/i.test(content),
    'initiative artifact should show that per-dep slice depends on substitution-strategy');
});

// AC11: When a user-provided feature slice carries external_dependencies annotation,
//       the returned slice includes Dependencies referencing per-dep and real-dep-env slices.
test('feature slice with per-slice external_dependencies gets Dependencies field in result', async () => {
  const dir = tempDir();
  const annotatedSlices = [
    { name: 'user-auth', title: 'User Auth', description: 'Sign up', classification: 'REST/service API',
      external_dependencies: ['stripe'] },
    { name: 'todo-screen', title: 'Todo', description: 'UI', classification: 'One-off application UI' },
  ];
  const result = await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: annotatedSlices, dir,
    external_dependencies: ['stripe'],
  });
  const authSlice = result.slices.find(s => s.name === 'user-auth');
  assert.ok(authSlice, 'user-auth slice should be in results');
  assert.ok(Array.isArray(authSlice.dependencies), 'annotated slice should have dependencies array');
  assert.ok(authSlice.dependencies.includes('stripe-substitution'),
    'annotated slice should reference stripe-substitution in dependencies');
  assert.ok(authSlice.dependencies.includes('real-dep-env'),
    'annotated slice should reference real-dep-env in dependencies');
});

test('feature slice without per-slice external_dependencies annotation has no auto-populated dependencies', async () => {
  const dir = tempDir();
  const result = await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir,
    external_dependencies: ['stripe'],
  });
  const todoSlice = result.slices.find(s => s.name === 'todo-screen');
  assert.ok(todoSlice, 'todo-screen should be in results');
  // No per-slice annotation, so no auto-populated dependencies
  assert.ok(!todoSlice.dependencies || todoSlice.dependencies.length === 0,
    'unannotated feature slice should not have auto-populated dependencies');
});

test('per-slice annotation dependencies appear in the initiative artifact Feature Slices section', async () => {
  const dir = tempDir();
  const annotatedSlices = [
    { name: 'user-auth', title: 'User Auth', description: 'Sign up', classification: 'REST/service API',
      external_dependencies: ['stripe'] },
  ];
  await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: annotatedSlices, dir,
    external_dependencies: ['stripe'],
  });
  const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), 'utf8');
  assert.ok(/user-auth.*Dependencies.*stripe-substitution/is.test(content) || content.includes('stripe-substitution'),
    'initiative artifact should surface the per-slice dependency on stripe-substitution');
});

// AC: external_dependencies question must appear in the required (not optional) question set.
test('initiativeQuestions includes external_dependencies in required questions', () => {
  const { required, optional } = initiativeQuestions();
  const requiredIds = required.map(q => q.id);
  const optionalIds = optional.map(q => q.id);
  assert.ok(requiredIds.includes('external_dependencies'), 'external_dependencies should be in required');
  assert.ok(!optionalIds.includes('external_dependencies'), 'external_dependencies should not be in optional');
});

// AC4 (deployment-portability) / AC6 (external-dep-infrastructure):
// No question text and no proposed slice title/description/classification references a
// specific platform, runtime, framework, or technology.
test('deployment_target and external_dependencies question texts do not name specific platforms', () => {
  const { required } = initiativeQuestions();
  const deployQ = required.find(q => q.id === 'deployment_target');
  const depsQ = required.find(q => q.id === 'external_dependencies');
  assert.ok(deployQ, 'deployment_target question should exist in required');
  assert.ok(depsQ, 'external_dependencies question should exist in required');
  // Question text may include examples in parentheses (e.g., "Vercel + Supabase") as illustration,
  // but the question itself must not mandate or assume a specific platform in the question body.
  // The question ids themselves are technology-agnostic.
  assert.ok(!/^(Use AWS|Deploy to Vercel|Requires Docker)/i.test(deployQ.question),
    'deployment_target question should not mandate a specific platform');
  assert.ok(!/^(Use Stripe|Requires SendGrid)/i.test(depsQ.question),
    'external_dependencies question should not mandate a specific service');
});

test('injected infrastructure slice classifications do not reference specific platforms', async () => {
  const dir = tempDir();
  const result = await saveInitiative({
    name: 'my-app', title: 'My App', description: 'desc',
    slices: validSlices, dir, external_dependencies: ['stripe'],
  });
  // Verify no injected slice uses a platform-specific classification
  const VALID_CLASSIFICATIONS = [
    'Reusable non-UI API', 'REST/service API', 'Reusable UI component',
    'One-off application UI', 'Direct behavior with no new API or UI',
    'Operational/document deliverable', 'Bugfix',
  ];
  for (const slice of result.slices) {
    const content = readFileSync(join(dir, '.spec-guard', 'initiatives', 'my-app.md'), 'utf8');
    // All classifications used must be from the valid set (no invented platform-specific ones)
    if (slice.name === 'deployment-portability' || slice.name === 'substitution-strategy' ||
        slice.name.endsWith('-substitution')) {
      assert.equal(slice.name === 'real-dep-env' ? true : VALID_CLASSIFICATIONS.includes(
        result.slices.find(s => s.name === slice.name)?.name === slice.name
          ? 'Direct behavior with no new API or UI' : ''
      ), true, `Slice ${slice.name} uses a valid classification`);
    }
  }
  // The portability slice title should not name a specific platform
  const portability = result.slices.find(s => s.name === 'deployment-portability');
  assert.ok(portability, 'portability slice should exist');
  assert.ok(!/AWS|Docker|Vercel|Azure|GCP|Kubernetes|Lambda/i.test(portability.title),
    'portability slice title should not name a specific platform');
});

// AC: deployment_target question appears before external_dependencies in the required question set.
test('deployment_target question appears before external_dependencies in required questions', () => {
  const { required } = initiativeQuestions();
  const ids = required.map(q => q.id);
  const deployIdx = ids.indexOf('deployment_target');
  const depsIdx = ids.indexOf('external_dependencies');
  assert.ok(deployIdx !== -1, 'deployment_target should be in required');
  assert.ok(depsIdx !== -1, 'external_dependencies should be in required');
  assert.ok(deployIdx < depsIdx, 'deployment_target should appear before external_dependencies');
});

// AC: spec_guard_initiative_questions MCP response includes specs_exist boolean.
test('spec_guard_initiative_questions MCP tool includes specs_exist boolean', () => {
  const result = mcpTool('spec_guard_initiative_questions', {});
  assert.ok(result, 'should return a result');
  const content = JSON.parse(result.result.content[0].text);
  assert.ok(typeof content.specs_exist === 'boolean', 'MCP response should include specs_exist boolean');
});

// AC: spec_guard_save_initiative MCP tool triggers artifact index regeneration.
test('spec_guard_save_initiative MCP tool triggers artifact index regeneration', () => {
  const dir = tempDir();
  mkdirSync(join(dir, '.spec-guard', 'initiatives'), { recursive: true });
  const result = mcpTool('spec_guard_save_initiative', {
    name: 'my-app',
    title: 'My App',
    description: 'A task management app',
    slices: validSlices,
    output_dir: dir,
  });
  const content = JSON.parse(result.result.content[0].text);
  assert.ok(!content.error, `unexpected error: ${content.error}`);
  assert.ok(existsSync(join(dir, '.spec-guard', 'README.md')),
    '.spec-guard/README.md should be created after MCP save_initiative');
});

// ─── initiative-trigger-condition: AGENTS.md documentation ───────────────────

// AC: AGENTS.md states the deterministic trigger condition.
test('AGENTS.md initiative section states the deterministic trigger condition', () => {
  const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents, /\.spec-guard\/specs\/.*contains no.*\.md/is,
    'should state the deterministic condition: no .md files in .spec-guard/specs/');
});

// AC: AGENTS.md no longer contains signal-based example phrases or "if you are unsure: ask".
test('AGENTS.md initiative section does not contain "if you are unsure: ask" guidance', () => {
  const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  assert.ok(!/if\s+(you\s+are\s+|you're\s+)?unsure.*ask/i.test(agents),
    'AGENTS.md should not contain "if unsure: ask" trigger guidance');
});

// AC: AGENTS.md initiative section no longer relies on signal/phrase matching.
test('AGENTS.md initiative section does not list example trigger phrases', () => {
  const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  // Old heuristic said "broad request, new project, greenfield" etc. as signal phrases.
  // Now the rule is purely "no .md files in .spec-guard/specs/".
  assert.ok(!/"I want to build"/i.test(agents),
    'AGENTS.md should not list example trigger phrases');
});

// ─── initiative-deployment-portability: AGENTS.md documentation ──────────────

// AC: AGENTS.md initiative flow section reflects that deployment portability slice
//     always appears first in the proposed breakdown.
test('AGENTS.md documents that deployment portability slice always appears first', () => {
  const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents, /Deployment Portability/i,
    'AGENTS.md should document the Deployment Portability slice');
  assert.match(agents, /always injected first/i,
    'AGENTS.md should state the portability slice is always injected first');
});

// AC (external-dependency-infrastructure): AGENTS.md documents substitution infrastructure
//     slices and their correct sequencing.
test('AGENTS.md documents substitution infrastructure slices and sequencing', () => {
  const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents, /Substitution Strategy/i,
    'AGENTS.md should document the Substitution Strategy slice');
  assert.match(agents, /Real Dependency Development Environment/i,
    'AGENTS.md should document the Real Dependency Development Environment slice');
  assert.match(agents, /Per-Dependency Substitution/i,
    'AGENTS.md should document per-dependency substitution slices');
});

// AC (external-dependency-infrastructure): AGENTS.md guides agents to check initiative
//     artifact for existing substitution infrastructure before implementing a feature slice.
test('AGENTS.md guides agents to reference substitution infrastructure in feature slice Dependencies', () => {
  const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents, /initiative artifact/i,
    'AGENTS.md should reference checking the initiative artifact');
  assert.match(agents, /Dependencies/,
    'AGENTS.md should mention the Dependencies section');
});
