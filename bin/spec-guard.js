#!/usr/bin/env node
import { constants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSpecText, formatDiagnostic, getSelectedClassifications } from '../src/check.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const args = process.argv.slice(2);

try {
  process.exitCode = await run(args);
} catch (error) {
  console.error(`[BLOCKER] SG-USAGE-001 <input>: ${error.message}`);
  process.exitCode = 2;
}

async function run(args) {
  const [command, ...rest] = args;

  if (command === 'check') {
    return checkCommand(rest);
  }

  if (command === 'init') {
    return initCommand(rest);
  }

  if (command === 'new') {
    return newCommand(rest);
  }

  if (command === 'classify') {
    return classifyCommand(rest);
  }

  if (command === 'blocker') {
    return copyTemplateCommand(rest, 'templates/blocker.md', 'blocker', 'blocker');
  }

  if (command === 'scope-discovery') {
    return copyTemplateCommand(rest, 'templates/scope-discovery.md', 'scope-discovery', 'scope discovery');
  }

  if (command === 'review') {
    return copyTemplateCommand(rest, 'templates/implementation-review.md', 'review', 'implementation review');
  }

  if (command === 'discovery') {
    return copyTemplateCommand(rest, 'templates/discovery-request.md', 'discovery', 'discovery request');
  }

  if (command === 'deviation') {
    return copyTemplateCommand(rest, 'templates/spec-deviation.md', 'deviation', 'spec deviation request');
  }

  printUsage();
  return 2;
}

async function checkCommand(args) {
  const [inputPath, ...extra] = args;
  if (!inputPath || extra.length > 0) {
    console.error('Usage: spec-guard check path/to/spec.md');
    return 2;
  }

  try {
    const text = await readFile(resolve(inputPath), 'utf8');
    const diagnostics = checkSpecText(text, inputPath);

    for (const diagnostic of diagnostics) {
      console.log(formatDiagnostic(diagnostic));
    }

    return diagnostics.some((diagnostic) => diagnostic.severity === 'BLOCKER') ? 1 : 0;
  } catch (error) {
    console.error(`[BLOCKER] SG-USAGE-001 ${inputPath}: ${error.message}`);
    return 2;
  }
}

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
  ];

  for (const directoryParts of directories) {
    await mkdir(resolve(targetDir, ...directoryParts), { recursive: true });
  }

  console.log(`Initialized Spec Guard directories in ${targetDir}`);
  return 0;
}

async function newCommand(args) {
  const [kind, outputPath, ...extra] = args;
  if (kind !== 'spec' || !outputPath || extra.length > 0) {
    console.error('Usage: spec-guard new spec path/to/spec.md');
    return 2;
  }

  return copyTemplate('templates/spec.md', outputPath, 'spec');
}

async function classifyCommand(args) {
  const [inputPath, ...extra] = args;
  if (!inputPath || extra.length > 0) {
    console.error('Usage: spec-guard classify path/to/spec.md');
    return 2;
  }

  try {
    const text = await readFile(resolve(inputPath), 'utf8');
    const selected = getSelectedClassifications(text);

    if (selected.length === 1) {
      console.log(selected[0]);
      return 0;
    }

    console.log(formatDiagnostic({
      severity: 'BLOCKER',
      ruleId: 'SG-CLASS-001',
      path: inputPath,
      message: selected.length === 0
        ? 'exactly one work classification must be selected; found none'
        : `exactly one work classification must be selected; found ${selected.length}`,
    }));
    return 1;
  } catch (error) {
    console.error(`[BLOCKER] SG-USAGE-001 ${inputPath}: ${error.message}`);
    return 2;
  }
}

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

function printUsage() {
  console.error(`Usage:
  spec-guard check path/to/spec.md
  spec-guard init [directory]
  spec-guard new spec path/to/spec.md
  spec-guard classify path/to/spec.md
  spec-guard blocker path/to/blocker.md
  spec-guard scope-discovery path/to/scope-discovery.md
  spec-guard review path/to/review.md
  spec-guard discovery path/to/discovery.md
  spec-guard deviation path/to/deviation.md`);
}
