import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
  return mkdtempSync(join(tmpdir(), 'spec-guard-'));
}

test('CLI exits 0 for valid spec', () => {
  const result = runCli(['check', 'test/fixtures/valid-spec.md']);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('CLI exits 1 and prints diagnostics for blockers', () => {
  const result = runCli(['check', 'test/fixtures/no-classification.md']);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^\[BLOCKER\] SG-CLASS-001 test\/fixtures\/no-classification\.md: /);
  assert.equal(result.stderr, '');
});

test('CLI exits 2 for usage errors', () => {
  const result = runCli([]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /^Usage:/);
});

test('CLI exits 2 for unreadable input', () => {
  const result = runCli(['check', 'test/fixtures/does-not-exist.md']);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /^\[BLOCKER\] SG-USAGE-001 test\/fixtures\/does-not-exist\.md: /);
});

test('init creates Spec Guard directories', () => {
  const directory = tempDir();
  const result = runCli(['init'], { cwd: directory });

  assert.equal(result.status, 0);
  assert.equal(existsSync(join(directory, '.spec-guard', 'specs')), true);
  assert.equal(existsSync(join(directory, '.spec-guard', 'contracts')), true);
  assert.equal(existsSync(join(directory, '.spec-guard', 'blockers')), true);
  assert.equal(existsSync(join(directory, '.spec-guard', 'scope-discoveries')), true);
  assert.equal(existsSync(join(directory, '.spec-guard', 'reviews')), true);
  assert.equal(existsSync(join(directory, '.spec-guard', 'deviations')), true);
  assert.equal(existsSync(join(directory, '.spec-guard', 'discoveries')), true);
  assert.equal(existsSync(join(directory, '.spec-guard', 'runs')), true);
});

test('init creates starter spec', () => {
  const directory = tempDir();
  runCli(['init'], { cwd: directory });

  const specPath = join(directory, '.spec-guard', 'specs', 'example.md');
  assert.equal(existsSync(specPath), true);
  assert.match(readFileSync(specPath, 'utf8'), /^# Spec/);
});

test('init creates AGENTS.md', () => {
  const directory = tempDir();
  runCli(['init'], { cwd: directory });

  const agentsPath = join(directory, 'AGENTS.md');
  assert.equal(existsSync(agentsPath), true);
  assert.match(readFileSync(agentsPath, 'utf8'), /Agent Instructions/);
});

test('init creates WORKFLOW.md', () => {
  const directory = tempDir();
  runCli(['init'], { cwd: directory });

  const workflowPath = join(directory, 'WORKFLOW.md');
  assert.equal(existsSync(workflowPath), true);
  assert.match(readFileSync(workflowPath, 'utf8'), /Spec Guard Workflow/);
});

test('init does not overwrite existing AGENTS.md', () => {
  const directory = tempDir();
  writeFileSync(join(directory, 'AGENTS.md'), 'existing content');
  runCli(['init'], { cwd: directory });

  assert.equal(readFileSync(join(directory, 'AGENTS.md'), 'utf8'), 'existing content');
});

test('init does not overwrite existing WORKFLOW.md', () => {
  const directory = tempDir();
  writeFileSync(join(directory, 'WORKFLOW.md'), 'existing content');
  runCli(['init'], { cwd: directory });

  assert.equal(readFileSync(join(directory, 'WORKFLOW.md'), 'utf8'), 'existing content');
});

test('init does not overwrite existing starter spec', () => {
  const directory = tempDir();
  runCli(['init'], { cwd: directory });
  const specPath = join(directory, '.spec-guard', 'specs', 'example.md');
  writeFileSync(specPath, 'existing spec');
  runCli(['init'], { cwd: directory });

  assert.equal(readFileSync(specPath, 'utf8'), 'existing spec');
});

test('init exits 2 when unexpected arguments are given', () => {
  const result = runCli(['init', 'some-dir']);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage: spec-guard init/);
});

test('init creates GitHub Actions workflow file', () => {
  const directory = tempDir();
  const result = runCli(['init'], { cwd: directory });

  assert.equal(result.status, 0);
  const workflowPath = join(directory, '.github', 'workflows', 'spec-guard.yml');
  assert.equal(existsSync(workflowPath), true);
  assert.match(readFileSync(workflowPath, 'utf8'), /npx spec-guard validate/);
});

