import { constants } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import { resolve, relative, basename, dirname, join } from 'node:path';
import { getSelectedClassifications, getSpecTitle } from './check.js';

// ─── Rule IDs ──────────────────────────────────────────────────────────────────
// SG-ALIGN-001  acceptance criterion not found in implementation review
// SG-ALIGN-002  required test not mentioned in implementation review
// SG-ALIGN-003  contract file missing, empty, or structurally weak for its type
// SG-ALIGN-004  unchecked items remain in implementation review (Gate 5 blocked)
// SG-ALIGN-005  Implementation Files section blank in review
// SG-ALIGN-006  Test Files section blank in review
// SG-ALIGN-007  One-off application UI with contract: Dependency Integration table unpopulated or checkbox unchecked
// SG-ALIGN-008  API contract missing persisted end-user API documentation path or doc file
// SG-ALIGN-009  current spec documentation requirements do not align with review linked documentation

const CONTRACT_STRUCTURE = {
  'REST/service API': {
    pattern: /(GET|POST|PUT|PATCH|DELETE)\s+\/|##\s+(Routes|Endpoints)|^\s*route:/im,
    hint: 'should define routes (e.g., GET /resource, or a ## Routes section)',
  },
  'Reusable non-UI API': {
    pattern: /function|method|param|argument|interface|type|export/i,
    hint: 'should define exported interface (functions, types, or method signatures)',
  },
  'Reusable UI component': {
    pattern: /prop|interface|type|variant|slot|children/i,
    hint: 'should define component props/interface',
  },
};

const REVIEW_RULES = new Set([
  'SG-ALIGN-001', 'SG-ALIGN-002', 'SG-ALIGN-004',
  'SG-ALIGN-005', 'SG-ALIGN-006', 'SG-ALIGN-007',
  'SG-ALIGN-009', 'SG-STALE-001',
]);

