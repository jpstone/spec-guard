import { z } from "zod";

export const JsonPatchOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), path: z.string(), value: z.unknown() }).strict(),
  z.object({ op: z.literal("replace"), path: z.string(), value: z.unknown() }).strict(),
  z.object({ op: z.literal("remove"), path: z.string() }).strict()
]);
export const JsonPatchSchema = z.array(JsonPatchOperationSchema);
export type JsonPatchOperation = z.infer<typeof JsonPatchOperationSchema>;

export interface ApplyJsonPatchOptions {
  protectedPrefixes?: string[];
}

function pathImpactsProtectedPath(path: string, protectedPath: string): boolean {
  return path === protectedPath || path.startsWith(`${protectedPath}/`) || protectedPath.startsWith(`${path}/`);
}

function assertCanonicalPointer(path: string): void {
  if (path.length === 0) throw new Error("patching the whole Config document is not supported");
  if (!path.startsWith("/")) throw new Error(`invalid JSON pointer ${path}: must start with /`);
  if (path.includes("//")) throw new Error(`invalid JSON pointer ${path}: empty tokens are not canonical`);
  for (let i = 0; i < path.length; i += 1) {
    if (path[i] === "~" && path[i + 1] !== "0" && path[i + 1] !== "1") {
      throw new Error(`invalid JSON pointer ${path}: ~ must be escaped as ~0 or ~1`);
    }
  }
}

function decodeToken(token: string): string {
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

function tokens(pointer: string): string[] {
  assertCanonicalPointer(pointer);
  return pointer.slice(1).split("/").map(decodeToken);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function parentFor(root: unknown, pointer: string): { parent: unknown; key: string } {
  const parts = tokens(pointer);
  const key = parts.pop();
  if (key === undefined) throw new Error(`invalid JSON pointer ${pointer}`);
  let current: unknown = root;
  for (const part of parts) {
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(part)) throw new Error(`invalid array index ${part} in ${pointer}`);
      const index = Number(part);
      if (index < 0 || index >= current.length) throw new Error(`path does not exist: ${pointer}`);
      current = current[index];
    } else if (current !== null && typeof current === "object") {
      if (!hasOwn(current, part)) throw new Error(`path does not exist: ${pointer}`);
      current = (current as Record<string, unknown>)[part];
    } else {
      throw new Error(`path does not exist: ${pointer}`);
    }
  }
  return { parent: current, key };
}

function exists(parent: unknown, key: string): boolean {
  if (Array.isArray(parent)) return /^\d+$/.test(key) && Number(key) >= 0 && Number(key) < parent.length;
  return parent !== null && typeof parent === "object" && hasOwn(parent, key);
}

function add(parent: unknown, key: string, value: unknown, pointer: string): void {
  if (Array.isArray(parent)) {
    if (key === "-") {
      parent.push(value);
      return;
    }
    if (!/^\d+$/.test(key)) throw new Error(`invalid array index ${key} in ${pointer}`);
    const index = Number(key);
    if (index < 0 || index > parent.length) throw new Error(`array add index out of range: ${pointer}`);
    parent.splice(index, 0, value);
    return;
  }
  if (parent !== null && typeof parent === "object") {
    (parent as Record<string, unknown>)[key] = value;
    return;
  }
  throw new Error(`path parent does not exist: ${pointer}`);
}

function replace(parent: unknown, key: string, value: unknown, pointer: string): void {
  if (!exists(parent, key)) throw new Error(`path does not exist: ${pointer}`);
  if (Array.isArray(parent)) parent[Number(key)] = value;
  else (parent as Record<string, unknown>)[key] = value;
}

function remove(parent: unknown, key: string, pointer: string): void {
  if (!exists(parent, key)) throw new Error(`path does not exist: ${pointer}`);
  if (Array.isArray(parent)) parent.splice(Number(key), 1);
  else delete (parent as Record<string, unknown>)[key];
}

export function applyJsonPatch<T>(value: T, patch: JsonPatchOperation[], options: ApplyJsonPatchOptions = {}): { value: T; affectedPaths: string[] } {
  const copy = deepClone(value);
  const affectedPaths: string[] = [];
  for (const operation of patch) {
    assertCanonicalPointer(operation.path);
    if (options.protectedPrefixes?.some((prefix) => pathImpactsProtectedPath(operation.path, prefix))) {
      throw new Error(`protected path cannot be patched: ${operation.path}`);
    }
    const target = parentFor(copy, operation.path);
    if (operation.op === "add") add(target.parent, target.key, operation.value, operation.path);
    if (operation.op === "replace") replace(target.parent, target.key, operation.value, operation.path);
    if (operation.op === "remove") remove(target.parent, target.key, operation.path);
    affectedPaths.push(operation.path);
  }
  return { value: copy, affectedPaths: [...new Set(affectedPaths)].sort() };
}
