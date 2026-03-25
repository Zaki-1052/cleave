// frontend/src/hooks/useExperiments.ts
import { useQuery } from '@tanstack/react-query';
import * as experimentsApi from '@/api/experiments';

export function useExperiments(projectId?: number, page = 1, perPage = 25) {
  return useQuery({
    queryKey: ['experiments', { projectId, page, perPage }],
    queryFn: () => experimentsApi.getExperiments(projectId, page, perPage),
    enabled: projectId !== undefined,
  });
}

export function useExperiment(id: number) {
  return useQuery({
    queryKey: ['experiments', id],
    queryFn: () => experimentsApi.getExperiment(id),
    enabled: !!id,
  });
}
