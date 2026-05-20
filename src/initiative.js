import { access, mkdir, writeFile } from 'node:fs/promises';
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

export async function saveInitiative({ name, title, description, slices, dir = '.' }) {
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

  const initiativesDir = resolve(dir, '.spec-guard', 'initiatives');
  await mkdir(initiativesDir, { recursive: true });

  const outputPath = join(initiativesDir, `${name}.md`);
  await writeFile(outputPath, buildInitiativeArtifact({ name, title, description, slices }), 'utf8');

  return {
    path: outputPath,
    slices: slices.map(s => ({
      name: s.name,
      suggestedSpecPath: `.spec-guard/specs/${s.name}.md`,
    })),
  };
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

function buildInitiativeArtifact({ title, description, slices }) {
  const rows = slices
    .map(s => `| ${s.name} | ${s.title} | ${s.classification} | ${s.description} |`)
    .join('\n');

  return `# Initiative: ${title}

## Description

${description}

## Feature Slices

| Name | Title | Classification | Description |
|------|-------|----------------|-------------|
${rows}

## Next Steps

For each slice, run:

\`\`\`
spec-guard draft <slice-name>
\`\`\`

Or via MCP: call \`spec_guard_draft_spec\` with the slice name and description as inputs.
`;
}
