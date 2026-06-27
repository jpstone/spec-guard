import { access, mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "../canonical/canonical-json.ts";

export interface RevisionRecord<T = unknown> {
  artifact_type: string;
  id: string | null;
  revision: number;
  governed_content_hash: string;
  governed_projection: T;
}

function segment(value: string | null): string {
  return value === null ? "__singleton__" : encodeURIComponent(value);
}

export class RevisionStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  revisionPath(artifactType: string, id: string | null, revision: number): string {
    return path.join(this.root, "artifacts", encodeURIComponent(artifactType), segment(id), "revisions", `${revision}.json`);
  }

  async writeRevision<T>(record: RevisionRecord<T>): Promise<void> {
    const filePath = this.revisionPath(record.artifact_type, record.id, record.revision);
    try {
      await access(filePath);
      throw new Error(`revision already exists: ${record.artifact_type}/${record.id ?? "__singleton__"}@${record.revision}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${canonicalJson(record)}\n`, "utf8");
  }

  async readRevision<T = unknown>(artifactType: string, id: string | null, revision: number): Promise<RevisionRecord<T>> {
    const raw = await readFile(this.revisionPath(artifactType, id, revision), "utf8");
    return JSON.parse(raw) as RevisionRecord<T>;
  }

  // Retention (references-by-hash, Part C): delete revisions/N.json whose revision number is NOT in `keep`.
  // Best-effort + race-tolerant — only ever called for old revisions well below the one just written, and the
  // caller always keeps `current` + any revision a live decision still references. Tolerates a missing dir and
  // unlink failures (a concurrent writer only ever creates a NEW revision, never an old one).
  async pruneRevisionsExcept(artifactType: string, id: string | null, keep: ReadonlySet<number>): Promise<void> {
    const dir = path.join(this.root, "artifacts", encodeURIComponent(artifactType), segment(id), "revisions");
    let entries: string[];
    try { entries = await readdir(dir); } catch { return; }
    await Promise.all(entries.map(async (entry) => {
      const match = /^(\d+)\.json$/.exec(entry);
      if (match === null || keep.has(Number(match[1]))) return;
      try { await rm(path.join(dir, entry), { force: true }); } catch { /* race-tolerant */ }
    }));
  }
}
