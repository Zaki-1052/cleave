// frontend/src/hooks/useLocalImport.ts
import { useMutation, useQuery } from '@tanstack/react-query';
import * as api from '@/api/localImport';

export function useLocalBrowse() {
  return useMutation({
    mutationFn: ({
      experimentId,
      req,
    }: {
      experimentId: number;
      req: api.LocalBrowseRequest;
    }) => api.browseLocal(experimentId, req),
  });
}

export function useLocalImportStart() {
  return useMutation({
    mutationFn: ({
      experimentId,
      req,
    }: {
      experimentId: number;
      req: api.LocalImportRequest;
    }) => api.startLocalImport(experimentId, req),
  });
}

export function useLocalImportProgress(
  experimentId: number,
  importId: string | null,
) {
  return useQuery({
    queryKey: ['local-import', importId],
    queryFn: () => api.getLocalImportProgress(experimentId, importId!),
    enabled: importId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'connecting' || status === 'downloading') return 3000;
      return false;
    },
  });
}