test('new spec creates a spec from the template', () => {
  const directory = tempDir();
  const result = runCli(['new', 'spec', 'my-feature'], { cwd: directory });

  assert.equal(result.status, 0);
  assert.match(readFileSync(join(directory, '.spec-guard', 'specs', 'my-feature.md'), 'utf8'), /^# Spec/);
});

test('new spec creates in .spec-guard/specs/', () => {
  const directory = tempDir();
  runCli(['new', 'spec', 'my-feature'], { cwd: directory });

  assert.equal(existsSync(join(directory, '.spec-guard', 'specs', 'my-feature.md')), true);
});

test('new api-contract creates in .spec-guard/contracts/', () => {
  const directory = tempDir();
  runCli(['new', 'api-contract', 'my-api'], { cwd: directory });

  assert.equal(existsSync(join(directory, '.spec-guard', 'contracts', 'my-api.md')), true);
});

test('new spec refuses to overwrite existing files', () => {
  const directory = tempDir();
  assert.equal(runCli(['new', 'spec', 'my-feature'], { cwd: directory }).status, 0);
  const result = runCli(['new', 'spec', 'my-feature'], { cwd: directory });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /^\[BLOCKER\] SG-USAGE-002 /);
});

test('new spec rejects absolute paths', () => {
  const result = runCli(['new', 'spec', join(tmpdir(), 'escape.md')]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /SG-USAGE-001/);
});

test('classify prints selected classification', () => {
  const result = runCli(['classify', 'test/fixtures/valid-spec.md']);

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), 'Direct behavior with no new API or UI');
});

test('classify reports invalid classification selection', () => {
  const result = runCli(['classify', 'test/fixtures/multiple-classifications.md']);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^\[BLOCKER\] SG-CLASS-001 /);
});

test('blocker creates a blocker from the template', () => {
  const directory = tempDir();
  const result = runCli(['blocker', 'auth-missing'], { cwd: directory });

  assert.equal(result.status, 0);
  assert.match(readFileSync(join(directory, '.spec-guard', 'blockers', 'auth-missing.md'), 'utf8'), /^# Blocker/);
});

test('blocker defaults to .spec-guard/blockers/ for bare names', () => {
  const directory = tempDir();
  const result = runCli(['blocker', 'auth-missing'], { cwd: directory });

  assert.equal(result.status, 0);
  assert.equal(existsSync(join(directory, '.spec-guard', 'blockers', 'auth-missing.md')), true);
});

test('scope-discovery creates a scope discovery from the template', () => {
  const directory = tempDir();
  const result = runCli(['scope-discovery', 'scope-item'], { cwd: directory });

  assert.equal(result.status, 0);
  assert.match(readFileSync(join(directory, '.spec-guard', 'scope-discoveries', 'scope-item.md'), 'utf8'), /^# Scope Discovery/);
});

test('review creates an implementation review from the template', () => {
  const directory = tempDir();
  const result = runCli(['review', 'my-feature'], { cwd: directory });

  assert.equal(result.status, 0);
  assert.match(readFileSync(join(directory, '.spec-guard', 'reviews', 'my-feature.md'), 'utf8'), /^# Implementation Review/);
});

test('discovery creates a discovery request from the template', () => {
  const directory = tempDir();
  const result = runCli(['discovery', 'my-topic'], { cwd: directory });

  assert.equal(result.status, 0);
  assert.match(readFileSync(join(directory, '.spec-guard', 'discoveries', 'my-topic.md'), 'utf8'), /^# Discovery Request/);
});

test('deviation creates a spec deviation request from the template', () => {
  const directory = tempDir();
  const result = runCli(['deviation', 'my-deviation'], { cwd: directory });

  assert.equal(result.status, 0);
  assert.match(readFileSync(join(directory, '.spec-guard', 'deviations', 'my-deviation.md'), 'utf8'), /^# Spec Deviation Request/);
});

test('draft exits 2 when no output path given', () => {
  const result = runCli(['draft']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage: spec-guard draft/);
});

test('draft exits 2 when too many arguments given', () => {
  const result = runCli(['draft', 'a.md', 'b.md']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage: spec-guard draft/);
});

test('draft exits 1 when output file already exists', () => {
  const directory = tempDir();
  runCli(['init'], { cwd: directory });
  const specPath = join(directory, '.spec-guard', 'specs', 'my-spec.md');
  writeFileSync(specPath, 'existing');
  const result = runCli(['draft', 'my-spec'], { cwd: directory });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SG-USAGE-002/);
});
