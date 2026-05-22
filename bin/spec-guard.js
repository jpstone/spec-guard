#!/usr/bin/env node
import { constants } from 'node:fs';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkSpecText,
  formatDiagnostic,
  formatDiagnosticJson,
  getSelectedClassifications,
  getSpecStatus,
  getSpecTitle,
} from '../src/check.js';
import { runInteractive, runCheck, PHASES, gate1, gate2, TEST_GUIDANCE } from '../src/run.js';
import { discoverInteractive, buildSpecFromAnswers, interviewQuestions } from '../src/discover.js';
import { initiativeQuestions, saveInitiative, initiativeInteractive } from '../src/initiative.js';
import { analyzeArtifacts } from '../src/analyze.js';
import { annotateDiagnostics, suggestFix } from '../src/suggest.js';
import { addDocLinkToReadme } from '../src/readme-maintenance.js';
import { updateSpecStatus } from '../src/spec-status.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const args = process.argv.slice(2);

// All spec-guard output lives under .spec-guard/ — hardcoded, no config needed.
const SG = Object.freeze({
  root:             '.spec-guard',
  specs:            '.spec-guard/specs',
  contracts:        '.spec-guard/contracts',
  blockers:         '.spec-guard/blockers',
  scopeDiscoveries: '.spec-guard/scope-discoveries',
  reviews:          '.spec-guard/reviews',
  deviations:       '.spec-guard/deviations',
  discoveries:      '.spec-guard/discoveries',
  runs:             '.spec-guard/runs',
  initiatives:      '.spec-guard/initiatives',
});

const NEW_DEFAULT_DIRS = Object.freeze({
  'spec':                 SG.specs,
  'brownfield-spec':      SG.specs,
  'api-contract':         SG.contracts,
  'rest-api-contract':    SG.contracts,
  'component-contract':   SG.contracts,
  'one-off-ui':           SG.specs,
  'operational-document': SG.specs,
  'task-plan':            SG.specs,
  'compound-work':        SG.specs,
});

const GITHUB_WORKFLOW = `name: Spec Guard

on:
  push:
    paths:
      - '.spec-guard/specs/**'
  pull_request:
    paths:
      - '.spec-guard/specs/**'

jobs:
  validate-specs:
    name: Validate specs
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install --save-dev @jpstone/spec-guard
      - run: npx spec-guard validate
`;

const NEW_TEMPLATES = Object.freeze({
  'spec':                    'templates/spec.md',
  'brownfield-spec':         'templates/brownfield-spec.md',
  'api-contract':            'templates/api-contract.md',
  'rest-api-contract':       'templates/rest-api-contract.md',
  'component-contract':      'templates/reusable-ui-component.md',
  'one-off-ui':              'templates/one-off-ui.md',
  'operational-document':    'templates/operational-document.md',
  'task-plan':               'templates/task-plan.md',
  'compound-work':           'templates/compound-work.md',
});

try {
  process.exitCode = await run(args);
} catch (error) {
  console.error(`[BLOCKER] SG-USAGE-001 <input>: ${error.message}`);
  process.exitCode = 2;
}

async function run(args) {
  const [command, ...rest] = args;

  if (command === 'run')             return runCommand(rest);
  if (command === 'draft')           return discoverCommand(rest);
  if (command === 'check')           return checkCommand(rest);
  if (command === 'analyze')         return analyzeCommand(rest);
  if (command === 'suggest')         return suggestCommand(rest);
  if (command === 'validate')        return validateCommand(rest);
  if (command === 'init')            return initCommand(rest);
  if (command === 'new')             return newCommand(rest);
  if (command === 'classify')        return classifyCommand(rest);
  if (command === 'status')          return statusCommand(rest);
  if (command === 'watch')           return watchCommand(rest);
  if (command === 'gate-status')     return gateStatusCommand(rest);
  if (command === 'confirm-gate')    return confirmGateCommand(rest);
  if (command === 'next')            return nextCommand(rest);
  if (command === 'interview-questions')  return interviewQuestionsCommand(rest);
  if (command === 'initiative-questions') return initiativeQuestionsCommand(rest);
  if (command === 'initiative')           return initiativeCommand(rest);
  if (command === 'blocker')         return copyTemplateCommand(rest, 'templates/blocker.md', 'blocker', 'blocker', SG.blockers);
  if (command === 'scope-discovery') return copyTemplateCommand(rest, 'templates/scope-discovery.md', 'scope-discovery', 'scope discovery', SG.scopeDiscoveries);
  if (command === 'review')          return copyTemplateCommand(rest, 'templates/implementation-review.md', 'review', 'implementation review', SG.reviews);
  if (command === 'discovery')       return copyTemplateCommand(rest, 'templates/discovery-request.md', 'discovery', 'discovery request', SG.discoveries);
  if (command === 'deviation')       return copyTemplateCommand(rest, 'templates/spec-deviation.md', 'deviation', 'spec deviation request', SG.deviations);

  printUsage();
  return 2;
}

// ─── run ──────────────────────────────────────────────────────────────────────

async function runCommand(args) {
  const flags = parseFlags(args);

  if (!flags.positional[0]) {
    console.error('Usage: spec-guard run [--check-only] <spec>');
    return 2;
  }

  const specPath = withDefaultDir(flags.positional[0], SG.specs);

  if (flags['check-only']) {
    const result = await runCheck(specPath);
    if (result.exitCode === 2) {
      console.error(`[BLOCKER] SG-USAGE-001 ${specPath}: ${result.error}`);
      return 2;
    }

    console.log(`\nSpec Guard Run Report: ${specPath}\n`);

    if (result.gate1.passed) {
      console.log('  ✓  Gate 1: Spec valid');
    } else {
      console.log('  ✗  Gate 1: Spec invalid');
      for (const d of result.gate1.blockers) {
        console.log(`       ${formatDiagnostic(d)}`);
      }
    }

    if (result.gate2) {
      if (result.gate2.passed) {
        console.log('  ✓  Gate 2: Contracts present');
      } else {
        console.log('  ✗  Gate 2: Contracts missing');
        for (const d of result.gate2.blockers) {
          console.log(`       ${formatDiagnostic(d)}`);
        }
      }
    } else {
      console.log('  —  Gate 2: Skipped (Gate 1 not passed)');
    }

    console.log('  —  Gate 3: Failure confirmed  (requires interactive run)');
    console.log('  —  Gate 4: Tests pass          (requires interactive run)');
    console.log('  —  Gate 5: Review complete     (requires interactive run)');

    if (result.classification) {
      console.log(`\n  Classification: ${result.classification}`);
    }
    if (result.testGuidance) {
      console.log(`  Test guidance:  ${result.testGuidance}`);
    }

    const allMechanicalGatesPassed = result.gate1?.passed && result.gate2?.passed;
    return allMechanicalGatesPassed ? 0 : 1;
  }

  const { exitCode } = await runInteractive(specPath, flags);
  return exitCode;
}

