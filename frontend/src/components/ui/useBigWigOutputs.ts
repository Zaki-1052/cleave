// frontend/src/components/ui/useBigWigOutputs.ts
import { useJobOutputs } from '@/hooks/useJobs';
import type { JobOutput } from '@/api/types';
import type { BigWigSourceType } from '@/lib/bigwig-utils';

/**
 * Hook to resolve bigWig outputs based on the selected source.
 * Returns the appropriate outputs for building sample arrays.
 */
export function useBigWigOutputs(
  bigwigSource: BigWigSourceType,
  selectedAlignmentJobId: number | null,
  selectedNormalizationJobId: number | null,
): { data: JobOutput[] | undefined; fileCategory: 'bigwig' | 'normalization_bigwig' } {
  const alignmentOutputs = useJobOutputs(
    bigwigSource === 'alignment' ? selectedAlignmentJobId : null,
    'bigwig',
  );
  const normalizationOutputs = useJobOutputs(
    bigwigSource === 'normalization' ? selectedNormalizationJobId : null,
    'normalization_bigwig',
  );

  if (bigwigSource === 'normalization') {
    return { data: normalizationOutputs.data, fileCategory: 'normalization_bigwig' };
  }
  return { data: alignmentOutputs.data, fileCategory: 'bigwig' };
}
