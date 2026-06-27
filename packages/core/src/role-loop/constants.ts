import { sha256HexCanonical } from "../canonical/hashes.ts";

// Normative implementation appendix — "Authoritative v1 schemas and projections" constants.
// These are hash-bearing inputs; tests must use these constants unless a future projection
// version supersedes them.
export const SCHEMA_VERSION_V1 = 1;
export const APPROVAL_PROJECTION_VERSION_V1 = 1;
export const RESOLVER_VERSION_V1 = 1;
export const POLICY_ID_V1 = "spec-guard-default-evidence-policy";
export const POLICY_VERSION_V1 = 1;
export const POLICY_DEFAULTS_VERSION_V1 = 1;

// All hash-bearing V1 records carry this algorithm tag.
export const HASH_ALGORITHM_V1 = "sha256-canonical-json-v1" as const;

// Milestone 1A/1B only emit `identity_binding_policy="content_only"` at runtime. The
// `bind_*_identity` modes are schema-compatible golden-test targets that are not emitted.
export const IDENTITY_BINDING_POLICY_CONTENT_ONLY = "content_only" as const;

// `SpecGuardPolicyConfigProjectionV1` is always the empty/default projection for 1A/1B.
// Non-empty user overrides are ignored for hash-bearing resolution (deferred diagnostics).
export interface SpecGuardPolicyConfigProjectionV1 {
  schema_version: number;
  policy_defaults_version: number;
  evidence_policy_overrides: Record<string, never>;
  path_policy_relevant_to_evidence: Record<string, never>;
  work_kind_policy_overrides: Record<string, never>;
}

export const CONFIG_PROJECTION_V1: SpecGuardPolicyConfigProjectionV1 = {
  schema_version: SCHEMA_VERSION_V1,
  policy_defaults_version: POLICY_DEFAULTS_VERSION_V1,
  evidence_policy_overrides: {},
  path_policy_relevant_to_evidence: {},
  work_kind_policy_overrides: {}
};

export const CONFIG_HASH_V1 = sha256HexCanonical(CONFIG_PROJECTION_V1);
