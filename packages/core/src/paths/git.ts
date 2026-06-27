import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { Config } from "../schemas/artifacts.ts";
import type { ChangeFileCategory } from "../schemas/enums.ts";
import type { Diagnostic } from "../schemas/embedded.ts";
import { diagnostic } from "../actions/config.ts";
import { classifyPath } from "./classify.ts";
import { fileContentHash } from "./manifest.ts";
import { normalizeGovernedPath, toPosixPath } from "./normalize.ts";
import { stat } from "node:fs/promises";

const execFileAsync = promisify(execFile);

export interface GitStatusEntry { path: string; status: "added" | "modified" | "deleted" | "renamed" | "untracked"; category: ChangeFileCategory | null; blocking: boolean }
export interface GitCapture { system: "git"; commit: string | null; tree: string | null; dirty_files: string[]; untracked_files: string[]; preauthorization_dirty_entries: Array<{ path: string; status: "added" | "modified" | "deleted" | "renamed" | "untracked"; size: number | null; content_hash: string | null }> }

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

export async function locateGitRoot(projectRoot: string): Promise<string | null> {
  try {
    const output = (await git(["rev-parse", "--show-toplevel"], projectRoot)).trim();
    if (output.length === 0) return null;
    const rel = path.relative(output, projectRoot);
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return output;
    return null;
  } catch {
    return null;
  }
}

function statusFromXY(xy: string): GitStatusEntry["status"] {
  if (xy === "??") return "untracked";
  if (xy.includes("R")) return "renamed";
  if (xy.includes("D")) return "deleted";
  if (xy.includes("A")) return "added";
  return "modified";
}

export async function gitStatusEntries(projectRoot: string, config: Config): Promise<GitStatusEntry[]> {
  const raw = await git(["status", "--porcelain=v1", "-z"], projectRoot);
  const parts = raw.split("\0").filter((part) => part.length > 0);
  const entries: GitStatusEntry[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const record = parts[i]!;
    const xy = record.slice(0, 2);
    const rawPath = record.slice(3);
    const status = statusFromXY(xy);
    if ((xy.includes("R") || xy.includes("C")) && i + 1 < parts.length) {
      // In porcelain -z, the displayed path is the destination path; consume the source path.
      i += 1;
    }
    const normalized = normalizeGovernedPath(toPosixPath(rawPath));
    const classified = classifyPath(normalized, config);
    if (classified.ignored) continue;
    const blocking = classified.category === "implementation_source" || classified.category === "runtime_product_configuration" || classified.category === "other_unexpected";
    entries.push({ path: normalized, status, category: classified.category, blocking });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path) || a.status.localeCompare(b.status));
  return entries;
}

function classifyEntry(rawPath: string, status: GitStatusEntry["status"], config: Config): GitStatusEntry | null {
  const normalized = normalizeGovernedPath(toPosixPath(rawPath));
  const classified = classifyPath(normalized, config);
  if (classified.ignored) return null;
  const blocking = classified.category === "implementation_source" || classified.category === "runtime_product_configuration" || classified.category === "other_unexpected";
  return { path: normalized, status, category: classified.category, blocking };
}

// Git's canonical empty-tree object — the diff base when the baseline was captured before any commit existed.
const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/**
 * The change set since a SPECIFIC commit (the change-baseline's captured commit), NOT since live HEAD. This is the
 * evidence-restore B1 fix: `git status` compares to HEAD/index, so a mid-loop `git commit` hides the change; diffing
 * the working tree against the OLD baseline commit (+ enumerating untracked files git-diff omits) is robust to it.
 */
