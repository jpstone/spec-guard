import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCommittableSpec, resolveValidation } from "../src/storage/spec-projection.ts";
import type { WorkPacket } from "../src/schemas/artifacts.ts";

// buildCommittableSpec's delivery record is a pure projection; resolveValidation reads the command-results
// store. Test both directly (minimal casts — the functions read only the fields below).
const workWith = (reviewerId: string, implementerId: string): WorkPacket => ({
  id: "W1", title: "T", workflow_state: "complete",
  lifecycle: { packet_approval: null, authorization: null },
  implementation_attempts: [{ id: "attempt:1", kind: "initial_implementation", state: "sealed", summary: "built the thing", changed_files: ["src/a.ts"], diff_hash: "dh1", producer: { role: "implementer", agent_instance_id: implementerId } }],
  review_cycles: [{ id: "review:1", kind: "initial_review", state: "sealed", verdict: "pass", summary: "independent read-only review, looks good", blockers: [], attempt_id: "attempt:1", producer: { role: "reviewer", agent_instance_id: reviewerId } }]
} as unknown as WorkPacket);

describe("committable spec delivery record", () => {
  it("reports review independence as ASSERTED (labels differ) — never 'proven', which core can't verify", () => {
    const spec = buildCommittableSpec(workWith("rev-1", "impl-1"));
    expect(spec.delivery.implementation_attempts[0]!.summary).toBe("built the thing");
    expect(spec.delivery.implementation_attempts[0]!.changed_files).toEqual(["src/a.ts"]);
    const review = spec.delivery.reviews[0]!;
    expect(review.verdict).toBe("pass");
    expect(review.reviewer_agent_instance_id).toBe("rev-1");
    expect(review.implementer_agent_instance_id).toBe("impl-1");
    expect(review.independence).toBe("asserted"); // labels differ, but a separate agent is NOT verified
  });

  it("reports a self-review (same identity) as self_review", () => {
    const spec = buildCommittableSpec(workWith("same-agent", "same-agent"));
    expect(spec.delivery.reviews[0]!.independence).toBe("self_review");
  });

  describe("resolveValidation", () => {
    let root: string;
    beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), "sg-val-")); });
    afterEach(async () => { await rm(root, { recursive: true, force: true }); });

    const writeResult = async (id: string, body: Record<string, unknown>) => {
      const dir = path.join(root, "command-results", encodeURIComponent(id));
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "result.json"), JSON.stringify(body), "utf8");
    };

    it("collects + dedupes linked command verdicts, ignoring other packets and output", async () => {
      await writeResult("command-result:1", { related_work_id: "W1", command: "npm test", status: "passed", exit_code: 0, purpose: "test", started_at: "x" });
      await writeResult("command-result:2", { related_work_id: "W1", command: "npm test", status: "passed", exit_code: 0, purpose: "test", started_at: "y" }); // duplicate verdict
      await writeResult("command-result:3", { related_work_id: "W1", command: "npm run build", status: "passed", exit_code: 0, purpose: "build" });
      await writeResult("command-result:4", { related_work_id: "OTHER", command: "npm test", status: "failed", exit_code: 1, purpose: "test" }); // other packet
      const verdicts = await resolveValidation(root, "W1");
      expect(verdicts).toEqual([
        { command: "npm run build", status: "passed", exit_code: 0, purpose: "build" },
        { command: "npm test", status: "passed", exit_code: 0, purpose: "test" }
      ]);
    });

    it("returns [] when there is no command-results store (a fresh clone)", async () => {
      expect(await resolveValidation(root, "W1")).toEqual([]);
    });
  });
});
