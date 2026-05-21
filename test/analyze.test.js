import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeArtifacts } from '../src/analyze.js';

function tmp() { return mkdtempSync(join(tmpdir(), 'sg-analyze-')); }

const VALID_SPEC = `# Spec

## Title

User Login

## Status

Draft

## Problem / Goal

Users cannot authenticate.

## In Scope

- Login form with email and password

## Out of Scope

- Password reset

## Expected Behavior

User submits credentials and is redirected to the dashboard.

## Acceptance Criteria

- [ ] Login form renders email and password fields
- [ ] Invalid credentials show an error message
- [ ] Valid credentials redirect to dashboard

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [x] Direct behavior with no new API or UI
- [ ] Operational/document deliverable

## Required Tests / Checks

- form renders email and password fields
- shows error when credentials are invalid
- redirects on successful login
`;

const COMPLETE_REVIEW = `# Implementation Review

## Linked Spec

specs/login.md

## Linked Contract

## Classification

Direct behavior with no new API or UI

## Implementation Files

- src/auth/login.js

## Test Files

- test/auth/login.test.js

## Summary of Change

- Added login form with email and password fields

## Tests Written First

- form renders email and password fields
- shows error when credentials are invalid
- redirects on successful login

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.
- [ ] If not run, the concrete reason is recorded here:

## Behavior / Contract Validated

- [x] Login form renders email and password fields
- [x] Invalid credentials show an error message
- [x] Valid credentials redirect to dashboard

## Linked Documentation

-

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All docs listed in Linked Documentation above updated, or confirmed not applicable.
- [ ] No documentation update was needed.
- [ ] Durable contract documentation was updated.
- [ ] The document itself was the deliverable.

## Remaining Risks / Follow-Ups

- None
`;

// ─── spec not found ────────────────────────────────────────────────────────────

test('analyzeArtifacts — returns error when spec not found', async () => {
  const result = await analyzeArtifacts({ specPath: '/nonexistent/spec.md' });
  assert.ok(result.error);
  assert.deepEqual(result.diagnostics, []);
});

// ─── no artifacts to check ────────────────────────────────────────────────────

test('analyzeArtifacts — clean when no contract or review given', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  writeFileSync(specPath, VALID_SPEC);

  const result = await analyzeArtifacts({ specPath });
  assert.equal(result.error, undefined);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.clean, true);
});

// ─── contract alignment ───────────────────────────────────────────────────────

test('analyzeArtifacts — BLOCKER when contract path given but file missing', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  writeFileSync(specPath, VALID_SPEC);

  const result = await analyzeArtifacts({ specPath, contractPath: '/no/such/contract.md' });
  const blockers = result.diagnostics.filter(d => d.severity === 'BLOCKER');
  assert.ok(blockers.length > 0);
  assert.equal(blockers[0].ruleId, 'SG-ALIGN-003');
});

test('analyzeArtifacts — WARNING when contract is blank template', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const contractPath = join(dir, 'contract.md');
  writeFileSync(specPath, VALID_SPEC);
  writeFileSync(contractPath, '# API Contract\n\n<!-- fill in -->\n');

  const result = await analyzeArtifacts({ specPath, contractPath });
  const warns = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-003');
  assert.ok(warns.length > 0);
});

test('analyzeArtifacts — WARNING when REST API contract has no routes', async () => {
  const dir = tmp();
  const restSpec = VALID_SPEC.replace(
    '- [x] Direct behavior with no new API or UI',
    '- [x] REST/service API\n- [ ] Direct behavior with no new API or UI'
  ).replace('- [x] Direct behavior with no new API or UI\n- [ ] Operational', '- [ ] Direct behavior with no new API or UI\n- [ ] Operational');
  // Build a simple REST spec
  const specContent = VALID_SPEC
    .replace('- [x] Direct behavior with no new API or UI', '- [ ] Direct behavior with no new API or UI')
    .replace('- [ ] REST/service API', '- [x] REST/service API');
  const specPath = join(dir, 'spec.md');
  const contractPath = join(dir, 'contract.md');
  writeFileSync(specPath, specContent);
  writeFileSync(contractPath, '# REST API Contract\n\n## Overview\n\nThis contract defines the authentication API for mobile and web clients.\n\n## Authentication\n\nAll endpoints require a Bearer token in the Authorization header.\n\n## Error Format\n\nErrors are returned as JSON with a message field.\n');

  const result = await analyzeArtifacts({ specPath, contractPath });
  const warns = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-003');
  assert.ok(warns.length > 0);
  assert.ok(warns[0].message.includes('routes') || warns[0].message.includes('endpoint'));
});

