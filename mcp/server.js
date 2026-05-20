#!/usr/bin/env node
/**
 * spec-guard MCP Server
 *
 * Exposes Spec Guard validation and workflow operations as MCP tools,
 * allowing any MCP-compatible agent (Claude Code, Cursor, etc.) to
 * call spec validation, gate checks, and artifact creation directly
 * as structured tool calls rather than parsing CLI output.
 *
 * Transport: stdio (standard MCP convention)
 *
 * Usage:
 *   node mcp/server.js
 *
 * MCP config (add to your agent's mcp config):
 *   {
 *     "spec-guard": {
 *       "command": "node",
 *       "args": ["/path/to/spec-guard/mcp/server.js"]
 *     }
 *   }
 */

import { readFile, writeFile, mkdir, access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, relative, join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkSpecText,
  getSelectedClassifications,
  getSpecStatus,
  getSpecTitle,
  formatDiagnostic,
  CLASSIFICATIONS,
} from '../src/check.js';
import { gate1, gate2, gate5, runCheck, TEST_GUIDANCE } from '../src/run.js';
import { buildSpecFromAnswers } from '../src/discover.js';
import { analyzeArtifacts } from '../src/analyze.js';
import { annotateDiagnostics } from '../src/suggest.js';
import { initiativeQuestions, saveInitiative } from '../src/initiative.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// ─── MCP Protocol ─────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'spec_guard_check',
    description: 'Validate a spec file against all Spec Guard rules. Returns diagnostics with severity (BLOCKER/WARNING/INFO), rule IDs, and messages. A spec must have no BLOCKERs before implementation can begin (Gate 1).',
    inputSchema: {
      type: 'object',
      properties: {
        spec_path: { type: 'string', description: 'Path to the spec markdown file' },
        include_warnings: { type: 'boolean', description: 'Include WARNING and INFO diagnostics (default: false, blockers only)' },
      },
      required: ['spec_path'],
    },
  },
  {
    name: 'spec_guard_gate_status',
    description: 'Check which gates a spec has passed. Returns status for Gate 1 (spec valid) and Gate 2 (contracts present), plus classification and test guidance. Gates 3-5 require confirmation via spec_guard_confirm_gate.',
    inputSchema: {
      type: 'object',
      properties: {
        spec_path: { type: 'string', description: 'Path to the spec markdown file' },
      },
      required: ['spec_path'],
    },
  },
  {
    name: 'spec_guard_classify',
    description: 'Return the selected work classification for a spec, or a BLOCKER diagnostic if zero or multiple are selected.',
    inputSchema: {
      type: 'object',
      properties: {
        spec_path: { type: 'string', description: 'Path to the spec markdown file' },
      },
      required: ['spec_path'],
    },
  },
  {
    name: 'spec_guard_test_guidance',
    description: 'Return the required test type and guidance for a given work classification.',
    inputSchema: {
      type: 'object',
      properties: {
        classification: {
          type: 'string',
          enum: [
            'Reusable non-UI API',
            'REST/service API',
            'Reusable UI component',
            'One-off application UI',
            'Direct behavior with no new API or UI',
            'Operational/document deliverable',
          ],
          description: 'The work classification',
        },
      },
      required: ['classification'],
    },
  },
  {
    name: 'spec_guard_confirm_gate',
    description: 'Record a manual gate confirmation (Gates 3-5 require human/agent confirmation). Gate 3: failure-first confirmed. Gate 4: tests pass. Gate 5: review complete.',
    inputSchema: {
      type: 'object',
      properties: {
        spec_path: { type: 'string', description: 'Path to the spec' },
        gate: { type: 'number', enum: [3, 4, 5], description: 'Which gate to confirm (3, 4, or 5)' },
        confirmed: { type: 'boolean', description: 'Whether the gate condition is met' },
        evidence: { type: 'string', description: 'Evidence or reason for the confirmation (required for Gate 3)' },
      },
      required: ['spec_path', 'gate', 'confirmed'],
    },
  },
  {
    name: 'spec_guard_create_artifact',
    description: 'Create a Spec Guard artifact from a template. Supports: spec, api-contract, rest-api-contract, component-contract, one-off-ui, operational-document, task-plan, compound-work, blocker, scope-discovery, review, discovery, deviation.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: [
            'spec', 'api-contract', 'rest-api-contract', 'component-contract',
            'one-off-ui', 'operational-document', 'task-plan', 'compound-work',
            'blocker', 'scope-discovery', 'review', 'discovery', 'deviation',
          ],
          description: 'The type of artifact to create',
        },
        output_path: { type: 'string', description: 'Where to create the file' },
      },
      required: ['kind', 'output_path'],
    },
  },
  {
    name: 'spec_guard_validate_directory',
    description: 'Validate all spec files in a directory. Returns a summary with per-file diagnostics and overall blocker count.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Directory to scan (default: specs/)' },
        include_warnings: { type: 'boolean', description: 'Include WARNING diagnostics' },
      },
    },
  },
  {
    name: 'spec_guard_status',
    description: 'Return status overview of all specs in a directory: title, status (Draft/Ready/Blocked/Implemented), classification, blocker count, and warning count.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Directory to scan (default: specs/)' },
      },
    },
  },
  {
    name: 'spec_guard_draft_spec',
    description: 'Build a spec markdown document from structured answers. Returns a spec draft and runs Gate 1 validation against it. When all required fields are provided, the output passes Gate 1. Optionally writes the file to output_path.',
    inputSchema: {
      type: 'object',
      properties: {
        title:                { type: 'string', description: 'Short name for this feature or change' },
        problem:              { type: 'string', description: 'What problem are you solving? What outcome is required?' },
        in_scope:             { type: 'array', items: { type: 'string' }, description: 'What is included in this work?' },
        out_of_scope:         { type: 'array', items: { type: 'string' }, description: 'What is explicitly excluded?' },
        users:                { type: 'array', items: { type: 'string' }, description: 'Who uses or invokes this?' },
        expected_behavior:    { type: 'string', description: 'Observable behavior description (not implementation)' },
        acceptance_criteria:  { type: 'array', items: { type: 'string' }, description: 'What must be true when done? Formatted as checkboxes.' },
        open_questions:       { type: 'array', items: { type: 'string' }, description: 'Unresolved questions that may affect implementation' },
        classification: {
          type: 'string',
          enum: [
            'Reusable non-UI API',
            'REST/service API',
            'Reusable UI component',
            'One-off application UI',
            'Direct behavior with no new API or UI',
            'Operational/document deliverable',
          ],
          description: 'Work classification — exactly one must be selected',
        },
        output_path:      { type: 'string', description: 'If provided, write the spec to this path' },
      },
    },
  },
  {
    name: 'spec_guard_analyze',
    description: 'Check cross-artifact alignment: does the contract match the spec classification? Does the implementation review cover every acceptance criterion and required test? Returns SG-ALIGN-* diagnostics. Run this before closing out implementation (between Gate 4 and Gate 5).',
    inputSchema: {
      type: 'object',
      properties: {
        spec_path:     { type: 'string', description: 'Path to the spec file' },
        contract_path: { type: 'string', description: 'Path to the contract file (auto-discovered if omitted)' },
        review_path:   { type: 'string', description: 'Path to the implementation review (auto-discovered if omitted)' },
      },
      required: ['spec_path'],
    },
  },
  {
    name: 'spec_guard_interview_questions',
    description: 'Return a structured list of questions for an AI agent to ask the user before calling spec_guard_draft_spec. Use this at the start of any spec-authoring conversation. Returns questions grouped by phase, each with field name, required flag, and guidance hint.',
    inputSchema: {
      type: 'object',
      properties: {
        classification: {
          type: 'string',
          enum: [
            'Reusable non-UI API', 'REST/service API', 'Reusable UI component',
            'One-off application UI', 'Direct behavior with no new API or UI',
            'Operational/document deliverable',
          ],
          description: 'If the classification is already known, include classification-specific questions',
        },
      },
    },
  },
  {
    name: 'spec_guard_suggest',
    description: 'Run spec validation and return each diagnostic annotated with a concrete, actionable fix instruction. Use this instead of spec_guard_check when you want human-readable guidance, not just error codes.',
    inputSchema: {
      type: 'object',
      properties: {
        spec_path:        { type: 'string', description: 'Path to the spec file' },
        include_warnings: { type: 'boolean', description: 'Include WARNING and INFO diagnostics (default: false)' },
      },
      required: ['spec_path'],
    },
  },
  {
    name: 'spec_guard_workflow_next_step',
    description: 'Given a spec path and the gates already passed, return the next required action in the Spec Guard workflow. Useful for agents to know what to do next without reading WORKFLOW.md.',
    inputSchema: {
      type: 'object',
      properties: {
        spec_path: { type: 'string', description: 'Path to the spec' },
        gates_passed: {
          type: 'array',
          items: { type: 'string', enum: ['gate1', 'gate2', 'gate3', 'gate4', 'gate5'] },
          description: 'List of gates already confirmed as passed',
        },
      },
      required: ['spec_path'],
    },
  },
  {
    name: 'spec_guard_initiative_questions',
    description: 'Return a structured list of questions for gathering context before decomposing a broad app or product idea into individual feature slices. Use this when a developer describes a multi-feature initiative rather than a single spec.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'spec_guard_save_initiative',
    description: 'Validate and save an initiative decomposition artifact. Writes .spec-guard/initiatives/<name>.md and returns the list of slice names and suggested spec paths for use with spec_guard_draft_spec.',
    inputSchema: {
      type: 'object',
      properties: {
        name:        { type: 'string', description: 'URL-safe initiative identifier (lowercase letters, digits, hyphens)' },
        title:       { type: 'string', description: 'Human-readable initiative title' },
        description: { type: 'string', description: 'Brief summary of the initiative' },
        slices: {
          type: 'array',
          description: 'Feature slices to decompose into individual specs',
          items: {
            type: 'object',
            properties: {
              name:           { type: 'string', description: 'URL-safe slice identifier' },
              title:          { type: 'string', description: 'Human-readable slice title' },
              description:    { type: 'string', description: 'What this slice delivers' },
              classification: {
                type: 'string',
                enum: [
                  'Reusable non-UI API', 'REST/service API', 'Reusable UI component',
                  'One-off application UI', 'Direct behavior with no new API or UI',
                  'Operational/document deliverable',
                ],
              },
            },
            required: ['name', 'title', 'description', 'classification'],
          },
        },
        output_dir: { type: 'string', description: 'Directory to write the initiative artifact into (default: current directory)' },
      },
      required: ['name', 'title', 'description', 'slices'],
    },
  },
];

