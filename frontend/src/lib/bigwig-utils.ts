// frontend/src/lib/bigwig-utils.ts
import type { JobOutput } from '@/api/types';

/**
 * Resolve the bigWig file path for a reaction from job outputs.
 * Supports both alignment bigWigs (file_category='bigwig') and
 * Roman-normalized bigWigs (file_category='normalization_bigwig').
 */
export function resolveReactionBigwig(
  reactionId: number,
  outputs: JobOutput[],
  fileCategory: 'bigwig' | 'normalization_bigwig' = 'bigwig',
): string {
  const bw = outputs.find(
    (o) =>
      o.reactionId === reactionId &&
      o.fileCategory === fileCategory &&
      o.fileType === 'bw',
  );
  return bw?.filePath ?? '';
}

export type BigWigSourceType = 'normalization' | 'alignment';
