import type { ArtifactDetailData, ArtifactListResult, DashboardSummary, WorkPacketSpecView, SpecDetailView, CommittableSpec, ContractView, ReviewView, ContractDetailView, ContractsOverview } from "@spec-guard/core";
import { AppShell, Badge, ButtonLink, Card, escapeHtml, Grid, JsonDebug, MetricCard, Section, Table } from "./mantine-components.ts";

/** Render an array as clean bullets (never a raw JSON array). */
function bullets(items: unknown): string {
  const arr = Array.isArray(items) ? items.filter((x) => x !== null && x !== undefined && x !== "") : [];
  if (arr.length === 0) return "<p class=\"sg-subtle\">none</p>";
  return `<ul class=\"sg-bullets\">${arr.map((x) => `<li>${escapeHtml(typeof x === "string" ? x : JSON.stringify(x))}</li>`).join("")}</ul>`;
}

function verdictTone(verdict: string | null): "green" | "red" | "yellow" {
  return verdict === "pass" || verdict === "pass_with_non_blocking_issues" ? "green" : verdict === "blocked" ? "red" : "yellow";
}

// Honest independence rendering: core never reports "proven" (it can't verify a separate agent), so "asserted"
// is shown amber with the caveat — never a green "independent" badge that would imply more than is true.
function independenceBadge(basis: string): string {
  if (basis === "proven") return Badge("independent (verified)", "green");
  if (basis === "self_review") return Badge("SELF-REVIEW", "red");
  if (basis === "asserted") return Badge("asserted — NOT verified", "yellow");
  return Badge("unverified", "default");
}

// Render arbitrary JSON (a contract surface) as CLEAN nested HTML — objects as key/value lists, arrays as bullets,
// primitives as text — instead of a raw JSON blob. Everything is escaped.
function renderJsonClean(value: unknown): string {
  if (value === null || value === undefined) return "<span class=\"sg-subtle\">—</span>";
  if (Array.isArray(value)) return value.length === 0 ? "<span class=\"sg-subtle\">(empty)</span>" : `<ul class=\"sg-list\">${value.map((item) => `<li>${renderJsonClean(item)}</li>`).join("")}</ul>`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length === 0 ? "<span class=\"sg-subtle\">(empty)</span>" : `<dl class=\"sg-kv\">${entries.map(([key, val]) => `<dt>${escapeHtml(key)}</dt><dd>${renderJsonClean(val)}</dd>`).join("")}</dl>`;
  }
  return escapeHtml(typeof value === "string" ? value : JSON.stringify(value));
}

// A contract ref rendered as a LINK (id@shorthash) to the clean contract viewer.
function contractLink(ref: { id: string; content_hash: string }): string {
  return `<a href=\"/contracts/${encodeURIComponent(ref.id)}/${encodeURIComponent(ref.content_hash)}\">${escapeHtml(ref.id)}@${escapeHtml(ref.content_hash.slice(0, 12))}</a>`;
}

