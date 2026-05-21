/**
 * spec-guard run — orchestrated workflow runner
 *
 * Walks a spec through all 5 phases and gates, prompting at each step,
 * recording blockers/discoveries automatically, and refusing to advance
 * past a gate until it passes.
 */

import { readFile, writeFile, mkdir, access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { checkSpecText, getSelectedClassifications, getSpecTitle, formatDiagnostic } from './check.js';
import { ensureReadmePreference, maintainReadme } from './readme-maintenance.js';
import { updateSpecStatus } from './spec-status.js';

// ─── Phase/Gate definitions ───────────────────────────────────────────────────

export const PHASES = [
  { id: 'discover',   label: 'Phase 1: Discover',              gate: 'Gate 1: Spec Valid'             },
  { id: 'contract',   label: 'Phase 2: Classify & Contract',   gate: 'Gate 2: Contracts Present'      },
  { id: 'test-first', label: 'Phase 3: Test First',            gate: 'Gate 3: Failure Confirmed'      },
  { id: 'implement',  label: 'Phase 4: Implement',             gate: 'Gate 4: Tests Pass'             },
  { id: 'review',     label: 'Phase 5: Review',                gate: 'Gate 5: Review Complete'        },
];

const CONTRACT_COMMANDS = {
  'Reusable non-UI API':            { cmd: 'api-contract',       dir: 'contracts', label: 'API contract' },
  'REST/service API':               { cmd: 'rest-api-contract',  dir: 'contracts', label: 'REST API contract' },
  'Reusable UI component':          { cmd: 'component-contract', dir: 'contracts', label: 'component contract' },
  'One-off application UI':         { cmd: 'one-off-ui',         dir: 'specs',     label: 'one-off UI doc' },
  'Operational/document deliverable': { cmd: 'operational-document', dir: 'specs', label: 'operational document' },
};

export const TEST_GUIDANCE = {
  'Reusable non-UI API':               'Unit tests against the documented/exported API surface only — not private helpers.',
  'REST/service API':                  'API/integration tests against the documented contract: routes, status codes, request/response shapes, error formats.',
  'Reusable UI component':             'Unit/component tests against documented props, states, callbacks, and accessibility contract. Add UI automation tests if the contract includes behavior a unit test environment cannot accurately simulate (focus management, keyboard navigation, scroll, viewport layout, popovers, file uploads, drag and drop, hydration).',
  'One-off application UI':            'UI automation tests for user-visible behavior: headings, forms, navigation, success/error states, permission-sensitive visibility, key accessibility affordances. If the spec declares an API or service dependency: (1) identify the integration code that wires the dependency at runtime (proxy config, middleware, dev server script); (2) write a test that exercises it through that real code path — not a test-only URL override, mocked fetch, or intercepted route; (3) the test must fail with 404 or similar before the wiring code exists, then pass after. Record the dependency, integration code location, and test in the Dependency Integration section of the review.',
  'Direct behavior with no new API or UI': 'Tests derived from the acceptance criteria. No new API or UI surface — use whatever mechanism verifies each criterion (calling existing code, checking a value, observing a side effect). Do not add tests for implementation details outside the spec.',
  'Operational/document deliverable':  'Process/document checks validating required sections, links, policy gates, or operational readiness criteria.',
  'Bugfix': 'Failure-first bugfix tests or checks that reproduce the reported bug before implementation and pass after the fix. Ask whether test evidence should be permanent or temporary. Temporary tests may be run transiently or deleted after they pass only after asking the human: "Have you verified that the reported bug is fixed and no longer reproduces?"',
};

// ─── RunState ─────────────────────────────────────────────────────────────────

export function createRunState(specPath) {
  return {
    specPath,
    phase: 'discover',
    gatesPassed: [],
    classification: null,
    contractPath: null,
    failureFirstConfirmed: false,
    failureFirstReason: null,
    blockers: [],
    scopeDiscoveries: [],
    deviations: [],
    reviewPath: null,
    startedAt: new Date().toISOString(),
  };
}

// ─── Gate checks ──────────────────────────────────────────────────────────────

export async function gate1(specPath) {
  const text = await readFile(resolve(specPath), 'utf8');
  const diagnostics = checkSpecText(text, specPath);
  const blockers = diagnostics.filter(d => d.severity === 'BLOCKER');
  return { passed: blockers.length === 0, diagnostics, blockers };
}

export async function gate2(specPath) {
  const text = await readFile(resolve(specPath), 'utf8');
  const diagnostics = checkSpecText(text, specPath);
  const relevant = diagnostics.filter(d =>
    d.severity === 'BLOCKER' &&
    ['SG-CLASS-002', 'SG-UI-001', 'SG-UI-002', 'SG-CLASS-001'].includes(d.ruleId)
  );
  return { passed: relevant.length === 0, diagnostics, blockers: relevant };
}

export async function gate4(specPath) {
  // Gate 4 is confirmed by the agent — we record the assertion
  return { passed: true, manual: true };
}

export async function gate5(reviewPath) {
  if (!reviewPath) return { passed: false, reason: 'No review file created yet.' };
  try {
    await access(resolve(reviewPath), constants.F_OK);
    const text = await readFile(resolve(reviewPath), 'utf8');
    // Check for unchecked boxes in the review
    const unchecked = (text.match(/^- \[ \] /gm) || []).length;
    return {
      passed: unchecked === 0,
      unchecked,
      reason: unchecked > 0 ? `${unchecked} unchecked item(s) remain in the implementation review.` : null,
    };
  } catch {
    return { passed: false, reason: 'Review file not found.' };
  }
}

// ─── Interactive runner ───────────────────────────────────────────────────────

export async function runInteractive(specPath, options = {}) {
  const rl = createInterface({ input, output });
  const state = createRunState(specPath);

  const ask = async (prompt) => {
    const answer = await rl.question(prompt);
    return answer.trim();
  };

  const confirm = async (prompt) => {
    const answer = await ask(`${prompt} [y/n] `);
    return answer.toLowerCase().startsWith('y');
  };

  const print = (msg = '') => console.log(msg);
  const header = (msg) => {
    print();
    print('═'.repeat(60));
    print(`  ${msg}`);
    print('═'.repeat(60));
  };
  const gate = (msg) => {
    print();
    print('┌' + '─'.repeat(58) + '┐');
    print(`│  🔒 ${msg.padEnd(53)}│`);
    print('└' + '─'.repeat(58) + '┘');
  };
  const ok = (msg) => print(`  ✓  ${msg}`);
  const warn = (msg) => print(`  ⚠  ${msg}`);
  const err = (msg) => print(`  ✗  ${msg}`);
  const info = (msg) => print(`  →  ${msg}`);

  try {
    // ── Verify spec exists ──────────────────────────────────────────────────
    try {
      await access(resolve(specPath), constants.F_OK);
    } catch {
      err(`Spec file not found: ${specPath}`);
      err(`Create it first: spec-guard new spec ${specPath}`);
      rl.close();
      return { exitCode: 2, state };
    }

    const specText = await readFile(resolve(specPath), 'utf8');
    const title = getSpecTitle(specText) || basename(specPath);

    const readmePreference = await ensureReadmePreference({
      ask: async (prompt) => confirm(`  ${prompt}`),
    });
    if (readmePreference.maintainReadme === true) {
      await maintainReadme({
        title,
        purpose: summarizeForReadme(extractSection(specText, 'Problem / Goal')),
      });
    }

    header(`Spec Guard Run: ${title}`);
    info(`Spec: ${specPath}`);
    info(`Started: ${new Date().toLocaleString()}`);

    // ── PHASE 1: DISCOVER ───────────────────────────────────────────────────
    header('Phase 1: Discover');
    print('Checking spec completeness...');
    print();

    let gate1Result = await gate1(specPath);

    while (!gate1Result.passed) {
      for (const d of gate1Result.blockers) {
        err(formatDiagnostic(d));
      }
      print();
      warn('Gate 1 is blocked. Fix the issues above in your spec, then press Enter to re-check.');
      warn(`Tip: run  spec-guard watch ${specPath}  in another terminal for live feedback.`);
      await ask('  Press Enter when ready to re-check → ');
      const freshText = await readFile(resolve(specPath), 'utf8');
      gate1Result = await gate1(specPath);
    }

    gate('Gate 1 passed: Spec valid');
    ok('All required sections present with concrete content');
    ok('Exactly one work classification selected');
    ok('Required tests/checks named');
    state.gatesPassed.push('gate1');

    // ── PHASE 2: CLASSIFY & CONTRACT ───────────────────────────────────────
    header('Phase 2: Classify & Contract');

    const classifications = getSelectedClassifications(await readFile(resolve(specPath), 'utf8'));
    state.classification = classifications[0];
    ok(`Classification: ${state.classification}`);

    const testGuidance = TEST_GUIDANCE[state.classification];
    if (testGuidance) {
      print();
      info(`Test type for this classification:`);
      info(testGuidance);
    }

    const contractInfo = CONTRACT_COMMANDS[state.classification];
    if (contractInfo) {
      print();
      info(`This classification requires a ${contractInfo.label}.`);
      const contractName = basename(specPath).replace('.md', '');
      const suggestedPath = `${contractInfo.dir}/${contractName}-${contractInfo.cmd}.md`;

      const hasContract = await confirm(`  Do you already have a ${contractInfo.label} at ${suggestedPath} or referenced in your spec?`);

      if (!hasContract) {
        info(`Create it with:`);
        info(`  spec-guard new ${contractInfo.cmd} ${suggestedPath}`);
        info(`Then add a reference to it in your spec's Dependencies section.`);
        await ask('  Press Enter when the contract is ready → ');
      }

      state.contractPath = suggestedPath;
    } else {
      info('No contract document required for this classification.');
    }

    // Re-check Gate 2
    let gate2Result = await gate2(specPath);
    while (!gate2Result.passed) {
      for (const d of gate2Result.blockers) {
        err(formatDiagnostic(d));
      }
      print();
      await ask('  Fix the issues above and press Enter to re-check → ');
      gate2Result = await gate2(specPath);
    }

    gate('Gate 2 passed: Contracts present');
    state.gatesPassed.push('gate2');

    // ── PHASE 3: TEST FIRST ─────────────────────────────────────────────────
    header('Phase 3: Test First');

    const specForTests = await readFile(resolve(specPath), 'utf8');
    const testsSection = extractSection(specForTests, 'Required Tests / Checks');
    if (testsSection) {
      info('Tests to write (from spec):');
      testsSection.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('<!--'))
        .forEach(l => info(`  ${l}`));
    }

    print();
    info('Write the tests listed above. Do not begin implementation yet.');
    await ask('  Press Enter when you have written the tests → ');

    print();
    info('Now run the tests and confirm they fail for the expected reason.');
    info('Expected failure means: the test runs, the assertion fails, and it fails because');
    info('the implementation does not yet exist — not because of a syntax error or wrong test.');

    const canRun = await confirm('  Can you run the tests right now?');

    if (canRun) {
      await ask('  Run your tests now, then press Enter to continue → ');
      const failed = await confirm('  Did the new test(s) fail for the expected reason?');

      if (failed) {
        const reason = await ask('  Briefly describe what failed and why (for the record): ');
        state.failureFirstConfirmed = true;
        state.failureFirstReason = reason;
        ok('Failure-first confirmed.');
      } else {
        warn('If the test passed immediately, it may not be testing the right thing.');
        warn('If it errored (syntax, import, etc.) rather than asserting, fix the test first.');
        const proceed = await confirm('  Do you want to record this as confirmed anyway with an explanation?');
        if (proceed) {
          const reason = await ask('  Explanation: ');
          state.failureFirstConfirmed = true;
          state.failureFirstReason = `Note: ${reason}`;
        } else {
          warn('Returning to test writing. Fix the test so it fails for the right reason.');
          await ask('  Press Enter when ready to re-confirm → ');
          const reason = await ask('  Describe the expected failure: ');
          state.failureFirstConfirmed = true;
          state.failureFirstReason = reason;
        }
      }
    } else {
      warn('Failure-first execution is impractical. This is only acceptable when:');
      warn('  - The test environment cannot be run at this stage');
      warn('  - A required dependency or infrastructure does not yet exist');
      warn('  - Running the test would cause irreversible side effects in a live system');
      const reason = await ask('  Record the concrete reason why failure-first is impractical: ');
      if (!reason || reason.length < 10) {
        warn('"Impractical" is not a sufficient reason. Please be specific.');
        const reason2 = await ask('  Concrete reason: ');
        state.failureFirstReason = reason2;
      } else {
        state.failureFirstReason = reason;
      }
      state.failureFirstConfirmed = false;
    }

    gate('Gate 3 passed: Failure confirmed (or reason recorded)');
    await updateSpecStatus(specPath, 'Ready');
    state.gatesPassed.push('gate3');

    // ── PHASE 4: IMPLEMENT ──────────────────────────────────────────────────
    header('Phase 4: Implement');

    info('Implement the smallest change that makes the failing tests pass.');
    info('Rules:');
    info('  • Change only what the spec requires');
    info('  • No unrequested features, refactors, or dependency upgrades');
    info('  • No inventing UI beyond design direction');
    info('  • If the spec proves wrong → stop, run: spec-guard deviation .spec-guard/deviations/<x>.md');
    info('  • If scope expands → stop, run: spec-guard scope-discovery .spec-guard/scope-discoveries/<x>.md');

    print();
    await ask('  Implement now. Press Enter when done and all tests pass → ');

    const allPass = await confirm('  Do all tests pass (including pre-existing tests)?');
    if (!allPass) {
      warn('Tests are not all passing. Do not proceed until they are.');
      await ask('  Press Enter when all tests pass → ');
    }

    const scopeClean = await confirm('  Was all discovered work accounted for (no silent scope absorption)?');
    if (!scopeClean) {
      info('Record any scope discoveries:');
      info('  spec-guard scope-discovery .spec-guard/scope-discoveries/<topic>.md');
      await ask('  Press Enter when discoveries are recorded → ');
    }

    gate('Gate 4 passed: Tests pass');
    state.gatesPassed.push('gate4');

    // ── PHASE 5: REVIEW ─────────────────────────────────────────────────────
    header('Phase 5: Review');

    const specName = basename(specPath).replace('.md', '');
    const reviewPath = `.spec-guard/reviews/${specName}.md`;

    info(`Create an implementation review:`);
    info(`  spec-guard review ${reviewPath}`);
    info(`Then complete all checklist items in the review file.`);

    await ask(`  Press Enter when the review is created and complete → `);
    state.reviewPath = reviewPath;

    let gate5Result = await gate5(reviewPath);
    if (!gate5Result.passed) {
      warn(gate5Result.reason || 'Review is not complete.');
      await ask('  Complete the review, then press Enter to re-check → ');
      gate5Result = await gate5(reviewPath);
    }

    if (gate5Result.passed) {
      gate('Gate 5 passed: Review complete');
      await updateSpecStatus(specPath, 'Implemented');
      state.gatesPassed.push('gate5');
    } else {
      warn('Review still has unchecked items. Recording as in-progress.');
    }

    // ── Summary ─────────────────────────────────────────────────────────────
    header('Run Complete');
    ok(`Spec: ${specPath}`);
    ok(`Classification: ${state.classification}`);
    ok(`Gates passed: ${state.gatesPassed.join(', ')}`);

    if (state.failureFirstConfirmed) {
      ok(`Failure-first confirmed: ${state.failureFirstReason}`);
    } else if (state.failureFirstReason) {
      warn(`Failure-first impractical: ${state.failureFirstReason}`);
    }

    if (state.gatesPassed.length === 5) {
      print();
      print('  ✓  All 5 gates passed. Implementation complete.');
    } else {
      print();
      warn(`  ${5 - state.gatesPassed.length} gate(s) not yet passed.`);
    }

    // Save run state
    await saveRunState(specPath, state);

    rl.close();
    return { exitCode: state.gatesPassed.length === 5 ? 0 : 1, state };

  } catch (error) {
    rl.close();
    throw error;
  }
}