// ─── draft ───────────────────────────────────────────────────────────────────

async function discoverCommand(args) {
  const flags = parseFlags(args);
  const rawPath = flags.positional[0];

  if (!rawPath || flags.positional.length > 1) {
    console.error('Usage: spec-guard draft [--from-json <path|-] <name>');
    return 2;
  }

  const outputPath = resolveWritePath(rawPath, SG.specs);
  if (!outputPath) {
    console.error(`[BLOCKER] SG-USAGE-001 ${rawPath}: use a bare name — write commands always create files in .spec-guard/`);
    return 2;
  }
  const target = resolve(outputPath);

  try {
    await access(target, constants.F_OK);
    console.error(`[BLOCKER] SG-USAGE-002 ${outputPath}: file already exists`);
    return 1;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`[BLOCKER] SG-USAGE-001 ${outputPath}: ${err.message}`);
      return 2;
    }
  }

  let specText;
  if (flags['from-json']) {
    let data;
    try {
      data = await readJsonInput(flags['from-json']);
    } catch (err) {
      console.error(`[BLOCKER] SG-USAGE-001: cannot read JSON input: ${err.message}`);
      return 2;
    }
    specText = buildSpecFromAnswers({
      title: data.title || '',
      problem: data.problem || '',
      inScope: data.in_scope || [],
      outOfScope: data.out_of_scope || [],
      users: data.users || [],
      expectedBehavior: data.expected_behavior || '',
      acceptanceCriteria: data.acceptance_criteria || [],
      openQuestions: data.open_questions || [],
      classification: data.classification || null,
    });
  } else {
    if (!process.stdin.isTTY) {
      console.error('[BLOCKER] SG-USAGE-001: interactive mode requires a terminal. Use --from-json <path> to run non-interactively.');
      console.error('  Example: spec-guard draft --from-json answers.json <name>');
      console.error('  Run: npx spec-guard interview-questions --json  to get the question list and expected JSON shape.');
      return 2;
    }
    ({ specText } = await discoverInteractive());
  }

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, specText, { flag: 'wx' });

  console.log();
  console.log(`  Created: ${outputPath}`);
  console.log(`  Next:    spec-guard check ${outputPath}`);
  console.log(`  Then:    spec-guard run ${outputPath}`);
  return 0;
}

// ─── check ────────────────────────────────────────────────────────────────────

async function checkCommand(args) {
  const flags = parseFlags(args);
  const paths = flags.positional;

  if (paths.length !== 1) {
    console.error('Usage: spec-guard check [--json] [--warnings] <spec>');
    return 2;
  }

  const inputPath = withDefaultDir(paths[0], SG.specs);

  try {
    const text = await readFile(resolve(inputPath), 'utf8');
    const diagnostics = checkSpecText(text, inputPath);
    const filtered = flags.warnings ? diagnostics : diagnostics.filter(d => d.severity !== 'INFO');

    for (const diagnostic of filtered) {
      if (flags.json) {
        console.log(formatDiagnosticJson(diagnostic));
      } else {
        console.log(formatDiagnostic(diagnostic));
      }
    }

    return diagnostics.some((d) => d.severity === 'BLOCKER') ? 1 : 0;
  } catch (error) {
    console.error(`[BLOCKER] SG-USAGE-001 ${inputPath}: ${error.message}`);
    return 2;
  }
}

// ─── analyze ─────────────────────────────────────────────────────────────────

async function analyzeCommand(args) {
  const flags = parseFlags(args);
  const dryRun = flags['dry-run'] === true;

  if (!flags.positional[0]) {
    console.error('Usage: spec-guard analyze <spec> [--contract path] [--review path] [--dry-run] [--json]');
    return 2;
  }

  const specPath = withDefaultDir(flags.positional[0], SG.specs);
  const contractPath = flags.contract || await inferContractPath(specPath);
  const reviewPath = dryRun ? null : (flags.review || inferReviewPath(specPath));

  const result = await analyzeArtifacts({ specPath, contractPath, reviewPath, dryRun });

  if (result.error) {
    console.error(`[BLOCKER] SG-USAGE-001 ${specPath}: ${result.error}`);
    return 2;
  }

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return dryRun ? 0 : (result.clean ? 0 : 1);
  }

  if (dryRun) {
    console.log(`\nSpec Guard Pre-Implementation Check (dry-run): ${result.title}`);
  } else {
    console.log(`\nSpec Guard Analysis: ${result.title}`);
  }
  console.log(`  Spec:       ${specPath}`);
  if (contractPath) console.log(`  Contract:   ${contractPath}`);
  if (!dryRun && reviewPath) console.log(`  Review:     ${reviewPath}`);
  console.log(`  Classification: ${result.classification || '—'}`);
  console.log(`  Criteria: ${result.criteriaCount}   Required tests: ${result.testsCount}`);
  console.log();

  if (result.diagnostics.length === 0) {
    console.log(dryRun ? '  ✓  No pre-implementation issues found.' : '  ✓  All artifacts aligned.');
  } else {
    for (const d of result.diagnostics) {
      console.log(formatDiagnostic(d));
    }
  }

  const w = result.warningCount, b = result.blockerCount;
  console.log(`\n${b > 0 ? b + ' blocker(s)' : ''}${b > 0 && w > 0 ? ', ' : ''}${w > 0 ? w + ' warning(s)' : ''}${result.clean ? '✓ clean' : ''}\n`);
  return dryRun ? 0 : (result.clean ? 0 : 1);
}

// ─── suggest ──────────────────────────────────────────────────────────────────

async function suggestCommand(args) {
  const flags = parseFlags(args);

  if (!flags.positional[0]) {
    console.error('Usage: spec-guard suggest [--warnings] <spec>');
    return 2;
  }

  const inputPath = withDefaultDir(flags.positional[0], SG.specs);

  let text;
  try {
    text = await readFile(resolve(inputPath), 'utf8');
  } catch (error) {
    console.error(`[BLOCKER] SG-USAGE-001 ${inputPath}: ${error.message}`);
    return 2;
  }

  const diagnostics = checkSpecText(text, inputPath);
  const filtered = flags.warnings ? diagnostics : diagnostics.filter(d => d.severity !== 'INFO');

  if (filtered.length === 0) {
    console.log(`✓  No issues found in ${inputPath}`);
    return 0;
  }

  const annotated = annotateDiagnostics(filtered);
  const SEPARATOR = '─'.repeat(60);

  for (const d of annotated) {
    console.log();
    console.log(SEPARATOR);
    console.log(formatDiagnostic(d));
    console.log();
    console.log('  Fix:');
    for (const line of d.suggestion.split('\n')) {
      console.log(`  ${line}`);
    }
  }
  console.log();
  console.log(SEPARATOR);
  console.log(`\n${annotated.length} issue(s) — run  spec-guard watch ${inputPath}  for live feedback while editing.\n`);

  return diagnostics.some(d => d.severity === 'BLOCKER') ? 1 : 0;
}

