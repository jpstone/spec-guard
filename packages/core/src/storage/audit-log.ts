import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "../canonical/canonical-json.ts";

export interface AuditRecord<T = unknown> {
  audit_revision: number;
  artifact_type: string;
  id: string | null;
  created_at: string;
  record: T;
}

function segment(value: string | null): string {
  return value === null ? "__singleton__" : encodeURIComponent(value);
}

export class AuditLog {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  logPath(artifactType: string, id: string | null): string {
    return path.join(this.root, "audit", encodeURIComponent(artifactType), segment(id), "audit.jsonl");
  }

  async readRecords<T = unknown>(artifactType: string, id: string | null): Promise<AuditRecord<T>[]> {
    try {
      const raw = await readFile(this.logPath(artifactType, id), "utf8");
      return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line) as AuditRecord<T>);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async append<T>(artifactType: string, id: string | null, record: T, createdAt = new Date().toISOString()): Promise<AuditRecord<T>> {
    const existing = await this.readRecords(artifactType, id);
    const auditRecord: AuditRecord<T> = {
      audit_revision: existing.length + 1,
      artifact_type: artifactType,
      id,
      created_at: createdAt,
      record
    };
    const filePath = this.logPath(artifactType, id);
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, `${canonicalJson(auditRecord)}\n`, "utf8");
    return auditRecord;
  }
}
