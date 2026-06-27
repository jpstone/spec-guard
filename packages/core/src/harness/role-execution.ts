import { z } from "zod";
import type { Config } from "../schemas/artifacts.ts";
import type { ChangeFileCategory } from "../schemas/enums.ts";
import type { Diagnostic } from "../schemas/embedded.ts";
import { classifyPath, changedFileAllowedByGlobs } from "../paths/classify.ts";
import { RoleNameSchema, READ_ONLY_ROLES, type RoleName, type RoleConfigEntry, type SpecGuardRoleConfig } from "../role-config/config.ts";
import { ProducerIdentitySchema } from "../role-loop/human-decision.ts";

/** M3: deterministic role-capability machinery + post-return write-violation detection.
 * Per the confirmed M3 decision, the boundary is permission-mode + detect-and-revert; physical
 * worktree/container isolation is deferred to M8. These predicates are the enforcement machinery;
 * they are consumed by the authorization/review gates (M6/M7) and the spawn flow (M8). M3 does not
 * itself run subagents or block a live workflow. */

export const ProductWorkspaceAccessSchema = z.enum(["none", "read", "write"]);
export type ProductWorkspaceAccess = z.infer<typeof ProductWorkspaceAccessSchema>;

export const GovernedStateAccessSchema = z.enum(["none", "append", "write"]);
export type GovernedStateAccess = z.infer<typeof GovernedStateAccessSchema>;

export const CommandPolicySchema = z.enum(["none", "read_only", "mutating_with_snapshots"]);
export type CommandPolicy = z.infer<typeof CommandPolicySchema>;

export const RoleExecutionContextSchema = z.object({
  role: RoleNameSchema,
  product_workspace_access: ProductWorkspaceAccessSchema,
  governed_state_access: GovernedStateAccessSchema,
  allowed_product_paths: z.array(z.string()),
  allowed_governed_record_kinds: z.array(z.string()),
  command_policy: CommandPolicySchema
}).strict();
export type RoleExecutionContext = z.infer<typeof RoleExecutionContextSchema>;

interface RolePolicy {
  product: ProductWorkspaceAccess;
  governed: GovernedStateAccess;
  command: CommandPolicy;
  record_kinds: string[];
}

/** Harness-layer policy per role — the authority for capabilities, not the editable role config.
 * Read-only roles are never granted product-write here even if the config says otherwise. */
const ROLE_POLICY: Record<RoleName, RolePolicy> = {
  coordinator: { product: "read", governed: "write", command: "none", record_kinds: ["work_packet", "focused_fix_instruction", "clarification_request"] },
  implementation_planner: { product: "read", governed: "append", command: "none", record_kinds: ["implementation_plan", "clarification_request"] },
  implementer: { product: "write", governed: "append", command: "none", record_kinds: ["implementation_attempt", "clarification_request"] },
  fixer: { product: "write", governed: "append", command: "none", record_kinds: ["implementation_attempt", "clarification_request"] },
  reviewer: { product: "read", governed: "append", command: "read_only", record_kinds: ["review_cycle"] },
  rereviewer: { product: "read", governed: "append", command: "read_only", record_kinds: ["review_cycle"] },
  validator: { product: "read", governed: "append", command: "mutating_with_snapshots", record_kinds: ["command_result", "validation_summary", "evidence_ref"] },
  evidence_recorder: { product: "read", governed: "append", command: "none", record_kinds: ["evidence_ref"] },
  clarification_handler: { product: "read", governed: "append", command: "none", record_kinds: ["clarification_request"] }
};

/** Derive the harness capability context for a role. The harness policy caps product write: a role
 * the policy marks read-only never gets product-write even if its config entry sets may_edit_code. */
export function deriveRoleExecutionContext(role: RoleName, entry: RoleConfigEntry, allowedGlobs: readonly string[]): RoleExecutionContext {
  const policy = ROLE_POLICY[role];
  const product: ProductWorkspaceAccess = policy.product === "write" && entry.may_edit_code ? "write" : policy.product === "write" ? "read" : policy.product;
  return RoleExecutionContextSchema.parse({
    role,
    product_workspace_access: product,
    governed_state_access: policy.governed,
    allowed_product_paths: product === "write" ? [...allowedGlobs] : [],
    allowed_governed_record_kinds: policy.record_kinds,
    command_policy: policy.command
  });
}

/** Abstract subagent permission mode for a context; M8 maps these to concrete provider flags
 * (e.g. `claude -p --permission-mode plan` for read_only). */
export function subagentPermissionMode(context: RoleExecutionContext): "read_only" | "scoped_write" {
  return context.product_workspace_access === "write" ? "scoped_write" : "read_only";
}

/** Flags a config that grants a harness-read-only role product-edit capability (config can only
 * narrow, never widen, the harness policy). */