// ─── validate ────────────────────────────────────────────────────────────────

async function validateCommand(args) {
  const flags = parseFlags(args);
  const dir = flags.positional[0] || SG.specs;

  let files;
  try {
    files = await collectMarkdownFiles(resolve(dir));
  } catch (error) {
    console.error(`[BLOCKER] SG-USAGE-001 ${dir}: ${error.message}`);
    return 2;
  }

  if (files.length === 0) {
    console.log(`No spec files found in ${dir}`);
    return 0;
  }

  let hasBlocker = false;
  const summary = [];

  for (const file of files) {
    const relPath = relative(process.cwd(), file);
    const text = await readFile(file, 'utf8');
    const diagnostics = checkSpecText(text, relPath);
    const filtered = flags.warnings ? diagnostics : diagnostics.filter(d => d.severity !== 'INFO');

    if (filtered.length > 0) {
      for (const d of filtered) {
        if (flags.json) {
          console.log(formatDiagnosticJson(d));
        } else {
          console.log(formatDiagnostic(d));
        }
      }
      if (diagnostics.some(d => d.severity === 'BLOCKER')) hasBlocker = true;
      summary.push({ path: relPath, blockers: diagnostics.filter(d => d.severity === 'BLOCKER').length });
    }
  }

  if (!flags.json) {
    const blockerFiles = summary.filter(s => s.blockers > 0).length;
    const clean = files.length - summary.length;
    console.log(`\nValidated ${files.length} spec(s): ${clean} clean, ${summary.length} with issues (${blockerFiles} with blockers)`);
  }

  return hasBlocker ? 1 : 0;
}

// ─── init ────────────────────────────────────────────────────────────────────

async function initCommand(args) {
  if (args.length > 0) {
    console.error('Usage: spec-guard init');
    return 2;
  }

  const directories = [
    ['.spec-guard', 'specs'],
    ['.spec-guard', 'contracts'],
    ['.spec-guard', 'blockers'],
    ['.spec-guard', 'scope-discoveries'],
    ['.spec-guard', 'reviews'],
    ['.spec-guard', 'deviations'],
    ['.spec-guard', 'discoveries'],
    ['.spec-guard', 'runs'],
    ['.spec-guard', 'initiatives'],
  ];

  for (const parts of directories) {
    await mkdir(resolve('.', ...parts), { recursive: true });
  }

  // Starter spec
  const starterSpec = resolve('.spec-guard', 'specs', 'example.md');
  try {
    await access(starterSpec, constants.F_OK);
  } catch {
    const template = await readFile(join(rootDir, 'templates', 'spec.md'), 'utf8');
    await writeFile(starterSpec, template, { flag: 'wx' });
    console.log(`  Created: .spec-guard/specs/example.md`);
  }

  // AGENTS.md — stays at project root for agent context auto-loading
  const agentsFile = resolve('AGENTS.md');
  try {
    await access(agentsFile, constants.F_OK);
  } catch {
    const agentContent = await readFile(join(rootDir, 'AGENTS.md'), 'utf8');
    await writeFile(agentsFile, agentContent, { flag: 'wx' });
    console.log(`  Created: AGENTS.md`);
  }

  // WORKFLOW.md — stays at project root for agent context auto-loading
  const workflowFile = resolve('WORKFLOW.md');
  try {
    await access(workflowFile, constants.F_OK);
  } catch {
    const wfContent = await readFile(join(rootDir, 'WORKFLOW.md'), 'utf8');
    await writeFile(workflowFile, wfContent, { flag: 'wx' });
    console.log(`  Created: WORKFLOW.md`);
  }

  // GitHub Actions workflow
  const ciDir = resolve('.github', 'workflows');
  const ciFile = resolve(ciDir, 'spec-guard.yml');
  try {
    await access(ciFile, constants.F_OK);
  } catch {
    await mkdir(ciDir, { recursive: true });
    await writeFile(ciFile, GITHUB_WORKFLOW, { flag: 'wx' });
    console.log(`  Created: .github/workflows/spec-guard.yml`);
  }

  console.log(`Initialized Spec Guard`);
  return 0;
}

// ─── new ─────────────────────────────────────────────────────────────────────

async function newCommand(args) {
  const flags = parseFlags(args);
  const [kind, rawPath, ...extra] = flags.positional;

  if (!kind || !rawPath || extra.length > 0) {
    const kinds = Object.keys(NEW_TEMPLATES).join(' | ');
    console.error(`Usage: spec-guard new <kind> [--spec <spec>] <name>`);
    console.error(`Kinds: ${kinds}`);
    return 2;
  }

  const templatePath = NEW_TEMPLATES[kind];
  if (!templatePath) {
    const kinds = Object.keys(NEW_TEMPLATES).join(', ');
    console.error(`Unknown kind: "${kind}". Valid kinds: ${kinds}`);
    return 2;
  }

  const outputPath = resolveWritePath(rawPath, NEW_DEFAULT_DIRS[kind]);
  if (!outputPath) {
    console.error(`[BLOCKER] SG-USAGE-001 ${rawPath}: use a bare name — write commands always create files in .spec-guard/`);
    return 2;
  }

  const specPath = flags.spec ? withDefaultDir(flags.spec, SG.specs) : null;
  if (specPath) {
    const validation = await validateSpecLinkTarget(specPath);
    if (validation !== 0) return validation;
  }

  const result = await copyTemplate(templatePath, outputPath, kind);
  if (result === 0 && specPath && isSpecLinkedNewArtifact(kind)) {
    await addArtifactLinkToSpec(specPath, outputPath, artifactLabelForKind(kind));
  }
  return result;
}

// ─── classify ────────────────────────────────────────────────────────────────

async function classifyCommand(args) {
  const flags = parseFlags(args);

  if (!flags.positional[0] || flags.positional.length > 1) {
    console.error('Usage: spec-guard classify [--json] <spec>');
    return 2;
  }

  const inputPath = withDefaultDir(flags.positional[0], SG.specs);

  try {
    const text = await readFile(resolve(inputPath), 'utf8');
    const selected = getSelectedClassifications(text);

    if (selected.length === 1) {
      const classification = selected[0];
      const guidance = TEST_GUIDANCE[classification] || null;
      if (flags.json) {
        console.log(JSON.stringify({ path: inputPath, classification, test_guidance: guidance }));
      } else {
        console.log(classification);
        if (guidance) console.log(`\n  Test guidance: ${guidance}`);
      }
      return 0;
    }

    const diagnostic = {
      severity: 'BLOCKER',
      ruleId: 'SG-CLASS-001',
      path: inputPath,
      message: selected.length === 0
        ? 'exactly one work classification must be selected; found none'
        : `exactly one work classification must be selected; found ${selected.length}`,
    };

    if (flags.json) {
      console.log(formatDiagnosticJson(diagnostic));
    } else {
      console.log(formatDiagnostic(diagnostic));
    }
    return 1;
  } catch (error) {
    console.error(`[BLOCKER] SG-USAGE-001 ${inputPath}: ${error.message}`);
    return 2;
  }
}

