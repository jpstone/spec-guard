import { LineageRecordRefSchema, type LineageRecordKind, type LineageRecordRef } from "./records.ts";

/** M5 anti-bloat: keep the latest compact lineage inline while the serialized WorkPacket stays under
 * a size/count budget; rotate older records to related artifacts, leaving stable refs inline. Moving
 * inline → rotated must not change a record's authoritative hash (the ref carries record_hash). */

export const DEFAULT_INLINE_MAX_BYTES = 128 * 1024;
export const DEFAULT_INLINE_MAX_REVIEW_CYCLES = 10;

export interface RotationThresholds {
  maxBytes: number;
  maxReviewCycles: number;
}

export const DEFAULT_ROTATION_THRESHOLDS: RotationThresholds = {
  maxBytes: DEFAULT_INLINE_MAX_BYTES,
  maxReviewCycles: DEFAULT_INLINE_MAX_REVIEW_CYCLES
};

/** One inline lineage entry, in chronological order (oldest first). */
export interface InlineLineageEntry {
  record_kind: LineageRecordKind;
  id: string;
  record_hash: string;
  serialized_bytes: number;
}

export interface LineageRotationPlan {
  inline: InlineLineageEntry[];
  rotate: InlineLineageEntry[];
}

/** Pure rotation policy: rotate the oldest entries until the inline set is under both the byte budget
 * and the review-cycle count, always keeping at least the newest record inline. */
export function planLineageRotation(entries: readonly InlineLineageEntry[], thresholds: RotationThresholds = DEFAULT_ROTATION_THRESHOLDS): LineageRotationPlan {
  const inline = [...entries];
  const rotate: InlineLineageEntry[] = [];
  const overBytes = (): boolean => inline.reduce((sum, entry) => sum + entry.serialized_bytes, 0) > thresholds.maxBytes;
  const overCycles = (): boolean => inline.filter((entry) => entry.record_kind === "review_cycle").length > thresholds.maxReviewCycles;
  while (inline.length > 1 && (overBytes() || overCycles())) {
    const oldest = inline.shift();
    if (oldest === undefined) break;
    rotate.push(oldest);
  }
  return { inline, rotate };
}

/** Build a stable ref for a rotated record, preserving its authoritative `record_hash` unchanged. */
export function buildLineageRecordRef(input: {
  record_kind: LineageRecordKind;
  id: string;
  record_hash: string;
  storage_ref: string;
  artifact_revision: number;
  artifact_hash: string;
}): LineageRecordRef {
  return LineageRecordRefSchema.parse(input);
}