test('analyzeArtifacts — clean contract when REST API contract has endpoints', async () => {
  const dir = tmp();
  const specContent = VALID_SPEC
    .replace('- [x] Direct behavior with no new API or UI', '- [ ] Direct behavior with no new API or UI')
    .replace('- [ ] REST/service API', '- [x] REST/service API');
  const specPath = join(dir, 'spec.md');
  const contractPath = join(dir, 'contract.md');
  writeFileSync(specPath, specContent);
  writeFileSync(contractPath, '# REST API Contract\n\n## End-User API Documentation\n\n- Documentation Path: docs/auth-api.md\n\n## Routes\n\n### POST /auth/login\n\nReturns a session token on success.\n\n### DELETE /auth/logout\n\nRevokes the current session.\n');
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'auth-api.md'), '# Auth API');

  const result = await analyzeArtifacts({ specPath, contractPath });
  const contractErrors = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-003');
  assert.equal(contractErrors.length, 0);
});

test('analyzeArtifacts — BLOCKER when API contract has no persisted end-user API doc path', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const contractPath = join(dir, 'contract.md');
  writeFileSync(specPath, VALID_SPEC);
  writeFileSync(contractPath, '# API Contract\n\n## Exported Surface\n\n- login()\n');

  const result = await analyzeArtifacts({ specPath, contractPath });
  const blockers = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-008');
  assert.equal(blockers.length, 1);
  assert.match(blockers[0].message, /end-user API doc/i);
});

test('analyzeArtifacts — BLOCKER when persisted end-user API doc path does not exist', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const contractPath = join(dir, 'contract.md');
  writeFileSync(specPath, VALID_SPEC);
  writeFileSync(contractPath, '# API Contract\n\n## End-User API Documentation\n\n- Documentation Path: docs/auth-api.md\n\n## Exported Surface\n\n- login()\n');

  const result = await analyzeArtifacts({ specPath, contractPath });
  const blockers = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-008');
  assert.equal(blockers.length, 1);
  assert.match(blockers[0].message, /docs\/auth-api\.md/);
});

test('analyzeArtifacts — clean when persisted end-user API doc path exists', async () => {
  const dir = tmp();
  mkdirSync(join(dir, 'docs'), { recursive: true });
  const specPath = join(dir, 'spec.md');
  const contractPath = join(dir, 'contract.md');
  writeFileSync(specPath, VALID_SPEC);
  writeFileSync(contractPath, '# API Contract\n\n## End-User API Documentation\n\n- Documentation Path: docs/auth-api.md\n\n## Exported Surface\n\n- login()\n');
  writeFileSync(join(dir, 'docs', 'auth-api.md'), '# Auth API\n');

  const result = await analyzeArtifacts({ specPath, contractPath });
  const blockers = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-008');
  assert.equal(blockers.length, 0);
});

// ─── documentation requirements alignment ─────────────────────────────────────

test('analyzeArtifacts — SG-ALIGN-009 when spec documentation requirement is missing from review linked docs', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const reviewPath = join(dir, 'review.md');
  writeFileSync(specPath, `${VALID_SPEC}\n## Documentation Requirements\n\n- [API Guide](docs/api.md)\n`);
  writeFileSync(reviewPath, COMPLETE_REVIEW);

  const result = await analyzeArtifacts({ specPath, reviewPath });
  const diags = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-009');
  assert.equal(diags.length, 1);
  assert.match(diags[0].message, /docs\/api\.md/);
});

