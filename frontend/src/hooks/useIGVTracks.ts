// frontend/src/hooks/useIGVTracks.ts
import { useQuery } from '@tanstack/react-query';
import { getIGVTokens } from '@/api/files';

const TOKEN_STALE_MS = 45 * 60 * 1000; // 45 minutes
const TOKEN_REFETCH_MS = 50 * 60 * 1000; // 50 minutes (active timer)

/**
 * Fetches signed IGV file-serving URLs for the given job outputs.
 * Tokens are 60-min TTL; refetchInterval actively refreshes at 50 min
 * to prevent silent failures during long IGV browsing sessions.
 */
export function useIGVTracks(jobId: number | null, outputIds: number[]) {
  const sortedIds = [...outputIds].sort((a, b) => a - b);

  return useQuery({
    queryKey: ['igv-tokens', jobId, ...sortedIds],
    queryFn: () => getIGVTokens(jobId!, sortedIds),
    enabled: jobId !== null && sortedIds.length > 0,
    staleTime: TOKEN_STALE_MS,
    refetchInterval: TOKEN_REFETCH_MS,
  });
}
