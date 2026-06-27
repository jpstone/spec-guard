import type { Config } from "../schemas/artifacts.ts";
import type { ChangeFileCategory } from "../schemas/enums.ts";
import { diagnostic } from "../actions/config.ts";
import type { Diagnostic } from "../schemas/embedded.ts";
import { matchesAnyGlob, validateGlobPatterns } from "./glob.ts";
import { normalizeGovernedPath } from "./normalize.ts";

export type ClassifiedPath = { path: string; category: ChangeFileCategory | null; ignored: boolean };

const PRECEDENCE: Array<Exclude<ChangeFileCategory, "other_unexpected">> = [
  "spec_guard_artifact_evidence",
  "docs",
  "tests",
  "runtime_product_configuration",
  "implementation_source",
  "generated_build_output"
];

const PRODUCT_SCOPE = new Set<ChangeFileCategory>(["docs", "tests", "runtime_product_configuration", "implementation_source", "generated_build_output"]);

export function validatePathPolicyGlobs(config: Config): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const [key, patterns] of Object.entries(config.path_policy)) {
    if (!Array.isArray(patterns)) continue;
    for (const pattern of patterns) {
      try { validateGlobPatterns([pattern]); } catch (error) {
        diagnostics.push(diagnostic("PATH_POLICY_GLOB_INVALID", error instanceof Error ? error.message : String(error), "error", `/config/path_policy/${key}`));
      }
    }
  }
  return diagnostics;
}

export function classifyPath(path: string, config: Config): ClassifiedPath {
  const normalized = normalizeGovernedPath(path);
  if (matchesAnyGlob(normalized, config.path_policy.ignored_paths)) return { path: normalized, category: null, ignored: true };
  for (const category of PRECEDENCE) {
    if (matchesAnyGlob(normalized, config.path_policy[category])) return { path: normalized, category, ignored: false };
  }
  return { path: normalized, category: "other_unexpected", ignored: false };
}

export function isProductScopeCategory(category: ChangeFileCategory): boolean {
  return PRODUCT_SCOPE.has(category);
}

export function validateAllowedGlobsForPaths(paths: readonly string[], allowedGlobs: readonly string[], config: Config): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const glob of allowedGlobs) {
    try { validateGlobPatterns([glob]); } catch (error) {
      diagnostics.push(diagnostic("ALLOWED_GLOB_INVALID", error instanceof Error ? error.message : String(error), "error", "/scope/allowed_globs"));
    }
  }
  for (const rawPath of paths) {
    let classified: ClassifiedPath;
    try { classified = classifyPath(rawPath, config); } catch (error) {
      diagnostics.push(diagnostic("CHANGED_PATH_INVALID", error instanceof Error ? error.message : String(error), "error", "/review/changed_files"));
      continue;
    }
    if (classified.ignored || classified.category === null || classified.category === "spec_guard_artifact_evidence") continue;
    if (classified.category === "other_unexpected") {
      diagnostics.push(diagnostic("CHANGED_PATH_UNEXPECTED", `${classified.path} is categorized as other_unexpected and is not silently allowed.`, "error", "/review/changed_files"));
      continue;
    }
    if (isProductScopeCategory(classified.category) && !matchesAnyGlob(classified.path, allowedGlobs)) {
      diagnostics.push(diagnostic("CHANGED_PATH_OUTSIDE_ALLOWED_GLOBS", `${classified.path} is outside WorkPacket allowed_globs.`, "error", "/scope/allowed_globs"));
    }
  }
  return diagnostics;
}

export function changedFileAllowedByGlobs(path: string, category: ChangeFileCategory, allowedGlobs: readonly string[]): boolean {
  if (category === "spec_guard_artifact_evidence") return true;
  if (category === "other_unexpected") return false;
  return matchesAnyGlob(path, allowedGlobs);
}
