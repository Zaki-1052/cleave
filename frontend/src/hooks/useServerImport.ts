// frontend/src/hooks/useServerImport.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@/api/serverImport';

export function useServerBrowse() {
  return useMutation({
    mutationFn: ({
      experimentId,
      req,
    }: {
      experimentId: number;
      req: api.ServerConnectRequest;
    }) => api.browseServer(experimentId, req),
  });
}

export function useServerImportStart() {
  return useMutation({
    mutationFn: ({
      experimentId,
      req,
    }: {
      experimentId: number;
      req: api.ServerImportRequest;
    }) => api.startImport(experimentId, req),
  });
}

export function useImportProgress(
  experimentId: number,
  importId: string | null,
) {
  return useQuery({
    queryKey: ['server-import', importId],
    queryFn: () => api.getImportProgress(experimentId, importId!),
    enabled: importId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'connecting' || status === 'downloading') return 3000;
      return false;
    },
  });
}

export function useSavedServers() {
  return useQuery({
    queryKey: ['saved-servers'],
    queryFn: api.listSavedServers,
  });
}

export function useCreateSavedServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: api.SavedServerCreate) => api.createSavedServer(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['saved-servers'] });
    },
  });
}

export function useDeleteSavedServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (serverId: number) => api.deleteSavedServer(serverId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['saved-servers'] });
    },
  });
}