export function validateReadOnlyRoleCapabilities(config: SpecGuardRoleConfig): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const role of READ_ONLY_ROLES) {
    if (config.roles[role].may_edit_code) {
      diagnostics.push({
        code: "ROLE_EDIT_CAPABILITY_NOT_PERMITTED",
        severity: "error",
        message: `Role '${role}' is read-only at the harness layer; may_edit_code:true in the config is ignored and not granted.`,
        field_path: `/roles/${role}/may_edit_code`,
        gate: null,
        fix: "Set may_edit_code:false for this role."
      });
    }
  }
  return diagnostics;
}

export type RoleChangeDisposition =
  | "allowed"
  | "unauthorized_product_write"
  | "out_of_boundary_product_write"
  | "unexpected_path";

export interface RoleChangeClassification {
  path: string;
  category: ChangeFileCategory | null;
  disposition: RoleChangeDisposition;
}

export interface RoleWriteViolationResult {
  classifications: RoleChangeClassification[];
  violations: RoleChangeClassification[];
  diagnostics: Diagnostic[];
  recommended_disposition: "none" | "revert_or_convert";
}

const VIOLATION_MESSAGE: Record<Exclude<RoleChangeDisposition, "allowed">, string> = {
  unauthorized_product_write: "wrote product-workspace files but its role has no product-write capability",
  out_of_boundary_product_write: "wrote a product file outside the approved allowed_globs boundary",
  unexpected_path: "changed a path that classifies as other_unexpected (not silently allowed)"
};

/** Detect role write violations from the set of files changed during/after a role's run.
 * Deterministic; intended to run after a subagent returns (M8) or at gate time (M6/M7). */
export function detectRoleWriteViolations(input: {
  context: RoleExecutionContext;
  changedFiles: readonly string[];
  allowedGlobs: readonly string[];
  config: Config;
}): RoleWriteViolationResult {
  const boundary = input.context.allowed_product_paths.length > 0 ? input.context.allowed_product_paths : input.allowedGlobs;
  const classifications: RoleChangeClassification[] = [];
  for (const raw of input.changedFiles) {
    const classified = classifyPath(raw, input.config);
    if (classified.ignored || classified.category === null) {
      classifications.push({ path: classified.path, category: classified.category, disposition: "allowed" });
      continue;
    }
    if (classified.category === "spec_guard_artifact_evidence") {
      // Governed .spec-guard changes are not product-write violations; governed-record append
      // authorization is enforced at record-creation time (API layer, M5/M6), not from changed files.
      classifications.push({ path: classified.path, category: classified.category, disposition: "allowed" });
      continue;
    }
    if (classified.category === "other_unexpected") {
      classifications.push({ path: classified.path, category: classified.category, disposition: "unexpected_path" });
      continue;
    }
    if (input.context.product_workspace_access !== "write") {
      classifications.push({ path: classified.path, category: classified.category, disposition: "unauthorized_product_write" });
      continue;
    }
    const inBoundary = changedFileAllowedByGlobs(classified.path, classified.category, boundary);
    classifications.push({ path: classified.path, category: classified.category, disposition: inBoundary ? "allowed" : "out_of_boundary_product_write" });
  }
  const violations = classifications.filter((entry) => entry.disposition !== "allowed");
  const diagnostics: Diagnostic[] = violations.map((violation) => ({
    code: "ROLE_WRITE_VIOLATION",
    severity: "error",
    message: `Role '${input.context.role}' ${VIOLATION_MESSAGE[violation.disposition as Exclude<RoleChangeDisposition, "allowed">]}: ${violation.path}`,
    field_path: "/review/changed_files",
    gate: null,
    fix: "Revert the change or convert it into an approved governed change."
  }));
  return { classifications, violations, diagnostics, recommended_disposition: violations.length > 0 ? "revert_or_convert" : "none" };
}

export const IdentityAttestationSchema = z.enum(["harness_captured", "provider_attested", "logical_role_trust_boundary", "unknown"]);
export type IdentityAttestation = z.infer<typeof IdentityAttestationSchema>;

export const RetryPolicySchema = z.enum(["none", "safe_retry"]);
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

/** Common envelope for a backend role invocation (defined here; executed in M8). Governed records
 * must use the harness-captured/provider-attested `observed_producer_identity`, never a model claim. */
export const BackendTaskEnvelopeSchema = z.object({
  task_id: z.string().min(1),
  role: RoleNameSchema,
  template_id: z.string().min(1),
  template_version: z.number().int().positive(),
  input_refs: z.array(z.string()),
  allowed_capabilities: RoleExecutionContextSchema,
  expected_output_schema: z.string().min(1),
  requested_role_identity: ProducerIdentitySchema,
  observed_producer_identity: ProducerIdentitySchema.nullable(),
  identity_attestation: IdentityAttestationSchema,
  timeout_ms: z.number().int().positive(),
  retry_policy: RetryPolicySchema
}).strict();
export type BackendTaskEnvelope = z.infer<typeof BackendTaskEnvelopeSchema>;