test('analyzeArtifacts — clean documentation requirements when spec and review linked docs match', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const reviewPath = join(dir, 'review.md');
  writeFileSync(specPath, `${VALID_SPEC}\n## Documentation Requirements\n\n- [API Guide](docs/api.md)\n`);
  writeFileSync(reviewPath, COMPLETE_REVIEW.replace('## Linked Documentation\n\n-', '## Linked Documentation\n\n- [API Guide](docs/api.md)'));

  const result = await analyzeArtifacts({ specPath, reviewPath });
  const diags = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-009');
  assert.equal(diags.length, 0);
});

test('analyzeArtifacts — SG-ALIGN-009 when review linked doc is not directly linked from spec documentation requirements', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const reviewPath = join(dir, 'review.md');
  writeFileSync(specPath, `${VALID_SPEC}\n## Documentation Requirements\n\n- No documentation changes are required.\n`);
  writeFileSync(reviewPath, COMPLETE_REVIEW.replace('## Linked Documentation\n\n-', '## Linked Documentation\n\n- docs/api.md'));

  const result = await analyzeArtifacts({ specPath, reviewPath });
  const diags = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-009');
  assert.equal(diags.length, 1);
  assert.match(diags[0].message, /not directly linked from the spec/i);
});

// ─── review alignment ──────────────────────────────────────────────────────────

test('analyzeArtifacts — clean when review covers all criteria and tests', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const reviewPath = join(dir, 'review.md');
  writeFileSync(specPath, VALID_SPEC);
  writeFileSync(reviewPath, COMPLETE_REVIEW);

  const result = await analyzeArtifacts({ specPath, reviewPath });
  const alignDiags = result.diagnostics.filter(d => ['SG-ALIGN-001', 'SG-ALIGN-002'].includes(d.ruleId));
  assert.equal(alignDiags.length, 0, `Unexpected alignment issues: ${alignDiags.map(d => d.message).join(', ')}`);
});

test('analyzeArtifacts — SG-ALIGN-001 when acceptance criterion missing from review', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const reviewPath = join(dir, 'review.md');
  writeFileSync(specPath, VALID_SPEC);
  // Review missing the "redirects to dashboard" criterion
  writeFileSync(reviewPath, COMPLETE_REVIEW.replace('- [x] Valid credentials redirect to dashboard\n', ''));

  const result = await analyzeArtifacts({ specPath, reviewPath });
  const missing = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-001');
  assert.ok(missing.length > 0);
  assert.ok(missing.some(d => d.message.includes('redirect')));
});

test('analyzeArtifacts — SG-ALIGN-002 when required test missing from review', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const reviewPath = join(dir, 'review.md');
  writeFileSync(specPath, VALID_SPEC);
  writeFileSync(reviewPath, COMPLETE_REVIEW.replace('- redirects on successful login\n', ''));

  const result = await analyzeArtifacts({ specPath, reviewPath });
  const missing = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-002');
  assert.ok(missing.length > 0);
});

test('analyzeArtifacts — SG-ALIGN-004 when review has unchecked boxes', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const reviewPath = join(dir, 'review.md');
  writeFileSync(specPath, VALID_SPEC);
  // Replace one [x] with [ ] to create an unchecked item
  writeFileSync(reviewPath, COMPLETE_REVIEW.replace('- [x] No out-of-scope work', '- [ ] No out-of-scope work'));

  const result = await analyzeArtifacts({ specPath, reviewPath });
  const unchecked = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-004');
  assert.ok(unchecked.length > 0);
  assert.ok(unchecked[0].message.includes('unchecked'));
});

test('analyzeArtifacts — SG-ALIGN-005 when Implementation Files section is blank', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const reviewPath = join(dir, 'review.md');
  writeFileSync(specPath, VALID_SPEC);
  writeFileSync(reviewPath, COMPLETE_REVIEW.replace('- src/auth/login.js', '-'));

  const result = await analyzeArtifacts({ specPath, reviewPath });
  const diags = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-005');
  assert.ok(diags.length > 0);
  assert.ok(diags[0].message.includes('Implementation Files'));
});

test('analyzeArtifacts — SG-ALIGN-006 when Test Files section is blank', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const reviewPath = join(dir, 'review.md');
  writeFileSync(specPath, VALID_SPEC);
  writeFileSync(reviewPath, COMPLETE_REVIEW.replace('- test/auth/login.test.js', '-'));

  const result = await analyzeArtifacts({ specPath, reviewPath });
  const diags = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-006');
  assert.ok(diags.length > 0);
  assert.ok(diags[0].message.includes('Test Files'));
});

