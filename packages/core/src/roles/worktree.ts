import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import type { Diagnostic } from "../schemas/embedded.ts";
import type { BackendTaskEnvelope } from "../harness/role-execution.ts";
import { evaluateAttemptBoundary, type AttemptBoundaryResult, type DriftContext } from "../workflow/authorization.ts";
import type { SubagentAdapter } from "./adapter.ts";
import { dispatchBackendTask, type DispatchResult } from "./dispatch.ts";

/** M8b: physical isolation for edit-role subagents. The subagent runs in a throwaway git worktree, so
 * its writes never touch the real tree until Spec Guard validates the diff against the approved
 * boundary (M6) and accepts only in-boundary changes. An out-of-boundary attempt is rejected wholesale
 * (nothing is copied back) and the worktree is discarded. */

const execFileAsync = promisify(execFile);

export async function runGit(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

export interface Worktree {
  path: string;
  remove: () => Promise<void>;
}

/** Create a detached worktree at the repo's current HEAD, in an OS temp dir outside the repo. */
export async function createWorktree(repoRoot: string): Promise<Worktree> {
  const holder = await mkdtemp(path.join(tmpdir(), "sg-worktree-"));
  const target = path.join(holder, "wt");
  await runGit(["worktree", "add", "--detach", target, "HEAD"], repoRoot);
  return {
    path: target,
    remove: async () => {
      try { await runGit(["worktree", "remove", "--force", target], repoRoot); } catch { /* best-effort */ }
      await rm(holder, { recursive: true, force: true });
    }
  };
}

/** Files changed in the worktree relative to its HEAD (posix-relative paths). */
export async function worktreeChangedFiles(worktreePath: string): Promise<string[]> {
  const out = await runGit(["status", "--porcelain", "--untracked-files=all"], worktreePath);
  return out
    .split("\n")
    .filter((line) => line.length > 3)
    .map((line) => {
      const rest = line.slice(3).trim();
      const arrow = rest.indexOf(" -> ");
      return arrow >= 0 ? rest.slice(arrow + 4) : rest;
    })
    .map((p) => p.replace(/^"(.*)"$/, "$1"));
}

/** Copy the given changed files from the worktree into the main tree (deletes if absent in worktree). */
export async function acceptWorktreeChanges(repoRoot: string, worktreePath: string, files: readonly string[]): Promise<void> {
  for (const rel of files) {
    const src = path.join(worktreePath, rel);
    const dst = path.join(repoRoot, rel);
    if (existsSync(src)) {
      await mkdir(path.dirname(dst), { recursive: true });
      await copyFile(src, dst);
    } else {
      await rm(dst, { force: true });
    }
  }
}

export interface WorktreeRunResult {
  dispatch: DispatchResult;
  changed_files: string[];
  boundary: AttemptBoundaryResult;
  accepted: boolean;
  diagnostics: Diagnostic[];
}

/** Run an edit-role subagent in an isolated worktree, validate its diff against the approved boundary,
 * and accept in-boundary changes (or reject the whole attempt). The worktree is always cleaned up. */
export async function runEditRoleInWorktree(input: {
  repoRoot: string;
  adapter: SubagentAdapter;
  envelope: BackendTaskEnvelope;
  model: string | null;
  drift: DriftContext;
}): Promise<WorktreeRunResult> {
  const worktree = await createWorktree(input.repoRoot);
  try {
    const dispatch = await dispatchBackendTask({ envelope: input.envelope, adapter: input.adapter, cwd: worktree.path, model: input.model });
    const changedFiles = await worktreeChangedFiles(worktree.path);
    const boundary = evaluateAttemptBoundary(changedFiles, input.drift);
    const diagnostics: Diagnostic[] = [...dispatch.diagnostics, ...boundary.diagnostics];
    let accepted = false;
    if (dispatch.ok && !boundary.blocked) {
      await acceptWorktreeChanges(input.repoRoot, worktree.path, changedFiles);
      accepted = true;
    }
    return { dispatch, changed_files: changedFiles, boundary, accepted, diagnostics };
  } finally {
    await worktree.remove();
  }
}
