import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ensureReadmePreference,
  maintainReadme,
  readReadmePreference,
  README_PREFERENCE_PATH,
} from '../src/readme-maintenance.js';

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'sg-readme-'));
}

test('ensureReadmePreference asks once when no README and persists opt-out', async () => {
  const directory = tempDir();
  let asked = 0;

  const first = await ensureReadmePreference({
    root: directory,
    ask: async () => {
      asked += 1;
      return false;
    },
  });
  const second = await ensureReadmePreference({
    root: directory,
    ask: async () => {
      asked += 1;
      return true;
    },
  });

  assert.equal(first.maintainReadme, false);
  assert.equal(second.maintainReadme, false);
  assert.equal(asked, 1);
  assert.equal(existsSync(join(directory, README_PREFERENCE_PATH)), true);
  assert.equal(existsSync(join(directory, 'README.md')), false);
});

test('maintainReadme returns updated: false when no README exists (no longer creates)', async () => {
  const directory = tempDir();
  const result = await maintainReadme({
    root: directory,
    title: 'Billing Service',
    purpose: 'Handles invoices and customer billing operations.',
    docLinks: ['docs/billing-api.md'],
  });

  assert.equal(result.updated, false, 'should not create README — only init does that now');
  assert.equal(existsSync(join(directory, 'README.md')), false, 'README.md should not be created');
});

test('maintainReadme updates existing README with doc links when README is present', async () => {
  const directory = tempDir();
  writeFileSync(join(directory, 'README.md'), '# My Project\n\n## Overview\n\nSome content.\n');
  const result = await maintainReadme({
    root: directory,
    title: 'My Project',
    purpose: 'Does things.',
    docLinks: ['docs/billing-api.md'],
  });

  const readme = readFileSync(join(directory, 'README.md'), 'utf8');
  assert.equal(result.updated, true);
  assert.match(readme, /\[Billing Api\]\(docs\/billing-api\.md\)/i);
});

test('maintainReadme updates README regardless of old repo-preferences opt-out (preference no longer consulted)', async () => {
  const directory = tempDir();
  mkdirSync(join(directory, '.spec-guard'), { recursive: true });
  writeFileSync(join(directory, README_PREFERENCE_PATH), JSON.stringify({ readme: { maintain: false } }, null, 2));
  const existing = '# Existing\n\nDo not change me.\n';
  writeFileSync(join(directory, 'README.md'), existing);

  const result = await maintainReadme({
    root: directory,
    title: 'New Title',
    purpose: 'New purpose.',
    docLinks: ['docs/new-api.md'],
  });

  // maintainReadme no longer checks preferences — it updates if README exists
  assert.equal(result.updated, true, 'should update README regardless of old preference');
  assert.ok(readFileSync(join(directory, 'README.md'), 'utf8').includes('docs/new-api.md'),
    'doc link should be added to README');
});

test('readReadmePreference returns persisted repo-scoped preference', async () => {
  const directory = tempDir();
  await ensureReadmePreference({ root: directory, ask: async () => true });

  const preference = await readReadmePreference({ root: directory });

  assert.equal(preference.maintainReadme, true);
});
