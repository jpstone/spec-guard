import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { WorkPacket } from "../schemas/artifacts.ts";
import type { Spec } from "../schemas/work-packet.ts";
import { DecisionLog } from "../decisions/decision-log.ts";

/** Resolve the chosen platform/architecture/stack options from the decision log (the trade-off content the
 *  human reviews at approval). Best-effort; returns [] when the decisions aren't readable (e.g. a fresh clone). */
export async function resolveStructuralDecisions(artifactRoot: string, work: WorkPacket): Promise<StructuralDecision[]> {
  const log = new DecisionLog(artifactRoot);
  const ids = [work.platform?.decision_id, ...(work.architecture?.decision_ids ?? []), ...(work.stack?.decision_ids ?? [])].filter((value): value is string => typeof value === "string");
  const out: StructuralDecision[] = [];
  for (const id of ids) {
    try {
      const decision = await log.get(id);
      out.push({ axis: decision.decision_type, chosen: decision.normalized_decision });
    } catch { /* skip unreadable */ }
  }
  return out;
}

// The committable spec projection (references-by-hash, Part D + delivery record). The whole artifact root is
// gitignored EXCEPT `<root>/spec/`, where this clean, human-readable, diffable file lives. It is the viewer's
// RENDER MODEL as well as the committed record, so it is consistent across clones: the approved contract
// (intent/ACs/structural decisions/plan/breakdown via the bound ApprovedWorkPacketProjectionV1) + a
// proof-of-approval stamp + a DELIVERY record (what was built, that it was independently reviewed, and the
// deterministic validation verdicts). Fully content-derived (no timestamps), so re-emits are diff-free and the
// approval hash doubles as a drift detector.

export interface DeliveryAttempt {
  id: string;
  kind: string;
  state: string;
  summary: string;
  changed_files: string[];
  diff_hash: string | null;
  producer_role: string;
  producer_agent_instance_id: string | null;
}

export interface DeliveryReview {
  id: string;
  kind: string;
  state: string;
  verdict: string | null;
  summary: string;
  blockers: Array<{ title: string; rationale: string }>;
  reviewer_role: string;
  reviewer_agent_instance_id: string | null;
  implementer_agent_instance_id: string | null;
  // Honest: Spec Guard sees only self-reported labels, so it NEVER reports "proven". "asserted" = the reviewer
  // label differs from the implementer's (but a genuinely separate agent is NOT verified by core); "self_review"
  // = same label (blocked); "unverified" = a null identity. (Proven independence requires harness attestation.)
  independence: IndependenceBasis;
}

export type IndependenceBasis = "asserted" | "self_review" | "unverified";

/** Core can only check label distinctness; it cannot verify a genuinely separate agent reviewed. So it never
 *  claims "proven" — `asserted` means the labels differ, nothing more. */
export function independenceBasis(reviewerId: string | null, otherId: string | null): IndependenceBasis {
  if (reviewerId === null || otherId === null) return "unverified";
  if (reviewerId === otherId) return "self_review";
  return "asserted";
}

export interface DeliveryValidation {
  command: string;
  status: string;
  exit_code: number | null;
  purpose: string | null;
}

export interface DeliveryRecord {
  implementation_attempts: DeliveryAttempt[];
  reviews: DeliveryReview[];
  validation: DeliveryValidation[];
}

// The PRE-approval independent spec review (Part C): was the spec reviewed, by a genuinely separate agent, and
// did it pass? Surfaced in the committed record so a clone/the human sees it, like the implementation review.
export interface SpecReviewSummary {
  reviewed: boolean;
  verdict: string | null;
  summary: string;
  // See IndependenceBasis — core never reports "proven", only that the labels differ ("asserted").
  independence: IndependenceBasis;
  blockers: Array<{ title: string; detail: string }>;
}

export interface CommittableSpec {
  spec_version: 1;
  work_id: string;
  title: string;
  workflow_state: string;
  // The approved spec content (ApprovedWorkPacketProjectionV1), bound at approval; null before approval.
  approved_spec: unknown | null;
  proof_of_approval: {
    approved: boolean;
    human_confirmed: boolean;
    approved_payload_hash: string | null;
    review_snapshot_hash: string | null;
    authorized: boolean;
    authorization_human_confirmed: boolean;
    authorization_hash: string | null;
  };
  work_breakdown_ref: WorkPacket["work_breakdown_ref"];
  structural_decisions: StructuralDecision[];
  // The declared cross-Spec dependency edges + the producer contract this Spec ships (v2 contract-first model).
  dependencies: Spec["dependencies"];
  contract: Spec["contract"];
  spec_review: SpecReviewSummary;
  delivery: DeliveryRecord;
}

// The chosen platform/architecture/stack options (the "what + why" the human reviews at approval, e.g. the
// in-memory backend trade-off). Resolved from the decision log by the decision ids on the work packet.
export interface StructuralDecision {
  axis: string;
  chosen: string;
}

function buildSpecReviewSummary(work: WorkPacket): SpecReviewSummary {
  const cycles = work.spec_review_cycles ?? [];
  const latest = cycles.length > 0 ? cycles[cycles.length - 1]! : null;
  if (latest === null) return { reviewed: false, verdict: null, summary: "", independence: "unverified", blockers: [] };
  return {
    reviewed: true,
    verdict: latest.state === "sealed" ? latest.verdict : null,
    summary: latest.summary,
    independence: independenceBasis(latest.producer.agent_instance_id, work.spec_author_agent_instance_id),
    blockers: latest.blockers.map((blocker) => ({ title: blocker.title, detail: blocker.detail }))
  };
}

