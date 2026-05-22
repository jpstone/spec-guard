import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeArtifacts } from '../src/analyze.js';

// Place spec and review under .spec-guard/specs/ and .spec-guard/reviews/ so
// inferRepoRootFromSpecPath can locate the repo root from the file path.
function tmpSpecGuardDir() {
  const base = mkdtempSync(join(tmpdir(), 'sg-doclinks-'));
  const specDir = join(base, '.spec-guard', 'specs');
  const reviewDir = join(base, '.spec-guard', 'reviews');
  mkdirSync(specDir, { recursive: true });
  mkdirSync(reviewDir, { recursive: true });
  return { base, specDir, reviewDir };
}

const VALID_SPEC = `# Spec

## Title

Link Path Test

## Status

Draft

## Problem / Goal

Test spec for doc link path resolution.

## In Scope

- Verifies file-relative link resolution

## Out of Scope

- Nothing

## Expected Behavior

Works correctly.

## Acceptance Criteria

- [ ] Something works

## Work Classification

- [x] Direct behavior with no new API or UI

`;

const COMPLETE_REVIEW = `# Implementation Review

## Linked Spec

specs/link-path-test.md

## Linked Contract

## Classification

Direct behavior with no new API or UI

## Implementation Files

- src/something.js

## Test Files

- test/something.test.js

## Summary of Change

- Fixed something

## Tests Written First

- Something works

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.

## Behavior / Contract Validated

- [x] Something works

## Linked Documentation

-

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All docs listed in Linked Documentation above updated, or confirmed not applicable.

## Remaining Risks / Follow-Ups

- None
`;

// ─── file-relative path resolution ───────────────────────────────────────────

test('SG-ALIGN-009 does not fire when spec uses file-relative Documentation Requirements path and review uses repo-root-relative Linked Documentation path', async () => {
  const { specDir, reviewDir } = tmpSpecGuardDir();
  const specPath = join(specDir, 'foo.md');
  const reviewPath = join(reviewDir, 'foo.md');

  // Spec links to ../../docs/api.md (file-relative from .spec-guard/specs/)
  // Review links to docs/api.md (repo-root-relative)
  // Both should normalize to docs/api.md → match → no SG-ALIGN-009
  writeFileSync(specPath, `${VALID_SPEC}\n## Documentation Requirements\n\n- [API Guide](../../docs/api.md)\n`);
  writeFileSync(reviewPath, COMPLETE_REVIEW.replace('## Linked Documentation\n\n-', '## Linked Documentation\n\n- [API Guide](docs/api.md)'));

  const result = await analyzeArtifacts({ specPath, reviewPath });
  const diags = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-009');
  assert.equal(diags.length, 0, `expected no SG-ALIGN-009 but got: ${diags.map(d => d.message).join('; ')}`);
});

test('SG-ALIGN-009 does not fire when spec uses repo-root-relative Documentation Requirements path and review uses file-relative Linked Documentation path', async () => {
  const { specDir, reviewDir } = tmpSpecGuardDir();
  const specPath = join(specDir, 'foo.md');
  const reviewPath = join(reviewDir, 'foo.md');

  // Spec links to docs/api.md (repo-root-relative)
  // Review links to ../../docs/api.md (file-relative from .spec-guard/reviews/)
  // Both should normalize to docs/api.md → match → no SG-ALIGN-009
  writeFileSync(specPath, `${VALID_SPEC}\n## Documentation Requirements\n\n- [API Guide](docs/api.md)\n`);
  writeFileSync(reviewPath, COMPLETE_REVIEW.replace('## Linked Documentation\n\n-', '## Linked Documentation\n\n- [API Guide](../../docs/api.md)'));

  const result = await analyzeArtifacts({ specPath, reviewPath });
  const diags = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-009');
  assert.equal(diags.length, 0, `expected no SG-ALIGN-009 but got: ${diags.map(d => d.message).join('; ')}`);
});

test('SG-ALIGN-009 fires when spec has two file-relative Documentation Requirements paths but review only links one', async () => {
  const { specDir, reviewDir } = tmpSpecGuardDir();
  const specPath = join(specDir, 'foo.md');
  const reviewPath = join(reviewDir, 'foo.md');

  // Spec links to ../../docs/api.md AND ../../docs/guide.md
  // Review only links to ../../docs/api.md
  // After normalization: spec has [docs/api.md, docs/guide.md], review has [docs/api.md]
  // → SG-ALIGN-009 must fire for docs/guide.md missing from review
  writeFileSync(specPath, `${VALID_SPEC}\n## Documentation Requirements\n\n- [API Guide](../../docs/api.md)\n- [User Guide](../../docs/guide.md)\n`);
  writeFileSync(reviewPath, COMPLETE_REVIEW.replace('## Linked Documentation\n\n-', '## Linked Documentation\n\n- [API Guide](../../docs/api.md)'));

  const result = await analyzeArtifacts({ specPath, reviewPath });
  const diags = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-009');
  assert.equal(diags.length, 1, `expected 1 SG-ALIGN-009 but got ${diags.length}: ${diags.map(d => d.message).join('; ')}`);
  assert.match(diags[0].message, /docs\/guide\.md/);
});

test('SG-ALIGN-009 silently skips file-relative path that resolves outside the repo root', async () => {
  const { specDir, reviewDir } = tmpSpecGuardDir();
  const specPath = join(specDir, 'foo.md');
  const reviewPath = join(reviewDir, 'foo.md');

  // ../../../../outside.md resolves above the repo root — should be silently skipped
  writeFileSync(specPath, `${VALID_SPEC}\n## Documentation Requirements\n\n- [Outside](../../../../outside.md)\n`);
  writeFileSync(reviewPath, COMPLETE_REVIEW);

  const result = await analyzeArtifacts({ specPath, reviewPath });
  const diags = result.diagnostics.filter(d => d.ruleId === 'SG-ALIGN-009');
  assert.equal(diags.length, 0, `path outside repo root should be skipped, got: ${diags.map(d => d.message).join('; ')}`);
});