// ─── gate-status ─────────────────────────────────────────────────────────────

async function gateStatusCommand(args) {
  const flags = parseFlags(args);

  if (!flags.positional[0] || flags.positional.length > 1) {
    console.error('Usage: spec-guard gate-status [--json] <spec>');
    return 2;
  }

  const inputPath = withDefaultDir(flags.positional[0], SG.specs);

  let text;
  try {
    text = await readFile(resolve(inputPath), 'utf8');
  } catch (err) {
    console.error(`[BLOCKER] SG-USAGE-001 ${inputPath}: ${err.message}`);
    return 2;
  }

  const g1 = await gate1(inputPath);
  const g2 = g1.passed ? await gate2(inputPath) : null;
  const classifications = getSelectedClassifications(text);
  const classification = classifications.length === 1 ? classifications[0] : null;

  // Load saved run state for gates 3–5
  const name = basename(inputPath).replace('.md', '');
  const runFile = join(resolve(SG.runs), `${name}-run.json`);
  let runState = { gatesPassed: [] };
  try {
    runState = JSON.parse(await readFile(runFile, 'utf8'));
  } catch { /* no run state yet */ }

  const g3passed = runState.gatesPassed?.includes('gate3') ?? false;
  const g4passed = runState.gatesPassed?.includes('gate4') ?? false;
  const g5passed = runState.gatesPassed?.includes('gate5') ?? false;
  const g6passed = runState.gatesPassed?.includes('gate6') ?? false;

  if (flags.json) {
    console.log(JSON.stringify({
      spec_path: inputPath,
      status: getSpecStatus(text) || 'Unknown',
      gate1: { passed: g1.passed, label: 'Spec valid',         blockers: g1.blockers.map(d => formatDiagnostic(d)) },
      gate2: g2
        ? { passed: g2.passed, label: 'Contracts present',     blockers: g2.blockers.map(d => formatDiagnostic(d)) }
        : { passed: false,     label: 'Contracts present', skipped: true, reason: 'Gate 1 must pass first' },
      gate3: { passed: g3passed, label: 'Planning confirmed', manual: true },
      gate4: { passed: g4passed, label: 'Failure confirmed', manual: true },
      gate5: { passed: g5passed, label: 'Tests pass',        manual: true },
      gate6: { passed: g6passed, label: 'Review complete',   manual: true },
      classification,
      test_guidance: classification ? TEST_GUIDANCE[classification] : null,
      ready_to_implement: g1.passed && (g2?.passed ?? false) && g3passed && g4passed,
    }));
    return 0;
  }

  const mark = (passed) => passed ? '✓' : '✗';
  const skip = (reason) => `— ${reason}`;

  console.log(`\nSpec: ${inputPath}`);
  console.log(`Status: ${getSpecStatus(text) || 'Unknown'}`);
  if (classification) console.log(`Classification: ${classification}`);
  console.log('');
  console.log(`  Gate 1 [${mark(g1.passed)}] Spec valid`);
  if (!g1.passed) g1.blockers.forEach(d => console.log(`         ${formatDiagnostic(d)}`));

  if (g2) {
    console.log(`  Gate 2 [${mark(g2.passed)}] Contracts present`);
    if (!g2.passed) g2.blockers.forEach(d => console.log(`         ${formatDiagnostic(d)}`));
  } else {
    console.log(`  Gate 2 [${skip('Gate 1 must pass first')}]`);
  }

  console.log(`  Gate 3 [${mark(g3passed)}] Planning confirmed (agent-confirmed — use spec-guard confirm-gate)`);
  console.log(`  Gate 4 [${mark(g4passed)}] Failure confirmed  (agent-confirmed — use spec-guard confirm-gate)`);
  console.log(`  Gate 5 [${mark(g5passed)}] Tests pass         (agent-confirmed — use spec-guard confirm-gate)`);
  console.log(`  Gate 6 [${mark(g6passed)}] Review complete    (agent-confirmed — use spec-guard confirm-gate)`);
  console.log('');

  return 0;
}

// ─── confirm-gate ─────────────────────────────────────────────────────────────

async function confirmGateCommand(args) {
  const flags = parseFlags(args);

  // Usage: confirm-gate <spec> <gate-number> [--evidence="..."] [--no-confirm]
  if (flags.positional.length < 2) {
    console.error('Usage: spec-guard confirm-gate <spec> <gate> [--evidence=<text>] [--no-confirm]');
    console.error('  <gate>: 3, 4, 5, or 6');
    console.error('  --evidence: required for gate 4; describe what failed and why');
    console.error('  --no-confirm: record gate as not-confirmed (problem encountered)');
    return 2;
  }

  const inputPath = withDefaultDir(flags.positional[0], SG.specs);
  const gate = parseInt(flags.positional[1], 10);
  const confirmed = flags['confirm'] !== false;
  const evidence = flags.evidence ?? null;

  if (![3, 4, 5, 6].includes(gate)) {
    console.error(`Gate must be 3, 4, 5, or 6 (gates 1 and 2 are automated). Got: ${gate}`);
    return 2;
  }

  if (gate === 4 && confirmed && !evidence) {
    console.error('Gate 4 confirmation requires --evidence describing what failed and why.');
    console.error('  Example: spec-guard confirm-gate <spec> 4 --evidence="test auth.test.js fails: 401 returned instead of 403"');
    return 2;
  }

  const runDir = resolve(SG.runs);
  await mkdir(runDir, { recursive: true });

  const name = basename(inputPath).replace('.md', '');
  const runFile = join(runDir, `${name}-run.json`);

  let runState = { specPath: inputPath, gatesPassed: [], startedAt: new Date().toISOString() };
  try {
    runState = JSON.parse(await readFile(runFile, 'utf8'));
  } catch { /* no existing run state — start fresh */ }

  const gateKey = `gate${gate}`;

  if (confirmed) {
    if (!runState.gatesPassed.includes(gateKey)) runState.gatesPassed.push(gateKey);
    if (gate === 4) {
      runState.failureFirstConfirmed = true;
      runState.failureFirstReason = evidence;
      await updateSpecStatus(inputPath, 'Ready');
    }
    if (gate === 6) {
      await updateSpecStatus(inputPath, 'Implemented');
    }
  }

  runState[`gate${gate}_confirmed`] = confirmed;
  runState[`gate${gate}_evidence`] = evidence ?? null;
  runState[`gate${gate}_confirmedAt`] = new Date().toISOString();

  await writeFile(runFile, JSON.stringify(runState, null, 2));

  if (flags.json) {
    console.log(JSON.stringify({
      success: true,
      gate,
      confirmed,
      gates_passed: runState.gatesPassed,
      message: confirmed
        ? `Gate ${gate} confirmed and recorded.`
        : `Gate ${gate} not confirmed. Record the reason and address it before proceeding.`,
    }));
  } else {
    console.log(confirmed
      ? `  Gate ${gate} confirmed and recorded.`
      : `  Gate ${gate} not confirmed — address the issue before proceeding.`);
    console.log(`  Gates passed: ${runState.gatesPassed.join(', ') || 'none'}`);
  }

  return 0;
}

