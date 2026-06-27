import { z } from "zod";
import { ActionResultSchema } from "./result.ts";
import { InitInputSchema } from "./init.ts";
import { ConfigCheckInputSchema, ConfigGetInputSchema, ConfigUpdateInputSchema } from "./config.ts";
import { McpQuickstartInputSchema, McpStatusInputSchema } from "./quickstart.ts";
import { DecisionCreateInputSchema, DecisionGetInputSchema, DecisionListInputSchema, DecisionSupersedeInputSchema } from "./decision.ts";
import { ReviewSnapshotPersistInputSchema } from "./review-snapshot.ts";
import { BaselineAcceptInputSchema, BaselineBlockInputSchema, BaselineCheckInputSchema, BaselineDevRuntimeRunInputSchema, BaselineEstablishInputSchema, BaselineInitInputSchema, BaselineReviewInputSchema, BaselineUpdateInputSchema } from "./baseline.ts";
import { CommandRunInputSchema } from "./command.ts";
import { SourceArtifactGetInputSchema, SourceArtifactListInputSchema, SourceArtifactRegisterInputSchema, SourceArtifactUpdateInputSchema } from "./source-artifact.ts";
import { ServeViewerInputSchema } from "./viewer.ts";
import { WorkCreateInputSchema, WorkDecomposeInputSchema, WorkApproveInputSchema, WorkAuthorizeInputSchema, WorkSpecAdvanceInputSchema, WorkSpecRecordInputSchema, WorkSpecMockupInputSchema, WorkSpecAcsInputSchema, WorkReviewInputSchema, WorkCompleteInputSchema, WorkChoiceInputSchema, WorkChoicesInputSchema, WorkGetInputSchema, WorkListInputSchema, WorkSpecPlanInputSchema, WorkIntentInputSchema } from "./work.ts";

export type ActionMutability = "yes" | "no" | "audit_only";
export type ActionExposure = "core" | "cli" | "mcp";

export interface ActionRegistryMetadata<TInput extends z.ZodType = z.ZodType, TOutput extends z.ZodType = z.ZodType> {
  id: string;
  title: string;
  description: string;
  mutability: ActionMutability;
  input_schema: TInput;
  output_schema: TOutput;
  human_gated: boolean;
  review_bound: boolean;
  exposed_via: ActionExposure[];
  affected_artifact_types: string[];
}

export class ActionRegistry {
  private readonly entries = new Map<string, ActionRegistryMetadata>();

  register(metadata: ActionRegistryMetadata): void {
    if (this.entries.has(metadata.id)) {
      throw new Error(`action already registered: ${metadata.id}`);
    }
    this.entries.set(metadata.id, metadata);
  }

  get(id: string): ActionRegistryMetadata | undefined {
    return this.entries.get(id);
  }

