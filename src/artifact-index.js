/**
 * artifact-index — regenerates .spec-guard/README.md from current disk state.
 *
 * Called by every command that writes a .spec-guard artifact so the index
 * always reflects the current contents of all artifact directories.
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, relative, dirname } from 'node:path';

const SPEC_STATUS_ORDER = ['Draft', 'Ready', 'Blocked', 'Implemented', 'Deferred'];
const ARTIFACT_DIRS = [
  { key: 'specs',            heading: 'Specs',             subdir: 'specs' },
  { key: 'contracts',        heading: 'Contracts',          subdir: 'contracts' },
  { key: 'reviews',          heading: 'Reviews',            subdir: 'reviews' },
  { key: 'initiatives',      heading: 'Initiatives',        subdir: 'initiatives' },
  { key: 'blockers',         heading: 'Blockers',           subdir: 'blockers' },
  { key: 'deviations',       heading: 'Deviations',         subdir: 'deviations' },
  { key: 'scopeDiscoveries', heading: 'Scope Discoveries',  subdir: 'scope-discoveries' },
  { key: 'discoveries',      heading: 'Discoveries',        subdir: 'discoveries' },
];

/** Entry point — regenerate .spec-guard/README.md in place. */
export async function regenerateArtifactIndex({ dir = '.' } = {}) {
  const sgRoot = resolve(dir, '.spec-guard');
  const indexPath = join(sgRoot, 'README.md');

  const sections = await Promise.all(
    ARTIFACT_DIRS.map(({ heading, subdir, key }) =>
      buildSection({ sgRoot, heading, subdir, key })
    )
  );

  const content = sections.join('\n') + '\n';
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, content, 'utf8');
}

// ─── Section builders ──────────────────────────────────────────────────────────

async function buildSection({ sgRoot, heading, subdir, key }) {
  const dir = join(sgRoot, subdir);
  const files = await safeReadMarkdownFiles(dir);

  if (key === 'specs') {
    return buildSpecsSection(sgRoot, files);
  }
  if (key === 'reviews') {
    return buildReviewsSection(sgRoot, files);
  }
  return buildFlatSection(sgRoot, heading, subdir, files);
}

async function buildSpecsSection(sgRoot, files) {
  // Group specs by status
  const byStatus = Object.fromEntries(SPEC_STATUS_ORDER.map(s => [s, []]));

  for (const file of files) {
    const text = await safeReadFile(file);
    const status = extractStatus(text) || 'Draft';
    const bucket = SPEC_STATUS_ORDER.includes(status) ? status : 'Draft';
    const title = extractTitle(text) || filenameToTitle(file);
    const link = relLink(sgRoot, file);
    byStatus[bucket].push({ title, link });
  }

  // Sort each bucket
  for (const bucket of SPEC_STATUS_ORDER) {
    byStatus[bucket].sort(titleSort);
  }

  const lines = ['## Specs', ''];
  for (const status of SPEC_STATUS_ORDER) {
    lines.push(`### ${status}`, '');
    for (const { title, link } of byStatus[status]) {
      lines.push(`- [${title}](${link})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function buildReviewsSection(sgRoot, files) {
  const entries = [];
  for (const file of files) {
    const text = await safeReadFile(file);
    const specRef = extractLinkedSpec(text);
    let title;
    if (specRef) {
      const specPath = resolveLinkedSpec(sgRoot, file, specRef);
      const specText = specPath ? await safeReadFile(specPath) : null;
      const specTitle = specText ? extractTitle(specText) : null;
      title = `Implementation Review: ${specTitle || filenameToTitle(specPath || file)}`;
    } else {
      title = `Implementation Review: ${filenameToTitle(file)}`;
    }
    const link = relLink(sgRoot, file);
    entries.push({ title, link });
  }

  entries.sort(titleSort);

  const lines = ['## Reviews', ''];
  for (const { title, link } of entries) {
    lines.push(`- [${title}](${link})`);
  }
  lines.push('');
  return lines.join('\n');
}

async function buildFlatSection(sgRoot, heading, subdir, files) {
  const entries = [];
  for (const file of files) {
    const text = await safeReadFile(file);
    const title = extractTitle(text) || filenameToTitle(file);
    const link = relLink(sgRoot, file);
    entries.push({ title, link });
  }

  entries.sort(titleSort);

  const lines = [`## ${heading}`, ''];
  for (const { title, link } of entries) {
    lines.push(`- [${title}](${link})`);
  }
  lines.push('');
  return lines.join('\n');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function safeReadMarkdownFiles(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md')
      .map(e => join(dir, e.name));
  } catch {
    return [];
  }
}

async function safeReadFile(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function extractTitle(text) {
  if (!text) return null;
  const match = /^##\s+Title\s*$/m.exec(text);
  if (!match) return null;
  const rest = text.slice(match.index + match[0].length);
  const nextHeading = /^##\s+/m.exec(rest);
  const section = nextHeading ? rest.slice(0, nextHeading.index) : rest;
  const line = section.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('<!--'));
  return line || null;
}

function extractStatus(text) {
  if (!text) return null;
  const match = /^##\s+Status\s*$/m.exec(text);
  if (!match) return null;
  const rest = text.slice(match.index + match[0].length);
  const nextHeading = /^##\s+/m.exec(rest);
  const section = nextHeading ? rest.slice(0, nextHeading.index) : rest;
  const line = section.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('<!--'));
  return line || null;
}

function extractLinkedSpec(text) {
  if (!text) return null;
  const match = /^##\s+Linked Spec\s*$/m.exec(text);
  if (!match) return null;
  const rest = text.slice(match.index + match[0].length);
  const nextHeading = /^##\s+/m.exec(rest);
  const section = nextHeading ? rest.slice(0, nextHeading.index) : rest;
  // Look for markdown link or bare path
  const linkMatch = /\[([^\]]+)\]\(([^)]+)\)/.exec(section);
  if (linkMatch) return linkMatch[2];
  const line = section.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('<!--'));
  return line || null;
}

function resolveLinkedSpec(sgRoot, reviewFile, specRef) {
  if (!specRef) return null;
  try {
    // specRef is relative to the review file directory
    const absolute = resolve(dirname(reviewFile), specRef);
    return absolute;
  } catch {
    return null;
  }
}

function filenameToTitle(filePath) {
  const base = filePath.split(/[/\\]/).pop().replace(/\.md$/i, '');
  return base
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function relLink(sgRoot, filePath) {
  // Link is relative from .spec-guard/README.md to the artifact file
  const indexDir = sgRoot; // .spec-guard/
  return relative(indexDir, filePath).replace(/\\/g, '/');
}

function titleSort(a, b) {
  const cmp = a.title.toLowerCase().localeCompare(b.title.toLowerCase());
  if (cmp !== 0) return cmp;
  return a.link.localeCompare(b.link);
}
