import { describe, expect, it } from "vitest";
import {
  DispositionSchema,
  DocsPolicySchema,
  ReviewSnapshotSchema,
  TimestampSchema,
  WorkClassificationSchema
} from "../src/index.ts";

describe("foundational schemas", () => {
  it("validates UTC RFC3339 millisecond timestamps", () => {
    expect(TimestampSchema.safeParse("2026-06-21T12:34:56.789Z").success).toBe(true);
    expect(TimestampSchema.safeParse("2026-06-21T12:34:56Z").success).toBe(false);
  });

  it("rejects unknown Appendix C enum values", () => {
    expect(WorkClassificationSchema.safeParse("feature").success).toBe(false);
    expect(DispositionSchema.safeParse("ready").success).toBe(false);
    expect(DocsPolicySchema.safeParse("optional").success).toBe(false);
  });

  it("validates the ReviewSnapshot base shape", () => {
    const snapshot = {
      id: "snap-1",
      category: "ephemeral",
      producer_action_id: "work.ac.review",
      snapshot_hash: "a".repeat(64),
      snapshot_revision: `ephemeral:${"b".repeat(64)}:${"a".repeat(64)}`,
      audit_revision: null,
      source_artifact_refs: [],
      payload: { work_id: "w1", work_packet_revision: 1, acceptance_criteria: [] },
      rendered_summary: "summary",
      created_at: "2026-06-21T12:34:56.789Z"
    };
    expect(ReviewSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });
});
