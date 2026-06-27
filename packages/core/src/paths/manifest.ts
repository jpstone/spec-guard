import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { sha256HexCanonical } from "../canonical/hashes.ts";
import type { Config } from "../schemas/artifacts.ts";
import { matchesAnyGlob } from "./glob.ts";
import { normalizeGovernedPath, toPosixPath } from "./normalize.ts";

export interface ManifestEntry { path: string; size: number; mtime: string; content_hash: string }
export interface ManifestCapture { manifest_hash: string; files: ManifestEntry[] }

export async function fileContentHash(absPath: string): Promise<string> {
  return createHash("sha256").update(await readFile(absPath)).digest("hex");
}

function ignored(rel: string, config: Config): boolean {
  return matchesAnyGlob(rel, config.path_policy.ignored_paths);
}

async function walk(projectRoot: string, dir: string, config: Config, out: ManifestEntry[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const relRaw = toPosixPath(path.relative(projectRoot, abs));
    let rel: string;
    try { rel = normalizeGovernedPath(relRaw); } catch { continue; }
    if (ignored(rel, config)) continue;
    if (entry.isDirectory()) {
      await walk(projectRoot, abs, config, out);
    } else if (entry.isFile()) {
      const s = await stat(abs);
      out.push({ path: rel, size: s.size, mtime: s.mtime.toISOString(), content_hash: await fileContentHash(abs) });
    }
  }
}

export async function captureManifest(projectRoot: string, config: Config): Promise<ManifestCapture> {
  const files: ManifestEntry[] = [];
  await walk(projectRoot, projectRoot, config, files);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { manifest_hash: sha256HexCanonical(files), files };
}
