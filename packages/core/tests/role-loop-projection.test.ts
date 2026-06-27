import { describe, it, expect } from "vitest";
import { buildApprovedWorkPacketProjectionV1, buildDefaultWorkPacket, WorkPacketSchema } from "../src/index.ts";

// Focused unit coverage of the approved-work-packet projection — the helper the v2 whole-WP approval binding
// rests on (each Spec contributes its v1 leaf projection). It lost its dedicated test when the v1-action-coupled
// milestone1a suite was deleted in the switch; its two load-bearing properties are determinism + sensitivity.
describe("approved work-packet projection (the v2 approval-binding substrate)", () => {
  const make = () => WorkPacketSchema.parse(buildDefaultWorkPacket({ id: "W1", title: "T", goal: "g", classification: "direct_behavior", acceptance_criteria: [{ id: "ac1", text: "x", source: "human", source_evidence: null }], allowed_globs: ["src/**"] }));

  it("is deterministic: equivalent work packets produce the same projection + hash", () => {
    const a = buildApprovedWorkPacketProjectionV1(make());
    const b = buildApprovedWorkPacketProjectionV1(make());
    expect(a.hash).toBe(b.hash);
    expect(a.projection).toEqual(b.projection);
  });

  it("the hash changes when an approved field (an AC) changes — drift is detectable", () => {
    const a = buildApprovedWorkPacketProjectionV1(make());
    const edited = WorkPacketSchema.parse({ ...make(), acceptance_criteria: [{ id: "ac1", text: "DIFFERENT", source: "human", source_evidence: null }] });
    expect(buildApprovedWorkPacketProjectionV1(edited).hash).not.toBe(a.hash);
  });
});
