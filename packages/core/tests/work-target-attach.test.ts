import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { baselineInit, baselineEstablish, workCreate, workTargetAttach, greenfieldBaselineDeferred, buildDefaultWorkPacket, initAction } from "../src/index.ts";

// A non-app baseline (all commands N/A, no product platform) is acceptance-ready, so baseline.establish
// accepts it deterministically — the cheapest way to stand up an ACCEPTED target baseline to inherit.
const allNotApplicable = {
  commands: {
    test: null, test_not_applicable_reason: "no test command",
    build: null, build_not_applicable_reason: "no build step",
    runtime_production: null, runtime_production_not_applicable_reason: "library has no production runtime",
    runtime_development: null, runtime_development_not_applicable_reason: "library has no development runtime"
  }
};

type Aggregate = { id: string; target_id: string | null; runtime_baseline_ref: { id: string; revision: number } | null };

let projectRoot: string;
beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), "spec-guard-target-attach-"));
  await initAction({ project_id: "demo" }, { projectRoot });
});
afterEach(async () => { await rm(projectRoot, { recursive: true, force: true }); });

async function establishTarget(targetId: string): Promise<void> {
  await baselineInit({ ...allNotApplicable, target_id: targetId }, { projectRoot });
  const established = await baselineEstablish({ target_id: targetId }, { projectRoot });
  expect(established.ok).toBe(true);
}

describe("work.target.attach (modify_existing inherit path)", () => {
  it("inherits an accepted target baseline onto the packet", async () => {
    await establishTarget("api");
    const create = await workCreate({ title: "Add endpoint", goal: "Add a new API endpoint", classification: "rest_api", origination: "modify_existing", target_id: "api" }, { projectRoot });
    expect(create.ok).toBe(true);
    const id = (create.data.work_packet as Aggregate).id;

    const attach = await workTargetAttach({ id, target_id: "api" }, { projectRoot });
    expect(attach.ok).toBe(true);
    const wp = attach.data.work_packet as Aggregate;
    expect(wp.target_id).toBe("api");
    expect(wp.runtime_baseline_ref?.id).toBe("api");
  });

  it("fails when the target has no runtime baseline", async () => {
    const create = await workCreate({ title: "x", goal: "y", classification: "rest_api", origination: "modify_existing", target_id: "ghost" }, { projectRoot });
    const attach = await workTargetAttach({ id: (create.data.work_packet as Aggregate).id }, { projectRoot });
    expect(attach.ok).toBe(false);
    expect(attach.diagnostics[0]?.code).toBe("RUNTIME_TARGET_NOT_FOUND");
  });

  it("fails when the target baseline is only draft (not accepted)", async () => {
    await baselineInit({ ...allNotApplicable, target_id: "api" }, { projectRoot }); // draft, never established
    const create = await workCreate({ title: "x", goal: "y", classification: "rest_api", origination: "modify_existing", target_id: "api" }, { projectRoot });
    const attach = await workTargetAttach({ id: (create.data.work_packet as Aggregate).id }, { projectRoot });
    expect(attach.ok).toBe(false);
    expect(attach.diagnostics[0]?.code).toBe("RUNTIME_TARGET_NOT_ACCEPTED");
  });

  it("defers the baseline requirement for new_in_existing (establishes a new target)", () => {
    const wp = buildDefaultWorkPacket({ title: "t", goal: "g", classification: "rest_api", origination: "new_in_existing", target_id: "newapp" });
    expect(wp.runtime_baseline_ref).toBeNull();
    expect(greenfieldBaselineDeferred(wp)).toBe(true);
  });

  it("new_in_existing requires an explicit, non-default target_id (not the single-app default)", async () => {
    const noTarget = await workCreate({ title: "x", goal: "y", classification: "rest_api", origination: "new_in_existing" }, { projectRoot });
    expect(noTarget.ok).toBe(false);
    expect(noTarget.diagnostics[0]?.code).toBe("NEW_IN_EXISTING_TARGET_REQUIRED");
    const defaultTarget = await workCreate({ title: "x", goal: "y", classification: "rest_api", origination: "new_in_existing", target_id: "default" }, { projectRoot });
    expect(defaultTarget.ok).toBe(false);
    expect(defaultTarget.diagnostics[0]?.code).toBe("NEW_IN_EXISTING_TARGET_REQUIRED");
  });

  it("new_in_existing rejects a target that already has an accepted baseline (it is not new)", async () => {
    await establishTarget("api"); // 'api' now has an accepted baseline
    const create = await workCreate({ title: "x", goal: "y", classification: "rest_api", origination: "new_in_existing", target_id: "api" }, { projectRoot });
    expect(create.ok).toBe(false);
    expect(create.diagnostics[0]?.code).toBe("NEW_IN_EXISTING_TARGET_NOT_FRESH");
  });

  it("new_in_existing accepts a FRESH explicit target_id", async () => {
    const create = await workCreate({ title: "x", goal: "y", classification: "rest_api", origination: "new_in_existing", target_id: "brandnew" }, { projectRoot });
    expect(create.ok).toBe(true);
  });
});
