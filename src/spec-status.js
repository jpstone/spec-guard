import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const SPEC_STATUSES = ['Draft', 'Pending Approval', 'Ready for Implementation', 'Implementation Approved', 'Blocked', 'Implemented', 'Deferred'];

export async function updateSpecStatus(specPath, status) {
  if (!SPEC_STATUSES.includes(status)) {
    throw new Error(`Invalid spec status: ${status}`);
  }

  const path = resolve(specPath);
  const text = await readFile(path, 'utf8');
  const updated = setSpecStatusText(text, status);
  if (updated !== text) await writeFile(path, updated);
  return updated;
}

export function setSpecStatusText(text, status) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const statusHeading = /^##\s+Status\s*$/m.exec(normalized);

  if (statusHeading) {
    const start = statusHeading.index + statusHeading[0].length;
    const rest = normalized.slice(start);
    const nextHeading = /^##\s+/m.exec(rest);
    const end = nextHeading ? start + nextHeading.index : normalized.length;
    const replacement = `## Status\n\n${status}\n`;
    const suffix = normalized.slice(end).replace(/^\n*/, '\n\n');
    return `${normalized.slice(0, statusHeading.index)}${replacement}${suffix}`.replace(/\n{3,}/g, '\n\n');
  }

  const firstHeading = /^#\s+.*$/m.exec(normalized);
  if (!firstHeading) {
    return `## Status\n\n${status}\n\n${normalized}`;
  }

  const insertAt = firstHeading.index + firstHeading[0].length;
  return `${normalized.slice(0, insertAt)}\n\n## Status\n\n${status}${normalized.slice(insertAt)}`;
}
