// Maps every rule ID to a concrete, actionable fix instruction.
// The message from the diagnostic is passed in so suggestions can be specific.

const RULE_SUGGESTIONS = {
  'SG-SPEC-002': (d) => {
    const heading = d.message.match(/missing required heading: (.+)$/)?.[1] || 'the missing heading';
    return `Add the section to your spec:\n\n  ## ${heading}\n\n  [describe content here]`;
  },

  'SG-SPEC-003': () =>
    'Resolve each open question, or mark it as not applicable:\n' +
    '  - N/A: [the question] — [reason it doesn\'t affect this work]\n' +
    'Do not delete unresolved questions — mark them explicitly.',

  'SG-SPEC-004': (d) => {
    const heading = d.message.match(/required section must identify concrete content: (.+)$/)?.[1] || 'the section';
    return `Fill in the "${heading}" section with concrete, observable content.\n` +
      'Avoid placeholder text like "-" or comments only. Describe what is actually true.';
  },

  'SG-SPEC-005': () =>
    'Change plain bullet criteria to checkbox format so they can be mechanically verified:\n\n' +
    '  Before:  - The login form works\n' +
    '  After:   - [ ] The login form renders email and password fields',

  'SG-SPEC-006': () =>
    'Set the Status line to one of the four valid values:\n\n' +
    '  Draft         — spec is being written\n' +
    '  Ready         — spec is ready for implementation\n' +
    '  Blocked       — work cannot proceed (create a blocker)\n' +
    '  Implemented   — implementation complete',

  'SG-SPEC-007': (d) => {
    const criterion = d.message.match(/: "(.+)"$/)?.[1] || 'the criterion';
    return `Replace vague qualifiers in the acceptance criterion with measurable conditions.\n\n` +
      `  Vague:    "${criterion}"\n` +
      `  Better:   - [ ] [specific, observable outcome with no room for interpretation]\n\n` +
      `Examples of vague → concrete:\n` +
      `  "loads quickly"       → "page loads in under 2 seconds on a 4G connection"\n` +
      `  "handles errors well" → "shows an inline error message when the API returns 4xx"`;
  },

  'SG-CLASS-001': () =>
    'In the Work Classification section, check exactly one box by changing [ ] to [x]:\n\n' +
    '  - [ ] Reusable non-UI API          ← leave unchecked\n' +
    '  - [x] REST/service API             ← check this one\n' +
    '  - [ ] One-off application UI       ← leave unchecked\n\n' +
    'If the work genuinely spans multiple types, create a compound-work plan:\n' +
    '  spec-guard new compound-work specs/<name>-plan.md',

  'SG-CLASS-002': (d) => {
    const classification = d.message.match(/classification "(.+?)"/)?.[1] || '';
    const contractType = classificationToContractType(classification);
    return `Create a contract document and reference it in your spec's Dependencies section.\n\n` +
      `  1. Create:    spec-guard new ${contractType} contracts/<name>.md\n` +
      `  2. Fill it in with the API/component interface\n` +
      `  3. Add to spec Dependencies:\n` +
      `       - Contract: contracts/<name>.md`;
  },

  'SG-UI-001': () =>
    'Add a mockup, wireframe, or explicit design direction to the spec before implementation.\n\n' +
    '  Options:\n' +
    '  - Link a Figma file:  "See Figma mockup at [url]"\n' +
    '  - Reference a design system pattern:  "Follows the Dashboard layout pattern"\n' +
    '  - Attach a wireframe description:  "Mockup: [describe layout]"\n\n' +
    'Do NOT invent UI. If no design direction exists, create a blocker:\n' +
    '  spec-guard blocker .spec-guard/blockers/no-design-direction.md',

  'SG-UI-002': () =>
    'Add a component library reference to the spec so agents don\'t invent one.\n\n' +
    '  Examples:\n' +
    '  "Uses MUI v5 component library"\n' +
    '  "Uses Radix UI primitives with Tailwind CSS"\n' +
    '  "No component library — raw HTML/CSS only"\n\n' +
    'If no component library is established, explicitly state that in Expected Behavior.',

  'SG-TEST-001': () =>
    'Add at least one named test to the "Required Tests / Checks" section.\n\n' +
    'Name tests by behavior, not by implementation:\n\n' +
    '  Good:  - returns 404 when the user is not found\n' +
    '  Good:  - shows inline error when form is submitted with empty email\n' +
    '  Weak:  - test the user endpoint\n' +
    '  Weak:  - unit tests\n\n' +
    'Use spec_guard_test_guidance (MCP) or classify first to get test type guidance.',

  'SG-SPEC-008': (d) => {
    const item = d.message.match(/: "(.+)"$/)?.[1] || 'the scope item';
    return `Expand the scope item to describe a specific boundary.\n\n` +
      `  Too brief:  "- ${item}"\n` +
      `  Better:     "- ${item} [describe what specifically is included/excluded and why]"\n\n` +
      `Vague scope items cause agents to make assumptions about what is and isn't in bounds.`;
  },

  'SG-ALIGN-001': (d) => {
    const criterion = d.message.match(/: "(.+)"$/)?.[1] || 'the criterion';
    return `Add the acceptance criterion to the "Behavior / Contract Validated" section of the review:\n\n` +
      `  - [x] ${criterion}`;
  },

  'SG-ALIGN-002': (d) => {
    const test = d.message.match(/: "(.+)"$/)?.[1] || 'the test';
    return `Add the required test to the "Tests Written First" section of the review:\n\n` +
      `  - ${test}`;
  },

  'SG-ALIGN-003': (d) => {
    if (d.message.includes('not found')) {
      return `Create the contract file at the path referenced in the spec's Dependencies section.\n` +
        `Use the appropriate template:\n` +
        `  spec-guard new api-contract contracts/<name>.md\n` +
        `  spec-guard new rest-api-contract contracts/<name>.md\n` +
        `  spec-guard new component-contract contracts/<name>.md`;
    }
    if (d.message.includes('blank') || d.message.includes('empty')) {
      return 'Fill in the contract template with the actual interface definition.\n' +
        'A contract document with only template placeholders does not satisfy Gate 2.';
    }
    return 'Verify the contract file contains the expected interface definitions for its type.\n' +
      'REST API contracts should define routes. Component contracts should define props.';
  },

  'SG-STALE-001': () =>
    'The spec was edited after gate confirmations were recorded. Re-verify alignment:\n\n' +
    '  1. Run: spec-guard analyze path/to/spec.md\n' +
    '  2. Fix any SG-ALIGN-001/002/003/004 issues\n' +
    '  3. Update the implementation review if acceptance criteria changed\n' +
    '  4. Re-confirm Gate 5 if the review changes',

  'SG-ALIGN-004': () =>
    'Complete all unchecked items in the implementation review.\n' +
    'Gate 5 requires every checkbox to be resolved.\n\n' +
    'For each unchecked item:\n' +
    '  - [ ] item   →   - [x] item   (completed)\n' +
    '  or document explicitly why it does not apply.',
};

export function suggestFix(diagnostic) {
  const fn = RULE_SUGGESTIONS[diagnostic.ruleId];
  if (!fn) return `Review the spec and address: ${diagnostic.message}`;
  return fn(diagnostic);
}

export function annotateDiagnostics(diagnostics) {
  return diagnostics.map(d => ({ ...d, suggestion: suggestFix(d) }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function classificationToContractType(classification) {
  if (classification.includes('REST')) return 'rest-api-contract';
  if (classification.includes('Reusable UI')) return 'component-contract';
  return 'api-contract';
}