test('analyzeArtifacts — no SG-ALIGN-005 or SG-ALIGN-006 for Operational/document deliverable', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const reviewPath = join(dir, 'review.md');
  const opSpec = VALID_SPEC
    .replace('- [x] Direct behavior with no new API or UI', '- [ ] Direct behavior with no new API or UI')
    .replace('- [ ] Operational/document deliverable', '- [x] Operational/document deliverable');
  writeFileSync(specPath, opSpec);
  writeFileSync(reviewPath, COMPLETE_REVIEW.replace('- src/auth/login.js', '-').replace('- test/auth/login.test.js', '-'));

  const result = await analyzeArtifacts({ specPath, reviewPath });
  const diags = result.diagnostics.filter(d => ['SG-ALIGN-005', 'SG-ALIGN-006'].includes(d.ruleId));
  assert.equal(diags.length, 0);
});

test('analyzeArtifacts — INFO when review file does not exist yet', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  writeFileSync(specPath, VALID_SPEC);

  const result = await analyzeArtifacts({ specPath, reviewPath: join(dir, 'no-review.md') });
  const infos = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-002' && d.severity === 'INFO');
  assert.ok(infos.length > 0);
});

// ─── SG-ALIGN-007 ─────────────────────────────────────────────────────────────

const UI_SPEC = VALID_SPEC
  .replace('- [x] Direct behavior with no new API or UI', '- [ ] Direct behavior with no new API or UI')
  .replace('- [ ] One-off application UI', '- [x] One-off application UI');

const DEP_TABLE_POPULATED =
  '\n## Dependency Integration\n\n' +
  '| Dependency | Integration code | Test |\n' +
  '|------------|-----------------|------|\n' +
  '| Todo API   | vite.config.js:server.proxy | todo.spec.js POST /api/todos → 200 |\n\n' +
  '- [x] Each dependency above is exercised through the real integration code and returns expected status codes (not 404).\n';

const DEP_TABLE_PLACEHOLDER =
  '\n## Dependency Integration\n\n' +
  '| Dependency | Integration code | Test |\n' +
  '|------------|-----------------|------|\n' +
  '| -          | -               | -    |\n\n' +
  '- [x] Each dependency above is exercised through the real integration code and returns expected status codes (not 404).\n';

const DEP_TABLE_UNCHECKED =
  '\n## Dependency Integration\n\n' +
  '| Dependency | Integration code | Test |\n' +
  '|------------|-----------------|------|\n' +
  '| Todo API   | vite.config.js:server.proxy | todo.spec.js POST /api/todos → 200 |\n\n' +
  '- [ ] Each dependency above is exercised through the real integration code and returns expected status codes (not 404).\n';

const CONTRACT = 'GET /todos\nPOST /todos\n## Routes\n- GET /todos returns list';

test('analyzeArtifacts — SG-ALIGN-007 BLOCKER when Dependency Integration section missing', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const contractPath = join(dir, 'contract.md');
  const reviewPath = join(dir, 'review.md');
  writeFileSync(specPath, UI_SPEC);
  writeFileSync(contractPath, CONTRACT);
  writeFileSync(reviewPath, COMPLETE_REVIEW);

  const result = await analyzeArtifacts({ specPath, contractPath, reviewPath });
  const diags = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-007');
  assert.ok(diags.length > 0, 'should emit SG-ALIGN-007 when section missing');
  assert.equal(diags[0].severity, 'BLOCKER');
});

test('analyzeArtifacts — SG-ALIGN-007 BLOCKER when Dependency Integration table has only placeholder rows', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const contractPath = join(dir, 'contract.md');
  const reviewPath = join(dir, 'review.md');
  writeFileSync(specPath, UI_SPEC);
  writeFileSync(contractPath, CONTRACT);
  writeFileSync(reviewPath, COMPLETE_REVIEW + DEP_TABLE_PLACEHOLDER);

  const result = await analyzeArtifacts({ specPath, contractPath, reviewPath });
  const diags = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-007');
  assert.ok(diags.length > 0, 'should emit SG-ALIGN-007 when table unpopulated');
  assert.equal(diags[0].severity, 'BLOCKER');
});

