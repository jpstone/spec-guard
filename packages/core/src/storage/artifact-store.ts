import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "../canonical/canonical-json.ts";
import { governedContentHash, governedProjection, compactStoredArtifact } from "./projections.ts";
import { RevisionStore, type RevisionRecord } from "./revision-store.ts";
import { AuditLog, type AuditRecord } from "./audit-log.ts";
import { migrateLoadedArtifact, validateCanonicalArtifactForWrite } from "./migration.ts";

export interface ArtifactStoreOptions {
  root?: string;
}

export interface StoredArtifact<T = unknown> {
  artifact: T;
  governed_content_hash: string;
  revision: number;
}

export interface ArtifactListEntry<T = unknown> extends StoredArtifact<T> {
  artifact_type: string;
  id: string | null;
}

type MutableArtifact = Record<string, unknown> & {
  artifact_type: string;
  id?: string;
  revision: number;
};

function idOf(artifact: { id?: string }): string | null {
  return artifact.id ?? null;
}

function segment(value: string | null): string {
  return value === null ? "__singleton__" : encodeURIComponent(value);
}

export class ArtifactStore {
  readonly root: string;
  readonly revisions: RevisionStore;
  readonly audit: AuditLog;

  constructor(options: ArtifactStoreOptions = {}) {
    this.root = options.root ?? ".spec-guard/";
    this.revisions = new RevisionStore(this.root);
    this.audit = new AuditLog(this.root);
  }

  currentPath(artifactType: string, id: string | null): string {
    return path.join(this.root, "artifacts", encodeURIComponent(artifactType), segment(id), "current.json");
  }

  async create<T extends MutableArtifact>(artifact: T): Promise<StoredArtifact<T>> {
    const nextArtifact = compactStoredArtifact({ ...artifact, revision: 1 } as T);
    const artifactType = nextArtifact.artifact_type;
    const id = idOf(nextArtifact);
    const currentPath = this.currentPath(artifactType, id);
    try {
      await access(currentPath);
      throw new Error(`artifact already exists: ${artifactType}/${id ?? "__singleton__"}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    validateCanonicalArtifactForWrite(nextArtifact);
    const projection = governedProjection(nextArtifact);
    const hash = governedContentHash(nextArtifact);
    const revisionRecord: RevisionRecord<typeof projection> = {
      artifact_type: artifactType,
      id,
      revision: 1,
      governed_content_hash: hash,
      governed_projection: projection
    };
    await this.revisions.writeRevision(revisionRecord);
    await mkdir(path.dirname(currentPath), { recursive: true });
    await writeFile(currentPath, `${canonicalJson(nextArtifact)}\n`, "utf8");
    return { artifact: nextArtifact, governed_content_hash: hash, revision: 1 };
  }

  async update<T extends MutableArtifact>(artifact: T): Promise<StoredArtifact<T>> {
    const nextArtifact = compactStoredArtifact({ ...artifact, revision: artifact.revision + 1 } as T);
    const artifactType = nextArtifact.artifact_type;
    const id = idOf(nextArtifact);
    validateCanonicalArtifactForWrite(nextArtifact);
    const projection = governedProjection(nextArtifact);
    const hash = governedContentHash(nextArtifact);
    const revisionRecord: RevisionRecord<typeof projection> = {
      artifact_type: artifactType,
      id,
      revision: nextArtifact.revision,
      governed_content_hash: hash,
      governed_projection: projection
    };
    await this.revisions.writeRevision(revisionRecord);
    const currentPath = this.currentPath(artifactType, id);
    await mkdir(path.dirname(currentPath), { recursive: true });
    await writeFile(currentPath, `${canonicalJson(nextArtifact)}\n`, "utf8");
    if (artifactType === "work_packet") await this.pruneDisposableWorkPacketRevisions(nextArtifact, id);
    return { artifact: nextArtifact, governed_content_hash: hash, revision: nextArtifact.revision };
  }

  // Retention (references-by-hash, Part C). Prune work-packet revisions that NO live decision references; keep
  // the current revision + every revision the lifecycle still reads. A work_packet revision is read when (a) a
  // lifecycle decision's source_artifact_refs include a work_packet self-ref at that revision (resolved during
  // readiness validation), or (b) a LEGACY ac_approval (no approved_content_hash) falls back to re-reading its
  // approved revision. Scoped to work_packet — runtime_baseline/source_artifact revisions are referenced
  // forever by immutable refs and are never pruned here.
  private async pruneDisposableWorkPacketRevisions<T extends MutableArtifact>(artifact: T, id: string | null): Promise<void> {
    const keep = new Set<number>([artifact.revision]);
    type LifecycleDecision = { source_artifact_refs?: Array<{ artifact_type?: string; revision?: number }>; approved_content_hash?: string | null; target_artifact_revision?: number | null };
    const lifecycle = (artifact as { lifecycle?: Record<string, unknown> }).lifecycle ?? {};
    for (const slot of ["ac_approval", "packet_approval", "authorization"] as const) {
      const decision = lifecycle[slot] as LifecycleDecision | null | undefined;
      if (decision === null || decision === undefined) continue;
      for (const ref of decision.source_artifact_refs ?? []) {
        if (ref.artifact_type === "work_packet" && typeof ref.revision === "number") keep.add(ref.revision);
      }
      if (slot === "ac_approval" && (decision.approved_content_hash === null || decision.approved_content_hash === undefined) && typeof decision.target_artifact_revision === "number") {
        keep.add(decision.target_artifact_revision);
      }
    }
    await this.revisions.pruneRevisionsExcept("work_packet", id, keep);
  }

  async readCurrent<T = unknown>(artifactType: string, id: string | null = null): Promise<StoredArtifact<T>> {
    const raw = await readFile(this.currentPath(artifactType, id), "utf8");
    const migration = migrateLoadedArtifact<T & { revision: number }>(JSON.parse(raw));
    const artifact = migration.artifact;
    const hash = governedContentHash(artifact);
    return { artifact: artifact as T, governed_content_hash: hash, revision: artifact.revision };
  }

  async readRevision<T = unknown>(artifactType: string, id: string | null, revision: number): Promise<RevisionRecord<T>> {
    return this.revisions.readRevision<T>(artifactType, id, revision);
  }

  async appendAudit<T>(artifactType: string, id: string | null, record: T, createdAt?: string): Promise<AuditRecord<T>> {
    return this.audit.append(artifactType, id, record, createdAt);
  }

  async readAudit<T = unknown>(artifactType: string, id: string | null): Promise<AuditRecord<T>[]> {
    return this.audit.readRecords<T>(artifactType, id);
  }

  async listCurrent<T = unknown>(): Promise<ArtifactListEntry<T>[]> {
    const artifactsRoot = path.join(this.root, "artifacts");
    let artifactTypes: string[];
    try {
      artifactTypes = await readdir(artifactsRoot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    const entries: ArtifactListEntry<T>[] = [];
    for (const encodedType of artifactTypes) {
      const artifactType = decodeURIComponent(encodedType);
      const typeDir = path.join(artifactsRoot, encodedType);
      const encodedIds = await readdir(typeDir);
      for (const encodedId of encodedIds) {
        const id = encodedId === "__singleton__" ? null : decodeURIComponent(encodedId);
        try {
          const current = await this.readCurrent<T>(artifactType, id);
          entries.push({ artifact_type: artifactType, id, ...current });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
    }
    return entries.sort((a, b) => `${a.artifact_type}:${a.id ?? ""}`.localeCompare(`${b.artifact_type}:${b.id ?? ""}`));
  }
}