const EMPTY_DEPS: Spec["dependencies"] = { spec_dependencies: [], external_dependencies: [], contract_dependencies: [] };
export function buildCommittableSpec(work: WorkPacket, validation: DeliveryValidation[] = [], structuralDecisions: StructuralDecision[] = [], extras: { dependencies: Spec["dependencies"]; contract: Spec["contract"] } = { dependencies: EMPTY_DEPS, contract: null }): CommittableSpec {
  const approval = work.lifecycle.packet_approval ?? null;
  const authorization = work.lifecycle.authorization ?? null;
  const attempts: DeliveryAttempt[] = work.implementation_attempts.map((attempt) => ({
    id: attempt.id,
    kind: attempt.kind,
    state: attempt.state,
    summary: attempt.summary,
    changed_files: attempt.changed_files,
    diff_hash: attempt.state === "sealed" ? attempt.diff_hash : null,
    producer_role: attempt.producer.role,
    producer_agent_instance_id: attempt.producer.agent_instance_id
  }));
  const reviews: DeliveryReview[] = work.review_cycles.map((cycle) => {
    const reviewed = work.implementation_attempts.find((attempt) => attempt.id === cycle.attempt_id);
    const implementerId = reviewed?.producer.agent_instance_id ?? null;
    const reviewerId = cycle.producer.agent_instance_id;
    return {
      id: cycle.id,
      kind: cycle.kind,
      state: cycle.state,
      verdict: cycle.state === "sealed" ? cycle.verdict : null,
      summary: cycle.summary,
      blockers: cycle.blockers.map((blocker) => ({ title: blocker.title, rationale: blocker.rationale })),
      reviewer_role: cycle.producer.role,
      reviewer_agent_instance_id: reviewerId,
      implementer_agent_instance_id: implementerId,
      independence: independenceBasis(reviewerId, implementerId)
    };
  });
  // Always render the CURRENT spec content (intent / ACs / scope / structural decisions / implementation plan).
  // In v2 the bound approved_payload is the WHOLE-Work-Packet record ({ id, title, specs[] }), NOT the single-spec
  // shape this render reads — using it blanked every field once approved. The live work.* fields ARE that shape,
  // and they equal the approved content (post-approval edits are blocked); the proof hashes below carry the
  // approval binding, so the approved/authorized state still shows without losing the content.
  const approvedSpec = {
    classification: work.classification,
    intent: work.intent,
    acceptance_criteria: work.acceptance_criteria,
    scope: work.scope,
    platform: work.platform,
    architecture: work.architecture,
    stack: work.stack,
    docs: work.docs,
    implementation_plan: work.implementation_plan
  };
  return {
    spec_version: 1,
    work_id: work.id,
    title: work.title,
    workflow_state: work.workflow_state,
    approved_spec: approvedSpec,
    work_breakdown_ref: work.work_breakdown_ref,
    structural_decisions: structuralDecisions,
    dependencies: extras.dependencies,
    contract: extras.contract,
    proof_of_approval: {
      approved: approval !== null,
      human_confirmed: approval?.human_confirmed ?? false,
      approved_payload_hash: approval?.approved_payload_hash ?? null,
      review_snapshot_hash: approval?.review_snapshot_hash ?? null,
      authorized: authorization !== null,
      authorization_human_confirmed: authorization?.human_confirmed ?? false,
      authorization_hash: authorization?.approved_payload_hash ?? authorization?.review_snapshot_hash ?? null
    },
    spec_review: buildSpecReviewSummary(work),
    delivery: { implementation_attempts: attempts, reviews, validation }
  };
}

/** Deterministic validation verdicts for a packet: every command-result linked to it (related_work_id),
 *  deduped, sorted, reduced to {command, status, exit_code, purpose} (no timestamps/output). Reads the local
 *  command-results store; returns [] when absent (e.g. a fresh clone — which renders from the committed
 *  projection that already has these baked in). */
export async function resolveValidation(artifactRoot: string, workId: string): Promise<DeliveryValidation[]> {
  const dir = path.join(artifactRoot, "command-results");
  let entries: string[];
  try { entries = await readdir(dir); } catch { return []; }
  const seen = new Set<string>();
  const out: DeliveryValidation[] = [];
  for (const entry of entries) {
    try {
      const parsed = JSON.parse(await readFile(path.join(dir, entry, "result.json"), "utf8")) as Record<string, unknown>;
      const cr = (parsed.command_result ?? parsed) as { related_work_id?: string; command?: string; status?: string; exit_code?: number | null; purpose?: string | null };
      if (cr.related_work_id !== workId) continue;
      const verdict: DeliveryValidation = { command: cr.command ?? "", status: cr.status ?? "unknown", exit_code: cr.exit_code ?? null, purpose: cr.purpose ?? null };
      const key = JSON.stringify(verdict);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(verdict);
    } catch { /* skip unreadable */ }
  }
  out.sort((a, b) => `${a.purpose}:${a.command}`.localeCompare(`${b.purpose}:${b.command}`));
  return out;
}

/** Writes `<artifactRoot>/spec/<work-id>.json`. Best-effort: a projection failure never blocks the gate (the
 *  decision log + lifecycle slots are the source of truth; the spec is re-emittable). Returns the path or null. */
export async function emitSpecProjection(artifactRoot: string, work: WorkPacket): Promise<string | null> {
  try {
    const validation = await resolveValidation(artifactRoot, work.id);
    const structural = await resolveStructuralDecisions(artifactRoot, work);
    const specDir = path.join(artifactRoot, "spec");
    await mkdir(specDir, { recursive: true });
    const file = path.join(specDir, `${encodeURIComponent(work.id)}.json`);
    await writeFile(file, `${JSON.stringify(buildCommittableSpec(work, validation, structural), null, 2)}\n`, "utf8");
    return file;
  } catch {
    return null;
  }
}
