import { describe, expect, it } from "vitest";
import { normalizeSourceArtifactRefs, SourceArtifactRefConflictError, hashSourceArtifactRefs } from "../src/index.ts";

const h1 = "a".repeat(64);
const h2 = "b".repeat(64);

describe("SourceArtifactRef canonical sets", () => {
  it("removes exact duplicate refs", () => {
    const refs = normalizeSourceArtifactRefs([
      { artifact_type: "source_artifact", id: "src", revision: 1, content_hash: h1 },
      { artifact_type: "source_artifact", id: "src", revision: 1, content_hash: h1 }
    ]);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.content_hash).toBe(h1);
  });

  it("sorts null id before string ids", () => {
    const refs = normalizeSourceArtifactRefs([
      { artifact_type: "runtime_baseline", id: "x", revision: 1 },
      { artifact_type: "runtime_baseline", id: null, revision: 1 }
    ]);
    expect(refs.map((ref) => ref.id)).toEqual([null, "x"]);
  });

  it("sorts by artifact_type, id, then revision", () => {
    const refs = normalizeSourceArtifactRefs([
      { artifact_type: "work_packet", id: "b", revision: 1 },
      { artifact_type: "config", id: null, revision: 1 },
      { artifact_type: "work_packet", id: "a", revision: 2 },
      { artifact_type: "work_packet", id: "a", revision: 1 }
    ]);
    expect(refs.map((ref) => `${ref.artifact_type}:${ref.id ?? "null"}:${ref.revision}`)).toEqual([
      "config:null:1",
      "work_packet:a:1",
      "work_packet:a:2",
      "work_packet:b:1"
    ]);
  });

  it("detects duplicate identity with conflicting content hashes", () => {
    expect(() => normalizeSourceArtifactRefs([
      { artifact_type: "source_artifact", id: "src", revision: 1, content_hash: h1 },
      { artifact_type: "source_artifact", id: "src", revision: 1, content_hash: h2 }
    ])).toThrow(SourceArtifactRefConflictError);
  });

  it("hashes the normalized canonical ref set stably", () => {
    const a = hashSourceArtifactRefs([
      { artifact_type: "work_packet", id: "b", revision: 1 },
      { artifact_type: "work_packet", id: "a", revision: 1 }
    ]);
    const b = hashSourceArtifactRefs([
      { artifact_type: "work_packet", id: "a", revision: 1 },
      { artifact_type: "work_packet", id: "b", revision: 1 }
    ]);
    expect(a).toBe(b);
  });
});
