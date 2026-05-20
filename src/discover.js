import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { CLASSIFICATIONS } from './check.js';

const UI_CLASSIFICATIONS = ['One-off application UI', 'Reusable UI component'];

/**
 * Build a spec markdown document from structured answers.
 * When all required fields are non-empty, the output passes Gate 1.
 *
 * Required for Gate 1:
 *   problem, inScope (>=1), outOfScope (>=1), expectedBehavior,
 *   acceptanceCriteria (>=1), classification
 */
export function buildSpecFromAnswers({
  title = '',
  status = 'Draft',
  problem = '',
  inScope = [],
  outOfScope = [],
  users = [],
  expectedBehavior = '',
  acceptanceCriteria = [],
  edgeCases = [],
  dependencies = [],
  openQuestions = [],
  classification = null,
  designDirection = '',
  componentLibrary = '',
} = {}) {
  const bulletLines = (arr) =>
    arr.length > 0
      ? arr.map(item => `- ${item.replace(/^-\s*/, '').trim()}`).join('\n')
      : '- ';

  const checkboxLines = (arr) =>
    arr.length > 0
      ? arr.map(item => `- [ ] ${item.replace(/^-\s*(\[[ xX]\]\s*)?/, '').trim()}`).join('\n')
      : '- [ ] ';

  const classificationList = CLASSIFICATIONS
    .map(c => `- [${c === classification ? 'x' : ' '}] ${c}`)
    .join('\n');

  const parts = [
    '# Spec',
    '',
    '## Title',
    '',
    title,
    '',
    '## Status',
    '',
    status,
    '',
    '## Problem / Goal',
    '',
    problem,
    '',
    '## In Scope',
    '',
    bulletLines(inScope),
    '',
    '## Out of Scope',
    '',
    bulletLines(outOfScope),
    '',
    '## Users / Actors',
    '',
    bulletLines(users.length > 0 ? users : ['User']),
    '',
    '## Expected Behavior',
    '',
    expectedBehavior,
    '',
    '## Acceptance Criteria',
    '',
    checkboxLines(acceptanceCriteria),
    '',
    '## Edge Cases',
    '',
    bulletLines(edgeCases.length > 0 ? edgeCases : ['-']),
    '',
    '## Dependencies',
    '',
    (() => {
      const items = [
        ...(designDirection ? [`Design direction: ${designDirection}`] : []),
        ...(componentLibrary ? [`Component library: ${componentLibrary}`] : []),
        ...dependencies,
      ];
      return bulletLines(items.length > 0 ? items : ['-']);
    })(),
    '',
    '## Open Questions',
    '',
    bulletLines(openQuestions.length > 0 ? openQuestions : ['-']),
    '',
    '## Work Classification',
    '',
    classificationList,
    '',
  ];

  return parts.join('\n');
}

/**
 * Interactive discovery wizard.
 * Asks questions for each required section, loops until required fields
 * are filled, and returns { answers, specText }.
 */
