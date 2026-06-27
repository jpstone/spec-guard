import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActionResultSchema } from "@spec-guard/core";
import { runCli } from "../src/index.ts";

const execFileAsync = promisify(execFile);
let projectRoot: string;
let extraRoots: string[] = [];

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), "spec-guard-cli-"));
  extraRoots = [];
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
  await Promise.all(extraRoots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("spec-guard init CLI", () => {
  it("prints plain text by default, not JSON, with paths and next steps", async () => {
    let stdout = "";
    const code = await runCli(["init"], { cwd: projectRoot, stdout: (text) => { stdout += text; } });
    expect(code).toBe(0);
    expect(() => JSON.parse(stdout)).toThrow();
    expect(stdout).toContain("Spec Guard initialized successfully");
    expect(stdout).toContain("Artifact root: .spec-guard/");
    expect(stdout).toContain(".pi/extensions/spec-guard.ts");
    expect(stdout).toContain(".mcp.json");
    expect(stdout).toContain("Reload or restart Pi");
    expect(stdout).toContain("Reload MCP clients");
    expect(stdout).toContain("spec_guard_mcp_status");
  });

  it("can invoke the spec-guard CLI entrypoint in a subprocess", async () => {
    const cliPath = path.resolve("packages/cli/src/index.ts");
    const { stdout } = await execFileAsync(process.execPath, [cliPath, "init", "--json"], { cwd: projectRoot });
    const result = ActionResultSchema.parse(JSON.parse(stdout) as unknown);
    expect(result.ok).toBe(true);
    expect(result.action_id).toBe("init");
  });

  it("prints Appendix B.1 ActionResult JSON with --json", async () => {
    let stdout = "";
    const code = await runCli(["init", "--json", "--project-id", "demo"], { cwd: projectRoot, stdout: (text) => { stdout += text; } });
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout) as unknown;
    const result = ActionResultSchema.parse(parsed);
    expect(result.ok).toBe(true);
    expect(result.action_id).toBe("init");
    expect(result.summary).toBe("Spec Guard initialized successfully.");
    expect(result.data).toMatchObject({ project_id: "demo" });
    await expect(stat(path.join(projectRoot, ".spec-guard"))).resolves.toBeTruthy();
  });

  it("supports --artifact-root with an absolute path", async () => {
    const artifactParent = await mkdtemp(path.join(tmpdir(), "spec-guard-cli-artifacts-"));
    extraRoots.push(artifactParent);
    const artifactRoot = path.join(artifactParent, "sg-artifacts");
    let stdout = "";

    const code = await runCli(["init", "--json", "--artifact-root", artifactRoot], { cwd: projectRoot, stdout: (text) => { stdout += text; } });
    expect(code).toBe(0);
    const result = ActionResultSchema.parse(JSON.parse(stdout) as unknown);
    expect(result.ok).toBe(true);
    expect(result.action_id).toBe("init");
    expect(result.data).toMatchObject({ artifact_root: artifactRoot });
    await expect(stat(path.join(artifactRoot, "artifacts/config/__singleton__/current.json"))).resolves.toBeTruthy();
    await expect(stat(path.join(artifactRoot, "harness/pi-extension.md"))).resolves.toBeTruthy();
    await expect(stat(path.join(projectRoot, ".pi/extensions/spec-guard.ts"))).resolves.toBeTruthy();
  });
});