export async function analyzeArtifacts({
  specPath,
  contractPath = null,
  reviewPath = null,
  runStatePath = null,
  dryRun = false,
}) {
  const diagnostics = [];

  let specText;
  try {
    specText = await readFile(resolve(specPath), 'utf8');
  } catch {
    return { error: `Cannot read spec: ${specPath}`, diagnostics: [] };
  }

  const criteria = extractBullets(specText, 'Acceptance Criteria');
  const tests = extractBullets(specText, 'Required Tests / Checks');
  const classifications = getSelectedClassifications(specText);
  const classification = classifications[0] || null;
  const title = getSpecTitle(specText) || specPath;

  // ── Stale gate detection ─────────────────────────────────────────────────────

  if (dryRun) {
    // dry-run skips all review-dependent and stale-gate checks — contract only
  } else {

  const name = basename(specPath).replace(/\.md$/, '');
  const resolvedRunState = runStatePath || join('.spec-guard', 'runs', `${name}-run.json`);
  try {
    const runStateText = await readFile(resolve(resolvedRunState), 'utf8');
    const runState = JSON.parse(runStateText);
    if (typeof runState.specModifiedAt === 'number' && runState.gatesPassed?.length > 0) {
      const specStat = await stat(resolve(specPath));
      if (specStat.mtimeMs > runState.specModifiedAt) {
        const gates = runState.gatesPassed.join(', ');
        diagnostics.push({
          severity: 'WARNING',
          ruleId: 'SG-STALE-001',
          path: specPath,
          message: `spec modified since gates were confirmed (${gates}) — re-verify implementation alignment`,
        });
      }
    }
  } catch { /* no run state or unreadable — skip */ }

  } // end !dryRun block for stale/review checks

  // ── Contract alignment ───────────────────────────────────────────────────────

  if (contractPath) {
    let contractText;
    try {
      contractText = await readFile(resolve(contractPath), 'utf8');
      const contentLength = contractText.replace(/<!--.*?-->/gs, '').trim().length;

      if (contentLength < 120) {
        diagnostics.push({
          severity: 'WARNING',
          ruleId: 'SG-ALIGN-003',
          path: contractPath,
          message: 'contract appears to be a blank or near-empty template — fill it out before Gate 2 passes',
        });
      } else if (classification && CONTRACT_STRUCTURE[classification]) {
        const { pattern, hint } = CONTRACT_STRUCTURE[classification];
        if (!pattern.test(contractText)) {
          diagnostics.push({
            severity: 'WARNING',
            ruleId: 'SG-ALIGN-003',
            path: contractPath,
            message: `"${classification}" contract ${hint}`,
          });
        }
      }

      if (isApiStyleContract(contractText)) {
        const docPath = extractEndUserApiDocPath(contractText);
        if (!docPath) {
          diagnostics.push({
            severity: 'BLOCKER',
            ruleId: 'SG-ALIGN-008',
            path: contractPath,
            message: 'API contract must persist a corresponding end-user API doc path in an "End-User API Documentation" section',
          });
        } else {
          const repoRoot = inferRepoRootFromContractPath(contractPath);
          try {
            await access(resolve(repoRoot, docPath), constants.F_OK);
          } catch {
            diagnostics.push({
              severity: 'BLOCKER',
              ruleId: 'SG-ALIGN-008',
              path: contractPath,
              message: `end-user API doc not found at persisted repository-relative path: ${docPath}`,
            });
          }
        }
      }
    } catch {
      diagnostics.push({
        severity: 'BLOCKER',
        ruleId: 'SG-ALIGN-003',
        path: contractPath,
        message: `contract file not found: ${contractPath}`,
      });
    }
  }

  // ── Review alignment ─────────────────────────────────────────────────────────

  if (!dryRun && reviewPath) {
    let reviewText;
    try {
      reviewText = await readFile(resolve(reviewPath), 'utf8');
      const reviewLower = reviewText.toLowerCase();

      // Check acceptance criteria coverage
      for (const line of criteria) {
        const clean = cleanBullet(line);
        if (clean.length < 5) continue;
        // Match first 35 chars to handle minor rewording
        const key = clean.slice(0, 35).toLowerCase();
        if (!reviewLower.includes(key)) {
          diagnostics.push({
            severity: 'WARNING',
            ruleId: 'SG-ALIGN-001',
            path: reviewPath,
            message: `acceptance criterion not found in review: "${clean}"`,
          });
        }
      }

      // Check required test coverage in "Tests Written First" section
      const testsSection = extractSection(reviewText, 'Tests Written First') || reviewText;
      const testsSectionLower = testsSection.toLowerCase();
      for (const line of tests) {
        const clean = cleanBullet(line);
        if (clean.length < 5) continue;
        const key = clean.slice(0, 30).toLowerCase();
        if (!testsSectionLower.includes(key)) {
          diagnostics.push({
            severity: 'WARNING',
            ruleId: 'SG-ALIGN-002',
            path: reviewPath,
            message: `required test not found in review's "Tests Written First": "${clean}"`,
          });
        }
      }

      // Check for unchecked boxes (Gate 5 blocker)
      const unchecked = (reviewText.match(/^- \[ \] /gm) || []).length;
      if (unchecked > 0) {
        diagnostics.push({
          severity: 'WARNING',
          ruleId: 'SG-ALIGN-004',
          path: reviewPath,
          message: `${unchecked} unchecked item(s) remain in implementation review — Gate 5 is blocked`,
        });
      }

      // SG-ALIGN-009: current spec documentation requirements must align with review linked docs
      const specDocSection = extractSection(specText, 'Documentation Requirements');
      const reviewDocSection = extractSection(reviewText, 'Linked Documentation');
      const specDocLinks = extractDocLinks(specDocSection || '', specPath);
      const reviewDocLinks = extractDocLinks(reviewDocSection || '', reviewPath);

      for (const docPath of specDocLinks) {
        if (!reviewDocLinks.includes(docPath)) {
          diagnostics.push({
            severity: 'WARNING',
            ruleId: 'SG-ALIGN-009',
            path: reviewPath,
            message: `documentation requirement is listed in the spec but missing from review Linked Documentation: ${docPath}`,
          });
        }
      }

      for (const docPath of reviewDocLinks) {
        if (!specDocLinks.includes(docPath)) {
          diagnostics.push({
            severity: 'WARNING',
            ruleId: 'SG-ALIGN-009',
            path: reviewPath,
            message: `documentation was created or updated but is not directly linked from the spec Documentation Requirements section: ${docPath}`,
          });
        }
      }

      // SG-ALIGN-007: UI spec with a contract must have populated Dependency Integration table + confirmed checkbox
      if (classification === 'One-off application UI' && contractPath) {
        const depSection = extractSection(reviewText, 'Dependency Integration');
        const checkboxConfirmed = depSection && /^- \[x\]/im.test(depSection);
        // Table row is real when it has 3 pipe-delimited cells and none are just a placeholder dash
        const realRows = depSection
          ? (depSection.match(/^\|[^|\n]+\|[^|\n]+\|[^|\n]+\|/gm) || [])
              .filter(r => !/Dependency.*Integration.code.*Test/i.test(r))
              .filter(r => !/^[|\s-]+$/.test(r))
              .filter(r => !/^\|\s*-\s*\|\s*-\s*\|\s*-\s*\|/.test(r))
          : [];
        const tablePopulated = realRows.length > 0;

        if (!depSection || !tablePopulated) {
          diagnostics.push({
            severity: 'BLOCKER',
            ruleId: 'SG-ALIGN-007',
            path: reviewPath,
            message: 'Dependency Integration table is missing or unpopulated — for each runtime dependency list the dependency name, the integration code file/location, and the test that exercises it through the real code path',
          });
        } else if (!checkboxConfirmed) {
          diagnostics.push({
            severity: 'BLOCKER',
            ruleId: 'SG-ALIGN-007',
            path: reviewPath,
            message: 'Dependency Integration checkbox is unchecked — confirm each dependency is exercised through the real integration code and returns expected status codes',
          });
        }
      }

      // Check Implementation Files and Test Files are populated
      if (classification !== 'Operational/document deliverable') {
        if (!sectionHasContent(reviewText, 'Implementation Files')) {
          diagnostics.push({
            severity: 'WARNING',
            ruleId: 'SG-ALIGN-005',
            path: reviewPath,
            message: 'Implementation Files section is blank — list the source files created or modified',
          });
        }
        if (!sectionHasContent(reviewText, 'Test Files')) {
          diagnostics.push({
            severity: 'WARNING',
            ruleId: 'SG-ALIGN-006',
            path: reviewPath,
            message: 'Test Files section is blank — list the test files written for this implementation',
          });
        }
      }
    } catch {
      diagnostics.push({
        severity: 'INFO',
        ruleId: 'SG-ALIGN-002',
        path: reviewPath,
        message: `review not found: ${reviewPath} — create it with: spec-guard review ${reviewPath}`,
      });
    }
  }

  const blockers = diagnostics.filter(d => d.severity === 'BLOCKER').length;
  const warnings = diagnostics.filter(d => d.severity === 'WARNING').length;

  return {
    specPath,
    contractPath,
    reviewPath,
    title,
    classification,
    criteriaCount: criteria.length,
    testsCount: tests.length,
    diagnostics,
    clean: blockers === 0 && warnings === 0,
    blockerCount: blockers,
    warningCount: warnings,
    ...(dryRun ? { dry_run: true } : {}),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractBullets(text, heading) {
  const section = extractSection(text, heading);
  if (!section) return [];
  return section
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^-\s+\S/.test(l) && !l.startsWith('<!--'));
}

function cleanBullet(line) {
  return line.replace(/^-\s*(\[[ xX]\]\s*)?/, '').trim();
}

function sectionHasContent(text, heading) {
  const section = extractSection(text, heading);
  if (!section) return false;
  return section.split('\n').some(l => /^-\s+\S/.test(l.trim()) && !l.trim().startsWith('<!--'));
}

function extractSection(text, heading) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^##\\s+${escaped}\\s*$`, 'm').exec(normalized);
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = normalized.slice(start);
  const next = /^##\s+/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

function isApiStyleContract(text) {
  return /^#\s+(API Contract|REST\s*\/\s*Service API Contract|REST API Contract)\s*$/im.test(text);
}

function extractEndUserApiDocPath(text) {
  const section = extractSection(text, 'End-User API Documentation');
  if (!section) return null;
  const match = /^\s*-\s*Documentation Path:\s*(\S.*?)\s*$/im.exec(section);
  if (!match) return null;
  const docPath = match[1].trim();
  if (!docPath || /^[/\\]/.test(docPath) || /^[A-Za-z]:/.test(docPath) || docPath.includes('..')) return null;
  return docPath;
}

function inferRepoRootFromContractPath(contractPath) {
  const normalized = resolve(contractPath).replace(/\\/g, '/');
  const marker = '/.spec-guard/contracts/';
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex >= 0) return normalized.slice(0, markerIndex);
  return dirname(resolve(contractPath));
}