// ─── Tool handlers ────────────────────────────────────────────────────────────

async function handleTool(name, input) {
  switch (name) {
    case 'spec_guard_check':           return toolCheck(input);
    case 'spec_guard_gate_status':     return toolGateStatus(input);
    case 'spec_guard_classify':        return toolClassify(input);
    case 'spec_guard_test_guidance':   return toolTestGuidance(input);
    case 'spec_guard_confirm_gate':    return toolConfirmGate(input);
    case 'spec_guard_create_artifact': return toolCreateArtifact(input);
    case 'spec_guard_validate_directory': return toolValidateDirectory(input);
    case 'spec_guard_status':          return toolStatus(input);
    case 'spec_guard_draft_spec':          return toolDraftSpec(input);
    case 'spec_guard_analyze':             return toolAnalyze(input);
    case 'spec_guard_interview_questions': return toolInterviewQuestions(input);
    case 'spec_guard_suggest':             return toolSuggest(input);
    case 'spec_guard_workflow_next_step':  return toolWorkflowNextStep(input);
    case 'spec_guard_initiative_questions': return toolInitiativeQuestions(input);
    case 'spec_guard_save_initiative':      return toolSaveInitiative(input);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function toolCheck({ spec_path, include_warnings = false }) {
  let text;
  try {
    text = await readFile(resolve(spec_path), 'utf8');
  } catch (err) {
    return {
      valid: false,
      error: `Cannot read spec: ${err.message}`,
      diagnostics: [],
    };
  }

  const diagnostics = checkSpecText(text, spec_path);
  const filtered = include_warnings
    ? diagnostics
    : diagnostics.filter(d => d.severity !== 'INFO');

  const blockers = filtered.filter(d => d.severity === 'BLOCKER');
  const warnings = filtered.filter(d => d.severity === 'WARNING');

  return {
    gate1_passed: blockers.length === 0,
    blocker_count: blockers.length,
    warning_count: warnings.length,
    diagnostics: filtered,
  };
}

async function toolGateStatus({ spec_path }) {
  let text;
  try {
    text = await readFile(resolve(spec_path), 'utf8');
  } catch (err) {
    return { error: `Cannot read spec: ${err.message}` };
  }

  const g1 = await gate1(spec_path);
  const g2 = g1.passed ? await gate2(spec_path) : null;
  const classifications = getSelectedClassifications(text);
  const classification = classifications.length === 1 ? classifications[0] : null;

  return {
    spec_path,
    gate1: {
      passed: g1.passed,
      label: 'Spec valid',
      blockers: g1.blockers.map(d => formatDiagnostic(d)),
    },
    gate2: g2 ? {
      passed: g2.passed,
      label: 'Contracts present',
      blockers: g2.blockers.map(d => formatDiagnostic(d)),
    } : {
      passed: false,
      label: 'Contracts present',
      skipped: true,
      reason: 'Gate 1 must pass first',
    },
    gate3: { passed: null, label: 'Failure confirmed', manual: true, note: 'Requires spec_guard_confirm_gate' },
    gate4: { passed: null, label: 'Tests pass',        manual: true, note: 'Requires spec_guard_confirm_gate' },
    gate5: { passed: null, label: 'Review complete',   manual: true, note: 'Requires spec_guard_confirm_gate' },
    classification,
    test_guidance: classification ? TEST_GUIDANCE[classification] : null,
    ready_to_implement: g1.passed && (g2?.passed ?? false),
  };
}

async function toolClassify({ spec_path }) {
  let text;
  try {
    text = await readFile(resolve(spec_path), 'utf8');
  } catch (err) {
    return { error: `Cannot read spec: ${err.message}` };
  }

  const selected = getSelectedClassifications(text);

  if (selected.length === 1) {
    return {
      valid: true,
      classification: selected[0],
      test_guidance: TEST_GUIDANCE[selected[0]] || null,
    };
  }

  return {
    valid: false,
    classification: null,
    diagnostic: selected.length === 0
      ? '[BLOCKER] SG-CLASS-001: exactly one work classification must be selected; found none'
      : `[BLOCKER] SG-CLASS-001: exactly one work classification must be selected; found ${selected.length}`,
    found: selected,
  };
}

async function toolTestGuidance({ classification }) {
  const guidance = TEST_GUIDANCE[classification];

  const contractRequired = [
    'Reusable non-UI API',
    'REST/service API',
    'Reusable UI component',
  ].includes(classification);

  const uiInputsRequired = [
    'One-off application UI',
    'Reusable UI component',
  ].includes(classification);

  return {
    classification,
    test_guidance: guidance || 'No guidance available for this classification.',
    contract_required: contractRequired,
    ui_inputs_required: uiInputsRequired,
    gate2_checklist: [
      ...(contractRequired ? ['Create and reference a contract document in specs Dependencies section'] : []),
      ...(uiInputsRequired ? ['Reference mockup, wireframe, or explicit design direction', 'Reference component library'] : []),
    ],
  };
}

async function toolConfirmGate({ spec_path, gate, confirmed, evidence }) {
  if (gate === 3 && confirmed && !evidence) {
    return {
      success: false,
      error: 'Gate 3 confirmation requires evidence: describe what failed and why.',
    };
  }

  const runDir = resolve('.spec-guard/runs');
  await mkdir(runDir, { recursive: true });

  const name = basename(spec_path).replace('.md', '');
  const runFile = join(runDir, `${name}-run.json`);

  let runState = {};
  try {
    const existing = await readFile(runFile, 'utf8');
    runState = JSON.parse(existing);
  } catch {
    runState = { specPath: spec_path, gatesPassed: [], startedAt: new Date().toISOString() };
  }

  const gateKey = `gate${gate}`;

  if (confirmed) {
    if (!runState.gatesPassed.includes(gateKey)) {
      runState.gatesPassed.push(gateKey);
    }
    if (gate === 3) {
      runState.failureFirstConfirmed = true;
      runState.failureFirstReason = evidence;
    }
  }

  runState[`gate${gate}_confirmed`] = confirmed;
  runState[`gate${gate}_evidence`] = evidence || null;
  runState[`gate${gate}_confirmedAt`] = new Date().toISOString();

  await writeFile(runFile, JSON.stringify(runState, null, 2));

  return {
    success: true,
    gate,
    confirmed,
    gates_passed: runState.gatesPassed,
    message: confirmed
      ? `Gate ${gate} confirmed and recorded.`
      : `Gate ${gate} not confirmed. Record the reason and address it before proceeding.`,
  };
}

const ARTIFACT_TEMPLATES = {
  'spec':                 'templates/spec.md',
  'api-contract':         'templates/api-contract.md',
  'rest-api-contract':    'templates/rest-api-contract.md',
  'component-contract':   'templates/reusable-ui-component.md',
  'one-off-ui':           'templates/one-off-ui.md',
  'operational-document': 'templates/operational-document.md',
  'task-plan':            'templates/task-plan.md',
  'compound-work':        'templates/compound-work.md',
  'blocker':              'templates/blocker.md',
  'scope-discovery':      'templates/scope-discovery.md',
  'review':               'templates/implementation-review.md',
  'discovery':            'templates/discovery-request.md',
  'deviation':            'templates/spec-deviation.md',
};

async function toolCreateArtifact({ kind, output_path }) {
  const templatePath = ARTIFACT_TEMPLATES[kind];
  if (!templatePath) {
    return { success: false, error: `Unknown artifact kind: ${kind}` };
  }

  const source = join(rootDir, templatePath);
  const target = resolve(output_path);

  try {
    await access(target, constants.F_OK);
    return { success: false, error: `File already exists: ${output_path}` };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      return { success: false, error: err.message };
    }
  }

  try {
    await mkdir(dirname(target), { recursive: true });
    const template = await readFile(source, 'utf8');
    await writeFile(target, template, { flag: 'wx' });
    return {
      success: true,
      kind,
      path: output_path,
      message: `Created ${kind}: ${output_path}`,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function toolValidateDirectory({ directory = 'specs', include_warnings = false }) {
  let files;
  try {
    files = await collectMarkdownFiles(resolve(directory));
  } catch (err) {
    return { error: `Cannot read directory: ${err.message}`, results: [] };
  }

  if (files.length === 0) {
    return { total: 0, clean: 0, with_blockers: 0, results: [] };
  }

  const results = [];
  for (const file of files) {
    const relPath = relative(process.cwd(), file);
    const text = await readFile(file, 'utf8');
    const diagnostics = checkSpecText(text, relPath);
    const filtered = include_warnings
      ? diagnostics
      : diagnostics.filter(d => d.severity !== 'INFO');

    results.push({
      path: relPath,
      valid: !diagnostics.some(d => d.severity === 'BLOCKER'),
      blocker_count: diagnostics.filter(d => d.severity === 'BLOCKER').length,
      warning_count: diagnostics.filter(d => d.severity === 'WARNING').length,
      diagnostics: filtered,
    });
  }

  return {
    total: results.length,
    clean: results.filter(r => r.valid && r.warning_count === 0).length,
    with_blockers: results.filter(r => !r.valid).length,
    results,
  };
}

async function toolStatus({ directory = 'specs' }) {
  let files;
  try {
    files = await collectMarkdownFiles(resolve(directory));
  } catch (err) {
    return { error: `Cannot read directory: ${err.message}`, specs: [] };
  }

  const specs = [];
  for (const file of files) {
    const relPath = relative(process.cwd(), file);
    const text = await readFile(file, 'utf8');
    const title = getSpecTitle(text) || relPath;
    const status = getSpecStatus(text) || 'Unknown';
    const classifications = getSelectedClassifications(text);
    const classification = classifications.length === 1 ? classifications[0] : null;
    const diagnostics = checkSpecText(text, relPath);

    specs.push({
      path: relPath,
      title,
      status,
      classification,
      gate1_passed: !diagnostics.some(d => d.severity === 'BLOCKER'),
      blocker_count: diagnostics.filter(d => d.severity === 'BLOCKER').length,
      warning_count: diagnostics.filter(d => d.severity === 'WARNING').length,
    });
  }

  return {
    total: specs.length,
    ready: specs.filter(s => s.status === 'Ready').length,
    blocked: specs.filter(s => s.status === 'Blocked').length,
    specs,
  };
}

async function toolDraftSpec({
  title = '',
  problem = '',
  in_scope: inScope = [],
  out_of_scope: outOfScope = [],
  users = [],
  expected_behavior: expectedBehavior = '',
  acceptance_criteria: acceptanceCriteria = [],
  open_questions: openQuestions = [],
  classification = null,
  output_path: outputPath = null,
}) {
  const specText = buildSpecFromAnswers({
    title,
    problem,
    inScope,
    outOfScope,
    users,
    expectedBehavior,
    acceptanceCriteria,
    openQuestions,
    classification,
  });

  const diagnostics = checkSpecText(specText, outputPath || '<draft>');
  const blockers = diagnostics.filter(d => d.severity === 'BLOCKER');
  const warnings = diagnostics.filter(d => d.severity === 'WARNING');

  const result = {
    gate1_passed: blockers.length === 0,
    blocker_count: blockers.length,
    warning_count: warnings.length,
    diagnostics,
    spec_text: specText,
    test_guidance: classification ? TEST_GUIDANCE[classification] : null,
    missing_required: blockers.map(d => d.message),
  };

  if (outputPath) {
    try {
      await access(resolve(outputPath), constants.F_OK);
      result.write_error = `File already exists: ${outputPath}`;
    } catch (err) {
      if (err.code === 'ENOENT') {
        try {
          await mkdir(dirname(resolve(outputPath)), { recursive: true });
          await writeFile(resolve(outputPath), specText, { flag: 'wx' });
          result.written_to = outputPath;
        } catch (writeErr) {
          result.write_error = writeErr.message;
        }
      } else {
        result.write_error = err.message;
      }
    }
  }

  return result;
}

async function toolAnalyze({ spec_path, contract_path = null, review_path = null }) {
  return analyzeArtifacts({
    specPath: spec_path,
    contractPath: contract_path,
    reviewPath: review_path,
  });
}

async function toolInterviewQuestions({ classification = null } = {}) {
  const base = [
    {
      field: 'problem',
      required: true,
      question: 'What problem are you solving, or what outcome do you need?',
      hint: 'Focus on the problem, not the solution. What happens if this is not built?',
    },
    {
      field: 'in_scope',
      required: true,
      question: 'What is explicitly included in this work? List the specific things that must be delivered.',
      hint: 'Be concrete. Vague scope items like "the API" are not sufficient.',
    },
    {
      field: 'out_of_scope',
      required: true,
      question: 'What are you explicitly NOT building? What might someone assume is included but is not?',
      hint: 'Listing out-of-scope items prevents scope creep and agent overreach.',
    },
    {
      field: 'expected_behavior',
      required: true,
      question: 'What will users or callers observe when this is working correctly? Describe observable behavior.',
      hint: 'Describe outcomes, not implementation details.',
    },
    {
      field: 'acceptance_criteria',
      required: true,
      question: 'What must be provably true when this is done? List specific, testable conditions.',
      hint: 'Each criterion becomes a checkbox. Avoid vague words like "correctly" or "properly".',
    },
    {
      field: 'classification',
      required: true,
      question: `Which work type best describes this? Choose exactly one: ${CLASSIFICATIONS.join(' | ')}`,
      hint: 'If the work spans multiple types, it needs to be decomposed into separate specs.',
    },
  ];

  const classificationSpecific = {
    'One-off application UI': [
      {
        field: 'expected_behavior',
        required: true,
        question: 'What is the mockup, wireframe, or design direction? Provide a link or description.',
        hint: 'UI work cannot proceed without design direction. No mockup = blocker.',
      },
    ],
  };

  const additional = classification ? (classificationSpecific[classification] || []) : [];

  const universal = [
    {
      field: 'title',
      required: false,
      question: 'What is a short name for this feature or change?',
      hint: 'Optional, but helpful for tracking.',
    },
    {
      field: 'open_questions',
      required: false,
      question: 'Are there any unresolved questions that might affect implementation?',
      hint: 'Better to surface these now than discover them at Gate 3.',
    },
  ];

  return {
    protocol: [
      '1. Ask the user the required questions in order.',
      '2. Ask optional questions if time permits or they seem relevant.',
      '3. Call spec_guard_draft_spec with the collected answers.',
      '4. If gate1_passed is false, address missing_required and retry.',
      '5. Present the spec to the user for review before proceeding to spec-guard run.',
    ].join('\n'),
    pre_classification: base,
    classification_specific: classification
      ? additional
      : { _note: 'Call again with classification param to get classification-specific questions once classification is known.' },
    universal_optional: universal,
    next_tool: 'spec_guard_draft_spec',
  };
}

async function toolSuggest({ spec_path, include_warnings = false }) {
  let text;
  try {
    text = await readFile(resolve(spec_path), 'utf8');
  } catch (err) {
    return { error: `Cannot read spec: ${err.message}`, diagnostics: [] };
  }

  const all = checkSpecText(text, spec_path);
  const filtered = include_warnings ? all : all.filter(d => d.severity !== 'INFO');
  const annotated = annotateDiagnostics(filtered);

  return {
    gate1_passed: !all.some(d => d.severity === 'BLOCKER'),
    issue_count: annotated.length,
    diagnostics: annotated,
  };
}

async function toolWorkflowNextStep({ spec_path, gates_passed = [] }) {
  // Determine what's needed next
  let text;
  try {
    text = await readFile(resolve(spec_path), 'utf8');
  } catch {
    return {
      next_action: 'create_spec',
      instruction: `Spec file not found: ${spec_path}. Create it with: spec-guard new spec ${spec_path}`,
      gate_target: 'gate1',
    };
  }

  if (!gates_passed.includes('gate1')) {
    const g1 = await gate1(spec_path);
    if (!g1.passed) {
      return {
        next_action: 'fix_spec',
        instruction: 'Gate 1 is blocked. Fix the spec issues listed in diagnostics.',
        gate_target: 'gate1',
        blockers: g1.blockers.map(d => formatDiagnostic(d)),
      };
    }
    return {
      next_action: 'confirm_gate1',
      instruction: 'Spec passes all checks. Call spec_guard_confirm_gate with gate=1 to record Gate 1 as passed, then proceed to Phase 2.',
      gate_target: 'gate1',
    };
  }

  if (!gates_passed.includes('gate2')) {
    const classifications = getSelectedClassifications(text);
    const classification = classifications[0];
    const g2 = await gate2(spec_path);
    if (!g2.passed) {
      return {
        next_action: 'create_contract',
        instruction: `Gate 2 is blocked. Classification is "${classification}". Create the required contract artifact and reference it in the spec's Dependencies section.`,
        gate_target: 'gate2',
        classification,
        test_guidance: TEST_GUIDANCE[classification],
        blockers: g2.blockers.map(d => formatDiagnostic(d)),
      };
    }
    return {
      next_action: 'confirm_gate2',
      instruction: 'Gate 2 checks pass. Confirm via spec_guard_confirm_gate gate=2, then proceed to Phase 3 (write failing tests).',
      gate_target: 'gate2',
      classification,
      test_guidance: TEST_GUIDANCE[classification],
    };
  }

  if (!gates_passed.includes('gate3')) {
    const classifications = getSelectedClassifications(text);
    return {
      next_action: 'write_failing_tests',
      instruction: `Write tests that verify every acceptance criterion in the spec. Run them before implementing. Confirm they fail for the expected reason. Then call spec_guard_confirm_gate with gate=3 and evidence describing what failed and why.`,
      gate_target: 'gate3',
      test_guidance: TEST_GUIDANCE[classifications[0]],
    };
  }

  if (!gates_passed.includes('gate4')) {
    return {
      next_action: 'implement',
      instruction: 'Implement the smallest change that makes the failing tests pass. Follow the spec strictly. When all tests pass and no scope was silently absorbed, call spec_guard_confirm_gate with gate=4.',
      gate_target: 'gate4',
    };
  }

  if (!gates_passed.includes('gate5')) {
    const specName = basename(spec_path).replace('.md', '');
    return {
      next_action: 'complete_review',
      instruction: `Create an implementation review with spec_guard_create_artifact kind=review, then complete all checklist items. Call spec_guard_confirm_gate with gate=5 when done.`,
      gate_target: 'gate5',
      suggested_review_path: `.spec-guard/reviews/${specName}.md`,
    };
  }

  return {
    next_action: 'complete',
    instruction: 'All 5 gates passed. Implementation is complete.',
    gate_target: null,
    complete: true,
  };
}

async function toolInitiativeQuestions() {
  return initiativeQuestions();
}

async function toolSaveInitiative({ name, title, description, slices, output_dir: dir = '.' }) {
  return saveInitiative({ name, title, description, slices, dir });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── MCP stdio transport ──────────────────────────────────────────────────────

let buffer = '';
const pending = [];

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop(); // keep incomplete line
  for (const line of lines) {
    if (line.trim()) pending.push(handleLine(line.trim()));
  }
});

process.stdin.on('close', async () => {
  if (buffer.trim()) pending.push(handleLine(buffer.trim()));
  await Promise.all(pending);
  process.exit(0);
});

async function handleLine(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  const response = await dispatch(msg);
  if (response) {
    process.stdout.write(JSON.stringify(response) + '\n');
  }
}

async function dispatch(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'spec-guard', version: '0.7.0' },
      },
    };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0', id,
      result: { tools: TOOLS },
    };
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params;
    try {
      const result = await handleTool(name, args || {});
      return {
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        },
      };
    } catch (err) {
      return {
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true,
        },
      };
    }
  }

  // notifications have no id — don't respond
  if (!id) return null;

  return {
    jsonrpc: '2.0', id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