export async function discoverInteractive() {
  const rl = createInterface({ input, output });

  const ask = async (prompt) => {
    const answer = await rl.question(prompt);
    return answer.trim();
  };

  const askRequired = async (prompt, hint) => {
    while (true) {
      const answer = await ask(prompt);
      if (answer) return answer;
      console.log(`  (Required${hint ? ` — ${hint}` : ''})`);
    }
  };

  const askList = async (label) => {
    console.log(`  ${label} (one per line, blank line to finish):`);
    const items = [];
    while (true) {
      const line = await ask('  > ');
      if (!line) break;
      items.push(line);
    }
    return items;
  };

  const askRequiredList = async (label, hint) => {
    while (true) {
      const items = await askList(label);
      if (items.length > 0) return items;
      console.log(`  (At least one item required${hint ? ` — ${hint}` : ''})`);
    }
  };

  const print = (msg = '') => console.log(msg);
  const divider = () => print('─'.repeat(56));
  const header = (msg) => {
    print();
    print('═'.repeat(56));
    print(`  ${msg}`);
    print('═'.repeat(56));
  };
  const step = (n, total, name) => {
    print();
    divider();
    print(`  [${n}/${total}] ${name}`);
    divider();
  };
  const hint = (msg) => print(`  → ${msg}`);

  try {
    header('Spec Guard: Discover');
    hint('Answer each question to produce a valid spec draft.');
    hint('Required fields are marked — press Enter to re-prompt them.');

    // 1. Title
    step(1, '?', 'Title');
    hint('Short name for this feature or change.');
    const title = await ask('  Title: ');

    // 2. Problem / Goal
    step(2, '?', 'Problem / Goal  [required]');
    hint('What problem are you solving? What outcome is required?');
    const problem = await askRequired('  Problem/Goal: ', 'describe the problem or desired outcome');

    // 3. Scope
    step(3, '?', 'Scope  [required]');
    hint('In Scope — what is included in this work?');
    const inScope = await askRequiredList('In Scope', 'at least one item');
    print();
    hint('Out of Scope — what are you explicitly NOT doing?');
    const outOfScope = await askRequiredList('Out of Scope', 'listing this prevents scope creep');

    // 4. Expected Behavior
    step(4, '?', 'Expected Behavior  [required]');
    hint('Describe observable behavior, not implementation details.');
    const expectedBehavior = await askRequired('  Expected Behavior: ', 'what will users or callers observe?');

    // 5. Acceptance Criteria
    step(5, '?', 'Acceptance Criteria  [required]');
    hint('What must be true when this is done?');
    hint('These become checkboxes in the spec.');
    const acceptanceCriteria = await askRequiredList('Acceptance Criteria', 'name at least one criterion');

    // 6. Work Classification
    step(6, '?', 'Work Classification  [required]');
    hint('Choose exactly one:');
    CLASSIFICATIONS.forEach((c, i) => print(`     ${i + 1}. ${c}`));
    print();

    let classification = null;
    while (!classification) {
      const choice = await ask('  Number (1–6): ');
      const idx = parseInt(choice, 10) - 1;
      if (Number.isInteger(idx) && idx >= 0 && idx < CLASSIFICATIONS.length) {
        classification = CLASSIFICATIONS[idx];
      } else {
        print('  Enter a number from 1 to 6.');
      }
    }
    print(`  ✓  ${classification}`);

    const isUI = UI_CLASSIFICATIONS.includes(classification);
    const TOTAL = isUI ? 8 : 7;

    // Retroactively label earlier steps now that we know the total
    // (steps already printed — total shown as ? until classification known)

    // 7. UI inputs (only for UI classifications)
    let designDirection = '';
    let componentLibrary = '';
    if (isUI) {
      step(7, TOTAL, 'UI Inputs  [required for Gate 2]');
      hint('Gate 2 will block if these are missing.');
      print();
      hint('Design direction — link to mockup, wireframe, Figma, or describe the layout.');
      hint('If no mockup exists and the component library is sufficient, type: "No mockup required — [reason]"');
      designDirection = await askRequired('  Design direction: ', 'e.g. "Figma: https://..." or "No mockup required — MUI Card component is sufficient"');
      print();
      hint('Component library — name and version, or state that custom styling is used.');
      hint('If no library: type "No component library — custom styling from mockup"');
      componentLibrary = await askRequired('  Component library: ', 'e.g. "MUI v5", "Tailwind + Radix UI", or "No component library — custom styling from mockup"');
    }

    // 7 or 8. Optional sections
    step(isUI ? 8 : 7, TOTAL, 'Optional: Users / Actors and Open Questions');
    hint('Who uses or invokes this? (skip if obvious)');
    const users = await askList('Users / Actors');
    print();
    hint('Any unresolved questions that might affect implementation?');
    const openQuestions = await askList('Open Questions');

    rl.close();

    const answers = {
      title,
      status: 'Draft',
      problem,
      inScope,
      outOfScope,
      users,
      expectedBehavior,
      acceptanceCriteria,
      openQuestions,
      classification,
      designDirection,
      componentLibrary,
    };

    return { answers, specText: buildSpecFromAnswers(answers) };

  } catch (error) {
    rl.close();
    throw error;
  }
}