export async function gitDiffSinceCommit(projectRoot: string, commit: string | null, config: Config): Promise<GitStatusEntry[]> {
  const base = commit ?? EMPTY_TREE_SHA;
  const entries: GitStatusEntry[] = [];
  const diffParts = (await git(["diff", "--name-status", "-z", base], projectRoot)).split("\0").filter((part) => part.length > 0);
  for (let i = 0; i < diffParts.length; i += 1) {
    const letter = diffParts[i]![0]!;
    const isRenameOrCopy = letter === "R" || letter === "C";
    const filePath = isRenameOrCopy ? diffParts[i + 2] ?? "" : diffParts[i + 1] ?? "";
    i += isRenameOrCopy ? 2 : 1;
    if (filePath.length === 0) continue;
    const status: GitStatusEntry["status"] = letter === "A" ? "added" : letter === "D" ? "deleted" : letter === "R" ? "renamed" : letter === "C" ? "added" : "modified";
    const entry = classifyEntry(filePath, status, config);
    if (entry !== null) entries.push(entry);
  }
  // Untracked files never appear in `git diff` — enumerate them explicitly (respecting .gitignore).
  for (const filePath of (await git(["ls-files", "--others", "--exclude-standard", "-z"], projectRoot)).split("\0").filter((part) => part.length > 0)) {
    const entry = classifyEntry(filePath, "untracked", config);
    if (entry !== null) entries.push(entry);
  }
  entries.sort((a, b) => a.path.localeCompare(b.path) || a.status.localeCompare(b.status));
  return entries;
}

export async function captureGitBaseline(projectRoot: string, config: Config): Promise<{ baseline: GitCapture; diagnostics: Diagnostic[] }> {
  const gitRoot = await locateGitRoot(projectRoot);
  if (gitRoot === null) throw new Error("Git repository was not found at or above project root");
  // UNBORN HEAD (a fresh repo with no commits — the common greenfield case): `git rev-parse HEAD` fails. There is no
  // baseline commit, so the baseline is the EMPTY tree (everything is "added"), which gitDiffSinceCommit handles via
  // a null commit. Don't force the agent to make a throwaway initial commit just to authorize work it hasn't written.
  let commit: string | null = null;
  let tree: string | null = null;
  try {
    commit = (await git(["rev-parse", "HEAD"], projectRoot)).trim() || null;
    tree = (await git(["rev-parse", "HEAD^{tree}"], projectRoot)).trim() || null;
  } catch { /* unborn HEAD: leave commit/tree null -> empty-tree baseline */ }
  const entries = await gitStatusEntries(projectRoot, config);
  const diagnostics: Diagnostic[] = [];
  const preauthorization_dirty_entries: GitCapture["preauthorization_dirty_entries"] = [];
  for (const entry of entries) {
    // PREAUTHORIZATION_DIRTY_BLOCKING guards against uncommitted PRODUCT code on top of an ESTABLISHED baseline. On
    // an unborn HEAD (commit === null) there is no baseline — everything is "uncommitted" by definition (the init
    // scaffolding, etc.), so the check is N/A. The empty-tree baseline + the completion backstop still catch any real
    // pre-written product code (it would be an unrecorded change). So don't block a fresh greenfield repo here.
    if (entry.blocking && commit !== null) {
      diagnostics.push(diagnostic("PREAUTHORIZATION_DIRTY_BLOCKING", `${entry.path} has pre-authorization ${entry.status} state in category ${entry.category}.`, "error", "/change_baseline/vcs/dirty_files"));
      continue;
    }
    if (entry.category === "docs" || entry.category === "tests" || entry.category === "spec_guard_artifact_evidence") {
      if (entry.status === "deleted") {
        preauthorization_dirty_entries.push({ path: entry.path, status: entry.status, size: null, content_hash: null });
      } else {
        const abs = path.join(projectRoot, entry.path);
        const s = await stat(abs).catch(() => null);
        preauthorization_dirty_entries.push({ path: entry.path, status: entry.status, size: s?.size ?? null, content_hash: s === null ? null : await fileContentHash(abs) });
      }
    }
  }
  return { baseline: { system: "git", commit, tree, dirty_files: entries.filter((e) => e.status !== "untracked").map((e) => e.path), untracked_files: entries.filter((e) => e.status === "untracked").map((e) => e.path), preauthorization_dirty_entries }, diagnostics };
}
