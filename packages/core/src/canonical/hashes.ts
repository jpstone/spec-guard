import { createHash } from "node:crypto";
import { canonicalJsonBytes, type CanonicalJsonOptions } from "./canonical-json.ts";

export function sha256LowerHex(bytes: string | Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256HexCanonical(value: unknown, options: CanonicalJsonOptions = {}): string {
  return sha256LowerHex(canonicalJsonBytes(value, options));
}
