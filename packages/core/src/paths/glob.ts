import { normalizeGovernedPath } from "./normalize.ts";

export function validateGlobPattern(pattern: string): string {
  if (pattern.startsWith("!")) throw new Error(`negated globs are not supported: ${pattern}`);
  return normalizeGovernedPath(pattern);
}

function escapeRegex(ch: string): string {
  return ch.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function globToRegExp(pattern: string): RegExp {
  const normalized = validateGlobPattern(pattern);
  let regex = "^";
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i]!;
    const next = normalized[i + 1];
    if (ch === "*") {
      if (next === "*") {
        const after = normalized[i + 2];
        if (after === "/") {
          regex += "(?:.*\/)?";
          i += 2;
        } else {
          regex += ".*";
          i += 1;
        }
      } else {
        regex += "[^/]*";
      }
    } else if (ch === "?") {
      regex += "[^/]";
    } else {
      regex += escapeRegex(ch);
    }
  }
  regex += "$";
  return new RegExp(regex);
}

export function validateGlobPatterns(patterns: readonly string[]): string[] {
  return patterns.map(validateGlobPattern);
}

export function matchesAnyGlob(path: string, patterns: readonly string[]): boolean {
  const normalizedPath = normalizeGovernedPath(path);
  return patterns.some((pattern) => globToRegExp(pattern).test(normalizedPath));
}
