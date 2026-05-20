export const REQUIRED_HEADINGS = [
  'Problem / Goal',
  'In Scope',
  'Out of Scope',
  'Expected Behavior',
  'Acceptance Criteria',
  'Work Classification',
];

export const CLASSIFICATIONS = [
  'Reusable non-UI API',
  'REST/service API',
  'Reusable UI component',
  'One-off application UI',
  'Direct behavior with no new API or UI',
  'Operational/document deliverable',
];

// Classifications that require a contract document
const CONTRACT_REQUIRED_CLASSIFICATIONS = [
  'Reusable non-UI API',
  'REST/service API',
  'Reusable UI component',
];

// Classifications that require UI inputs
const UI_CLASSIFICATIONS = [
  'One-off application UI',
  'Reusable UI component',
];

export function checkSpecText(text, path = '<input>') {
  const normalized = normalize(text);
  const diagnostics = [];

  diagnostics.push(...checkRequiredHeadings(normalized, path));
  diagnostics.push(...checkRequiredSectionContent(normalized, path));
  diagnostics.push(...checkClassification(normalized, path));
  diagnostics.push(...checkOpenQuestions(normalized, path));
  diagnostics.push(...checkAcceptanceCriteriaFormat(normalized, path));
  diagnostics.push(...checkVagueCriteria(normalized, path));
  diagnostics.push(...checkBriefScopeItems(normalized, path));
  diagnostics.push(...checkStatus(normalized, path));
  diagnostics.push(...checkContractRequirement(normalized, path));
  diagnostics.push(...checkUIInputs(normalized, path));

  return diagnostics;
}

export function checkSpecTextStrict(text, path = '<input>') {
  return checkSpecText(text, path);
}

export function formatDiagnostic(diagnostic) {
  return `[${diagnostic.severity}] ${diagnostic.ruleId} ${diagnostic.path}: ${diagnostic.message}`;
}

export function formatDiagnosticJson(diagnostic) {
  return JSON.stringify(diagnostic);
}

export function getSelectedClassifications(text) {
  const normalized = normalize(text);
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

export function getSpecStatus(text) {
  const normalized = normalize(text);
  const statusSection = getSection(normalized, 'Status');
  if (!statusSection) return null;

  const line = statusSection.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('<!--'));
  return line || null;
}

export function getSpecTitle(text) {
  const normalized = normalize(text);
  // Try ## Title section first
  if (hasHeading(normalized, 'Title')) {
    const section = getSection(normalized, 'Title');
    const line = section.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('<!--'));
    if (line) return line;
  }
  // Fall back to first # heading
  const match = /^#\s+(.+)$/m.exec(normalized);
  return match ? match[1].trim() : null;
}

// ─── Rule implementations ────────────────────────────────────────────────────

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

function checkRequiredSectionContent(text, path) {
  return REQUIRED_HEADINGS
    .filter((h) => h !== 'Work Classification')
    .filter((h) => hasHeading(text, h) && !hasSubstantiveContent(getSection(text, h)))
    .map((heading) => ({
      severity: 'BLOCKER',
      ruleId: 'SG-SPEC-004',
      path,
      message: `required section must identify concrete content: ${heading}`,
    }));
}

function checkClassification(text, path) {
  if (!hasHeading(text, 'Work Classification')) return [];

  const selected = getSelectedClassifications(text);

  if (selected.length === 1) return [];

  return [{
    severity: 'BLOCKER',
    ruleId: 'SG-CLASS-001',
    path,
    message: selected.length === 0
      ? 'exactly one work classification must be selected; found none'
      : `exactly one work classification must be selected; found ${selected.length}`,
  }];
}

function checkOpenQuestions(text, path) {
  if (!hasHeading(text, 'Open Questions')) return [];

  const section = getSection(text, 'Open Questions');
  // Detect unanswered open questions: lines starting with - or * that aren't
  // a placeholder or explicitly marked resolved
  const lines = section.split('\n').map(l => l.trim()).filter(l => l);
  const unresolved = lines.filter(l => {
    if (l.startsWith('<!--') && l.endsWith('-->')) return false;
    if (/^[-*+]\s*$/.test(l)) return false; // empty bullet
    if (/^[-*+]\s+\[[ xX]\]\s*$/.test(l)) return false; // empty checkbox
    if (/resolved|answered|n\/a|none|N\/A/i.test(l)) return false;
    return /^[-*+]\s+\S/.test(l); // non-empty bullet
  });

  if (unresolved.length === 0) return [];

  return [{
    severity: 'WARNING',
    ruleId: 'SG-SPEC-003',
    path,
    message: `${unresolved.length} open question(s) may affect implementation — resolve or mark N/A before proceeding`,
  }];
}

