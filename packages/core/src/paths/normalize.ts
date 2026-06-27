import path from "node:path";

export function toPosixPath(value: string): string {
  return value.replace(/\\+/g, "/");
}

export function normalizeGovernedPath(input: string): string {
  if (typeof input !== "string" || input.trim().length === 0) throw new Error("path must be a non-empty string");
  const posix = toPosixPath(input.trim());
  if (path.posix.isAbsolute(posix) || /^[A-Za-z]:\//.test(posix)) throw new Error(`absolute governed paths are not allowed: ${input}`);
  const normalized = path.posix.normalize(posix);
  if (normalized === "." || normalized === "") throw new Error(`governed path must not normalize to project root: ${input}`);
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) throw new Error(`governed paths must not contain traversal: ${input}`);
  return normalized;
}

export function projectRelativePath(projectRoot: string, absoluteOrRelative: string): string {
  const absolute = path.isAbsolute(absoluteOrRelative) ? absoluteOrRelative : path.join(projectRoot, absoluteOrRelative);
  const relative = path.relative(projectRoot, absolute);
  return normalizeGovernedPath(toPosixPath(relative));
}
