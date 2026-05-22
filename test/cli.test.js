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

test('spec-linked artifact creation records direct links in the originating spec without duplicates', () => {
  const directory = tempDir();
  runCli(['init'], { cwd: directory });
  const specPath = join(directory, '.spec-guard', 'specs', 'my-spec.md');
  const originalSpec = `${readFileSync('test/fixtures/valid-spec.md', 'utf8')}\n## Documentation Requirements\n\n- No documentation changes required.\n`;
  writeFileSync(specPath, originalSpec);

  assert.equal(runCli(['new', 'api-contract', '--spec', 'my-spec', 'my-api'], { cwd: directory }).status, 0);
  assert.equal(runCli(['review', '--spec', 'my-spec', 'my-review'], { cwd: directory }).status, 0);
  assert.equal(runCli(['blocker', '--spec', 'my-spec', 'my-blocker'], { cwd: directory }).status, 0);
  assert.equal(runCli(['deviation', '--spec', 'my-spec', 'my-deviation'], { cwd: directory }).status, 0);
  assert.equal(runCli(['scope-discovery', '--spec', 'my-spec', 'my-scope'], { cwd: directory }).status, 0);
  assert.equal(runCli(['discovery', '--spec', 'my-spec', 'my-discovery'], { cwd: directory }).status, 0);

  // Re-recording an existing artifact link should be idempotent.
  assert.equal(runCli(['review', '--spec', 'my-spec', 'my-review-2'], { cwd: directory }).status, 0);
  assert.equal(runCli(['review', '--spec', 'my-spec', 'my-review-2'], { cwd: directory }).status, 1);

  const spec = readFileSync(specPath, 'utf8');
  for (const artifact of [
    '../contracts/my-api.md',
    '../reviews/my-review.md',
    '../blockers/my-blocker.md',
    '../deviations/my-deviation.md',
    '../scope-discoveries/my-scope.md',
    '../discoveries/my-discovery.md',
    '../reviews/my-review-2.md',
  ]) {
    assert.equal(spec.split(artifact).length - 1, 1, `${artifact} should appear exactly once`);
  }
  assert.match(spec, /## Related Artifacts/);
  assert.match(spec, /## Documentation Requirements\s+- No documentation changes required\./);
});

test('artifact backlinks use paths relative to the spec file, not the repo root', () => {
  const directory = tempDir();
  runCli(['init'], { cwd: directory });
  const specPath = join(directory, '.spec-guard', 'specs', 'my-spec.md');
  writeFileSync(specPath, readFileSync('test/fixtures/valid-spec.md', 'utf8'));

  runCli(['review', '--spec', 'my-spec', 'my-review'], { cwd: directory });

  const spec = readFileSync(specPath, 'utf8');
  // Link must be relative to .spec-guard/specs/ — ../reviews/my-review.md, not .spec-guard/reviews/my-review.md
  assert.match(spec, /\(\.\.\/reviews\/my-review\.md\)/);
  assert.doesNotMatch(spec, /\(\.spec-guard\/reviews\/my-review\.md\)/);
});

test('new api-contract creates end-user API doc in existing documentation location and records path', () => {
  const directory = tempDir();
  runCli(['init'], { cwd: directory });
  writeFileSync(join(directory, 'README.md'), '# Project\n\n## Table of Contents\n\n- [Guide](documentation/guide.md)\n');
  runCli(['new', 'api-contract', 'billing'], { cwd: directory });

  const contract = readFileSync(join(directory, '.spec-guard', 'contracts', 'billing.md'), 'utf8');
  assert.match(contract, /## End-User API Documentation/);
  assert.match(contract, /- Documentation Path: documentation\/billing-api\.md/);
  assert.equal(existsSync(join(directory, 'documentation', 'billing-api.md')), true);
  assert.match(readFileSync(join(directory, 'README.md'), 'utf8'), /\[Billing API\]\(documentation\/billing-api\.md\)/);
});

test('new rest-api-contract falls back to docs folder and avoids contract in API doc filename', () => {
  const directory = tempDir();
  const result = runCli(['new', 'rest-api-contract', 'orders-contract'], { cwd: directory });

  assert.equal(result.status, 0);
  const contract = readFileSync(join(directory, '.spec-guard', 'contracts', 'orders-contract.md'), 'utf8');
  assert.match(contract, /- Documentation Path: docs\/orders-api\.md/);
  assert.equal(existsSync(join(directory, 'docs', 'orders-api.md')), true);
  assert.equal(existsSync(join(directory, 'docs', 'orders-contract.md')), false);
});

test('new api-contract does not modify README table of contents when API doc is already linked', () => {
  const directory = tempDir();
  runCli(['init'], { cwd: directory });
  const readmePath = join(directory, 'README.md');
  const readme = '# Project\n\n## Table of Contents\n\n- [Billing API](docs/billing-api.md)\n';
  writeFileSync(readmePath, readme);
  runCli(['new', 'api-contract', 'billing'], { cwd: directory });

  assert.equal(readFileSync(readmePath, 'utf8'), readme);
});

test('new api-contract does not update README when README maintenance preference is opt-out', () => {
  const directory = tempDir();
  runCli(['init'], { cwd: directory });
  const readmePath = join(directory, 'README.md');
  const readme = '# Project\n\n## Table of Contents\n\n- [Guide](docs/guide.md)\n';
  writeFileSync(readmePath, readme);
  writeFileSync(join(directory, '.spec-guard', 'repo-preferences.json'), JSON.stringify({ readme: { maintain: false } }, null, 2));

  runCli(['new', 'api-contract', 'billing'], { cwd: directory });

  assert.equal(readFileSync(readmePath, 'utf8'), readme);
});

test('new brownfield-spec creates in .spec-guard/specs/', () => {
  const directory = tempDir();
  const result = runCli(['new', 'brownfield-spec', 'my-change'], { cwd: directory });

  assert.equal(result.status, 0);
  assert.match(readFileSync(join(directory, '.spec-guard', 'specs', 'my-change.md'), 'utf8'), /^# Spec/);
});

test('new rest-api-contract creates in .spec-guard/contracts/', () => {
  const directory = tempDir();
  const result = runCli(['new', 'rest-api-contract', 'my-api'], { cwd: directory });

  assert.equal(result.status, 0);
  assert.match(readFileSync(join(directory, '.spec-guard', 'contracts', 'my-api.md'), 'utf8'), /^# REST \/ Service API Contract/);
});

test('new component-contract creates in .spec-guard/contracts/', () => {
  const directory = tempDir();
  const result = runCli(['new', 'component-contract', 'my-component'], { cwd: directory });

  assert.equal(result.status, 0);
  assert.match(readFileSync(join(directory, '.spec-guard', 'contracts', 'my-component.md'), 'utf8'), /^# Reusable UI Component Contract/);
});

test('new one-off-ui creates in .spec-guard/specs/', () => {
  const directory = tempDir();
  const result = runCli(['new', 'one-off-ui', 'my-screen'], { cwd: directory });

  assert.equal(result.status, 0);
  assert.match(readFileSync(join(directory, '.spec-guard', 'specs', 'my-screen.md'), 'utf8'), /^# One-Off Application UI Spec/);
});

test('new operational-document creates in .spec-guard/specs/', () => {
  const directory = tempDir();
  const result = runCli(['new', 'operational-document', 'my-runbook'], { cwd: directory });

  assert.equal(result.status, 0);
  assert.match(readFileSync(join(directory, '.spec-guard', 'specs', 'my-runbook.md'), 'utf8'), /^# Operational \/ Document Deliverable/);
});

test('new task-plan creates in .spec-guard/specs/', () => {
  const directory = tempDir();
  const result = runCli(['new', 'task-plan', 'my-plan'], { cwd: directory });

  assert.equal(result.status, 0);
  assert.match(readFileSync(join(directory, '.spec-guard', 'specs', 'my-plan.md'), 'utf8'), /^# Task Plan/);
});

test('new compound-work creates in .spec-guard/specs/', () => {
  const directory = tempDir();
  const result = runCli(['new', 'compound-work', 'my-compound'], { cwd: directory });

  assert.equal(result.status, 0);
  assert.match(readFileSync(join(directory, '.spec-guard', 'specs', 'my-compound.md'), 'utf8'), /^# Compound Work Plan/);
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
  assert.match(result.stdout, /^Direct behavior with no new API or UI/);
});

test('classify includes test guidance in output', () => {
  const result = runCli(['classify', 'test/fixtures/valid-spec.md']);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Test guidance:/);
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

test('blocker --spec updates referenced spec status to Blocked', () => {
  const directory = tempDir();
  runCli(['init'], { cwd: directory });
  const specPath = join(directory, '.spec-guard', 'specs', 'my-spec.md');
  writeFileSync(specPath, readFileSync('test/fixtures/valid-spec.md', 'utf8'));

  const result = runCli(['blocker', '--spec', 'my-spec', 'auth-missing'], { cwd: directory });

  assert.equal(result.status, 0);
  assert.match(readFileSync(specPath, 'utf8'), /## Status\s+Blocked/);
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

// ─── gate-status ─────────────────────────────────────────────────────────────

test('gate-status prints gate pass/fail for a valid spec', () => {
  const result = runCli(['gate-status', 'test/fixtures/valid-spec.md']);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Gate 1/);
  assert.match(result.stdout, /Gate 2/);
  assert.match(result.stdout, /Gate 3/);
});

test('gate-status --json returns structured gate data', () => {
  const result = runCli(['gate-status', '--json', 'test/fixtures/valid-spec.md']);

  assert.equal(result.status, 0);
  const data = JSON.parse(result.stdout);
  assert.ok('gate1' in data);
  assert.ok('gate2' in data);
  assert.ok('gate3' in data);
  assert.ok('gate4' in data);
  assert.ok('gate5' in data);
  assert.ok('gate6' in data);
});

test('gate-status exits 2 with no args', () => {
  const result = runCli(['gate-status']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage: spec-guard gate-status/);
});

// ─── confirm-gate ─────────────────────────────────────────────────────────────

test('confirm-gate records gate 4 with evidence', () => {
  const directory = tempDir();
  runCli(['init'], { cwd: directory });
  const specPath = join(directory, '.spec-guard', 'specs', 'my-spec.md');
  writeFileSync(specPath, readFileSync('test/fixtures/valid-spec.md', 'utf8'));
  const result = runCli(
    ['confirm-gate', 'my-spec', '4', '--evidence=test auth.test.js fails: 401 not 403'],
    { cwd: directory },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Gate 4 confirmed/);
  const runFile = join(directory, '.spec-guard', 'runs', 'my-spec-run.json');
  const state = JSON.parse(readFileSync(runFile, 'utf8'));
  assert.ok(state.gatesPassed.includes('gate4'));
  assert.equal(state.failureFirstReason, 'test auth.test.js fails: 401 not 403');
});

test('confirm-gate 4 updates spec status to Ready', () => {
  const directory = tempDir();
  runCli(['init'], { cwd: directory });
  const specPath = join(directory, '.spec-guard', 'specs', 'my-spec.md');
  writeFileSync(specPath, readFileSync('test/fixtures/valid-spec.md', 'utf8'));

  const result = runCli(['confirm-gate', 'my-spec', '4', '--evidence=test fails before implementation'], { cwd: directory });

  assert.equal(result.status, 0);
  assert.match(readFileSync(specPath, 'utf8'), /## Status\s+Ready/);
});

test('confirm-gate 6 updates spec status to Implemented and gate-status reports it', () => {
  const directory = tempDir();
  runCli(['init'], { cwd: directory });
  const specPath = join(directory, '.spec-guard', 'specs', 'my-spec.md');
  writeFileSync(specPath, readFileSync('test/fixtures/valid-spec.md', 'utf8'));

  const result = runCli(['confirm-gate', 'my-spec', '6'], { cwd: directory });
  const status = runCli(['gate-status', '--json', 'my-spec'], { cwd: directory });

  assert.equal(result.status, 0);
  assert.match(readFileSync(specPath, 'utf8'), /## Status\s+Implemented/);
  assert.equal(JSON.parse(status.stdout).status, 'Implemented');
});

test('confirm-gate exits 2 when gate 4 confirmed without evidence', () => {
  const directory = tempDir();
  runCli(['init'], { cwd: directory });
  const specPath = join(directory, '.spec-guard', 'specs', 'my-spec.md');
  writeFileSync(specPath, readFileSync('test/fixtures/valid-spec.md', 'utf8'));
  const result = runCli(['confirm-gate', 'my-spec', '4'], { cwd: directory });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /evidence/);
});

test('confirm-gate exits 2 with no args', () => {
  const result = runCli(['confirm-gate']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage: spec-guard confirm-gate/);
});

// ─── next ─────────────────────────────────────────────────────────────────────

test('next prints the current next step for a valid spec', () => {
  const result = runCli(['next', 'test/fixtures/valid-spec.md']);

  // gate1 passes but no gates confirmed yet — should say fix_spec or confirm_gate1
  assert.ok(result.status === 0 || result.status === 1);
  assert.match(result.stdout, /Next:/);
});

test('next --json returns structured result', () => {
  const result = runCli(['next', '--json', 'test/fixtures/valid-spec.md']);

  assert.ok(result.status === 0 || result.status === 1);
  const data = JSON.parse(result.stdout);
  assert.ok('next_action' in data);
  assert.ok('instruction' in data);
  assert.ok('gate_target' in data);
});

test('next exits 2 with no args', () => {
  const result = runCli(['next']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage: spec-guard next/);
});

// ─── draft ───────────────────────────────────────────────────────────────────

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

test('draft --from-json creates spec file from JSON input', () => {
  const directory = tempDir();
  runCli(['init'], { cwd: directory });
  const jsonPath = join(directory, 'answers.json');
  writeFileSync(jsonPath, JSON.stringify({
    title: 'Login Feature',
    problem: 'Users cannot authenticate',
    in_scope: ['Login form', 'JWT issuance'],
    out_of_scope: ['OAuth', 'SSO'],
    users: ['End user'],
    expected_behavior: 'User submits credentials and receives a token',
    acceptance_criteria: ['Valid credentials return 200 with token', 'Invalid credentials return 401'],
    open_questions: [],
    classification: 'Reusable non-UI API',
  }));
  const result = runCli(['draft', '--from-json', jsonPath, 'login-feature'], { cwd: directory });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(directory, '.spec-guard', 'specs', 'login-feature.md')));
});

test('draft --from-json with stdin (-) creates spec file', () => {
  const directory = tempDir();
  runCli(['init'], { cwd: directory });
  const json = JSON.stringify({
    title: 'Signup',
    problem: 'No signup flow',
    in_scope: ['Email signup'],
    out_of_scope: ['OAuth'],
    users: [],
    expected_behavior: 'User can register',
    acceptance_criteria: ['POST /signup returns 201'],
    open_questions: [],
    classification: 'REST/service API',
  });
  const result = spawnSync(process.execPath, [cli, 'draft', '--from-json', '-', 'signup'], {
    cwd: directory,
    input: json,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(directory, '.spec-guard', 'specs', 'signup.md')));
});

// ─── interview-questions ──────────────────────────────────────────────────────

test('interview-questions prints question list', () => {
  const result = runCli(['interview-questions']);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.length > 0);
});

test('interview-questions --json returns parseable JSON with pre_classification and universal_optional', () => {
  const result = runCli(['interview-questions', '--json']);
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.ok(Array.isArray(parsed.pre_classification), 'should have pre_classification array');
  assert.ok(Array.isArray(parsed.universal_optional), 'should have universal_optional array');
});

// ─── analyze --dry-run ────────────────────────────────────────────────────────

test('analyze --dry-run exits 0 even when contract warnings are present', () => {
  const directory = tempDir();
  runCli(['init'], { cwd: directory });
  const specPath = join(directory, '.spec-guard', 'specs', 'my-spec.md');
  const contractPath = join(directory, '.spec-guard', 'contracts', 'my-contract.md');
  writeFileSync(specPath, readFileSync('test/fixtures/valid-spec.md', 'utf8'));
  writeFileSync(contractPath, '# Contract\n\n<!-- blank template -->\n');

  const result = runCli(['analyze', 'my-spec', '--contract', contractPath, '--dry-run'], { cwd: directory });
  assert.equal(result.status, 0, `expected exit 0 but got ${result.status}:\n${result.stdout}\n${result.stderr}`);
});

test('analyze --dry-run output is labeled as pre-implementation check', () => {
  const directory = tempDir();
  runCli(['init'], { cwd: directory });
  const specPath = join(directory, '.spec-guard', 'specs', 'my-spec.md');
  writeFileSync(specPath, readFileSync('test/fixtures/valid-spec.md', 'utf8'));

  const result = runCli(['analyze', 'my-spec', '--dry-run'], { cwd: directory });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /pre-implementation|dry.run/i);
});