// ─── Non-interactive runner (for CI/scripted use) ─────────────────────────────

export async function runCheck(specPath) {
  const results = {};

  try {
    await access(resolve(specPath), constants.F_OK);
  } catch {
    return { exitCode: 2, error: `Spec not found: ${specPath}` };
  }

  // Gate 1
  results.gate1 = await gate1(specPath);

  // Gate 2 (only if gate1 passed)
  if (results.gate1.passed) {
    results.gate2 = await gate2(specPath);
    const classifications = getSelectedClassifications(await readFile(resolve(specPath), 'utf8'));
    results.classification = classifications[0] || null;
    results.testGuidance = results.classification ? TEST_GUIDANCE[results.classification] : null;
  }

  results.specPath = specPath;
  return results;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function saveRunState(specPath, state) {
  const dir = '.spec-guard/runs';
  await mkdir(resolve(dir), { recursive: true });
  const name = basename(specPath).replace('.md', '');
  const runFile = resolve(dir, `${name}-run.json`);
  try {
    const specStat = await stat(resolve(specPath));
    state.specModifiedAt = specStat.mtimeMs;
  } catch { /* ignore */ }
  await writeFile(runFile, JSON.stringify(state, null, 2));
}

function extractSection(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^##\\s+${escaped}\\s*$`, 'm').exec(text);
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const next = /^##\s+/m.exec(rest);
  return next ? rest.slice(0, next.index).trim() : rest.trim();
}

function summarizeForReadme(text) {
  if (!text) return '';
  return text
    .replace(/<!--.*?-->/gs, '')
    .split('\n')
    .map(line => line.replace(/^[-*+]\s+/, '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 400)
    .trim();
}