// Produced contracts (created or updated) — each is a LINK (its name as anchor text) to the clean contract viewer.
// Hidden entirely when there are none (most Specs don't produce a contract).
function contractsSection(label: string, contracts: ContractView[]): string {
  if (contracts.length === 0) return "";
  return Section(label, `<ul class=\"sg-list\">${contracts.map((c) => `<li><a href=\"/contracts/${encodeURIComponent(c.id)}/${encodeURIComponent(c.content_hash)}\">${escapeHtml(c.id)}</a> <span class=\"sg-subtle\">@${escapeHtml(c.content_hash.slice(0, 12))} · produced by ${escapeHtml(c.spec_title)}</span></li>`).join("")}</ul>`);
}

// Pre-approval review output (the whole-WP coherence review on the packet page; the per-Spec reviews on a Spec page).
function reviewsSection(label: string, reviews: ReviewView[]): string {
  if (reviews.length === 0) return Section(label, "<p class=\"sg-subtle\">No review recorded yet.</p>");
  return Section(label, reviews.map((r) => `<article class="sg-lane"><h4>${Badge(r.verdict ?? "pending", verdictTone(r.verdict))} <span class="sg-subtle">${escapeHtml(r.scope)} review · ${escapeHtml(r.reviewer)}${r.reviewed_at ? ` · ${escapeHtml(r.reviewed_at)}` : ""}</span></h4><p>${escapeHtml(r.summary)}</p>${r.blockers.length === 0 ? "" : `<strong>Blockers</strong>${bullets(r.blockers.map((b) => `${b.title}: ${b.detail}`))}`}</article>`).join(""));
}

// The work-packet page renders the CommittableSpec render model (clone-consistent), cleanly: bullets for
// arrays, tables for hashes/delivery, no raw JSON lanes, raw packet behind a link.
// Build every section from a CommittableSpec (used by BOTH the container page and a per-Spec page; each composes
// the subset it shows).
function specSections(spec: CommittableSpec, source: "live" | "projection"): Record<string, string> {
  const approved = (spec.approved_spec ?? {}) as Record<string, unknown>;
  const intent = (approved.intent ?? {}) as Record<string, unknown>;
  const acs = (approved.acceptance_criteria ?? []) as Array<Record<string, unknown>>;
  const plan = (approved.implementation_plan ?? null) as Record<string, unknown> | null;
  const poa = spec.proof_of_approval;
  const d = spec.delivery;
  const acRows = acs.map((ac) => [escapeHtml(String(ac.id ?? "")), escapeHtml(String(ac.text ?? "")), ac.classification === undefined || ac.classification === null ? Badge("(inherits packet)") : Badge(String(ac.classification), "blue"), Badge(String(ac.source ?? "?"), statusTone(String(ac.source ?? ""))), ac.bootstrap === true ? Badge("bootstrap", "blue") : ""]);
  const attemptRows = d.implementation_attempts.map((a) => [escapeHtml(a.id), Badge(a.kind, "blue"), Badge(a.state), `${escapeHtml(a.producer_role)}${a.producer_agent_instance_id ? ` (${escapeHtml(a.producer_agent_instance_id)})` : ""}`, escapeHtml(a.summary), bullets(a.changed_files)]);
  const reviewRows = d.reviews.map((r) => [escapeHtml(r.id), Badge(r.verdict ?? "pending", verdictTone(r.verdict)), independenceBadge(r.independence), `${escapeHtml(r.reviewer_role)}${r.reviewer_agent_instance_id ? ` (${escapeHtml(r.reviewer_agent_instance_id)})` : ""}`, escapeHtml(r.summary), r.blockers.length === 0 ? Badge("none") : bullets(r.blockers.map((b) => `${b.title}: ${b.rationale}`))]);
  const valRows = d.validation.map((v) => [escapeHtml(v.command), escapeHtml(v.purpose ?? ""), Badge(v.status, v.status === "passed" ? "green" : "red"), String(v.exit_code ?? "—")]);
  const sr = spec.spec_review;
  const scopeData = (approved.scope ?? {}) as Record<string, unknown>;
  const docs = (approved.docs ?? {}) as Record<string, unknown>;
  const platform = (approved.platform ?? {}) as Record<string, unknown>;
  const structuralRows = spec.structural_decisions.map((decision) => [escapeHtml(decision.axis), escapeHtml(decision.chosen)]);
  return {
    status: Section("Status", kv([["Title", spec.title], ["Workflow state", spec.workflow_state], ["Rendered from", source === "projection" ? "committed spec/ projection (e.g. a clone)" : "live working store"]])),
    proof: Section("Approval", `${kv([["Approved", poa.approved ? "yes" : "no"], ["Human confirmed", poa.human_confirmed ? "yes" : "no"], ["Authorized", poa.authorized ? "yes" : "no"]])}${Table(["Proof", "Hash"], [["Packet approval (payload)", escapeHtml(poa.approved_payload_hash ?? "—")], ["Packet approval (review snapshot)", escapeHtml(poa.review_snapshot_hash ?? "—")], ["Authorization", escapeHtml(poa.authorization_hash ?? "—")]])}`),
    intent: Section("Goal and intent", `${kv([["Goal", typeof intent.goal === "string" ? intent.goal : "—"]])}<h4>Desired outcomes</h4>${bullets(intent.desired_outcomes)}<h4>In scope</h4>${bullets(intent.in_scope)}<h4>Out of scope</h4>${bullets(intent.out_of_scope)}<h4>Users / actors</h4>${bullets(intent.users_actors)}<h4>Edge cases</h4>${bullets(intent.edge_cases)}<h4>Open questions</h4>${bullets(intent.open_questions)}`),
    ac: Section("Acceptance criteria", acRows.length === 0 ? "<p class=\"sg-subtle\">none</p>" : Table(["AC", "Text", "Classification", "Source", "Bootstrap"], acRows)),
    plan: Section("Implementation plan", plan === null ? "<p class=\"sg-subtle\">not set</p>" : plan.kind === "standard_plan" ? `${kv([["Summary", String(plan.summary ?? "")]])}<h4>Approach</h4>${bullets(plan.approach)}${Array.isArray(plan.expected_files) && plan.expected_files.length > 0 ? `<h4>Expected files</h4>${Table(["Path", "Purpose", "Change"], (plan.expected_files as Array<Record<string, unknown>>).map((f) => [escapeHtml(String(f.path ?? "")), escapeHtml(String(f.purpose ?? "")), escapeHtml(String(f.change_type ?? ""))]))}` : ""}` : kv([["Kind", String(plan.kind ?? "—")]])),
    delivery: Section("Delivery — implementation, review, validation", `<h4>Implementation</h4>${d.implementation_attempts.length === 0 ? "<p class=\"sg-subtle\">No implementation recorded yet.</p>" : Table(["Attempt", "Kind", "State", "By", "Summary", "Changed files"], attemptRows)}<h4>Review</h4>${d.reviews.length === 0 ? "<p class=\"sg-subtle\">No review recorded yet.</p>" : Table(["Review", "Verdict", "Independence", "By", "Summary", "Blockers"], reviewRows)}<h4>Validation</h4>${d.validation.length === 0 ? "<p class=\"sg-subtle\">No validation commands recorded.</p>" : Table(["Command", "Purpose", "Status", "Exit"], valRows)}`),
    specReview: Section("Spec review (pre-approval, independent)", sr.reviewed
      ? `${kv([["Verdict", sr.verdict ?? "pending"], ["Independence", raw(`${independenceBadge(sr.independence)}${sr.independence === "asserted" ? escapeHtml(" — Spec Guard confirmed the reviewer label differs from the author, but cannot verify a genuinely separate agent reviewed. Confirm it was actually delegated.") : ""}`)], ["Summary", sr.summary]])}${sr.blockers.length === 0 ? "" : `<h4>Blockers</h4>${bullets(sr.blockers.map((blocker) => `${blocker.title}: ${blocker.detail}`))}`}`
      : "<p class=\"sg-subtle\">No spec review recorded yet (an independent spec review must pass before approval).</p>"),
    scope: Section("Scope (allowed paths)", bullets(scopeData.allowed_globs)),
    dependencies: Section("Dependencies & contract", `${spec.contract === null ? "" : kv([["Produces contract", raw(contractLink(spec.contract))]])}${spec.dependencies.spec_dependencies.length === 0 ? "<p class=\"sg-subtle\">No cross-Spec dependencies.</p>" : Table(["Depends on Spec", "Contract pin", "Why"], spec.dependencies.spec_dependencies.map((e) => [escapeHtml(e.spec_id), e.contract === null ? "—" : contractLink(e.contract), escapeHtml(e.reason)]))}${spec.dependencies.external_dependencies.length === 0 ? "" : `<h4>External</h4>${Table(["Package / module", "Why"], spec.dependencies.external_dependencies.map((e) => [escapeHtml(e.name), escapeHtml(e.reason)]))}`}${spec.dependencies.contract_dependencies.length === 0 ? "" : `<h4>Cross-packet contracts</h4>${Table(["Contract pin", "Why"], spec.dependencies.contract_dependencies.map((d) => [contractLink(d.contract), escapeHtml(d.reason)]))}`}`),
    structural: Section("Classification, platform, architecture & stack", `${kv([["Classification", String(approved.classification ?? "—")], ["Platform", platform.choice === undefined || platform.choice === null ? "—" : String(platform.choice)], ["Docs policy", String((docs.policy ?? docs.docs_policy) ?? "—")]])}${spec.structural_decisions.length === 0 ? "<p class=\"sg-subtle\">No platform/architecture/stack decisions recorded.</p>" : Table(["Decision", "Chosen (the trade-off you're approving)"], structuralRows)}`)
  };
}

// The Work Packet page is CONTAINER-level: goal/intent, structural decisions, approval, and the CLICKABLE embedded
// Specs. Each Spec's ACs / implementation plan / scope / review / delivery live on its own Spec page (#3/#4).
export function renderWorkPacketSpec(view: WorkPacketSpecView): string {
  const s = specSections(view.spec, view.source);
  const specsSection = Section("Embedded Specs (the Work Breakdown — click a Spec for its ACs, plan, review)", Table(["Spec", "Classification", "State", "Attempts", "Reviews", "Spec review"], view.specs.map((sp) => [`<a href="/artifacts/work_packet/${encodeURIComponent(view.spec.work_id)}/spec/${encodeURIComponent(sp.id)}" title="${escapeHtml(sp.id)}">${escapeHtml(sp.title)}</a>`, Badge(sp.classification), Badge(sp.workflow_state, statusTone(sp.workflow_state)), escapeHtml(String(sp.attempts)), escapeHtml(String(sp.reviews)), sp.spec_review_verdict === null ? "—" : Badge(sp.spec_review_verdict)])));
  const rawLink = `<p><a href=\"/artifacts/work_packet/${encodeURIComponent(view.spec.work_id)}/raw\" target=\"_blank\" rel=\"noopener\">View raw JSON &#8599;</a> — the full work packet, opens in a new tab.</p>`;
  return AppShell({ title: view.spec.title, subtitle: `Work Packet · ${view.spec.work_id}`, children: `${s.status}${s.proof}${s.specReview}${s.intent}${s.structural}${specsSection}${reviewsSection("Whole-WP coherence review", view.coherence_reviews)}${contractsSection("Contracts created by this Work Packet", view.contracts_created)}${contractsSection("Contracts updated by this Work Packet", view.contracts_updated)}${rawLink}` });
}

// A Spec page is the embedded Spec's OWN content: its classification, ACs, scope, implementation plan, the
// independent spec review, and its delivery.
export function renderSpecDetail(view: SpecDetailView): string {
  const s = specSections(view.spec, view.source);
  const back = `<p><a href="/artifacts/work_packet/${encodeURIComponent(view.work_id)}" title="${escapeHtml(view.work_id)}">&larr; ${escapeHtml(view.work_title)}</a></p>`;
  const rawLink = `<p><a href=\"/artifacts/work_packet/${encodeURIComponent(view.work_id)}/raw\" target=\"_blank\" rel=\"noopener\">View raw JSON &#8599;</a></p>`;
  return AppShell({ title: view.spec.title, subtitle: `Spec · ${view.spec_id}`, children: `${back}${s.status}${s.structural}${s.specReview}${reviewsSection("Spec reviews", view.spec_reviews)}${s.ac}${s.scope}${s.dependencies}${contractsSection("Contracts created by this Spec", view.contracts_created)}${contractsSection("Contracts updated by this Spec", view.contracts_updated)}${s.plan}${s.delivery}${rawLink}` });
}

export function renderRawJson(title: string, json: string): string {
  return AppShell({ title, subtitle: "Raw JSON (read-only)", children: `<article class=\"sg-lane\"><pre>${escapeHtml(json)}</pre></article>` });
}

function statusTone(status: string | null | undefined): "default" | "red" | "green" | "yellow" | "blue" {
  if (status === undefined || status === null) return "default";
  if (status.includes("blocked") || status.includes("failed") || status.includes("missing") || status.includes("unsupported")) return "red";
  if (status.includes("pending") || status.includes("draft") || status.includes("unknown")) return "yellow";
  if (status.includes("accepted") || status.includes("approved") || status.includes("passed") || status.includes("supported") || status.includes("present")) return "green";
  return "blue";
}

function listHref(params: Record<string, string | number | boolean>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) search.set(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  return `/artifacts?${search.toString()}`;
}

// Only the cards with human/actionable value. The per-type / per-type-status / per-stage counts (each usually
// just "1") were duplicative noise — that breakdown lives in the "Artifact overview" table below.
function metricCards(summary: DashboardSummary): string {
  return Grid([
    MetricCard({ label: "Total artifacts", value: summary.total_artifact_count, href: "/artifacts", detail: "Persisted current artifacts" }),
    MetricCard({ label: "Pending human gates", value: summary.pending_gates_count, href: listHref({ pending: true }), detail: "Review/approval action required", action: summary.pending_gates_count > 0 }),
    MetricCard({ label: "Blocked packets", value: summary.blocked_packet_count, href: listHref({ blocked: true }), detail: "Blocked WorkPackets", action: summary.blocked_packet_count > 0 }),
    MetricCard({ label: "Validation failures", value: summary.validation_failures_count, href: listHref({ validation_failures: true }), detail: "Error diagnostics", action: summary.validation_failures_count > 0 })
  ].join(""));
}

// The clean contract viewer: metadata + the frozen surface rendered as readable nested HTML (not a raw JSON blob).
export function renderContract(view: ContractDetailView): string {
  const producedBy = view.produced_by === null ? raw("<span class=\"sg-subtle\">—</span>")
    : raw(`<a href=\"/artifacts/work_packet/${encodeURIComponent(view.produced_by.work_id)}/spec/${encodeURIComponent(view.produced_by.spec_id)}\">${escapeHtml(view.produced_by.spec_id)}</a>`);
  const meta = kv([
    ["Contract", view.id],
    ["Version (content hash)", view.content_hash],
    ["Kind", view.first_version ? "genesis (created here)" : "revision (updated)"],
    ["Produced by Spec", producedBy]
  ]);
  return AppShell({ title: view.id, subtitle: `Contract · @${view.content_hash.slice(0, 12)}`, children: `${Section("Contract", meta)}${Section("Surface — the frozen, authoritative interface", renderJsonClean(view.surface))}` });
}

export function renderDashboard(summary: DashboardSummary, contracts: ContractsOverview = { versions: [] }): string {
  const typeRows = Object.entries(summary.artifact_counts_by_type).map(([type, count]) => [
    `<a href=\"${escapeHtml(listHref({ type }))}\">${escapeHtml(type)}</a>`,
    String(count),
    Object.entries(summary.artifact_counts_by_type_status[type] ?? {}).map(([status, countForStatus]) => `${Badge(status, statusTone(status))} ${countForStatus}`).join(" ") || Badge("none")
  ]);
  const health = Card({ children: `<div class=\"sg-pill-row\">${Badge(`Baseline: ${summary.baseline_status}`, statusTone(summary.baseline_status))}${Badge(`Blocked packets: ${summary.blocked_packet_count}`, statusTone(summary.blocked_packet_count > 0 ? "missing" : "present"))}${Badge(`Validation failures: ${summary.validation_failures_count}`, statusTone(summary.validation_failures_count > 0 ? "missing" : "present"))}</div>` });
  const contractsSectionHtml = Section(`Contracts (${contracts.versions.length})`, contracts.versions.length === 0
    ? "<p class=\"sg-subtle\">No contracts frozen yet.</p>"
    : Table(["Contract", "Version", "Kind", "Produced by"], contracts.versions.map((c) => [
        `<a href=\"/contracts/${encodeURIComponent(c.id)}/${encodeURIComponent(c.content_hash)}\">${escapeHtml(c.id)}</a>`,
        escapeHtml(c.content_hash.slice(0, 12)),
        c.first_version ? Badge("created", "green") : Badge("updated", "blue"),
        c.produced_by === null ? Badge("none") : escapeHtml(`${c.produced_by.spec_id} (${c.produced_by.work_id})`)
      ])));
  return AppShell({ title: "Spec Guard Viewer", subtitle: "Artifact-derived governance dashboard", children: `${health}${metricCards(summary)}${Section("Artifact overview", Table(["Type", "Count", "Statuses"], typeRows))}${contractsSectionHtml}` });
}

export function renderArtifactList(result: ArtifactListResult): string {
  const rows = result.rows.map((row) => [
    `<a href=\"${escapeHtml(row.detail_path)}\" title=\"${escapeHtml(row.display_id)}\">${escapeHtml(row.display_label)}</a>`,
    escapeHtml(row.artifact_type),
    row.status === null ? Badge("n/a") : Badge(row.status, statusTone(row.status)),
    row.lifecycle === null ? "" : escapeHtml(row.lifecycle),
    row.pending_action === null ? Badge("none") : Badge(row.pending_action, "yellow"),
    escapeHtml(row.updated_at ?? "n/a"),
    escapeHtml(row.revision ?? "n/a"),
    ButtonLink(row.detail_path, "Detail", true)
  ]);
  const filterText = Object.keys(result.filter).length === 0 ? "All artifacts" : JSON.stringify(result.filter);
  return AppShell({ title: "Spec Guard Artifacts", subtitle: `${result.total} rows — ${filterText}`, children: `${Section("Filtered artifact list", `<p class=\"sg-subtle\">Visible row count: <strong>${result.total}</strong></p>${Table(["Identifier", "Type", "Status", "Lifecycle", "Pending action", "Last updated", "Revision", "Links"], rows)}`)}` });
}

// A kv value that is ALREADY HTML (e.g. a Badge) — kv emits it verbatim instead of escaping it to literal text.
class RawHtml { constructor(readonly html: string) {} }
function raw(html: string): RawHtml { return new RawHtml(html); }

function kv(items: Array<[string, unknown]>): string {
  return `<dl class=\"sg-kv\">${items.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${value instanceof RawHtml ? value.html : typeof value === "string" ? escapeHtml(value) : value === null || value === undefined ? "—" : escapeHtml(JSON.stringify(value))}</dd>`).join("")}</dl>`;
}


export function renderArtifactDetail(detail: ArtifactDetailData): string {
  return AppShell({ title: `${detail.artifact_type} ${detail.id ?? "singleton"}`, subtitle: detail.status ?? "artifact detail", children: `${Section("Artifact summary", kv([["Type", detail.artifact_type], ["Identifier", detail.id ?? "singleton"], ["Status", detail.status], ["Pending action", detail.pending_action], ["Revision", detail.revision], ["Governed content hash", detail.governed_content_hash]]))}${JsonDebug(detail.artifact)}` });
}

export function renderNotFound(message: string): string {
  return AppShell({ title: "Spec Guard Viewer", subtitle: "Not found", children: Card({ children: `<h2>Not found</h2><p>${escapeHtml(message)}</p>${ButtonLink("/", "Back to dashboard")}` }) });
}
