import { z } from "zod";
import { WorkPacketSchema } from "./artifacts.ts";

/**
 * v2 aggregate Work Packet schema (WORK_PACKET_AGGREGATE_V2_DESIGN.md).
 *
 * ADDITIVE: a NEW `schema_version: 2` shape defined ALONGSIDE the live v1 `WorkPacketSchema`, not wired into any
 * store yet (Phase 2 swaps the backend onto it). Derived from the v1 leaf via `.pick()` + shape-spread so the
 * field DEFINITIONS live in one place and stay in sync; only the container/Spec SPLIT and the lifecycle shape
 * are new here.
 *
 * Split (per §3):
 *  - The CONTAINER holds the whole-Work-Packet request (intent), the structural decisions Specs inherit
 *    (platform/architecture/stack, runtime baseline), the embedded decision log, and the THREE whole-WP HUMAN
 *    gates — approve / authorize / complete.
 *  - Each embedded SPEC is a homogeneous leaf with its OWN classification / ACs / docs / scope / plan and its
 *    AGENT-driven implementation lifecycle (`workflow_state` + attempts/reviews + spec review). A Spec has NO
 *    human gate of its own.
 *
 * Deliberately ABSENT from v2 (per §3): per-Spec `ac_approval`/`packet_approval` (collapsed into the one
 * whole-WP `approval`); `clarification_requests` (mid-flight clarification is eliminated); the container-level
 * `classification`/`docs`/`implementation_plan` (vestigial once Specs are authoritative, §5); `decomposed` /
 * `work_breakdown_ref` / `parent_plan_id` / `plan_slice_id` (the breakdown IS `specs[]`, no separate Plan).
 */

// Reuse the exact `HumanDecision | null` type the v1 lifecycle uses, without a fresh import.
const humanGate = WorkPacketSchema.shape.lifecycle.shape.packet_approval;

/**
 * A Spec's declared dependency EDGES, identified during implementation planning (required by work.spec.plan). A
 * cross-Spec edge points at a sibling Spec + (optionally) the named CONTRACT ARTIFACT that is the authority — NOT a
 * copied symbol list (which would duplicate the contract and drift when the API changes). Spec Guard gates the
 * EDGE: it must resolve to a real sibling Spec (plan-time) and the graph must be acyclic (review-time). The build
 * verifies the actual exports and the reviewer judges truthfulness. `external_dependencies` (packages / existing
 * modules) are informational — the deterministic validator (build/typecheck) is their export authority, so they
 * are ungated. See DEPENDENCY_EDGES_DESIGN.md.
 */
// A reference to a frozen contract version Spec Guard OWNS — id + the content hash of its surface. Resolvable across
// Work Packets via the committed ContractStore. This is the deterministic pin (a producer re-version can't move it).
export const ContractRefSchema = z.object({
  id: z.string().min(1),
  content_hash: z.string().min(1)
}).strict();
export type ContractRef = z.infer<typeof ContractRefSchema>;

// The authoritative contract artifact Spec Guard owns: a hard JSON-Schema `surface` (structural interface — Spec
// Guard does NOT parse it in Phase 1), content-hashed. Stored committed at <artifactRoot>/contracts/<id>/<content_hash>.json.
export const ContractArtifactSchema = z.object({
  schema_version: z.literal(1).default(1),
  id: z.string().min(1),
  surface: z.unknown(),
  content_hash: z.string().min(1),
  // Was this the GENESIS of the contract id (no prior version existed when it was frozen)? Recorded once at freeze
  // time and never flipped, so the viewer can show "created" vs "updated" contracts deterministically. NOT hashed
  // (the ref is the surface hash), so it never affects resolution. Defaults true for pre-provenance committed files.
  first_version: z.boolean().default(true),
  // Which Work Packet + Spec froze THIS version. The viewer attributes "created" to the WP that authored the GENESIS
  // (first_version) version — so a WP that creates a contract and then revises it still reads "created", not "updated".
  produced_by: z.object({ work_id: z.string().min(1), spec_id: z.string().min(1) }).nullable().default(null)
}).strict();
export type ContractArtifact = z.infer<typeof ContractArtifactSchema>;

export const SpecDependencyEdgeSchema = z
  .object({
    spec_id: z.string().min(1),
    contract: ContractRefSchema.nullable(), // the consumer's PIN to a frozen contract version, or null (derive from the producer)
    reason: z.string().min(1)
  })
  .strict();