// ─── next ─────────────────────────────────────────────────────────────────────

async function nextCommand(args) {
  const flags = parseFlags(args);

  if (!flags.positional[0] || flags.positional.length > 1) {
    console.error('Usage: spec-guard next [--json] <spec>');
    return 2;
  }

  const inputPath = withDefaultDir(flags.positional[0], SG.specs);

  let text;
  try {
    text = await readFile(resolve(inputPath), 'utf8');
  } catch {
    const msg = {
      next_action: 'create_spec',
      instruction: `Spec file not found: ${inputPath}. Create it with: spec-guard new spec <name>`,
      gate_target: 'gate1',
    };
    if (flags.json) { console.log(JSON.stringify(msg)); } else { console.log(msg.instruction); }
    return 1;
  }

  // Load saved run state for gates 3–5
  const name = basename(inputPath).replace('.md', '');
  const runFile = join(resolve(SG.runs), `${name}-run.json`);
  let runState = { gatesPassed: [] };
  try {
    runState = JSON.parse(await readFile(runFile, 'utf8'));
  } catch { /* no run state */ }

  const gatesPassed = runState.gatesPassed ?? [];

  let result;

  if (!gatesPassed.includes('gate1')) {
    const g1 = await gate1(inputPath);
    if (!g1.passed) {
      result = {
        next_action: 'fix_spec',
        instruction: 'Gate 1 is blocked. Fix the spec issues listed below.',
        gate_target: 'gate1',
        blockers: g1.blockers.map(d => formatDiagnostic(d)),
      };
    } else {
      result = {
        next_action: 'confirm_gate1',
        instruction: 'Spec passes all checks. Run: spec-guard confirm-gate <spec> 1 (or confirm via gate1 in the orchestrated run)',
        gate_target: 'gate1',
      };
    }
  } else if (!gatesPassed.includes('gate2')) {
    const classifications = getSelectedClassifications(text);
    const classification = classifications[0];
    const g2 = await gate2(inputPath);
    if (!g2.passed) {
      result = {
        next_action: 'create_contract',
        instruction: `Gate 2 is blocked. Classification: "${classification}". Create the required contract artifact and reference it in the spec's Dependencies section.`,
        gate_target: 'gate2',
        classification,
        test_guidance: TEST_GUIDANCE[classification],
        blockers: g2.blockers.map(d => formatDiagnostic(d)),
      };
    } else {
      result = {
        next_action: 'confirm_gate2',
        instruction: 'Gate 2 checks pass. Proceed to Phase 3 (implementation planning).',
        gate_target: 'gate2',
        classification,
        test_guidance: TEST_GUIDANCE[classification],
      };
    }
  } else if (!gatesPassed.includes('gate3')) {
    const g1 = await gate1(inputPath);
    const planningBlockers = g1.blockers.filter(d => d.ruleId === 'SG-PLAN-001');
    result = planningBlockers.length > 0
      ? {
          next_action: 'confirm_implementation_plan',
          instruction: 'Implementation planning is required. Suggest a context-appropriate stack/layer, ask the human to accept or override it, record the accepted plan, then confirm Gate 3.',
          gate_target: 'gate3',
          blockers: planningBlockers.map(d => formatDiagnostic(d)),
        }
      : {
          next_action: 'confirm_gate3',
          instruction: 'Implementation planning is satisfied. Record via: spec-guard confirm-gate <spec> 3, then proceed to Phase 4 (write failing tests).',
          gate_target: 'gate3',
        };
  } else if (!gatesPassed.includes('gate4')) {
    const classifications = getSelectedClassifications(text);
    result = {
      next_action: 'write_failing_tests',
      instruction: 'Write tests that verify every acceptance criterion. Run them before implementing. Confirm they fail for the expected reason. Then: spec-guard confirm-gate <spec> 4 --evidence="<what failed and why>"',
      gate_target: 'gate4',
      test_guidance: TEST_GUIDANCE[classifications[0]],
    };
  } else if (!gatesPassed.includes('gate5')) {
    result = {
      next_action: 'implement',
      instruction: 'Implement the smallest change that makes the failing tests pass. Follow the spec strictly. When all tests pass: spec-guard confirm-gate <spec> 5',
      gate_target: 'gate5',
    };
  } else if (!gatesPassed.includes('gate6')) {
    result = {
      next_action: 'complete_review',
      instruction: `Create an implementation review: spec-guard review <name>. Complete all checklist items. Then: spec-guard confirm-gate <spec> 6`,
      gate_target: 'gate6',
      suggested_review_path: `.spec-guard/reviews/${name}.md`,
    };
  } else {
    result = {
      next_action: 'complete',
      instruction: 'All 6 gates passed. Implementation is complete.',
      gate_target: null,
      complete: true,
    };
  }

  if (flags.json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`\n  Next: ${result.next_action} (${result.gate_target ?? 'done'})`);
    console.log(`  ${result.instruction}`);
    if (result.blockers?.length) {
      console.log('');
      result.blockers.forEach(b => console.log(`  ${b}`));
    }
    if (result.test_guidance) {
      console.log(`\n  Test guidance: ${result.test_guidance}`);
    }
    console.log('');
  }

  return result.complete ? 0 : 1;
}

// ─── interview-questions ──────────────────────────────────────────────────────

async function interviewQuestionsCommand(args) {
  const flags = parseFlags(args);
  const result = interviewQuestions(flags.classification || null);

  if (flags.json) {
    console.log(JSON.stringify(result));
    return 0;
  }

  console.log('\n  Required questions:\n');
  for (const q of result.pre_classification) {
    console.log(`  [${q.field}] ${q.question}`);
    console.log(`    ${q.hint}`);
    console.log();
  }
  console.log('  Optional questions:\n');
  for (const q of result.universal_optional) {
    console.log(`  [${q.field}] ${q.question}`);
    console.log(`    ${q.hint}`);
    console.log();
  }
  return 0;
}

