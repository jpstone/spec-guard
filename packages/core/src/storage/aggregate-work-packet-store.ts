import { access, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "../canonical/canonical-json.ts";
import { AggregateWorkPacketSchema, type AggregateWorkPacket } from "../schemas/work-packet.ts";

/**
 * v2 aggregate persistence (WORK_PACKET_AGGREGATE_V2_DESIGN.md §2): ONE canonical-JSON document per Work Packet
 * at `<root>/packets/<url-encoded-id>.json`, committed to git (clone-resumable). Plain text, NO `revisions/`
 * sidecar — the document IS the live state and git history is the revision history; the bytes are canonical so
 * diffs/merges are stable and the file stays cat/jq-debuggable.
 *
 * ADDITIVE: a standalone store, not yet wired into the action layer (the v1 many-file ArtifactStore is still
 * authoritative). A later increment puts the scoped `WorkPacketStore` interface on top of this.
 */
export class AggregateWorkPacketStore {
  readonly root: string;
  constructor(root = ".spec-guard/") {
    this.root = root;
  }

  /** `<root>/packets/<url-encoded-id>.json` (the id is encoded the same way ArtifactStore encodes path segments). */
  packetPath(id: string): string {
    return path.join(this.root, "packets", `${encodeURIComponent(id)}.json`);
  }

  /** Create a NEW Work Packet document (revision forced to 1); throws if one already exists for this id. */
  async create(packet: AggregateWorkPacket): Promise<AggregateWorkPacket> {
    const next = AggregateWorkPacketSchema.parse({ ...packet, revision: 1 });
    const file = this.packetPath(next.id);
    try {
      await access(file);
      throw new Error(`work packet already exists: ${next.id}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await this.write(file, next);
    return next;
  }

  /** Read + parse the Work Packet document; throws `work packet not found: <id>` if missing. */
  async read(id: string): Promise<AggregateWorkPacket> {
    let raw: string;
    try {
      raw = await readFile(this.packetPath(id), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`work packet not found: ${id}`);
      throw error;
    }
    return AggregateWorkPacketSchema.parse(JSON.parse(raw));
  }

  /** Read the Work Packet document, or null if it does not exist. */
  async tryRead(id: string): Promise<AggregateWorkPacket | null> {
    try {
      return await this.read(id);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("work packet not found:")) return null;
      throw error;
    }
  }

  /** Persist a full Work Packet candidate. Bumps revision from the ON-DISK base and pins immutable lineage
   *  (id / created_at / artifact_type / schema_version) from it, so a stray field on the candidate can't clobber
   *  identity or corrupt the revision chain. Throws if the Work Packet does not already exist. */
  async update(packet: AggregateWorkPacket): Promise<AggregateWorkPacket> {
    const base = await this.read(packet.id);
    const next = AggregateWorkPacketSchema.parse({
      ...packet,
      id: base.id,
      artifact_type: base.artifact_type,
      schema_version: base.schema_version,
      created_at: base.created_at,
      revision: base.revision + 1,
      updated_at: new Date().toISOString()
    });
    await this.write(this.packetPath(next.id), next);
    return next;
  }

  /** Ids of every persisted Work Packet (decoded from the `packets/` filenames), sorted. */
  async list(): Promise<string[]> {
    let entries: string[];
    try {
      entries = await readdir(path.join(this.root, "packets"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return entries
      .filter((name) => name.endsWith(".json"))
      .map((name) => decodeURIComponent(name.slice(0, -".json".length)))
      .sort();
  }

  // Write-temp-then-rename so a crash mid-write can't leave a torn/truncated document (the aggregate is the
  // WHOLE Work Packet in one file). rename is atomic on POSIX and replaces-existing on Windows (MoveFileEx).
  // NOTE: this guards against torn writes, NOT concurrent lost updates — a single-writer-per-document lock is a
  // separate gated sub-project (design Sanity-review #4); it matters once the live action flow does
  // read-modify-write on these files.
  private async write(file: string, packet: AggregateWorkPacket): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, `${canonicalJson(packet)}\n`, "utf8");
    await rename(tmp, file);
  }
}
