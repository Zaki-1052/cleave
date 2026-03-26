// frontend/src/hooks/useFiles.ts
import { useQuery } from '@tanstack/react-query';
import * as filesApi from '@/api/files';

export function useExperimentFiles(experimentId: number) {
  return useQuery({
    queryKey: ['experiment-files', experimentId],
    queryFn: () => filesApi.getExperimentFiles(experimentId),
    enabled: !!experimentId,
    staleTime: 30_000,
  });
}