// ─── initiative-questions ─────────────────────────────────────────────────────

async function initiativeQuestionsCommand(args) {
  const flags = parseFlags(args);
  const questions = initiativeQuestions();

  if (flags.json) {
    console.log(JSON.stringify(questions));
    return 0;
  }

  console.log('\n  Required questions:\n');
  for (const q of questions.required) {
    console.log(`  [${q.id}] ${q.question}`);
    console.log(`    ${q.notes}`);
    console.log();
  }
  console.log('  Optional questions:\n');
  for (const q of questions.optional) {
    console.log(`  [${q.id}] ${q.question}`);
    console.log(`    ${q.notes}`);
    console.log();
  }
  return 0;
}

// ─── initiative ───────────────────────────────────────────────────────────────

async function initiativeCommand(args) {
  const flags = parseFlags(args);
  const rawName = flags.positional[0];

  if (!rawName || flags.positional.length > 1) {
    console.error('Usage: spec-guard initiative [--from-json <path>|-] <name>');
    return 2;
  }

  const outputPath = resolve(SG.initiatives, `${rawName}.md`);
  try {
    await access(outputPath, constants.F_OK);
    console.error(`[BLOCKER] SG-USAGE-002 ${outputPath}: file already exists`);
    return 1;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`[BLOCKER] SG-USAGE-001 ${outputPath}: ${err.message}`);
      return 2;
    }
  }

  let answers;
  if (flags['from-json']) {
    let data;
    try {
      data = await readJsonInput(flags['from-json']);
    } catch (err) {
      console.error(`[BLOCKER] SG-USAGE-001: cannot read JSON input: ${err.message}`);
      return 2;
    }
    answers = { name: rawName, title: data.title || '', description: data.description || '', slices: data.slices || [] };
  } else {
    if (!process.stdin.isTTY) {
      console.error('[BLOCKER] SG-USAGE-001: interactive mode requires a terminal. Use --from-json <path> to run non-interactively.');
      console.error('  Example: spec-guard initiative --from-json init.json <name>');
      console.error('  Run: npx spec-guard initiative-questions --json  to get the question list and expected JSON shape.');
      return 2;
    }
    answers = await initiativeInteractive();
    if (answers.error) {
      console.error(`[BLOCKER] SG-USAGE-001: ${answers.error}`);
      return 1;
    }
  }

  const result = await saveInitiative({ ...answers });
  if (result.error) {
    console.error(`[BLOCKER] SG-USAGE-001: ${result.error}`);
    return 1;
  }

  console.log();
  console.log(`  Created: ${result.path}`);
  console.log(`  Slices:  ${result.slices.map(s => s.name).join(', ')}`);
  console.log();
  console.log('  Next: run  spec-guard draft <slice-name>  for each slice.');
  return 0;
}

// ─── status ──────────────────────────────────────────────────────────────────

async function statusCommand(args) {
  const flags = parseFlags(args);
  const dir = flags.positional[0] || SG.specs;

  let files;
  try {
    files = await collectMarkdownFiles(resolve(dir));
  } catch (error) {
    console.error(`[BLOCKER] SG-USAGE-001 ${dir}: ${error.message}`);
    return 2;
  }

  if (files.length === 0) {
    console.log(`No spec files found in ${dir}`);
    return 0;
  }

  const rows = [];
  for (const file of files) {
    const relPath = relative(process.cwd(), file);
    const text = await readFile(file, 'utf8');
    const title = getSpecTitle(text) || relPath;
    const status = getSpecStatus(text) || 'Unknown';
    const classifications = getSelectedClassifications(text);
    const classification = classifications.length === 1 ? classifications[0] : '—';
    const diagnostics = checkSpecText(text, relPath);
    const blockers = diagnostics.filter(d => d.severity === 'BLOCKER').length;
    const warnings = diagnostics.filter(d => d.severity === 'WARNING').length;
    rows.push({ path: relPath, title, status, classification, blockers, warnings });
  }

  if (flags.json) {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }

  const statusPad = 12;
  const classPad = 38;
  const issuePad = 10;

  console.log('\nSpec Guard Status\n');
  console.log(
    'Status'.padEnd(statusPad) +
    'Classification'.padEnd(classPad) +
    'Issues'.padEnd(issuePad) +
    'Path'
  );
  console.log('─'.repeat(statusPad + classPad + issuePad + 40));

  for (const r of rows) {
    const issues = r.blockers > 0
      ? `${r.blockers}B ${r.warnings}W`
      : r.warnings > 0
        ? `0B ${r.warnings}W`
        : 'clean';

    console.log(
      r.status.padEnd(statusPad) +
      r.classification.padEnd(classPad) +
      issues.padEnd(issuePad) +
      r.path
    );
  }

  const total = rows.length;
  const clean = rows.filter(r => r.blockers === 0 && r.warnings === 0).length;
  const ready = rows.filter(r => r.status === 'Ready').length;
  const blocked = rows.filter(r => r.status === 'Blocked').length;
  console.log(`\n${total} spec(s) — ${ready} Ready, ${blocked} Blocked, ${clean} clean\n`);
  return 0;
}

// ─── watch ────────────────────────────────────────────────────────────────────

