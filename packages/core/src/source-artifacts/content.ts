import { Buffer } from "node:buffer";
import { canonicalJson, canonicalJsonBytes } from "../canonical/canonical-json.ts";
import { sha256LowerHex } from "../canonical/hashes.ts";
import { BlobStore } from "../storage/blob-store.ts";
import type { JsonValue } from "../schemas/embedded.ts";

export type DescriptorValue = Record<string, JsonValue>;

export interface SourceContentMaterialization {
  content_hash: string;
  content_ref: string;
  descriptor: DescriptorValue | null;
}

function hasBytes(input: { content_bytes_base64?: string | null | undefined }): boolean {
  return input.content_bytes_base64 !== undefined && input.content_bytes_base64 !== null;
}

function hasDescriptor(input: { descriptor?: DescriptorValue | null | undefined }): boolean {
  return input.descriptor !== undefined && input.descriptor !== null;
}

export async function materializeSourceArtifactContent(
  input: { content_bytes_base64?: string | null | undefined; descriptor?: DescriptorValue | null | undefined; content_hash?: string | null | undefined },
  artifactRoot: string
): Promise<SourceContentMaterialization> {
  const bytesPresent = hasBytes(input);
  const descriptorPresent = hasDescriptor(input);
  if (bytesPresent === descriptorPresent) {
    throw new Error("source artifact content requires exactly one of content_bytes_base64 or descriptor");
  }
  const blobs = new BlobStore(artifactRoot);
  if (bytesPresent) {
    const decoded = Buffer.from(input.content_bytes_base64 as string, "base64");
    const hash = sha256LowerHex(decoded);
    await blobs.put(decoded);
    return { content_hash: hash, content_ref: `blob:sha256:${hash}`, descriptor: null };
  }

  const descriptor = input.descriptor as DescriptorValue;
  const canonicalBytes = canonicalJsonBytes(descriptor);
  const hash = sha256LowerHex(canonicalBytes);
  // content_hash is DERIVED from the canonical descriptor — the system computes it. Any value the caller
  // supplies is advisory and simply ignored (do NOT reject on mismatch): registration shouldn't fail because
  // the agent guessed a hash (e.g. the file's byte hash) for a value the tool already owns. The content_hash
  // binds integrity only at REFERENCE time (resolveSourceArtifactRef), where it is checked. ("compute, don't demand".)
  await blobs.put(canonicalJson(descriptor));
  return { content_hash: hash, content_ref: `descriptor:sha256:${hash}`, descriptor };
}
