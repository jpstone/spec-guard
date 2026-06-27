import { sha256HexCanonical } from "../canonical/hashes.ts";
import { normalizeSourceArtifactRefs } from "../canonical/source-refs.ts";
import type { AcceptanceCriterion, Diagnostic, SourceArtifactRef, SourceEvidence } from "../schemas/embedded.ts";
import { resolveSourceArtifactRef } from "../actions/source-artifact.ts";
import { diagnostic } from "../actions/config.ts";
import type { ActionExecutionContext } from "../actions/context.ts";

export function sourceEvidenceHash(evidence: Omit<SourceEvidence, "evidence_hash"> | SourceEvidence): string {
  const { evidence_hash: _ignored, ...rest } = evidence as SourceEvidence;
  return sha256HexCanonical({ ...rest, source_artifact_refs: normalizeSourceArtifactRefs(rest.source_artifact_refs) });
}

/**
 * COMPUTE-DON'T-DEMAND: fill each source-derived AC's evidence_hash with the CANONICAL value, ignoring whatever
 * the caller supplied (a placeholder, an omission defaulting to zeros, or a wrong value). Call this BEFORE
 * validating/storing ACs so the agent never has to compute or reverse-engineer evidence_hash — the tool derives it.
 */
export function normalizeAcceptanceCriteria(acs: readonly AcceptanceCriterion[]): AcceptanceCriterion[] {
  return acs.map((ac) =>
    ac.source === "source_derived" && ac.source_evidence !== null
      ? { ...ac, source_evidence: { ...ac.source_evidence, evidence_hash: sourceEvidenceHash(ac.source_evidence) } }
      : ac
  );
}

export function sourceArtifactRefsForAcs(acs: readonly AcceptanceCriterion[]): SourceArtifactRef[] {
  return normalizeSourceArtifactRefs(acs.flatMap((ac) => ac.source === "source_derived" && ac.source_evidence !== null ? ac.source_evidence.source_artifact_refs : []));
}

export async function validateAcceptanceCriteria(acs: readonly AcceptanceCriterion[], context: ActionExecutionContext = {}): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const ids = new Set<string>();
  for (const ac of acs) {
    if (ids.has(ac.id)) diagnostics.push(diagnostic("AC_ID_NOT_UNIQUE", `AcceptanceCriterion id is duplicated: ${ac.id}`, "error", "/acceptance_criteria"));
    ids.add(ac.id);
    if (ac.source === "source_derived") {
      if (ac.source_evidence === null) {
        diagnostics.push(diagnostic("SOURCE_DERIVED_AC_MISSING_EVIDENCE", `Source-derived AC ${ac.id} requires SourceEvidence.`, "error", `/acceptance_criteria/${ac.id}/source_evidence`));
        continue;
      }
      if (ac.source_evidence.source_artifact_refs.length === 0) {
        diagnostics.push(diagnostic("SOURCE_EVIDENCE_REFS_EMPTY", `Source-derived AC ${ac.id} requires non-empty source_artifact_refs.`, "error", `/acceptance_criteria/${ac.id}/source_evidence/source_artifact_refs`));
      }
      const expected = sourceEvidenceHash(ac.source_evidence);
      if (ac.source_evidence.evidence_hash !== expected) {
        diagnostics.push(diagnostic("SOURCE_EVIDENCE_HASH_MISMATCH", `SourceEvidence hash mismatch for AC ${ac.id}.`, "error", `/acceptance_criteria/${ac.id}/source_evidence/evidence_hash`));
      }
      for (const ref of ac.source_evidence.source_artifact_refs) {
        try {
          await resolveSourceArtifactRef(ref, context);
        } catch (error) {
          diagnostics.push(diagnostic("SOURCE_ARTIFACT_REF_UNRESOLVED", error instanceof Error ? error.message : String(error), "error", `/acceptance_criteria/${ac.id}/source_evidence/source_artifact_refs`));
        }
      }
    }
  }
  return diagnostics;
}
