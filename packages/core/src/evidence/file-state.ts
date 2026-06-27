import path from "node:path";
import { stat } from "node:fs/promises";
import type { Config } from "../schemas/artifacts.ts";
import { FileStateSnapshotSchema, type ChangedFile, type FileStateSnapshot, type PacketChangeBaseline } from "../schemas/embedded.ts";
import { sha256HexCanonical } from "../canonical/hashes.ts";
import { diagnostic, isoNow } from "../actions/config.ts";
import type { Diagnostic } from "../schemas/embedded.ts";
import { gitDiffSinceCommit } from "../paths/git.ts";
import { captureManifest } from "../paths/manifest.ts";
import { classifyPath, changedFileAllowedByGlobs } from "../paths/classify.ts";
import { normalizeGovernedPath, toPosixPath } from "../paths/normalize.ts";

function changedFile(pathValue: string, status: ChangedFile["status"], config: Config, allowedGlobs: string[]): ChangedFile | null {
  const classified = classifyPath(pathValue, config);
  if (classified.ignored || classified.category === null) return null;
  return { path: classified.path, category: classified.category, status, allowed_by_globs: changedFileAllowedByGlobs(classified.path, classified.category, allowedGlobs) };
}

export async function captureFileStateSnapshot(input: { projectRoot: string; config: Config; baseline: PacketChangeBaseline | null; allowedGlobs: string[] }): Promise<{ snapshot: FileStateSnapshot; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const captured_at = isoNow();
  if (input.baseline?.mode === "vcs") {
    const vcs_commit = input.baseline.vcs?.commit ?? null;
    try {
      const entries = await gitDiffSinceCommit(input.projectRoot, vcs_commit, input.config); // since the BASELINE commit, not live HEAD
      const changed_files_since_packet_baseline = entries.map((entry) => changedFile(entry.path, entry.status, input.config, input.allowedGlobs)).filter((entry): entry is ChangedFile => entry !== null);
      return { snapshot: FileStateSnapshotSchema.parse({ captured_at, mode: "vcs", vcs_commit, manifest_hash: null, changed_files_since_packet_baseline }), diagnostics };
    } catch (error) {
      // A vcs baseline has no manifest, so DON'T fall through to the manifest diff (it would mark every file added).
      diagnostics.push(diagnostic("FILE_STATE_VCS_CAPTURE_FAILED", error instanceof Error ? error.message : String(error), "warning", "/file_state_snapshot"));
      return { snapshot: FileStateSnapshotSchema.parse({ captured_at, mode: "vcs", vcs_commit, manifest_hash: null, changed_files_since_packet_baseline: [] }), diagnostics };
    }
  }

  const current = await captureManifest(input.projectRoot, input.config);
  const baselineFiles = new Map((input.baseline?.manifest?.files ?? []).map((entry) => [entry.path, entry]));
  const currentFiles = new Map(current.files.map((entry) => [entry.path, entry]));
  const paths = new Set([...baselineFiles.keys(), ...currentFiles.keys()]);
  const changed_files_since_packet_baseline: ChangedFile[] = [];
  for (const p of [...paths].sort()) {
    const before = baselineFiles.get(p);
    const after = currentFiles.get(p);
    let status: ChangedFile["status"] | null = null;
    if (before === undefined && after !== undefined) status = "added";
    else if (before !== undefined && after === undefined) status = "deleted";
    else if (before !== undefined && after !== undefined && before.content_hash !== after.content_hash) status = "modified";
    if (status !== null) {
      const cf = changedFile(p, status, input.config, input.allowedGlobs);
      if (cf !== null) changed_files_since_packet_baseline.push(cf);
    }
  }
  return { snapshot: FileStateSnapshotSchema.parse({ captured_at, mode: "manifest", vcs_commit: null, manifest_hash: current.manifest_hash, changed_files_since_packet_baseline }), diagnostics };
}

export async function validateExistingProjectPath(projectRoot: string, relPath: string): Promise<string> {
  const normalized = normalizeGovernedPath(toPosixPath(relPath));
  const abs = path.resolve(projectRoot, normalized);
  const relative = path.relative(projectRoot, abs);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`path is outside project: ${relPath}`);
  const s = await stat(abs);
  if (!s.isFile()) throw new Error(`path is not a file: ${normalized}`);
  return normalized;
}

export function snapshotHash(snapshot: FileStateSnapshot): string {
  return sha256HexCanonical(snapshot);
}
