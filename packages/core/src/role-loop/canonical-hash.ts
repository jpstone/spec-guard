import { sha256HexCanonical } from "../canonical/hashes.ts";

// Every role-loop `*_hash` reuses the existing canonical-JSON hash verbatim
// (integer/string/bool/null only, sorted keys, code-point order). This is the single
// hash scheme for all V1 projections ("sha256-canonical-json-v1").
export function sha256CanonicalJson(value: unknown): string {
  return sha256HexCanonical(value);
}