function checkAcceptanceCriteriaFormat(text, path) {
  if (!hasHeading(text, 'Acceptance Criteria')) return [];

  const section = getSection(text, 'Acceptance Criteria');
  const lines = section.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('<!--'));

  // Must have at least one checkbox item
  const hasCheckbox = lines.some(l => /^-\s+\[[ xX]\]\s+\S/.test(l));
  if (!hasCheckbox && lines.some(l => /^-/.test(l))) {
    return [{
      severity: 'WARNING',
      ruleId: 'SG-SPEC-005',
      path,
      message: 'acceptance criteria should use checkbox format (- [ ] criterion) for mechanical verification',
    }];
  }

  return [];
}

function checkStatus(text, path) {
  if (!hasHeading(text, 'Status')) return [];

  const section = getSection(text, 'Status');
  const lines = section.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('<!--'));
  const statusLine = lines[0];

  if (!statusLine) return []; // optional section, no content is fine

  const validStatuses = ['Draft', 'Ready', 'Blocked', 'Implemented'];
  const isValid = validStatuses.some(s => statusLine.toLowerCase().includes(s.toLowerCase()));

  if (!isValid) {
    return [{
      severity: 'INFO',
      ruleId: 'SG-SPEC-006',
      path,
      message: `status "${statusLine}" is not a standard value; expected one of: ${validStatuses.join(', ')}`,
    }];
  }

  return [];
}

function checkContractRequirement(text, path) {
  const selected = getSelectedClassifications(text);
  if (selected.length !== 1) return []; // classification errors handled elsewhere

  const classification = selected[0];
  if (!CONTRACT_REQUIRED_CLASSIFICATIONS.includes(classification)) return [];

  // Check for a contract reference in Dependencies, or a "Contract" heading
  const hasContractHeading = /^##\s+(API Contract|Contract|Component Contract|Service Contract|REST API Contract)\s*$/m.test(text);
  const deps = hasHeading(text, 'Dependencies') ? getSection(text, 'Dependencies') : '';
  const hasContractRef = /contract/i.test(deps);

  if (!hasContractHeading && !hasContractRef) {
    return [{
      severity: 'WARNING',
      ruleId: 'SG-CLASS-002',
      path,
      message: `classification "${classification}" typically requires a contract document — add a contract reference to Dependencies or include a Contract heading`,
    }];
  }

  return [];
}

function checkUIInputs(text, path) {
  const selected = getSelectedClassifications(text);
  if (selected.length !== 1) return [];

  const classification = selected[0];
  if (!UI_CLASSIFICATIONS.includes(classification)) return [];

  const allText = text.toLowerCase();
  const hasMockup = /mockup|wireframe|figma|design.{0,20}direction|sketch|prototype/i.test(allText);
  const hasComponentLib = /component.{0,20}library|design.{0,20}system|ui.{0,20}kit/i.test(allText);

  const diagnostics = [];

  if (!hasMockup) {
    diagnostics.push({
      severity: 'BLOCKER',
      ruleId: 'SG-UI-001',
      path,
      message: hasComponentLib
        ? `UI work requires a mockup or explicit design direction — component library is referenced but human confirmation is needed to proceed without a mockup`
        : `UI work requires a mockup or explicit design direction — add a reference before implementation`,
    });
  }

  if (!hasComponentLib && hasMockup) {
    diagnostics.push({
      severity: 'BLOCKER',
      ruleId: 'SG-UI-002',
      path,
      message: `UI work requires a component library reference or explicit confirmation of custom styling — mockup is present but no component library is referenced`,
    });
  }

  return diagnostics;
}

function checkVagueCriteria(text, path) {
  if (!hasHeading(text, 'Acceptance Criteria')) return [];

  const VAGUE = /\b(correctly|properly|well|good|fast|efficient|easy|simple|nice|smooth|seamlessly|cleanly|appropriately|adequately|reasonably|suitably)\b/i;
  const section = getSection(text, 'Acceptance Criteria');
  const lines = section.split('\n').map(l => l.trim()).filter(l => /^-/.test(l) && !l.startsWith('<!--'));

  return lines
    .filter(l => VAGUE.test(l))
    .map(l => ({
      severity: 'INFO',
      ruleId: 'SG-SPEC-007',
      path,
      message: `acceptance criterion uses a vague qualifier — replace with a measurable condition: "${l.replace(/^-\s*(\[[ xX]\]\s*)?/, '').trim()}"`,
    }));
}

function checkBriefScopeItems(text, path) {
  const diagnostics = [];

  for (const heading of ['In Scope', 'Out of Scope']) {
    if (!hasHeading(text, heading)) continue;
    const section = getSection(text, heading);
    const lines = section.split('\n').map(l => l.trim()).filter(l => /^-\s+\S/.test(l) && !l.startsWith('<!--'));

    for (const line of lines) {
      const content = line.replace(/^-\s+/, '').trim();
      const wordCount = content.split(/\s+/).length;
      if (wordCount <= 2 && content.length > 0) {
        diagnostics.push({
          severity: 'INFO',
          ruleId: 'SG-SPEC-008',
          path,
          message: `scope item is too brief to prevent misinterpretation — describe the specific boundary: "${content}"`,
        });
      }
    }
  }

  return diagnostics;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalize(text) {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function hasSubstantiveContent(section) {
  return section
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
    .trim()
    .length > 0;
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