test('analyzeArtifacts — SG-ALIGN-007 BLOCKER when table populated but checkbox unchecked', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const contractPath = join(dir, 'contract.md');
  const reviewPath = join(dir, 'review.md');
  writeFileSync(specPath, UI_SPEC);
  writeFileSync(contractPath, CONTRACT);
  writeFileSync(reviewPath, COMPLETE_REVIEW + DEP_TABLE_UNCHECKED);

  const result = await analyzeArtifacts({ specPath, contractPath, reviewPath });
  const diags = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-007');
  assert.ok(diags.length > 0, 'should emit SG-ALIGN-007 when checkbox unchecked');
  assert.equal(diags[0].severity, 'BLOCKER');
});

test('analyzeArtifacts — no SG-ALIGN-007 when table populated and checkbox checked', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const contractPath = join(dir, 'contract.md');
  const reviewPath = join(dir, 'review.md');
  writeFileSync(specPath, UI_SPEC);
  writeFileSync(contractPath, CONTRACT);
  writeFileSync(reviewPath, COMPLETE_REVIEW + DEP_TABLE_POPULATED);

  const result = await analyzeArtifacts({ specPath, contractPath, reviewPath });
  const diags = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-007');
  assert.equal(diags.length, 0, 'should not emit SG-ALIGN-007 when fully populated and confirmed');
});

test('analyzeArtifacts — no SG-ALIGN-007 when One-off UI with no contract', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const reviewPath = join(dir, 'review.md');
  writeFileSync(specPath, UI_SPEC);
  writeFileSync(reviewPath, COMPLETE_REVIEW);

  const result = await analyzeArtifacts({ specPath, reviewPath });
  const diags = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-007');
  assert.equal(diags.length, 0, 'should not emit SG-ALIGN-007 when no contract involved');
});

// ─── stale gate detection ─────────────────────────────────────────────────────

test('analyzeArtifacts — SG-STALE-001 when spec modified after gate confirmation', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const runStatePath = join(dir, 'run.json');
  writeFileSync(specPath, VALID_SPEC);
  writeFileSync(runStatePath, JSON.stringify({
    gatesPassed: ['gate1', 'gate2', 'gate3', 'gate4', 'gate5'],
    specModifiedAt: 0, // epoch — any real file will be newer
  }));

  const result = await analyzeArtifacts({ specPath, runStatePath });
  const stale = result.diagnostics.filter(d => d.ruleId === 'SG-STALE-001');
  assert.ok(stale.length > 0, 'Expected SG-STALE-001 diagnostic');
  assert.equal(stale[0].severity, 'WARNING');
  assert.ok(stale[0].message.includes('gate'));
});

test('analyzeArtifacts — no SG-STALE-001 when spec not modified since gate confirmation', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  const runStatePath = join(dir, 'run.json');
  writeFileSync(specPath, VALID_SPEC);
  writeFileSync(runStatePath, JSON.stringify({
    gatesPassed: ['gate1', 'gate2'],
    specModifiedAt: Date.now() + 100_000, // far future — spec is "older"
  }));

  const result = await analyzeArtifacts({ specPath, runStatePath });
  const stale = result.diagnostics.filter(d => d.ruleId === 'SG-STALE-001');
  assert.equal(stale.length, 0);
});

test('analyzeArtifacts — no SG-STALE-001 when no run state exists', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  writeFileSync(specPath, VALID_SPEC);

  const result = await analyzeArtifacts({ specPath, runStatePath: join(dir, 'no-run.json') });
  const stale = result.diagnostics.filter(d => d.ruleId === 'SG-STALE-001');
  assert.equal(stale.length, 0);
});

// ─── metadata ─────────────────────────────────────────────────────────────────

test('analyzeArtifacts — returns title and classification', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  writeFileSync(specPath, VALID_SPEC);

  const result = await analyzeArtifacts({ specPath });
  assert.equal(result.title, 'User Login');
  assert.equal(result.classification, 'Direct behavior with no new API or UI');
  assert.equal(result.criteriaCount, 3);
  assert.equal(result.testsCount, 3);
});
