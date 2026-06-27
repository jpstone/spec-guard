import type { Config } from "../schemas/artifacts.ts";
import type { ChangedFile } from "../schemas/embedded.ts";
import { changedFileAllowedByGlobs, classifyPath } from "./classify.ts";

export function classifyChangedPaths(paths: readonly string[], allowedGlobs: readonly string[], config: Config, status: ChangedFile["status"] = "modified"): ChangedFile[] {
  const out: ChangedFile[] = [];
  for (const path of paths) {
    const classified = classifyPath(path, config);
    if (classified.ignored || classified.category === null) continue;
    out.push({ path: classified.path, category: classified.category, status, allowed_by_globs: changedFileAllowedByGlobs(classified.path, classified.category, allowedGlobs) });
  }
  return out;
}
