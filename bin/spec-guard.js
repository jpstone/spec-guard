#!/usr/bin/env node
import { constants } from 'node:fs';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkSpecText,
  formatDiagnostic,
  formatDiagnosticJson,
  getSelectedClassifications,
  getSpecStatus,
  getSpecTitle,
} from '../src/check.js';
import { runInteractive, runCheck, PHASES } from '../src/run.js';
import { discoverInteractive } from '../src/discover.js';
import { analyzeArtifacts } from '../src/analyze.js';
import { annotateDiagnostics, suggestFix } from '../src/suggest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const args = process.argv.slice(2);

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
  if (command === 'discover')        return discoverCommand(rest);
  if (command === 'check')           return checkCommand(rest);
  if (command === 'analyze')         return analyzeCommand(rest);
  if (command === 'suggest')         return suggestCommand(rest);
  if (command === 'validate')        return validateCommand(rest);
  if (command === 'init')            return initCommand(rest);
  if (command === 'new')             return newCommand(rest);
  if (command === 'classify')        return classifyCommand(rest);
  if (command === 'status')          return statusCommand(rest);
  if (command === 'watch')           return watchCommand(rest);
  if (command === 'blocker')         return copyTemplateCommand(rest, 'templates/blocker.md', 'blocker', 'blocker');
  if (command === 'scope-discovery') return copyTemplateCommand(rest, 'templates/scope-discovery.md', 'scope-discovery', 'scope discovery');
  if (command === 'review')          return copyTemplateCommand(rest, 'templates/implementation-review.md', 'review', 'implementation review');
  if (command === 'discovery')       return copyTemplateCommand(rest, 'templates/discovery-request.md', 'discovery', 'discovery request');
  if (command === 'deviation')       return copyTemplateCommand(rest, 'templates/spec-deviation.md', 'deviation', 'spec deviation request');

  printUsage();
  return 2;
}

// ─── run ──────────────────────────────────────────────────────────────────────

async function runCommand(args) {
  const flags = parseFlags(args);
  const specPath = flags.positional[0];

  if (!specPath) {
    console.error('Usage: spec-guard run [--check-only] path/to/spec.md');
    return 2;
  }

  if (flags['check-only']) {
    // Non-interactive: just report gate status
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

  // Interactive run
  const { exitCode } = await runInteractive(specPath, flags);
  return exitCode;
}

// ─── discover ────────────────────────────────────────────────────────────────

async function discoverCommand(args) {
  const [outputPath, ...extra] = args;

  if (!outputPath || extra.length > 0) {
    console.error('Usage: spec-guard discover path/to/spec.md');
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

  const { specText } = await discoverInteractive();

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
    console.error('Usage: spec-guard check [--json] [--warnings] path/to/spec.md');
    return 2;
  }

  const inputPath = paths[0];

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
  const specPath = flags.positional[0];

  if (!specPath) {
    console.error('Usage: spec-guard analyze path/to/spec.md [--contract path/to/contract.md] [--review path/to/review.md]');
    return 2;
  }

  // Auto-discover contract and review if not specified
  const contractPath = flags.contract || await inferContractPath(specPath);
  const reviewPath = flags.review || inferReviewPath(specPath);

  const result = await analyzeArtifacts({ specPath, contractPath, reviewPath });

  if (result.error) {
    console.error(`[BLOCKER] SG-USAGE-001 ${specPath}: ${result.error}`);
    return 2;
  }

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return result.clean ? 0 : 1;
  }

  console.log(`\nSpec Guard Analysis: ${result.title}`);
  console.log(`  Spec:       ${specPath}`);
  if (contractPath) console.log(`  Contract:   ${contractPath}`);
  if (reviewPath)   console.log(`  Review:     ${reviewPath}`);
  console.log(`  Classification: ${result.classification || '—'}`);
  console.log(`  Criteria: ${result.criteriaCount}   Required tests: ${result.testsCount}`);
  console.log();

  if (result.diagnostics.length === 0) {
    console.log('  ✓  All artifacts aligned.');
  } else {
    for (const d of result.diagnostics) {
      console.log(formatDiagnostic(d));
    }
  }

  const w = result.warningCount, b = result.blockerCount;
  console.log(`\n${b > 0 ? b + ' blocker(s)' : ''}${b > 0 && w > 0 ? ', ' : ''}${w > 0 ? w + ' warning(s)' : ''}${result.clean ? '✓ clean' : ''}\n`);
  return result.clean ? 0 : 1;
}

// ─── suggest ──────────────────────────────────────────────────────────────────

