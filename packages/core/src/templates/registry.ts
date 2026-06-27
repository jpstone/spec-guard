import { SCHEMA_VERSION_V1 } from "../role-loop/constants.ts";

/** M5 anti-bloat: prompt templates are shared/static and referenced by id+version. Per-work lineage
 * records (review_cycle, fix_instruction, attempt) store only `template_id`/`template_version` — never
 * a copy of the body — so no per-cycle prompt/review markdown files are generated. */

export const TEMPLATE_IDS = [
  "implementation_plan_draft_v1",
  "implementation_execute_v1",
  "focused_implementation_review_v1",
  "focused_blocker_fix_v1",
  "focused_rereview_v1",
  "validation_run_v1"
] as const;
export type TemplateId = typeof TEMPLATE_IDS[number];

export interface PromptTemplate {
  template_id: TemplateId;
  template_version: number;
  schema_version: number;
  title: string;
  /** Static prompt scaffold sections. Inputs are injected by ref at dispatch time (M8). */
  sections: string[];
}

function template(template_id: TemplateId, title: string, sections: string[]): PromptTemplate {
  return { template_id, template_version: 1, schema_version: SCHEMA_VERSION_V1, title, sections };
}

const TEMPLATES: Record<TemplateId, PromptTemplate> = {
  implementation_plan_draft_v1: template("implementation_plan_draft_v1", "Draft implementation plan", [
    "Inputs: WorkPacket intent, ACs, platform, architecture, runtime baseline, scope, allowed globs.",
    "Produce a concise standard_plan: summary, approach, expected_files, tests/evidence, risks, out-of-scope.",
    "Request clarification if the packet is too underspecified to plan safely."
  ]),
  implementation_execute_v1: template("implementation_execute_v1", "Execute implementation", [
    "Inputs: approved WorkPacket, implementation plan, allowed globs, runtime baseline.",
    "Implement only within approved scope and allowed globs; produce a concise implementation summary.",
    "Request clarification if the approved plan is insufficient or wrong."
  ]),
  focused_implementation_review_v1: template("focused_implementation_review_v1", "Focused implementation review", [
    "Inputs: approved WorkPacket, plan, sealed attempt, evidence/validation refs, allowed globs.",
    "Compare against approval; check evidence is meaningful; record blockers with exact paths/rationale.",
    "Verdict: pass | pass_with_non_blocking_issues | blocked."
  ]),
  focused_blocker_fix_v1: template("focused_blocker_fix_v1", "Focused blocker fix", [
    "Inputs: focused fix instruction (blocker ids + reviewer blocker refs), allowed files subset.",
    "Fix only the referenced blockers; no opportunistic refactors; produce a fix summary tied to blocker ids."
  ]),
  focused_rereview_v1: template("focused_rereview_v1", "Focused re-review", [
    "Inputs: prior blocked review, fix instruction, sealed fix attempt, affected validation/evidence.",
    "Cover each referenced blocker, files changed by the fix, affected validation, and regression risk in scope.",
    "Do not silently widen to a full review without recording a scope_expansion_reason."
  ]),
  validation_run_v1: template("validation_run_v1", "Validation run", [
    "Inputs: validation commands/evidence requirements for the work and ACs.",
    "Run commands deterministically; record command results/evidence refs; summarize without deciding pass/fail."
  ])
};

export function listTemplates(): PromptTemplate[] {
  return TEMPLATE_IDS.map((id) => TEMPLATES[id]);
}

export function getTemplate(templateId: TemplateId, templateVersion?: number): PromptTemplate {
  const found = TEMPLATES[templateId];
  if (templateVersion !== undefined && templateVersion !== found.template_version) {
    throw new Error(`template ${templateId} version ${templateVersion} not available (have ${found.template_version})`);
  }
  return found;
}
