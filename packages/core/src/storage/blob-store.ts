import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256LowerHex } from "../canonical/hashes.ts";

export interface BlobRef {
  algorithm: "sha256";
  hash: string;
  path: string;
}

export class BlobStore {
  private readonly root: string;

  constructor(root: string = ".spec-guard/") {
    this.root = root;
  }

  private blobPath(hash: string): string {
    return path.join(this.root, "blobs", hash.slice(0, 2), hash);
  }

  async put(bytes: string | Buffer | Uint8Array): Promise<BlobRef> {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const hash = sha256LowerHex(buffer);
    const blobPath = this.blobPath(hash);
    await mkdir(path.dirname(blobPath), { recursive: true });
    await writeFile(blobPath, buffer);
    return { algorithm: "sha256", hash, path: blobPath };
  }

  async get(hash: string): Promise<Buffer> {
    return readFile(this.blobPath(hash));
  }
}