async function suggestCommand(args) {
  const flags = parseFlags(args);
  const inputPath = flags.positional[0];

  if (!inputPath) {
    console.error('Usage: spec-guard suggest [--warnings] path/to/spec.md');
    return 2;
  }

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
  const dir = flags.positional[0] || 'specs';

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
  const [targetDir = '.', ...extra] = args;
  if (extra.length > 0) {
    console.error('Usage: spec-guard init [directory]');
    return 2;
  }

  const directories = [
    ['specs'],
    ['contracts'],
    ['.spec-guard', 'blockers'],
    ['.spec-guard', 'scope-discoveries'],
    ['.spec-guard', 'reviews'],
    ['.spec-guard', 'deviations'],
    ['.spec-guard', 'discoveries'],
    ['.spec-guard', 'runs'],
  ];

  for (const parts of directories) {
    await mkdir(resolve(targetDir, ...parts), { recursive: true });
  }

  // Starter spec
  const starterSpec = resolve(targetDir, 'specs', 'example.md');
  try {
    await access(starterSpec, constants.F_OK);
  } catch {
    const template = await readFile(join(rootDir, 'templates', 'spec.md'), 'utf8');
    await writeFile(starterSpec, template, { flag: 'wx' });
    console.log(`  Created starter spec: specs/example.md`);
  }

  // AGENTS.md
  const agentsFile = resolve(targetDir, 'AGENTS.md');
  try {
    await access(agentsFile, constants.F_OK);
  } catch {
    const src = join(rootDir, 'AGENTS.md');
    const agentContent = await readFile(src, 'utf8');
    await writeFile(agentsFile, agentContent, { flag: 'wx' });
    console.log(`  Created: AGENTS.md`);
  }

  // WORKFLOW.md
  const workflowFile = resolve(targetDir, 'WORKFLOW.md');
  try {
    await access(workflowFile, constants.F_OK);
  } catch {
    const src = join(rootDir, 'WORKFLOW.md');
    const wfContent = await readFile(src, 'utf8');
    await writeFile(workflowFile, wfContent, { flag: 'wx' });
    console.log(`  Created: WORKFLOW.md`);
  }

  console.log(`Initialized Spec Guard in ${targetDir}`);
  return 0;
}

// ─── new ─────────────────────────────────────────────────────────────────────

async function newCommand(args) {
  const [kind, outputPath, ...extra] = args;

  if (!kind || !outputPath || extra.length > 0) {
    const kinds = Object.keys(NEW_TEMPLATES).join(' | ');
    console.error(`Usage: spec-guard new <kind> path/to/file.md`);
    console.error(`Kinds: ${kinds}`);
    return 2;
  }

  const templatePath = NEW_TEMPLATES[kind];
  if (!templatePath) {
    const kinds = Object.keys(NEW_TEMPLATES).join(', ');
    console.error(`Unknown kind: "${kind}". Valid kinds: ${kinds}`);
    return 2;
  }

  return copyTemplate(templatePath, outputPath, kind);
}

// ─── classify ────────────────────────────────────────────────────────────────

async function classifyCommand(args) {
  const flags = parseFlags(args);
  const inputPath = flags.positional[0];

  if (!inputPath || flags.positional.length > 1) {
    console.error('Usage: spec-guard classify [--json] path/to/spec.md');
    return 2;
  }

  try {
    const text = await readFile(resolve(inputPath), 'utf8');
    const selected = getSelectedClassifications(text);

    if (selected.length === 1) {
      if (flags.json) {
        console.log(JSON.stringify({ path: inputPath, classification: selected[0] }));
      } else {
        console.log(selected[0]);
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

// ─── status ──────────────────────────────────────────────────────────────────

async function statusCommand(args) {
  const flags = parseFlags(args);
  const dir = flags.positional[0] || 'specs';

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
  const inputPath = flags.positional[0];

  if (!inputPath) {
    console.error('Usage: spec-guard watch path/to/spec.md');
    return 2;
  }

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

async function copyTemplateCommand(args, templatePath, commandName, label) {
  const [outputPath, ...extra] = args;
  if (!outputPath || extra.length > 0) {
    console.error(`Usage: spec-guard ${commandName} path/to/file.md`);
    return 2;
  }
  return copyTemplate(templatePath, outputPath, label);
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
  const template = await readFile(source, 'utf8');
  await writeFile(target, template, { flag: 'wx' });
  console.log(`Created ${label}: ${outputPath}`);
  return 0;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

async function inferContractPath(specPath) {
  const base = specPath.replace(/\.md$/, '').replace(/^specs[/\\]/, '');
  const name = base.split(/[/\\]/).pop();
  const candidates = [
    `contracts/${name}-api-contract.md`,
    `contracts/${name}-rest-api-contract.md`,
    `contracts/${name}-component-contract.md`,
    `contracts/${name}.md`,
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
    else if (!arg.startsWith('--')) flags.positional.push(arg);
  }
  return flags;
}

function printUsage() {
  console.error(`Usage:
  spec-guard discover path/to/spec.md                guided wizard — builds a valid spec from answers
  spec-guard run [--check-only] path/to/spec.md      orchestrated 5-phase workflow
  spec-guard check [--json] [--warnings] path/to/spec.md
  spec-guard suggest [--warnings] path/to/spec.md    show diagnostics with concrete fix instructions
  spec-guard analyze path/to/spec.md                 cross-artifact alignment (spec, contract, review)
    [--contract path] [--review path] [--json]
  spec-guard validate [--json] [--warnings] [specs-dir]
  spec-guard status [--json] [specs-dir]
  spec-guard watch path/to/spec.md
  spec-guard init [directory]
  spec-guard new <kind> path/to/file.md
    kinds: spec | brownfield-spec | api-contract | rest-api-contract | component-contract
           one-off-ui | operational-document | task-plan | compound-work
  spec-guard classify [--json] path/to/spec.md
  spec-guard blocker path/to/blocker.md
  spec-guard scope-discovery path/to/scope-discovery.md
  spec-guard review path/to/review.md
  spec-guard discovery path/to/discovery.md
  spec-guard deviation path/to/deviation.md`);
}
