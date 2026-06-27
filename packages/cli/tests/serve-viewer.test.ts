import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initAction } from "@spec-guard/core";
import { parseArgs, runCli } from "../src/index.ts";

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), "spec-guard-cli-viewer-"));
  await initAction({ project_id: "cli-viewer" }, { projectRoot });
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe("serve.viewer CLI", () => {
  it("parses spec-guard serve viewer flags", () => {
    expect(parseArgs(["serve", "viewer", "--host", "127.0.0.1", "--port", "0", "--json"])).toEqual({ actionId: "serve.viewer", input: { host: "127.0.0.1", port: 0 }, json: true });
    expect(parseArgs(["serve.viewer", "--port", "0"])).toMatchObject({ actionId: "serve.viewer", input: { port: 0 }, json: false });
  });

  it("starts the viewer in non-hanging test mode and returns an Appendix B.1 action result as JSON", async () => {
    let stdout = "";
    const code = await runCli(["serve", "viewer", "--host", "127.0.0.1", "--port", "0", "--json"], { cwd: projectRoot, keepAlive: false, stdout: (text) => { stdout += text; } });
    expect(code).toBe(0);
    const result = JSON.parse(stdout) as { ok: boolean; action_id: string; data: { url: string } };
    expect(result.ok).toBe(true);
    expect(result.action_id).toBe("serve.viewer");
    expect(result.data.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  });

  it("returns non-zero diagnostics on bind failure", async () => {
    let stdout = "";
    let stderr = "";
    let close: (() => Promise<void>) | undefined;
    const first = runCli(["serve", "viewer", "--host", "127.0.0.1", "--port", "0"], {
      cwd: projectRoot,
      keepAlive: false,
      stdout: (text) => { stdout += text; },
      onViewerStarted: (handle) => { close = handle.close; }
    });
    await first;
    const port = /:(\d+)\//.exec(stdout)?.[1];
    expect(port).toBeDefined();
    const code = await runCli(["serve", "viewer", "--host", "127.0.0.1", "--port", port!, "--json"], { cwd: projectRoot, keepAlive: false, stderr: (text) => { stderr += text; } });
    expect(code).toBe(1);
    expect(stderr).toContain("VIEWER_BIND_FAILED");
    await close?.();
  });
});
