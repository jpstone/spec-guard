import { access, mkdir, readdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { CLASSIFICATIONS } from './check.js';

export const INITIATIVE_QUESTIONS = {
  required: [
    {
      id: 'purpose',
      question: 'What problem does this initiative solve, and what is the intended outcome?',
      notes: 'Capture the core goal — what will be true when this is done that is not true now.',
    },
    {
      id: 'users',
      question: 'Who are the intended users or actors?',
      notes: 'List all user types who will interact with the system.',
    },
    {
      id: 'feature_areas',
      question: 'What are the core feature areas or capabilities this initiative must deliver?',
      notes: 'List broadly — each area will likely become one or more specs.',
    },
    {
      id: 'out_of_scope',
      question: 'What is explicitly out of scope for this initiative?',
      notes: 'Be specific. Out-of-scope items prevent scope creep during implementation.',
    },
  ],
  optional: [
    {
      id: 'deployment_target',
      question: 'What is the intended deployment target or environment for this project? (e.g. "Vercel + Supabase", "AWS Lambda", "Docker on VPS", "TBD")',
      notes: 'Captures the runtime platform for the deployment portability slice. If unknown, answer "TBD" or leave blank — a portability slice is still generated.',
    },
    {
      id: 'external_dependencies',
      question: 'Does this project depend on any external services that need to be substituted during development and testing? (e.g. payment processors, email providers, third-party APIs)',
      notes: 'List each service boundary that needs a test double or stub. Leave blank if none. Asked after deployment_target.',
    },
    {
      id: 'integrations',
      question: 'What external systems, APIs, or services does this integrate with?',
      notes: 'Include auth providers, databases, third-party APIs, etc.',
    },
    {
      id: 'existing_systems',
      question: 'Does this initiative modify or replace any existing systems?',
      notes: 'If yes, note what behavior must be preserved.',
    },
  ],
};

export function initiativeQuestions() {
  return INITIATIVE_QUESTIONS;
}

export async function initiativeQuestionsWithContext({ dir = '.' } = {}) {
  const exists = await specsExist(dir);
  return { ...INITIATIVE_QUESTIONS, specs_exist: exists };
}

async function specsExist(dir = '.') {
  const specsDir = resolve(dir, '.spec-guard', 'specs');
  try {
    const entries = await readdir(specsDir);
    return entries.some(e => e.endsWith('.md'));
  } catch {
    return false;
  }
}

export async function saveInitiative({ name, title, description, slices, dir = '.', deployment_target = null, external_dependencies = [] } = {}) {
  if (await specsExist(dir)) {
    return { error: `Initiative decomposition is only available on projects with no existing specs. One or more .md files already exist in .spec-guard/specs/. Use spec-guard draft to add a single spec to the existing project.` };
  }

  if (!/^[a-z0-9-]+$/.test(name)) {
    return { error: `Initiative name "${name}" must contain only lowercase letters, digits, and hyphens` };
  }

  for (const slice of slices) {
    if (!/^[a-z0-9-]+$/.test(slice.name)) {
      return { error: `Slice name "${slice.name}" is not URL-safe — use only lowercase letters, digits, and hyphens` };
    }
    if (!CLASSIFICATIONS.includes(slice.classification)) {
      return {
        error: `Slice "${slice.name}" has unrecognized classification "${slice.classification}". Must be one of: ${CLASSIFICATIONS.join(', ')}`,
      };
    }
  }

  for (const slice of slices) {
    const specPath = resolve(dir, '.spec-guard', 'specs', `${slice.name}.md`);
    try {
      await access(specPath, constants.F_OK);
      return { error: `Slice name "${slice.name}" conflicts with existing spec: .spec-guard/specs/${slice.name}.md` };
    } catch { /* no conflict */ }
  }

  // Build injected infrastructure slices (prepended before user-provided slices)
  const injectedSlices = buildInjectedSlices({ deployment_target, external_dependencies });
  const allSlices = [...injectedSlices, ...slices];

  const initiativesDir = resolve(dir, '.spec-guard', 'initiatives');
  await mkdir(initiativesDir, { recursive: true });

  const outputPath = join(initiativesDir, `${name}.md`);
  await writeFile(outputPath, buildInitiativeArtifact({ name, title, description, slices: allSlices, deployment_target, external_dependencies }), 'utf8');

  return {
    path: outputPath,
    slices: allSlices.map(s => ({
      name: s.name,
      suggestedSpecPath: `.spec-guard/specs/${s.name}.md`,
    })),
  };
}

function buildInjectedSlices({ deployment_target, external_dependencies }) {
  const injected = [];

  // 1. Deployment portability — always injected first
  const targetKnown = deployment_target && !/^(tbd|unknown|)$/i.test(deployment_target.trim());
  injected.push({
    name: 'deployment-portability',
    title: 'Deployment Portability',
    classification: 'Direct behavior with no new API or UI',
    description: targetKnown
      ? `Ensure the project runs correctly on the target deployment environment: ${deployment_target}. Document required environment variables, build steps, and any platform-specific constraints. All feature slices must be portable to this target.`
      : `Deployment target is TBD or unknown. Establish portability discipline: use environment variables for all configuration, avoid hard-coded paths or platform-specific assumptions, and document any deployment constraints as they are discovered. Update this slice when the deployment target is confirmed.`,
    _injected: true,
  });

  // 2. External dependency substitution infrastructure — only when deps provided
  const deps = [...new Set((external_dependencies || []).map(d => String(d).trim()).filter(Boolean))];
  if (deps.length > 0) {
    // 2a. Substitution strategy slice
    injected.push({
      name: 'substitution-strategy',
      title: 'External Dependency Substitution Strategy',
      classification: 'Direct behavior with no new API or UI',
      description: `Define the project-wide strategy for substituting external service dependencies during development and testing. Establishes where substitutes live (domain-aligned, co-located with real implementations), how they are activated (environment variable, configuration, or entry point), and the interface contract they must satisfy.`,
      _injected: true,
    });

    // 2b. Real-dependency development environment slice (canonical record for all boundaries)
    injected.push({
      name: 'real-dep-env',
      title: 'Real Dependency Development Environment',
      classification: 'Operational/document deliverable',
      description: `Document and provision the development environment for running against real external services (${deps.join(', ')}). This slice is the project-wide canonical record for real-dependency environment setup. Update it whenever a new service boundary is added to the project.`,
      _injected: true,
    });

    // 2c. Per-dependency substitution slices (deduplicated)
    for (const dep of deps) {
      const slug = dep.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      injected.push({
        name: `${slug}-substitution`,
        title: `${dep} Substitution`,
        classification: 'Direct behavior with no new API or UI',
        description: `Implement the ${dep} substitute (test double / stub) following the project substitution strategy. The real-dep-env slice must cover ${dep} as part of its canonical environment record.`,
        _injected: true,
      });
    }
  }

  return injected;
}

export async function initiativeInteractive() {
  const rl = createInterface({ input, output });
  const ask = async (prompt) => (await rl.question(prompt)).trim();
  const print = (msg = '') => console.log(msg);

  const askRequired = async (prompt) => {
    while (true) {
      const answer = await ask(prompt);
      if (answer) return answer;
      print('  (Required)');
    }
  };

  const askValidName = async (prompt) => {
    while (true) {
      const answer = await ask(prompt);
      if (!answer) { print('  (Required)'); continue; }
      if (!/^[a-z0-9-]+$/.test(answer)) {
        print('  (Use only lowercase letters, digits, and hyphens — e.g. my-app)');
        continue;
      }
      return answer;
    }
  };

  if (await specsExist()) {
    rl.close();
    return { error: `Initiative decomposition is only available on projects with no existing specs. One or more .md files already exist in .spec-guard/specs/. Use spec-guard draft to add a single spec to the existing project.` };
  }

  print();
  print('  Spec Guard — Initiative Decomposition');
  print('  ' + '─'.repeat(38));
  print();

  const name        = await askValidName('  Initiative name (URL-safe, e.g. my-app): ');
  const title       = await askRequired('  Title: ');
  const description = await askRequired('  Description: ');

  print();
  print('  Add feature slices. Leave name blank when done.');
  print();

  const slices = [];
  while (true) {
    const sliceName = await ask(`  Slice ${slices.length + 1} name (blank to finish): `);
    if (!sliceName) break;

    if (!/^[a-z0-9-]+$/.test(sliceName)) {
      print('  (Use only lowercase letters, digits, and hyphens)');
      continue;
    }

    const sliceTitle = await askRequired(`  "${sliceName}" title: `);
    const sliceDesc  = await askRequired(`  "${sliceName}" description: `);

    print();
    CLASSIFICATIONS.forEach((c, i) => print(`    ${i + 1}. ${c}`));

    let classification = null;
    while (!classification) {
      const choice = await ask('  Classification (1-6): ');
      const idx = parseInt(choice, 10) - 1;
      if (idx >= 0 && idx < CLASSIFICATIONS.length) {
        classification = CLASSIFICATIONS[idx];
      } else {
        print('  (Enter a number 1-6)');
      }
    }

    slices.push({ name: sliceName, title: sliceTitle, description: sliceDesc, classification });
    print();
  }

  rl.close();

  if (slices.length === 0) {
    return { error: 'No slices defined. Add at least one feature slice.' };
  }

  return { name, title, description, slices };
}

const UI_CLASSIFICATIONS = new Set(['One-off application UI', 'Reusable UI component']);
const API_CLASSIFICATIONS = new Set(['REST/service API', 'Reusable non-UI API']);

function buildInitiativeArtifact({ title, description, slices, deployment_target = null, external_dependencies = [] }) {
  const rows = slices
    .map(s => `| ${s.name} | ${s.title} | ${s.classification} | ${s.description} |`)
    .join('\n');

  const hasUI  = slices.some(s => UI_CLASSIFICATIONS.has(s.classification));
  const hasAPI = slices.some(s => API_CLASSIFICATIONS.has(s.classification));
  const integrationNote = hasUI && hasAPI
    ? `\n## Cross-Slice Integration

This initiative includes both UI and API slices. After both are implemented, at least one test must verify the full runtime wiring — the UI calling the real API without mocking. This is required before Gate 5 of any UI slice that depends on an API slice from this initiative.
`
    : '';

  const targetKnown = deployment_target && !/^(tbd|unknown|)$/i.test(String(deployment_target).trim());
  const deploymentNote = targetKnown
    ? `\n## Deployment Target\n\n${deployment_target}\n`
    : `\n## Deployment Target\n\nTBD — update when deployment target is confirmed.\n`;

  const deps = [...new Set((external_dependencies || []).map(d => String(d).trim()).filter(Boolean))];
  const depsNote = deps.length > 0
    ? `\n## External Dependencies\n\n${deps.map(d => `- ${d}`).join('\n')}\n`
    : '';

  return `# Initiative: ${title}

## Description

${description}
${deploymentNote}${depsNote}
## Feature Slices

| Name | Title | Classification | Description |
|------|-------|----------------|-------------|
${rows}
${integrationNote}
## Next Steps

For each slice, run:

\`\`\`
npx spec-guard draft <slice-name>
\`\`\`

Or via MCP: call \`spec_guard_draft_spec\` with the slice name and description as inputs.
`;
}