  list(): ActionRegistryMetadata[] {
    return [...this.entries.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
}

export const foundationalActionRegistry = new ActionRegistry();

export const EmptyInputSchema = z.object({}).strict();

foundationalActionRegistry.register({
  id: "init",
  title: "Initialize Spec Guard",
  description: "Create the artifact root, Config artifact, and project-visible MCP/Pi/client guidance stubs.",
  mutability: "yes",
  input_schema: InitInputSchema,
  output_schema: ActionResultSchema,
  human_gated: false,
  review_bound: false,
  exposed_via: ["core", "cli"],
  affected_artifact_types: ["config"]
});

foundationalActionRegistry.register({
  id: "config.get",
  title: "Get config",
  description: "Read the persisted Spec Guard config artifact from the real store.",
  mutability: "no",
  input_schema: ConfigGetInputSchema,
  output_schema: ActionResultSchema,
  human_gated: false,
  review_bound: false,
  exposed_via: ["core", "cli", "mcp"],
  affected_artifact_types: ["config"]
});

foundationalActionRegistry.register({
  id: "config.update",
  title: "Update config",
  description: "Apply a Config-only RFC 6902 add/replace/remove patch and write a governed revision.",
  mutability: "yes",
  input_schema: ConfigUpdateInputSchema,
  output_schema: ActionResultSchema,
  human_gated: false,
  review_bound: false,
  exposed_via: ["core", "cli", "mcp"],
  affected_artifact_types: ["config"]
});

foundationalActionRegistry.register({
  id: "config.check",
  title: "Check config",
  description: "Read-only config/store health over persisted artifacts with a real governance summary.",
  mutability: "no",
  input_schema: ConfigCheckInputSchema,
  output_schema: ActionResultSchema,
  human_gated: false,
  review_bound: false,
  exposed_via: ["core", "cli", "mcp"],
  affected_artifact_types: ["config"]
});

foundationalActionRegistry.register({
  id: "mcp.quickstart",
  title: "MCP quickstart",
  description: "Return obvious first steps for agents backed by config.check.",
  mutability: "no",
  input_schema: McpQuickstartInputSchema,
  output_schema: ActionResultSchema,
  human_gated: false,
  review_bound: false,
  exposed_via: ["core", "cli", "mcp"],
  affected_artifact_types: []
});

foundationalActionRegistry.register({
  id: "serve.viewer",
  title: "Serve viewer",
  description: "CLI-only local runtime action that starts a real long-running HTTP server for the Spec Guard viewer.",
  mutability: "no",
  input_schema: ServeViewerInputSchema,
  output_schema: ActionResultSchema,
  human_gated: false,
  review_bound: false,
  exposed_via: ["cli"],
  affected_artifact_types: []
});

foundationalActionRegistry.register({
  id: "mcp.status",
  title: "MCP status",
  description: "Return Spec Guard status backed by config.check.",
  mutability: "no",
  input_schema: McpStatusInputSchema,
  output_schema: ActionResultSchema,
  human_gated: false,
  review_bound: false,
  exposed_via: ["core", "cli", "mcp"],
  affected_artifact_types: []
});

foundationalActionRegistry.register({
  id: "decision.create",
  title: "Create generic decision",
  description: "Append an immutable HumanDecision for custom/non-side-effect decision types only.",
  mutability: "yes",
  input_schema: DecisionCreateInputSchema,
  output_schema: ActionResultSchema,
  human_gated: true,
  review_bound: false,
  exposed_via: ["core", "cli", "mcp"],
  affected_artifact_types: ["decision_log"]
});

foundationalActionRegistry.register({
  id: "decision.supersede",
  title: "Supersede generic decision",
  description: "Create a new HumanDecision and update only the prior decision metadata backlink.",
  mutability: "yes",
  input_schema: DecisionSupersedeInputSchema,
  output_schema: ActionResultSchema,
  human_gated: true,
  review_bound: false,
  exposed_via: ["core", "cli", "mcp"],
  affected_artifact_types: ["decision_log"]
});

foundationalActionRegistry.register({
  id: "decision.list",
  title: "List decisions",
  description: "Read durable HumanDecision records from the project decision log.",
  mutability: "no",
  input_schema: DecisionListInputSchema,
  output_schema: ActionResultSchema,
  human_gated: false,
  review_bound: false,
  exposed_via: ["core", "cli", "mcp"],
  affected_artifact_types: ["decision_log"]
});

foundationalActionRegistry.register({
  id: "decision.get",
  title: "Get decision",
  description: "Read one durable HumanDecision record.",
  mutability: "no",
  input_schema: DecisionGetInputSchema,
  output_schema: ActionResultSchema,
  human_gated: false,
  review_bound: false,
  exposed_via: ["core", "cli", "mcp"],
  affected_artifact_types: ["decision_log"]
});

foundationalActionRegistry.register({
  id: "review_snapshot.persist",
  title: "Persist review snapshot",
  description: "Store a review snapshot in audit-only storage without governed artifact revision changes.",
  mutability: "audit_only",
  input_schema: ReviewSnapshotPersistInputSchema,
  output_schema: ActionResultSchema,
  human_gated: false,
  review_bound: true,
  exposed_via: ["core", "cli", "mcp"],
  affected_artifact_types: ["review_snapshot"]
});

for (const metadata of [
  { id: "source_artifact.register", title: "Register source artifact", description: "Register immutable source bytes or descriptor material and create SourceArtifact revision 1.", mutability: "yes" as const, input_schema: SourceArtifactRegisterInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["source_artifact"] },
  { id: "source_artifact.update", title: "Update source artifact", description: "Create a new immutable SourceArtifact revision; prior revisions remain resolvable.", mutability: "yes" as const, input_schema: SourceArtifactUpdateInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["source_artifact"] },
  { id: "source_artifact.get", title: "Get source artifact", description: "Resolve a SourceArtifact revision and verify content hash when supplied.", mutability: "no" as const, input_schema: SourceArtifactGetInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["source_artifact"] },
  { id: "source_artifact.list", title: "List source artifacts", description: "List current SourceArtifact records.", mutability: "no" as const, input_schema: SourceArtifactListInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["source_artifact"] },
  { id: "validate.parity", title: "Validate MCP/Pi parity", description: "Read-only comparison of implemented action registry metadata against generated MCP and Pi tool definitions, schemas, and descriptions.", mutability: "no" as const, input_schema: z.object({}).strict(), human_gated: false, review_bound: false, affected_artifact_types: [] },
  { id: "baseline.init", title: "Initialize runtime baseline", description: "Create the singleton draft RuntimeBaseline artifact or return the existing one unchanged.", mutability: "yes" as const, input_schema: BaselineInitInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["runtime_baseline"] },
  { id: "baseline.update", title: "Update runtime baseline", description: "Patch draft RuntimeBaseline fields; command results must come from command.run and accepted approved-field changes invalidate acceptance.", mutability: "yes" as const, input_schema: BaselineUpdateInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["runtime_baseline"] },
  { id: "baseline.review", title: "Review runtime baseline", description: "Produce a non-mutating ephemeral RuntimeBaseline review snapshot for the baseline.accept human gate.", mutability: "no" as const, input_schema: BaselineReviewInputSchema, human_gated: false, review_bound: true, affected_artifact_types: ["runtime_baseline"] },
  { id: "baseline.accept", title: "Accept runtime baseline", description: "Specialized binary human-gated runtime baseline acceptance action; validates snapshot freshness and deterministic baseline validation before recording acceptance.", mutability: "yes" as const, input_schema: BaselineAcceptInputSchema, human_gated: true, review_bound: true, affected_artifact_types: ["runtime_baseline", "decision_log"] },
  { id: "baseline.establish", title: "Establish runtime baseline (deterministic)", description: "Deterministic runtime-baseline acceptance: when the baseline's deterministic validation passes (commands valid + dev runtime PROVEN), accepts it automatically with a system-actor acceptance record — no human gate. The human's judgment is at packet approval and the work.complete completion gate.", mutability: "yes" as const, input_schema: BaselineEstablishInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["runtime_baseline", "decision_log"] },
  { id: "baseline.dev_runtime.run", title: "Run the dev runtime", description: "Start the declared runtime_development process group, poll its readiness probe, tear it down, and record the run result on the draft baseline so a real dev runtime can be required before acceptance.", mutability: "yes" as const, input_schema: BaselineDevRuntimeRunInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["runtime_baseline"] },
  { id: "baseline.block", title: "Block runtime baseline", description: "Record a runtime baseline blocker and set status blocked without fabricating decisions.", mutability: "yes" as const, input_schema: BaselineBlockInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["runtime_baseline"] },
  { id: "baseline.check", title: "Check runtime baseline", description: "Read current RuntimeBaseline and compute deterministic acceptance-readiness diagnostics.", mutability: "no" as const, input_schema: BaselineCheckInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["runtime_baseline"] },
  { id: "command.run", title: "Run command", description: "Execute argv commands without a shell or shell commands through the platform shell, derive status deterministically, and store a durable CommandResult.", mutability: "yes" as const, input_schema: CommandRunInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["command_result", "runtime_baseline"] },
  // v2 aggregate cutover: the v2 action layer over one canonical-JSON document per Work Packet (embedded specs[]).
  { id: "work.create", title: "Create aggregate Work Packet (v2)", description: "Create an undecomposed aggregate Work Packet (one document, one Spec).", mutability: "yes" as const, input_schema: WorkCreateInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["work_packet"] },
  { id: "work.intent", title: "Set Work Packet intent", description: "Set the whole-WP intent (goal + desired outcomes / in+out of scope / users / edge cases / open questions); pre-approval. work.create seeds only the goal — this fleshes out the rest.", mutability: "yes" as const, input_schema: WorkIntentInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["work_packet"] },
  { id: "work.get", title: "Read a Work Packet", description: "Read one Work Packet (the whole aggregate document) + its CURRENT whole-WP approval hash (to echo at a gate). Non-mutating.", mutability: "no" as const, input_schema: WorkGetInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["work_packet"] },
  { id: "work.list", title: "List Work Packets", description: "List every Work Packet as a compact summary (id, title, disposition, Spec count, gate state). Non-mutating.", mutability: "no" as const, input_schema: WorkListInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["work_packet"] },
  { id: "work.decompose", title: "Work Breakdown (v2)", description: "Decompose a Work Packet into its embedded specs[] (>=2 Specs); pre-approval.", mutability: "yes" as const, input_schema: WorkDecomposeInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["work_packet"] },
  { id: "work.choice", title: "Structural choice (v2)", description: "Record a platform/architecture/stack structural decision on the Work Packet container; pre-approval. Must record options_presented including a visible 'type your own answer' + 'Discuss' option (WORK_CHOICE_OPTIONS_INCOMPLETE otherwise).", mutability: "yes" as const, input_schema: WorkChoiceInputSchema, human_gated: true, review_bound: false, affected_artifact_types: ["work_packet"] },
  { id: "work.choices", title: "Structural choices — batch (v2)", description: "Record MULTIPLE structural decisions (platform + architecture + stack the human chose in one prompt) in a single call; pre-approval. Same per-choice validation (incl. the options_presented type-your-own + Discuss requirement), one write.", mutability: "yes" as const, input_schema: WorkChoicesInputSchema, human_gated: true, review_bound: false, affected_artifact_types: ["work_packet"] },
  { id: "work.spec.acs", title: "Draft Spec ACs (v2)", description: "Draft + validate one Spec's acceptance criteria; pre-approval (ACs are in the whole-WP approval hash).", mutability: "yes" as const, input_schema: WorkSpecAcsInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["work_packet"] },
  { id: "work.spec.plan", title: "Set Spec implementation plan", description: "Set one Spec's implementation plan (standard_plan or plan_waived_noop) + recompute its work-kind/evidence-policy resolutions; pre-approval. Required before the spec review + the bulk approval.", mutability: "yes" as const, input_schema: WorkSpecPlanInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["work_packet"] },
  { id: "work.spec.mockup", title: "Resolve Spec mockup (v2)", description: "Resolve a UI Spec's mockup question (none/present) before approval. HUMAN-gated: requires human_confirmed + the human's raw_response — the agent cannot answer it for them (WORK_SPEC_MOCKUP_UNCONFIRMED).", mutability: "yes" as const, input_schema: WorkSpecMockupInputSchema, human_gated: true, review_bound: false, affected_artifact_types: ["work_packet"] },
  { id: "work.review", title: "Record whole-WP review (v2)", description: "Record a pre-approval INDEPENDENT review: per-Spec (pass spec_id — runnable in PARALLEL) and/or whole-WP (no spec_id, over ALL Specs for cross-Spec coherence). A multi-Spec packet needs a whole-WP coherence review independent of every author; a per-Spec review differs from that Spec's author. After the Spec (+ its dependencies) are drafted + planned.", mutability: "yes" as const, input_schema: WorkReviewInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["work_packet"] },
  { id: "work.approve", title: "Approve Work Packet (v2)", description: "The whole-Work-Packet human approval gate over all Specs; binds the whole-WP approval hash, requires each Spec be ready (docs/mockup/AC/spec-review).", mutability: "yes" as const, input_schema: WorkApproveInputSchema, human_gated: true, review_bound: true, affected_artifact_types: ["work_packet"] },
  { id: "work.authorize", title: "Authorize Work Packet (v2)", description: "The whole-Work-Packet human authorization gate; greenlights every Spec to build and captures each Spec's change-baseline. Gated on the current approval.", mutability: "yes" as const, input_schema: WorkAuthorizeInputSchema, human_gated: true, review_bound: true, affected_artifact_types: ["work_packet"] },
  { id: "work.spec.record", title: "Record Spec lineage (v2)", description: "Append a sealed implementation_attempt/review_cycle/fix_instruction to one Spec and advance it, with producer-identity enforcement.", mutability: "yes" as const, input_schema: WorkSpecRecordInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["work_packet"] },
  { id: "work.spec.advance", title: "Advance Spec state (v2)", description: "Advance one Spec's workflow_state through a non-record-gated routing transition.", mutability: "yes" as const, input_schema: WorkSpecAdvanceInputSchema, human_gated: false, review_bound: false, affected_artifact_types: ["work_packet"] },
  { id: "work.complete", title: "Complete Work Packet (v2)", description: "The whole-Work-Packet human completion gate; completable only when every Spec is review_complete and the dev-runtime proof is satisfied.", mutability: "yes" as const, input_schema: WorkCompleteInputSchema, human_gated: true, review_bound: false, affected_artifact_types: ["work_packet"] }
]) {
  foundationalActionRegistry.register({ ...metadata, output_schema: ActionResultSchema, exposed_via: ["core", "cli", "mcp"] });
}