function inferRepoRootFromSpecPath(filePath) {
  const normalized = resolve(filePath).replace(/\\/g, '/');
  const markerIndex = normalized.indexOf('/.spec-guard/');
  if (markerIndex >= 0) return normalized.slice(0, markerIndex);
  // fallback: go up two directories (.spec-guard/<subdir>/<file>)
  return dirname(dirname(dirname(resolve(filePath))));
}

function extractDocLinks(text, filePath = null) {
  if (!text) return [];
  const links = new Set();
  const normalized = text.replace(/\\/g, '/');
  const markdownLinks = normalized.matchAll(/\[[^\]]+\]\(([^)#]+\.md)(?:#[^)]+)?\)/gi);
  for (const match of markdownLinks) addDocLink(links, match[1], filePath);

  const plainPaths = normalized.matchAll(/(?:^|[\s`(])((?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.md)(?:#[A-Za-z0-9_.-]+)?/gim);
  for (const match of plainPaths) addDocLink(links, match[1], filePath);

  return [...links];
}

function addDocLink(links, rawPath, filePath = null) {
  let path = rawPath.trim().replace(/^\.\//, '').replace(/[,.;:]+$/, '');
  if (!path || path === '-' || /^[/\\]/.test(path) || /^[A-Za-z]:/.test(path)) return;
  if (path.includes('..')) {
    if (!filePath) return;
    const repoRoot = inferRepoRootFromSpecPath(filePath);
    const resolved = resolve(dirname(resolve(filePath)), path);
    const key = relative(repoRoot, resolved).replace(/\\/g, '/');
    if (key.includes('..')) return; // escaped repo root — skip
    path = key;
  }
  if (path.startsWith('.spec-guard/')) return;
  links.add(path);
}
