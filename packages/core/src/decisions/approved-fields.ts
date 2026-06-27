export type ApprovedFieldRoot =
  | "runtime_baseline_artifact"
  | "work_packet_artifact"
  | "human_decision_approved_payload";

export function isCanonicalJsonPointer(pointer: string): boolean {
  if (!pointer.startsWith("/")) return false;
  if (pointer.includes("*")) return false;
  const tokens = pointer.slice(1).split("/");
  if (tokens.some((token) => token.length === 0)) return false;
  for (const token of tokens) {
    for (let i = 0; i < token.length; i += 1) {
      if (token[i] !== "~") continue;
      const next = token[i + 1];
      if (next !== "0" && next !== "1") return false;
      i += 1;
    }
  }
  return true;
}

export function assertCanonicalApprovedFields(fields: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const field of fields) {
    if (!isCanonicalJsonPointer(field)) {
      throw new Error(`approved field is not a canonical JSON pointer: ${field}`);
    }
    if (!seen.has(field)) {
      seen.add(field);
      result.push(field);
    }
  }
  return result;
}
