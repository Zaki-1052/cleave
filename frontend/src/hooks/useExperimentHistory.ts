// frontend/src/hooks/useExperimentHistory.ts
import { useQuery } from '@tanstack/react-query';
import { listExperimentHistory } from '@/api/experimentEvents';

export function useExperimentHistory(
  experimentId: number,
  page = 1,
  perPage = 25,
) {
  return useQuery({
    queryKey: ['experiment-history', experimentId, { page, perPage }],
    queryFn: () => listExperimentHistory(experimentId, page, perPage),
    enabled: !!experimentId,
  });
}
