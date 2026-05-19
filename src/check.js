export const REQUIRED_HEADINGS = [
  'Problem / Goal',
  'In Scope',
  'Out of Scope',
  'Expected Behavior',
  'Acceptance Criteria',
  'Work Classification',
  'Required Tests / Checks',
];

export const CLASSIFICATIONS = [
  'Reusable non-UI API',
  'REST/service API',
  'Reusable UI component',
  'One-off application UI',
  'Direct behavior with no new API or UI',
  'Operational/document deliverable',
];

export function checkSpecText(text, path = '<input>') {
  const normalized = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const diagnostics = [];

  diagnostics.push(...checkRequiredHeadings(normalized, path));
  diagnostics.push(...checkClassification(normalized, path));
  diagnostics.push(...checkRequiredTests(normalized, path));

  return diagnostics;
}

export function formatDiagnostic(diagnostic) {
  return `[${diagnostic.severity}] ${diagnostic.ruleId} ${diagnostic.path}: ${diagnostic.message}`;
}

export function getSelectedClassifications(text) {
  const normalized = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  if (!hasHeading(normalized, 'Work Classification')) {
    return [];
  }

  const section = getSection(normalized, 'Work Classification');
  return CLASSIFICATIONS.filter((classification) => {
    const escaped = escapeRegExp(classification);
    const pattern = new RegExp(`^\\s*-\\s*\\[[xX]\\]\\s*${escaped}\\s*$`, 'm');
    return pattern.test(section);
  });
}

function checkRequiredHeadings(text, path) {
  return REQUIRED_HEADINGS
    .filter((heading) => !hasHeading(text, heading))
    .map((heading) => ({
      severity: 'BLOCKER',
      ruleId: 'SG-SPEC-002',
      path,
      message: `missing required heading: ${heading}`,
    }));
}

function checkClassification(text, path) {
  if (!hasHeading(text, 'Work Classification')) {
    return [];
  }

  const selected = getSelectedClassifications(text);

  if (selected.length === 1) {
    return [];
  }

  return [{
    severity: 'BLOCKER',
    ruleId: 'SG-CLASS-001',
    path,
    message: selected.length === 0
      ? 'exactly one work classification must be selected; found none'
      : `exactly one work classification must be selected; found ${selected.length}`,
  }];
}

function checkRequiredTests(text, path) {
  if (!hasHeading(text, 'Required Tests / Checks')) {
    return [];
  }

  const section = getSection(text, 'Required Tests / Checks');
  const content = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (line.startsWith('<!--') && line.endsWith('-->')) return false;
      if (/^[-*+]\s*$/.test(line)) return false;
      if (/^[-*+]\s+\[[ xX]\]\s*$/.test(line)) return false;
      return true;
    })
    .join('\n')
    .trim();

  if (content.length > 0) {
    return [];
  }

  return [{
    severity: 'BLOCKER',
    ruleId: 'SG-TEST-001',
    path,
    message: 'required tests/checks must be identified',
  }];
}

function hasHeading(text, heading) {
  const escaped = escapeRegExp(heading);
  return new RegExp(`^##\\s+${escaped}\\s*$`, 'm').test(text);
}

function getSection(text, heading) {
  const escaped = escapeRegExp(heading);
  const match = new RegExp(`^##\\s+${escaped}\\s*$`, 'm').exec(text);
  if (!match) return '';

  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const nextHeading = /^##\s+/m.exec(rest);
  return nextHeading ? rest.slice(0, nextHeading.index) : rest;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
