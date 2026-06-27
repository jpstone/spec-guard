import type { ChoicePromptOption } from "../schemas/embedded.ts";

const platform = (number: number, label: string, choice: string): ChoicePromptOption => ({
  number,
  label,
  kind: "standard",
  payload: { choice },
  architecture_option_details: null,
  custom_confirmation_value: null
});

const somethingElse = (number: number): ChoicePromptOption => ({ number, label: "Something else", kind: "something_else", payload: null, architecture_option_details: null, custom_confirmation_value: null });
const discuss = (number: number): ChoicePromptOption => ({ number, label: "Discuss", kind: "discuss", payload: null, architecture_option_details: null, custom_confirmation_value: null });

export function highLevelPlatformOptions(): ChoicePromptOption[] {
  return [
    platform(1, "Web app", "web_app"),
    platform(2, "Desktop app", "desktop_app"),
    platform(3, "Mobile app", "mobile_app"),
    platform(4, "CLI app", "cli_app"),
    platform(5, "Backend/API service", "backend_api_service"),
    somethingElse(6),
    discuss(7)
  ];
}

export function platformPromptText(): string {
  return "Choose the high-level product platform only (for example web, desktop, mobile, CLI, or backend/API), not framework/stack/tooling.";
}

// Spec Guard does NOT hardcode architecture/stack options. The driving agent generates options
// appropriate to the platform and the work; these helpers only state what each gate is FOR so the agent
// presents the right KIND of decision. Architecture = structural shape; stack = framework/tooling.

export function architecturePromptText(platformChoice: string | null): string {
  const context = (platformChoice ?? "").trim().length > 0 ? ` for a ${platformChoice} project` : "";
  return `Choose the architectural shape/structure${context} — e.g. application topology (monolith / modular monolith / microservices / serverless), service decomposition, repo layout (monorepo / polyrepo), and persistence/runtime structure. This is NOT the framework or tooling (that is the separate stack choice). Generate options appropriate to this platform and work; each option must include structural details (description, benefits, tradeoffs, downstream constraints).`;
}

export function stackPromptText(platformChoice: string | null, classification?: string | null): string {
  const context = (platformChoice ?? "").trim().length > 0 ? ` for a ${platformChoice} project` : "";
  // The component/UI library choice only applies to a NEW standalone application (one_off_application_ui)
  // where a stack is being chosen — that's the signal it's a fresh app that may need a component library.
  // It does NOT apply to reusable UI work, API surfaces, or non-app changes.
  const componentGuidance = classification === "one_off_application_ui"
    ? " Because this is a NEW standalone application UI, the stack choice MUST record an explicit component/UI library selection: present the ecosystem's common component libraries (or \"none\") as a genuine choice for the human, and record the chosen one in option_details.component_library (\"none\" is a valid recorded value). Do not infer or omit it — the choice is rejected without it. A feature added to an EXISTING app inherits its component library; don't re-prompt."
    : "";
  return `Choose the framework / library / language / package manager / build tooling stack${context}, after the architecture decision. Generate options appropriate to this platform and architecture (for example, the relevant frameworks/runtimes for the chosen platform).${componentGuidance}`;
}

const PLATFORM_STACK_TOOLING_TERMS: Array<{ label: string; pattern: RegExp }> = [
  { label: "React", pattern: /\breact\b/i },
  { label: "Vite", pattern: /\bvite\b/i },
  { label: "Next.js", pattern: /\bnext(?:\.js|js)?\b/i },
  { label: "TypeScript", pattern: /\b(?:type\s*script|typescript)\b/i },
  { label: "npm", pattern: /\bnpm\b/i },
  { label: "pnpm", pattern: /\bpnpm\b/i },
  { label: "yarn", pattern: /\byarn\b/i },
  { label: "build tool", pattern: /\bbuild\s+tool(?:ing)?\b/i },
  { label: "bundler", pattern: /\bbundler\b/i },
  { label: "webpack", pattern: /\bwebpack\b/i },
  { label: "rollup", pattern: /\brollup\b/i },
  { label: "esbuild", pattern: /\besbuild\b/i },
  { label: "Vue", pattern: /\bvue\b/i },
  { label: "Svelte", pattern: /\bsvelte\b/i },
  { label: "Angular", pattern: /\bangular\b/i },
  { label: "Node.js", pattern: /\bnode(?:\.js|js)?\b/i }
];

export function platformStackTermsInText(text: string): string[] {
  return PLATFORM_STACK_TOOLING_TERMS.filter((term) => term.pattern.test(text)).map((term) => term.label);
}

export function platformOptionStackTerms(option: ChoicePromptOption): string[] {
  if (option.kind !== "standard") return [];
  const parts = [option.label];
  if (typeof option.payload?.choice === "string") parts.push(option.payload.choice);
  return platformStackTermsInText(parts.join(" "));
}

export function assertHighLevelPlatformChoiceValue(value: string): void {
  const invalid = platformStackTermsInText(value);
  if (invalid.length > 0) throw new Error(`platform_choice must be a high-level product platform only; move stack/framework/runtime/tooling/package-manager details to architecture/stack choice: ${invalid.join(", ")}`);
}