export const ExternalDependencySchema = z.object({ name: z.string().min(1), reason: z.string().min(1) }).strict();
// A pin to a contract produced by ANOTHER Work Packet (or a pre-existing one) — resolved via the committed
// cross-packet ContractStore, with NO sibling producer Spec. This is how a NEW Work Packet references an existing contract.
export const ContractDependencySchema = z.object({ contract: ContractRefSchema, reason: z.string().min(1) }).strict();
export const SpecDependenciesSchema = z
  .object({
    spec_dependencies: z.array(SpecDependencyEdgeSchema),       // intra-WP: depend on a sibling Spec
    external_dependencies: z.array(ExternalDependencySchema),   // packages/modules (ungated)
    contract_dependencies: z.array(ContractDependencySchema).default([]) // cross-PACKET: pin an existing contract by ref
  })
  .strict();
export const EMPTY_SPEC_DEPENDENCIES: z.infer<typeof SpecDependenciesSchema> = { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] };

/** One homogeneous leaf of a Work Packet — AGENT-owned implementation lifecycle, no human gate of its own. */
export const SpecSchema = z
  .object({
    ...WorkPacketSchema.pick({
      id: true,
      title: true,
      classification: true,
      origination: true,
      acceptance_criteria: true,
      docs: true,
      scope: true,
      mockup_decision: true,
      work_kind_resolution: true,
      work_kind_resolution_hash: true,
      implementation_plan: true,
      implementation_plan_hash: true,
      evidence_policy_resolution: true,
      evidence_policy_resolution_hash: true,
      change_baseline: true,
      workflow_state: true,
      implementation_attempts: true,
      review_cycles: true,
      focused_fix_instructions: true,
      spec_review_cycles: true,
      spec_author_agent_instance_id: true,
      diagnostics: true
    }).shape,
    dependencies: SpecDependenciesSchema.default(EMPTY_SPEC_DEPENDENCIES),
    // A reference to the frozen contract this Spec PRODUCES (registered in the committed ContractStore at plan time).
    // Required for the contract-producing classifications (rest_api / reusable_api / reusable_ui). Null = no contract.
    contract: ContractRefSchema.nullable().default(null)
  })
  .strict();

/** The classifications whose deliverable IS a contract others consume — they MUST declare a `contract` artifact. */
export const CONTRACT_PRODUCING_CLASSIFICATIONS = ["rest_api", "reusable_api", "reusable_ui"] as const;
export type Spec = z.infer<typeof SpecSchema>;

/** The three whole-Work-Packet HUMAN gates (§3). `approval` collapses today's `ac_approval` + `packet_approval`. */
export const AggregateLifecycleSchema = z
  .object({
    approval: humanGate,
    authorization: humanGate,
    completion: humanGate,
    history: WorkPacketSchema.shape.lifecycle.shape.history
  })
  .strict();
export type AggregateLifecycle = z.infer<typeof AggregateLifecycleSchema>;

/** One canonical-JSON document per Work Packet: the container + its embedded `specs[]`. */
export const AggregateWorkPacketSchema = z
  .object({
    ...WorkPacketSchema.pick({
      id: true,
      revision: true,
      created_at: true,
      updated_at: true,
      disposition: true,
      title: true,
      intent: true,
      platform: true,
      architecture: true,
      stack: true,
      runtime_baseline_ref: true,
      decision_history: true,
      spec_review_cycles: true,
      diagnostics: true
    }).shape,
    artifact_type: z.literal("work_packet"),
    schema_version: z.literal(2),
    lifecycle: AggregateLifecycleSchema,
    // Set when the human requests changes at the approval gate and declines a re-review: the NEXT approval skips
    // the stale-whole-WP-review check (the human accepts the changes without a fresh agent review). Cleared on
    // approval. NOT part of the approval hash (a workflow flag, not approved content).
    re_review_waived: z.boolean().default(false),
    // At least one Spec always (an undecomposed Work Packet is its own single Spec). Enforced so the approval
    // hash can never degenerate to one that ignores the container's structural decisions (they ride inside the
    // per-Spec projections, so zero Specs => zero coverage).
    specs: z.array(SpecSchema).min(1)
  })
  .strict()
  .superRefine((value, ctx) => {
    // Spec ids must be unique within a Work Packet: actions address a Spec by id (find/patch), so a duplicate
    // would make the second Spec unreachable. (artifacts.ts AC ids are similarly unique within a packet.)
    const ids = value.specs.map((spec) => spec.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["specs"], message: "Spec ids must be unique within a Work Packet" });
  });
export type AggregateWorkPacket = z.infer<typeof AggregateWorkPacketSchema>;
