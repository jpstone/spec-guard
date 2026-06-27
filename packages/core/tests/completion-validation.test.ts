import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initAction, completionValidationDiagnostics, baselineInit, baselineEstablish, commandRun, buildDefaultWorkPacket } from "../src/index.ts";

// A leaf scoped to the DEFAULT target (where acceptBaselineWithBuild establishes its baseline).
const defaultTargetWork = buildDefaultWorkPacket({ title: "t", goal: "g", classification: "rest_api" });

// A stateful BUILD command: passes iff build-ok.txt exists. We create the marker so the build passes at
// establish/accept time, then delete it so the SAME build fails when the completion validator re-runs it.
const BUILD = { mode: "argv" as const, argv: [process.execPath, "-e", "process.exit(require('fs').existsSync('build-ok.txt')?0:1)"], working_directory: "." };
const commands = (build: unknown) => ({
  test: null, test_not_applicable_reason: "no tests",
  build, build_not_applicable_reason: build === null ? "no build" : null,
  runtime_production: null, runtime_production_not_applicable_reason: "n/a",
  runtime_development: null, runtime_development_not_applicable_reason: "n/a"
});
const stack = { product_platform: null, runtime: null, language: null, package_manager: null, framework: null, build_tool: null, architecture: null };

describe("end-state validation gate (validator wired into completion)", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sg-val-"));
    await initAction({ project_id: "demo" }, { projectRoot: root });
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  async function acceptBaselineWithBuild(): Promise<void> {
    await baselineInit({ stack, commands: commands(BUILD) } as never, { projectRoot: root });
    await writeFile(path.join(root, "build-ok.txt"), "ok", "utf8"); // build passes at accept time
    const run = await commandRun({ command_spec: BUILD as never, purpose: "build", related_runtime_baseline_draft_revision: 1 }, { projectRoot: root });
    expect(run.data.command_result.status).toBe("passed");
    const est = await baselineEstablish({}, { projectRoot: root });
    expect(est.ok).toBe(true); // deterministic validation passed -> auto-accepted
  }

  it("BLOCKS completion when the final build fails (COMPLETION_VALIDATION_FAILED)", async () => {
    await acceptBaselineWithBuild();
    await rm(path.join(root, "build-ok.txt")); // the code regressed: the build now fails
    const diags = await completionValidationDiagnostics(defaultTargetWork, { projectRoot: root });
    expect(diags.some((d) => d.code === "COMPLETION_VALIDATION_FAILED")).toBe(true);
  });

  it("ALLOWS completion when the final build passes", async () => {
    await acceptBaselineWithBuild(); // marker still present -> build passes
    expect(await completionValidationDiagnostics(defaultTargetWork, { projectRoot: root })).toEqual([]);
  });

  it("is a no-op when there is no accepted baseline", async () => {
    expect(await completionValidationDiagnostics(defaultTargetWork, { projectRoot: root })).toEqual([]);
  });
});
