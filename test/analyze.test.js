import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
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

## Classification

Direct behavior with no new API or UI

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

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] No documentation update was needed.
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
  writeFileSync(contractPath, '# REST API Contract\n\n## Routes\n\n### POST /auth/login\n\nReturns a session token on success.\n\n### DELETE /auth/logout\n\nRevokes the current session.\n');

  const result = await analyzeArtifacts({ specPath, contractPath });
  const contractErrors = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-003');
  assert.equal(contractErrors.length, 0);
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

test('analyzeArtifacts — INFO when review file does not exist yet', async () => {
  const dir = tmp();
  const specPath = join(dir, 'spec.md');
  writeFileSync(specPath, VALID_SPEC);

  const result = await analyzeArtifacts({ specPath, reviewPath: join(dir, 'no-review.md') });
  const infos = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-002' && d.severity === 'INFO');
  assert.ok(infos.length > 0);
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
