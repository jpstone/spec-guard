import { describe, expect, it } from "vitest";
import {
  buildCustomConfirmationOptions,
  validateBinaryGateSelection,
  validateCustomConfirmationSelection,
  validateFixedBinaryDecisionOptions,
  validateFixedBinaryDecisionSelection,
  validateNonBinaryChoicePrompt,
  validateNonBinaryChoiceSelection
} from "../src/index.ts";

const fixed = [
  { number: 1, label: "Single packet", kind: "standard" as const },
  { number: 2, label: "Plan", kind: "standard" as const },
  { number: 3, label: "Discuss", kind: "discuss" as const }
];

const nonBinary = [
  { number: 1, label: "Web app", kind: "standard" as const },
  { number: 2, label: "CLI", kind: "standard" as const },
  { number: 3, label: "Something else", kind: "something_else" as const },
  { number: 4, label: "Discuss", kind: "discuss" as const }
];

describe("gate semantics", () => {
  it("normalizes binary Yes/No/Discuss and rejects other numbers", () => {
    expect(validateBinaryGateSelection(1).normalized_decision).toBe("yes");
    expect(validateBinaryGateSelection(2).normalized_decision).toBe("no");
    expect(validateBinaryGateSelection(3)).toMatchObject({ normalized_decision: "discuss", creates_human_decision: false, mutates_governed_state: false });
    expect(() => validateBinaryGateSelection(4)).toThrow(/binary gates/);
  });

  it("keeps fixed binary decisions to two domain outcomes plus Discuss", () => {
    validateFixedBinaryDecisionOptions(fixed);
    expect(validateFixedBinaryDecisionSelection(1, fixed).creates_human_decision).toBe(true);
    expect(validateFixedBinaryDecisionSelection(3, fixed).creates_human_decision).toBe(false);
    expect(() => validateFixedBinaryDecisionOptions([...fixed.slice(0, 2), { number: 3, label: "Something else", kind: "something_else" as const }, { number: 4, label: "Discuss", kind: "discuss" as const }])).toThrow();
  });

  it("requires non-binary custom choices to be confirmed", () => {
    validateNonBinaryChoicePrompt(nonBinary);
    expect(validateNonBinaryChoiceSelection(3, nonBinary)).toMatchObject({ creates_human_decision: false, requires_custom_confirmation: true });
    expect(validateNonBinaryChoiceSelection(4, nonBinary)).toMatchObject({ creates_human_decision: false, normalized_decision: "discuss" });
    const confirm = buildCustomConfirmationOptions("desktop app", "platform");
    expect(validateCustomConfirmationSelection(1, confirm).creates_human_decision).toBe(true);
    expect(validateCustomConfirmationSelection(2, confirm).creates_human_decision).toBe(false);
    expect(validateCustomConfirmationSelection(3, confirm).normalized_decision).toBe("discuss");
  });
});
