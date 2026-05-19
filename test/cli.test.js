import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const cli = join(root, 'bin', 'spec-guard.js');

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
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
  const result = runCli(['init', directory]);

  assert.equal(result.status, 0);
  assert.equal(existsSync(join(directory, 'specs')), true);
  assert.equal(existsSync(join(directory, 'contracts')), true);
  assert.equal(existsSync(join(directory, '.spec-guard', 'blockers')), true);
  assert.equal(existsSync(join(directory, '.spec-guard', 'scope-discoveries')), true);
  assert.equal(existsSync(join(directory, '.spec-guard', 'reviews')), true);
});

test('new spec creates a spec from the template', () => {
  const directory = tempDir();
  const output = join(directory, 'spec.md');
  const result = runCli(['new', 'spec', output]);

  assert.equal(result.status, 0);
  assert.match(readFileSync(output, 'utf8'), /^# Spec/);
});

test('new spec refuses to overwrite existing files', () => {
  const directory = tempDir();
  const output = join(directory, 'spec.md');

  assert.equal(runCli(['new', 'spec', output]).status, 0);
  const result = runCli(['new', 'spec', output]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /^\[BLOCKER\] SG-USAGE-002 /);
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
  const output = join(tempDir(), 'blocker.md');
  const result = runCli(['blocker', output]);

  assert.equal(result.status, 0);
  assert.match(readFileSync(output, 'utf8'), /^# Blocker/);
});

test('scope-discovery creates a scope discovery from the template', () => {
  const output = join(tempDir(), 'scope.md');
  const result = runCli(['scope-discovery', output]);

  assert.equal(result.status, 0);
  assert.match(readFileSync(output, 'utf8'), /^# Scope Discovery/);
});

test('review creates an implementation review from the template', () => {
  const output = join(tempDir(), 'review.md');
  const result = runCli(['review', output]);

  assert.equal(result.status, 0);
  assert.match(readFileSync(output, 'utf8'), /^# Implementation Review/);
});
