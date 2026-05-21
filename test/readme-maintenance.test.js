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

test('ensureReadmePreference persists opt-in and maintainReadme creates concise README with useful doc links', async () => {
  const directory = tempDir();

  await ensureReadmePreference({ root: directory, ask: async () => true });
  const result = await maintainReadme({
    root: directory,
    title: 'Billing Service',
    purpose: 'Handles invoices and customer billing operations.',
    docLinks: ['docs/billing-api.md'],
  });

  const readme = readFileSync(join(directory, 'README.md'), 'utf8');
  assert.equal(result.updated, true);
  assert.match(readme, /^# Billing Service/m);
  assert.match(readme, /Handles invoices and customer billing operations\./);
  assert.match(readme, /\[Billing API\]\(docs\/billing-api\.md\)/);
  assert.ok(readme.length < 1200, 'README should stay concise and at-a-glance');
});

test('maintainReadme does not create or update README when preference is opt-out', async () => {
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

  assert.equal(result.updated, false);
  assert.equal(readFileSync(join(directory, 'README.md'), 'utf8'), existing);
});

test('readReadmePreference returns persisted repo-scoped preference', async () => {
  const directory = tempDir();
  await ensureReadmePreference({ root: directory, ask: async () => true });

  const preference = await readReadmePreference({ root: directory });

  assert.equal(preference.maintainReadme, true);
});
