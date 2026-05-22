import { constants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

export const README_PREFERENCE_PATH = '.spec-guard/repo-preferences.json';

export async function ensureReadmePreference({ root = '.', ask } = {}) {
  const existing = await readReadmePreference({ root });
  if (existing) return existing;

  if (await hasReadme(root)) {
    return { maintainReadme: null, prompted: false, reason: 'README exists' };
  }

  if (typeof ask !== 'function') {
    return { maintainReadme: null, prompted: false, reason: 'No ask function provided' };
  }

  const maintainReadme = Boolean(await ask('Spec Guard did not find a README. Should Spec Guard create and maintain one for this repo?'));
  const preference = {
    readme: {
      maintain: maintainReadme,
      answeredAt: new Date().toISOString(),
    },
  };

  await writePreference(root, preference);
  return { maintainReadme, prompted: true };
}

export async function readReadmePreference({ root = '.' } = {}) {
  let text;
  try {
    text = await readFile(resolve(root, README_PREFERENCE_PATH), 'utf8');
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.readme?.maintain !== 'boolean') return null;
    return {
      maintainReadme: parsed.readme.maintain,
      prompted: false,
      answeredAt: parsed.readme.answeredAt ?? null,
    };
  } catch {
    return null;
  }
}

export async function maintainReadme({ root = '.', title = 'Project', purpose = '', docLinks = [] } = {}) {
  const readmePath = await findReadme(root);
  if (!readmePath) {
    return { updated: false, reason: 'No README found — skipping update' };
  }

  let existing = null;
  try {
    existing = await readFile(readmePath, 'utf8');
  } catch {
    return { updated: false, reason: 'Could not read README' };
  }

  const uniqueDocLinks = [...new Set(docLinks.filter(Boolean))];
  const next = updateExistingReadme(existing, uniqueDocLinks);

  if (next === existing) return { updated: false, path: relativeRepoPath(root, readmePath) };

  await mkdir(dirname(readmePath), { recursive: true });
  await writeFile(readmePath, next);
  return { updated: true, path: relativeRepoPath(root, readmePath) };
}

export async function addDocLinkToReadme({ root = '.', docPath }) {
  if (!docPath) return { updated: false, reason: 'No doc path provided' };
  return maintainReadme({ root, docLinks: [docPath] });
}

async function writePreference(root, preference) {
  const path = resolve(root, README_PREFERENCE_PATH);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(preference, null, 2));
}

async function hasReadme(root) {
  return Boolean(await findReadme(root));
}

async function findReadme(root) {
  for (const name of ['README.md', 'README']) {
    const path = resolve(root, name);
    try {
      await access(path, constants.F_OK);
      return path;
    } catch { /* continue */ }
  }
  return null;
}

function createConciseReadme({ title, purpose, docLinks }) {
  const lines = [`# ${title || 'Project'}`, ''];
  if (purpose) {
    lines.push('## Overview', '', purpose.trim(), '');
  }
  if (docLinks.length > 0) {
    lines.push('## Documentation', '');
    for (const link of docLinks) lines.push(`- [${titleFromDocPath(link)}](${link})`);
    lines.push('');
  }
  lines.push('For detailed behavior and implementation constraints, see the linked project documentation.');
  lines.push('');
  return lines.join('\n');
}

function updateExistingReadme(text, docLinks) {
  if (docLinks.length === 0) return text;

  let next = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const missingLinks = docLinks.filter(link => !next.includes(`](${link})`) && !next.includes(`](${link.replace(/ /g, '%20')})`));
  if (missingLinks.length === 0) return text;

  const documentationSection = extractMarkdownSection(next, 'Documentation') || extractMarkdownSection(next, 'Table of Contents');
  const targetHeading = documentationSection ? documentationSection.heading : null;

  if (!targetHeading) {
    if (!next.endsWith('\n')) next += '\n';
    next += `\n## Documentation\n\n${missingLinks.map(link => `- [${titleFromDocPath(link)}](${link})`).join('\n')}\n`;
    return next;
  }

  const entries = missingLinks.map(link => `- [${titleFromDocPath(link)}](${link})`).join('\n');
  const insertAt = documentationSection.end;
  const prefix = next.slice(0, insertAt).replace(/\s*$/, '');
  const suffix = next.slice(insertAt);
  return `${prefix}\n${entries}\n${suffix.startsWith('\n') ? suffix : `\n${suffix}`}`;
}

function extractMarkdownSection(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^#{1,6}\\s+${escaped}\\s*$`, 'im').exec(text);
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const next = /^#{1,6}\s+/m.exec(rest);
  return {
    heading: match[0],
    start,
    end: next ? start + next.index : text.length,
    body: next ? rest.slice(0, next.index) : rest,
  };
}

function titleFromDocPath(docPath) {
  const base = basename(docPath).replace(/\.md$/i, '').replace(/[-_]+/g, ' ');
  return base
    .replace(/\b\w/g, char => char.toUpperCase())
    .replace(/\bApi\b/g, 'API');
}

function relativeRepoPath(root, path) {
  return path.replace(resolve(root), '').replace(/^[/\\]/, '').replace(/\\/g, '/');
}
