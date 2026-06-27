import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildDefaultWorkPacket, WorkPacketSchema, AggregateWorkPacketSchema, type AcceptanceCriterion, type AggregateWorkPacket } from "../src/index.ts";
import { AggregateWorkPacketStore } from "../src/storage/aggregate-work-packet-store.ts";

const AC: AcceptanceCriterion = { id: "ac1", text: "do x", source: "human", source_evidence: null };
const fullLeaf = (id: string, classification: string): Record<string, unknown> =>
  WorkPacketSchema.parse(buildDefaultWorkPacket({ id, title: id, goal: "g", classification: classification as never, acceptance_criteria: [AC], allowed_globs: ["src/**"] })) as unknown as Record<string, unknown>;
const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const SPEC_KEYS = ["id", "title", "classification", "origination", "acceptance_criteria", "docs", "scope", "mockup_decision", "work_kind_resolution", "work_kind_resolution_hash", "implementation_plan", "implementation_plan_hash", "evidence_policy_resolution", "evidence_policy_resolution_hash", "change_baseline", "workflow_state", "implementation_attempts", "review_cycles", "focused_fix_instructions", "spec_review_cycles", "spec_author_agent_instance_id", "diagnostics"];
const CONTAINER_KEYS = ["id", "revision", "created_at", "updated_at", "disposition", "title", "intent", "platform", "architecture", "stack", "runtime_baseline_ref", "decision_history", "diagnostics"];
const aggregate = (id: string): AggregateWorkPacket => AggregateWorkPacketSchema.parse({
  ...pick(fullLeaf(id, "reusable_api"), CONTAINER_KEYS),
  artifact_type: "work_packet",
  schema_version: 2,
  lifecycle: { approval: null, authorization: null, completion: null, history: [] },
  specs: [pick(fullLeaf(`${id}-s1`, "reusable_api"), SPEC_KEYS)]
});

let root: string;
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), "sg-agg-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("AggregateWorkPacketStore", () => {
  it("create writes one canonical-JSON doc per Work Packet; read returns it at revision 1", async () => {
    const store = new AggregateWorkPacketStore(root);
    const created = await store.create(aggregate("WP1"));
    expect(created.revision).toBe(1);
    const read = await store.read("WP1");
    expect(read.id).toBe("WP1");
    expect(read.specs.map((s) => s.id)).toEqual(["WP1-s1"]);
    // on-disk bytes are canonical JSON, newline-terminated (stable for git diff/merge)
    const raw = await readFile(store.packetPath("WP1"), "utf8");
    expect(raw.endsWith("}\n")).toBe(true);
    expect(JSON.parse(raw).schema_version).toBe(2);
  });

  it("create twice throws; read/tryRead handle a missing packet", async () => {
    const store = new AggregateWorkPacketStore(root);
    await store.create(aggregate("WP1"));
    await expect(store.create(aggregate("WP1"))).rejects.toThrow(/already exists/);
    await expect(store.read("nope")).rejects.toThrow(/not found/);
    expect(await store.tryRead("nope")).toBeNull();
  });

  it("update bumps revision from the on-disk base (ignores a fabricated revision) and pins created_at", async () => {
    const store = new AggregateWorkPacketStore(root);
    const created = await store.create(aggregate("WP1"));
    // a tampered candidate tries to fabricate a revision + rewrite created_at alongside a legitimate change
    const updated = await store.update({ ...created, revision: 99, created_at: "2000-01-01T00:00:00.000Z", title: "Renamed" });
    expect(updated.revision).toBe(2);                      // bumped from base (1), NOT the fabricated 99
    expect(updated.created_at).toBe(created.created_at);   // pinned from base, NOT clobbered
    expect(updated.title).toBe("Renamed");                 // the legitimate change applied
    expect((await store.read("WP1")).revision).toBe(2);
  });

  it("update throws for a missing packet; list returns persisted ids sorted", async () => {
    const store = new AggregateWorkPacketStore(root);
    await expect(store.update(aggregate("MISSING"))).rejects.toThrow(/not found/);
    expect(await store.list()).toEqual([]); // no packets/ dir yet
    await store.create(aggregate("WP2"));
    await store.create(aggregate("WP1"));
    expect(await store.list()).toEqual(["WP1", "WP2"]);
  });
});