async function watchCommand(args) {
  const { watch } = await import('node:fs/promises');
  const flags = parseFlags(args);

  if (!flags.positional[0]) {
    console.error('Usage: spec-guard watch <spec>');
    return 2;
  }

  const inputPath = withDefaultDir(flags.positional[0], SG.specs);
  const absPath = resolve(inputPath);

  async function runCheck() {
    try {
      const text = await readFile(absPath, 'utf8');
      const diagnostics = checkSpecText(text, inputPath);
      process.stdout.write('\x1Bc');
      console.log(`Watching: ${inputPath}\n`);

      if (diagnostics.length === 0) {
        console.log('✓ No blockers or warnings.');
      } else {
        for (const d of diagnostics) {
          console.log(formatDiagnostic(d));
        }
      }

      const blockers = diagnostics.filter(d => d.severity === 'BLOCKER').length;
      const warnings = diagnostics.filter(d => d.severity === 'WARNING').length;
      const gate1 = blockers === 0 ? '✓ Gate 1 ready' : `✗ Gate 1 blocked (${blockers} blocker(s))`;
      console.log(`\n${gate1} — ${warnings} warning(s) — ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      console.error(`Error reading ${inputPath}: ${error.message}`);
    }
  }

  await runCheck();

  try {
    const watcher = watch(absPath);
    for await (const event of watcher) {
      if (event.eventType === 'change') await runCheck();
    }
  } catch (error) {
    console.error(`Watch failed: ${error.message}`);
    return 2;
  }

  return 0;
}

// ─── template commands ────────────────────────────────────────────────────────

async function copyTemplateCommand(args, templatePath, commandName, label, defaultDir) {
  const flags = parseFlags(args);
  const [rawPath, ...extra] = flags.positional;
  if (!rawPath || extra.length > 0) {
    console.error(`Usage: spec-guard ${commandName} [--spec <spec>] <name>`);
    return 2;
  }
  const outputPath = resolveWritePath(rawPath, defaultDir);
  if (!outputPath) {
    console.error(`[BLOCKER] SG-USAGE-001 ${rawPath}: use a bare name — write commands always create files in .spec-guard/`);
    return 2;
  }
  const specPath = flags.spec ? withDefaultDir(flags.spec, SG.specs) : null;
  if (specPath) {
    const validation = await validateSpecLinkTarget(specPath);
    if (validation !== 0) return validation;
  }

  const result = await copyTemplate(templatePath, outputPath, label);
  if (result === 0 && specPath) {
    await addArtifactLinkToSpec(specPath, outputPath, label);
  }
  if (result === 0 && specPath && (commandName === 'blocker' || commandName === 'deviation')) {
    await updateSpecStatus(specPath, 'Blocked');
  }
  return result;
}

async function copyTemplate(templatePath, outputPath, label) {
  const source = join(rootDir, templatePath);
  const target = resolve(outputPath);

  try {
    await access(target, constants.F_OK);
    console.error(`[BLOCKER] SG-USAGE-002 ${outputPath}: file already exists`);
    return 1;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`[BLOCKER] SG-USAGE-001 ${outputPath}: ${error.message}`);
      return 2;
    }
  }

  await mkdir(dirname(target), { recursive: true });
  let template = await readFile(source, 'utf8');
  let apiDocPath = null;
  if (label === 'api-contract' || label === 'rest-api-contract') {
    apiDocPath = await selectEndUserApiDocPath(outputPath);
    template = withEndUserApiDocPath(template, apiDocPath);
  }
  await writeFile(target, template, { flag: 'wx' });
  console.log(`Created ${label}: ${outputPath}`);

  if (apiDocPath) {
    await createEndUserApiDoc(apiDocPath, outputPath);
    await addDocLinkToReadme({ docPath: apiDocPath });
    console.log(`Created end-user API doc: ${apiDocPath}`);
  }

  return 0;
}

function isSpecLinkedNewArtifact(kind) {
  return kind === 'api-contract' || kind === 'rest-api-contract' || kind === 'component-contract';
}

function artifactLabelForKind(kind) {
  return kind.replace(/-/g, ' ');
}

async function validateSpecLinkTarget(specPath) {
  try {
    await access(resolve(specPath), constants.F_OK);
    return 0;
  } catch (error) {
    console.error(`[BLOCKER] SG-USAGE-001 ${specPath}: ${error.message}`);
    return 2;
  }
}

async function addArtifactLinkToSpec(specPath, artifactPath, label) {
  const resolvedSpec = resolve(specPath);
  const relativeArtifact = relative(dirname(resolvedSpec), resolve(artifactPath)).replace(/\\/g, '/');
  const text = await readFile(resolvedSpec, 'utf8');
  const normalizedText = text.replace(/\\/g, '/');
  if (normalizedText.includes(relativeArtifact)) return;

  const entry = `- [${label}](${relativeArtifact})`;
  let updated;
  if (/^## Related Artifacts\s*$/m.test(text)) {
    updated = text.replace(/(^## Related Artifacts\s*\n)([\s\S]*?)(?=^## |(?![\s\S]))/m, (match, heading, body) => {
      const separator = body.trim().length === 0 ? '' : (body.endsWith('\n') ? '' : '\n');
      return `${heading}${body}${separator}${entry}\n\n`;
    });
  } else {
    const section = `## Related Artifacts\n\n${entry}\n\n`;
    if (/^## Documentation Requirements\s*$/m.test(text)) {
      updated = text.replace(/^## Documentation Requirements\s*$/m, `${section}## Documentation Requirements`);
    } else if (/^## Dependencies\s*$/m.test(text)) {
      updated = text.replace(/^## Dependencies\s*$/m, `${section}## Dependencies`);
    } else {
      updated = text.endsWith('\n') ? `${text}\n${section}` : `${text}\n\n${section}`;
    }
  }

  await writeFile(resolvedSpec, updated, 'utf8');
}

// ─── Utilities ────────────────────────────────────────────────────────────────

async function selectEndUserApiDocPath(contractOutputPath) {
  const contractName = basename(contractOutputPath).replace(/\.md$/, '');
  const apiDocName = `${contractName.replace(/(?:[-_]?contract)+$/i, '')}-api.md`;
  const docDir = await findObviousDocumentationDir();
  return join(docDir, apiDocName).replace(/\\/g, '/');
}

async function findObviousDocumentationDir() {
  const readme = await readRepositoryReadme();
  const tocDir = readme ? documentationDirFromReadmeToc(readme.text) : null;
  if (tocDir) return tocDir;

  for (const candidate of ['docs', 'documentation', 'doc', 'guides']) {
    try {
      const entries = await readdir(resolve(candidate));
      if (entries.some(entry => entry.toLowerCase().endsWith('.md'))) return candidate;
    } catch { /* not present */ }
  }

  return 'docs';
}

async function readRepositoryReadme() {
  for (const name of ['README.md', 'README']) {
    try {
      return { path: name, text: await readFile(resolve(name), 'utf8') };
    } catch { /* continue */ }
  }
  return null;
}

function documentationDirFromReadmeToc(text) {
  const section = extractMarkdownSection(text, 'Table of Contents');
  if (!section) return null;
  const match = /\[[^\]]+\]\(([^)]+\.md)(?:#[^)]+)?\)/i.exec(section);
  if (!match) return null;
  const linkedPath = match[1].trim();
  if (/^[/\\]/.test(linkedPath) || /^[A-Za-z]:/.test(linkedPath) || linkedPath.includes('..')) return null;
  const dir = dirname(linkedPath).replace(/\\/g, '/');
  return dir === '.' ? 'docs' : dir;
}

function extractMarkdownSection(text, heading) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^#{1,6}\\s+${escaped}\\s*$`, 'im').exec(normalized);
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = normalized.slice(start);
  const next = /^#{1,6}\s+/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

function withEndUserApiDocPath(template, apiDocPath) {
  const section = `\n## End-User API Documentation\n\n- Documentation Path: ${apiDocPath}\n`;
  if (/^##\s+End-User API Documentation\s*$/m.test(template)) {
    return template.replace(/- Documentation Path:\s*.*$/m, `- Documentation Path: ${apiDocPath}`);
  }
  return `${template.trimEnd()}\n${section}`;
}

async function createEndUserApiDoc(apiDocPath, contractOutputPath) {
  const title = titleFromApiDocPath(apiDocPath);
  const target = resolve(apiDocPath);
  try {
    await access(target, constants.F_OK);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  await mkdir(dirname(target), { recursive: true });
  const contractRel = contractOutputPath.replace(/\\/g, '/');
  await writeFile(target, `# ${title}\n\nSource Spec Guard contract: \`${contractRel}\`.\n`, { flag: 'wx' });
}

function titleFromApiDocPath(apiDocPath) {
  const base = basename(apiDocPath).replace(/\.md$/i, '').replace(/[-_]+/g, ' ');
  return base
    .replace(/\b\w/g, char => char.toUpperCase())
    .replace(/\bApi\b/g, 'API');
}

async function addApiDocToReadmeToc(apiDocPath) {
  const readme = await readRepositoryReadme();
  if (!readme) return;
  const toc = extractMarkdownSection(readme.text, 'Table of Contents');
  if (!toc || !/\[[^\]]+\]\([^)]+\.md(?:#[^)]+)?\)/i.test(toc)) return;
  if (toc.includes(apiDocPath)) return;

  const normalized = readme.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const heading = /^#{1,6}\s+Table of Contents\s*$/im.exec(normalized);
  if (!heading) return;
  const start = heading.index + heading[0].length;
  const rest = normalized.slice(start);
  const next = /^#{1,6}\s+/m.exec(rest);
  const sectionEnd = next ? start + next.index : normalized.length;
  const section = normalized.slice(start, sectionEnd);
  const entry = `- [${titleFromApiDocPath(apiDocPath)}](${apiDocPath})`;
  const bulletMatches = [...section.matchAll(/^\s*[-*+]\s+\[[^\]]+\]\([^)]+\.md(?:#[^)]+)?\)\s*$/gim)];
  const insertAt = bulletMatches.length > 0
    ? start + bulletMatches[bulletMatches.length - 1].index + bulletMatches[bulletMatches.length - 1][0].length
    : sectionEnd;
  const updated = `${normalized.slice(0, insertAt)}\n${entry}${normalized.slice(insertAt)}`;
  await writeFile(resolve(readme.path), updated);
}

// Read commands: bare names default to defaultDir, full paths pass through as-is.
function withDefaultDir(arg, defaultDir) {
  if (!arg) return arg;
  if (arg.includes('/') || arg.includes('\\') || arg.startsWith('.')) return arg;
  const name = arg.endsWith('.md') ? arg : `${arg}.md`;
  return join(defaultDir, name);
}

// Write commands: name only — always resolves within defaultDir.
// Rejects absolute paths, dotfile names, and path traversal.
function resolveWritePath(name, defaultDir) {
  if (!name) return null;
  if (/^[/\\]/.test(name) || /^[A-Za-z]:/.test(name)) return null; // absolute path
  if (name.startsWith('.')) return null;                             // dotfile or relative escape
  if (name.includes('..')) return null;                             // traversal
  const filename = name.endsWith('.md') ? name : `${name}.md`;
  return join(defaultDir, filename);
}

async function inferContractPath(specPath) {
  const base = specPath.replace(/\.md$/, '').replace(/^\.spec-guard[/\\]specs[/\\]/, '');
  const name = base.split(/[/\\]/).pop();
  const candidates = [
    `.spec-guard/contracts/${name}-api-contract.md`,
    `.spec-guard/contracts/${name}-rest-api-contract.md`,
    `.spec-guard/contracts/${name}-component-contract.md`,
    `.spec-guard/contracts/${name}.md`,
  ];
  for (const p of candidates) {
    try { await access(resolve(p), constants.F_OK); return p; } catch { /* continue */ }
  }
  return null;
}

function inferReviewPath(specPath) {
  const name = specPath.replace(/^.*[/\\]/, '').replace(/\.md$/, '');
  return `.spec-guard/reviews/${name}.md`;
}

async function readJsonInput(pathOrDash) {
  let text;
  if (pathOrDash === '-') {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    text = Buffer.concat(chunks).toString('utf8');
  } else {
    text = await readFile(resolve(pathOrDash), 'utf8');
  }
  return JSON.parse(text);
}

async function collectMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectMarkdownFiles(fullPath));
    } else if (entry.isFile() && extname(entry.name) === '.md' && entry.name !== 'README.md') {
      files.push(fullPath);
    }
  }
  return files;
}

function parseFlags(args) {
  const flags = { json: false, warnings: false, 'check-only': false, contract: null, review: null, positional: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') flags.json = true;
    else if (arg === '--warnings') flags.warnings = true;
    else if (arg === '--check-only') flags['check-only'] = true;
    else if (arg === '--contract') flags.contract = args[++i] || null;
    else if (arg === '--review') flags.review = args[++i] || null;
    else if (arg === '--from-json') flags['from-json'] = args[++i] || null;
    else if (arg === '--classification') flags.classification = args[++i] || null;
    else if (arg === '--spec') flags.spec = args[++i] || null;
    else if (arg.startsWith('--')) {
      // Handle --key=value and --no-key boolean flags
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        flags[key] = arg.slice(eqIdx + 1);
      } else if (arg.startsWith('--no-')) {
        flags[arg.slice(5)] = false;
      } else {
        flags[arg.slice(2)] = true;
      }
    } else {
      flags.positional.push(arg);
    }
  }
  return flags;
}

function printUsage() {
  console.error(`Usage:
  spec-guard interview-questions [--json]            list spec authoring questions (mirrors spec_guard_interview_questions)
  spec-guard draft [--from-json <path>|-] <name>    guided wizard — or non-interactive from JSON
  spec-guard run [--check-only] <name>               orchestrated 5-phase workflow
  spec-guard check [--json] [--warnings] <name>
  spec-guard suggest [--warnings] <name>             show diagnostics with concrete fix instructions
  spec-guard analyze <name>                          cross-artifact alignment (spec, contract, review)
    [--contract path] [--review path] [--json]
  spec-guard validate [--json] [--warnings]
  spec-guard status [--json]
  spec-guard watch <name>
  spec-guard init
  spec-guard new <kind> [--spec <spec>] <name>
    kinds: spec | brownfield-spec | api-contract | rest-api-contract | component-contract
           one-off-ui | operational-document | task-plan | compound-work
  spec-guard classify [--json] <name>
  spec-guard blocker [--spec <spec>] <name>
  spec-guard scope-discovery [--spec <spec>] <name>
  spec-guard review [--spec <spec>] <name>
  spec-guard discovery [--spec <spec>] <name>
  spec-guard deviation [--spec <spec>] <name>
  spec-guard initiative-questions [--json]           list initiative decomposition questions
  spec-guard initiative [--from-json <path>|-] <name>  interactive wizard — or non-interactive from JSON

  Bare names default to .spec-guard/ subdirectories. Pass a full path to override.`);
}
