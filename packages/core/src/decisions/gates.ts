export type BinaryGateDecision = "yes" | "no" | "discuss";
export type ChoiceOptionKind = "standard" | "something_else" | "discuss" | "custom_confirmation";

export interface NumberedChoiceOption<TPayload = unknown> {
  number: number;
  label: string;
  kind: ChoiceOptionKind;
  payload?: TPayload | null;
  architecture_option_details?: unknown | null;
  custom_confirmation_value?: string | null;
}

export interface SelectionOutcome {
  selected_number: number;
  normalized_decision: string;
  creates_human_decision: boolean;
  mutates_governed_state: boolean;
  requires_custom_confirmation: boolean;
}

export function validateBinaryGateSelection(selectedNumber: number): SelectionOutcome {
  if (selectedNumber === 1) {
    return { selected_number: selectedNumber, normalized_decision: "yes", creates_human_decision: true, mutates_governed_state: true, requires_custom_confirmation: false };
  }
  if (selectedNumber === 2) {
    return { selected_number: selectedNumber, normalized_decision: "no", creates_human_decision: true, mutates_governed_state: true, requires_custom_confirmation: false };
  }
  if (selectedNumber === 3) {
    return { selected_number: selectedNumber, normalized_decision: "discuss", creates_human_decision: false, mutates_governed_state: false, requires_custom_confirmation: false };
  }
  throw new Error("binary gates accept only selected_number 1 Yes, 2 No, or 3 Discuss");
}

export function validateFixedBinaryDecisionOptions(options: readonly NumberedChoiceOption[]): void {
  if (options.length !== 3) throw new Error("fixed binary decisions must have exactly two domain outcomes plus Discuss");
  const [first, second, third] = options;
  if (first?.number !== 1 || first.kind !== "standard") throw new Error("fixed binary option 1 must be the first domain outcome");
  if (second?.number !== 2 || second.kind !== "standard") throw new Error("fixed binary option 2 must be the second domain outcome");
  if (third?.number !== 3 || third.kind !== "discuss") throw new Error("fixed binary option 3 must be Discuss");
}

export function validateFixedBinaryDecisionSelection(selectedNumber: number, options: readonly NumberedChoiceOption[]): SelectionOutcome {
  validateFixedBinaryDecisionOptions(options);
  if (selectedNumber === 1 || selectedNumber === 2) {
    const option = options[selectedNumber - 1];
    return { selected_number: selectedNumber, normalized_decision: option?.label ?? String(selectedNumber), creates_human_decision: true, mutates_governed_state: true, requires_custom_confirmation: false };
  }
  if (selectedNumber === 3) {
    return { selected_number: selectedNumber, normalized_decision: "discuss", creates_human_decision: false, mutates_governed_state: false, requires_custom_confirmation: false };
  }
  throw new Error("fixed binary decisions accept only options 1, 2, or 3");
}

export function validateNonBinaryChoicePrompt(options: readonly NumberedChoiceOption[]): void {
  if (options.length < 3) throw new Error("non-binary choices require at least one domain option, Something else, and Discuss");
  const somethingElse = options[options.length - 2];
  const discuss = options[options.length - 1];
  if (somethingElse?.kind !== "something_else") throw new Error("non-binary choices must end with Something else before Discuss");
  if (discuss?.kind !== "discuss") throw new Error("non-binary choices must end with Discuss");
  options.forEach((option, index) => {
    const expectedNumber = index + 1;
    if (option.number !== expectedNumber) throw new Error("choice option numbers must be consecutive starting at 1");
    if (index < options.length - 2 && option.kind !== "standard") throw new Error("domain options must use kind standard");
  });
}

export function validateNonBinaryChoiceSelection(selectedNumber: number, options: readonly NumberedChoiceOption[]): SelectionOutcome {
  validateNonBinaryChoicePrompt(options);
  const option = options[selectedNumber - 1];
  if (option === undefined) throw new Error("selected number is not present in the choice prompt");
  if (option.kind === "standard") {
    return { selected_number: selectedNumber, normalized_decision: option.label, creates_human_decision: true, mutates_governed_state: true, requires_custom_confirmation: false };
  }
  if (option.kind === "something_else") {
    return { selected_number: selectedNumber, normalized_decision: "something_else", creates_human_decision: false, mutates_governed_state: false, requires_custom_confirmation: true };
  }
  if (option.kind === "discuss") {
    return { selected_number: selectedNumber, normalized_decision: "discuss", creates_human_decision: false, mutates_governed_state: false, requires_custom_confirmation: false };
  }
  throw new Error("custom confirmation options are valid only in a custom confirmation prompt");
}

export function buildCustomConfirmationOptions(decision: string, choice: string): NumberedChoiceOption[] {
  return [
    { number: 1, label: `Use ${decision} as the proposed ${choice}`, kind: "custom_confirmation", custom_confirmation_value: decision },
    { number: 2, label: "Do not use this decision", kind: "standard" },
    { number: 3, label: "Discuss", kind: "discuss" }
  ];
}

export function validateCustomConfirmationOptions(options: readonly NumberedChoiceOption[]): void {
  if (options.length !== 3) throw new Error("custom confirmation prompts must have exactly three options");
  const [useDecision, doNotUse, discuss] = options;
  if (useDecision?.number !== 1 || useDecision.kind !== "custom_confirmation" || !useDecision.custom_confirmation_value) {
    throw new Error("custom confirmation option 1 must use the proposed decision");
  }
  if (doNotUse?.number !== 2 || doNotUse.kind !== "standard") throw new Error("custom confirmation option 2 must be Do not use this decision");
  if (discuss?.number !== 3 || discuss.kind !== "discuss") throw new Error("custom confirmation option 3 must be Discuss");
}

export function validateCustomConfirmationSelection(selectedNumber: number, options: readonly NumberedChoiceOption[]): SelectionOutcome {
  validateCustomConfirmationOptions(options);
  if (selectedNumber === 1) {
    const option = options[0];
    return { selected_number: selectedNumber, normalized_decision: option?.custom_confirmation_value ?? option?.label ?? "custom", creates_human_decision: true, mutates_governed_state: true, requires_custom_confirmation: false };
  }
  if (selectedNumber === 2) {
    return { selected_number: selectedNumber, normalized_decision: "do_not_use_custom_decision", creates_human_decision: false, mutates_governed_state: false, requires_custom_confirmation: false };
  }
  if (selectedNumber === 3) {
    return { selected_number: selectedNumber, normalized_decision: "discuss", creates_human_decision: false, mutates_governed_state: false, requires_custom_confirmation: false };
  }
  throw new Error("custom confirmation prompts accept only options 1, 2, or 3");
}
