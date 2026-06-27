import type { Config, WorkPacket } from "../schemas/artifacts.ts";
import type { ChangedFile, Diagnostic } from "../schemas/embedded.ts";
import { captureFileStateSnapshot } from "../evidence/file-state.ts";

export interface ReviewChangedFilesResult {
  changed_files: ChangedFile[];
  diagnostics: Diagnostic[];
}

// NOTE (evidence-restore S-4): captureFileStateSnapshot's vcs branch now diffs against the change-baseline COMMIT
// (gitDiffSinceCommit), not live HEAD. So in a git repo this returns "changed since the packet baseline", robust to
// mid-loop commits — the correct semantics for review, but a behavior change if this is ever wired into the loop.
export async function computeReviewChangedFiles(input: { projectRoot: string; config: Config; work: WorkPacket }): Promise<ReviewChangedFilesResult> {
  const result = await captureFileStateSnapshot({
    projectRoot: input.projectRoot,
    config: input.config,
    baseline: input.work.change_baseline,
    allowedGlobs: input.work.scope.allowed_globs
  });
  return { changed_files: result.snapshot.changed_files_since_packet_baseline, diagnostics: result.diagnostics };
}

export function implementationFilesFromChangedFiles(changedFiles: readonly ChangedFile[]): string[] {
  return changedFiles
    .filter((file) => file.category === "implementation_source" || file.category === "runtime_product_configuration")
    .map((file) => file.path)
    .sort((a, b) => a.localeCompare(b));
}

export function testFilesFromChangedFiles(changedFiles: readonly ChangedFile[]): string[] {
  return changedFiles
    .filter((file) => file.category === "tests")
    .map((file) => file.path)
    .sort((a, b) => a.localeCompare(b));
}

export function docsFilesFromChangedFiles(changedFiles: readonly ChangedFile[]): string[] {
  return changedFiles
    .filter((file) => file.category === "docs")
    .map((file) => file.path)
    .sort((a, b) => a.localeCompare(b));
}
