import { isCanonicalJsonPointer } from "./approved-fields.ts";

function unescapeToken(token: string): string {
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

export function jsonPointerExists(value: unknown, pointer: string): boolean {
  if (!isCanonicalJsonPointer(pointer)) return false;
  const tokens = pointer.slice(1).split("/").map(unescapeToken);
  let current: unknown = value;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      if (!/^0$|^[1-9][0-9]*$/.test(token)) return false;
      const index = Number(token);
      if (index < 0 || index >= current.length) return false;
      current = current[index];
      continue;
    }
    if (typeof current === "object" && current !== null && Object.hasOwn(current, token)) {
      current = (current as Record<string, unknown>)[token];
      continue;
    }
    return false;
  }
  return true;
}

export function assertJsonPointersExist(value: unknown, pointers: readonly string[]): void {
  for (const pointer of pointers) {
    if (!jsonPointerExists(value, pointer)) {
      throw new Error(`approved field pointer does not exist in approved_payload: ${pointer}`);
    }
  }
}
