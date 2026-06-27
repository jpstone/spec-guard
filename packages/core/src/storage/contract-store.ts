import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "../canonical/canonical-json.ts";
import { sha256HexCanonical } from "../canonical/hashes.ts";
import { ContractArtifactSchema, type ContractArtifact, type ContractRef } from "../schemas/work-packet.ts";

// A contract surface is a hard JSON-Schema, which legitimately uses NON-integer numbers (minimum: 0.5, multipleOf:
// 0.1), so contract canonicalization/hashing must permit them (still deterministic via the ECMAScript Number->String).
const CONTRACT_CANON = { allowNonIntegerNumbers: true } as const;

/**
 * The COMMITTED contract registry — the authoritative typed-surface artifacts Spec Guard OWNS, keyed by id,
 * content-hashed, resolvable across Work Packets. VERSIONED at <artifactRoot>/contracts/<id>/<content_hash>.json
 * (committed, unlike the gitignored .spec-guard working store — the contract content must travel with the repo for
 * consumers in fresh clones / other packets). Spec Guard does NOT parse the surface in Phase 1; it freezes + hashes it.
 */
export class ContractStore {
  private readonly root: string;
  constructor(artifactRoot: string) { this.root = artifactRoot; }
  // Re-versioning a contract adds a NEW file; prior versions are KEPT, so a consumer pinned to an older hash still
  // resolves (it isn't clobbered). Both id and hash are encodeURIComponent'd so a hand-authored ref can't path-traverse.
  private versionDir(id: string): string { return path.join(this.root, "contracts", encodeURIComponent(id)); }
  private versionFile(id: string, hash: string): string { return path.join(this.versionDir(id), `${encodeURIComponent(hash)}.json`); }

  /** Freeze a NEW version of contract `id` (kept alongside prior versions), returning its ref. Idempotent: re-freezing
   *  an already-present version is a no-op (so its recorded `first_version`/`produced_by` provenance never flips). */
  async put(id: string, surface: unknown, producedBy: { work_id: string; spec_id: string } | null = null): Promise<ContractRef> {
    const content_hash = sha256HexCanonical(surface, CONTRACT_CANON);
    const file = this.versionFile(id, content_hash);
    try { await readFile(file, "utf8"); return { id, content_hash }; } // already frozen at this hash — leave it
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    let priorVersions = 0;
    try { priorVersions = (await readdir(this.versionDir(id))).length; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const artifact = ContractArtifactSchema.parse({ schema_version: 1, id, surface, content_hash, first_version: priorVersions === 0, produced_by: producedBy });
    await mkdir(this.versionDir(id), { recursive: true });
    await writeFile(file, `${canonicalJson(artifact, CONTRACT_CANON)}\n`, "utf8");
    return { id, content_hash };
  }

  /** The Work Packet + Spec that froze the GENESIS (first_version) version of contract `id`, or null if unknown.
   *  Lets the viewer attribute "created" to the WP that introduced the contract, independent of which version is pinned now. */
  async genesisProducer(id: string): Promise<{ work_id: string; spec_id: string } | null> {
    let files: string[];
    try { files = await readdir(this.versionDir(id)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    for (const file of files) {
      try {
        const artifact = ContractArtifactSchema.parse(JSON.parse(await readFile(path.join(this.versionDir(id), file), "utf8")));
        if (artifact.first_version) return artifact.produced_by;
      } catch { /* skip a corrupt/foreign file */ }
    }
    return null;
  }

  /** The exact frozen version a ref pins, or null if it isn't in the registry, is CORRUPT, or has been TAMPERED with
   *  (the committed file travels + is merge-editable, so re-verify its bytes hash to the pinned ref — tamper-evident). */
  async getVersion(ref: ContractRef): Promise<ContractArtifact | null> {
    let raw: string;
    try { raw = await readFile(this.versionFile(ref.id, ref.content_hash), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    let artifact: ContractArtifact;
    try { artifact = ContractArtifactSchema.parse(JSON.parse(raw)); }
    catch { return null; } // corrupt / malformed committed file -> does not cleanly resolve (treated as absent, not a crash)
    if (artifact.id !== ref.id || artifact.content_hash !== ref.content_hash || sha256HexCanonical(artifact.surface, CONTRACT_CANON) !== ref.content_hash) return null;
    return artifact;
  }

  /** Does the registry hold exactly this frozen ref (the pinned id@content_hash version exists)? */
  async resolves(ref: ContractRef): Promise<boolean> {
    return (await this.getVersion(ref)) !== null;
  }

  /** Every contract id in the registry (for the viewer's contracts list). */
  async listIds(): Promise<string[]> {
    try { return (await readdir(path.join(this.root, "contracts"))).map((entry) => decodeURIComponent(entry)).sort(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }

  /** Every frozen version of contract `id` (skipping any corrupt/foreign file). */
  async listVersions(id: string): Promise<ContractArtifact[]> {
    let files: string[];
    try { files = await readdir(this.versionDir(id)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    const versions: ContractArtifact[] = [];
    for (const file of files) {
      try { versions.push(ContractArtifactSchema.parse(JSON.parse(await readFile(path.join(this.versionDir(id), file), "utf8")))); }
      catch { /* skip a corrupt/foreign file */ }
    }
    return versions;
  }
}
