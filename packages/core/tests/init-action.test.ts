import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActionResultSchema, initAction } from "../src/index.ts";

let projectRoot: string;
let extraRoots: string[] = [];

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), "spec-guard-init-"));
  extraRoots = [];
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
  await Promise.all(extraRoots.map((root) => rm(root, { recursive: true, force: true })));
});

const requiredFiles = [
  ".mcp.json",
  ".cursor/mcp.json",
  ".vscode/mcp.json",
  ".cline/mcp.json",
  ".cline/cline_mcp_settings.json",
  ".roo/mcp.json",
  ".roo/roo_mcp_settings.json",
  ".windsurf/mcp.json",
  ".windsurf/mcp_config.json",
  ".pi/extensions/spec-guard.ts",
  "SPEC_GUARD_AGENT_GUIDE.md",
  ".spec-guard/harness/claude-desktop-snippet.json",
  ".spec-guard/harness/pi-extension.md",
  ".spec-guard/harness/mcp-quickstart.md",
  ".spec-guard/harness/client-support-matrix.md",
  ".spec-guard/harness/generic-stdio-snippet.json"
];

describe("init action", () => {
  it("creates artifact root, Config revision 1, and required generated files", async () => {
    const result = await initAction({ project_id: "demo" }, { projectRoot });
    expect(ActionResultSchema.parse(result)).toEqual(result);
    expect(result.ok).toBe(true);
    expect(result.summary).toBe("Spec Guard initialized successfully.");
    expect(result.data.config_created).toBe(true);
    expect(result.data.config_revision).toBe(1);

    await expect(stat(path.join(projectRoot, ".spec-guard"))).resolves.toBeTruthy();
    await expect(stat(path.join(projectRoot, ".spec-guard/artifacts/config/__singleton__/revisions/1.json"))).resolves.toBeTruthy();

    for (const file of requiredFiles) {
      await expect(stat(path.join(projectRoot, file))).resolves.toBeTruthy();
    }

    const guide = await readFile(path.join(projectRoot, "SPEC_GUARD_AGENT_GUIDE.md"), "utf8");
    expect(guide).toContain("Use Spec Guard tools directly.");
    expect(guide).toContain("Call status/quickstart first.");
    expect(guide).toContain("Human-approved content is canonical intent.");
    expect(guide).toContain("Documentation itself is never tested");

    const gitignore = await readFile(path.join(projectRoot, ".gitignore"), "utf8");
    expect(gitignore).toContain("!.spec-guard/packets/"); // the canonical committable Work Packet must NOT be gitignored
    expect(gitignore).toContain("!.spec-guard/spec/");
    expect(gitignore).toContain("node_modules/"); // not so sparse it's useless out of the box
  });

  it("is idempotent and preserves user-edited generated files", async () => {
    await initAction({}, { projectRoot });
    await writeFile(path.join(projectRoot, ".mcp.json"), "user edit\n", "utf8");

    const result = await initAction({}, { projectRoot });
    expect(result.ok).toBe(true);
    expect(result.data.config_created).toBe(false);
    expect(result.data.config_revision).toBe(1);
    expect(result.data.generated_files.find((file) => file.path === ".mcp.json")?.status).toBe("preserved");
  });

  it("supports an absolute artifact root while keeping project-visible files in the project", async () => {
    const artifactParent = await mkdtemp(path.join(tmpdir(), "spec-guard-artifacts-"));
    extraRoots.push(artifactParent);
    const artifactRoot = path.join(artifactParent, "sg-artifacts");

    const first = await initAction({ project_id: "absolute-demo", artifact_root: artifactRoot }, { projectRoot });
    expect(first.ok).toBe(true);
    expect(first.data.artifact_root).toBe(artifactRoot);
    expect(first.data.config_created).toBe(true);
    expect(first.data.config_revision).toBe(1);

    await expect(stat(path.join(artifactRoot, "artifacts/config/__singleton__/current.json"))).resolves.toBeTruthy();
    await expect(stat(path.join(artifactRoot, "artifacts/config/__singleton__/revisions/1.json"))).resolves.toBeTruthy();
    for (const file of ["claude-desktop-snippet.json", "pi-extension.md", "mcp-quickstart.md", "client-support-matrix.md", "generic-stdio-snippet.json"]) {
      await expect(stat(path.join(artifactRoot, "harness", file))).resolves.toBeTruthy();
    }
    for (const file of [".mcp.json", ".cursor/mcp.json", ".pi/extensions/spec-guard.ts", "SPEC_GUARD_AGENT_GUIDE.md"]) {
      await expect(stat(path.join(projectRoot, file))).resolves.toBeTruthy();
    }

    await writeFile(path.join(projectRoot, ".mcp.json"), "user edit\n", "utf8");
    const second = await initAction({ artifact_root: artifactRoot }, { projectRoot });
    expect(second.ok).toBe(true);
    expect(second.data.config_created).toBe(false);
    expect(second.data.config_revision).toBe(1);
    expect(second.data.generated_files.find((file) => file.path === ".mcp.json")?.status).toBe("preserved");
    expect(second.data.generated_files.some((file) => file.path === `${artifactRoot.replaceAll("\\", "/")}/harness/pi-extension.md`)).toBe(true);
  });
});
