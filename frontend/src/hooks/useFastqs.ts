// frontend/src/hooks/useFastqs.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as fastqsApi from '@/api/fastqs';

export function useFastqs(experimentId: number, page = 1, perPage = 25) {
  return useQuery({
    queryKey: ['fastqs', experimentId, { page, perPage }],
    queryFn: () => fastqsApi.getFastqs(experimentId, page, perPage),
    enabled: !!experimentId,
  });
}

export function useUploadFastqs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      experimentId,
      files,
      onProgress,
    }: {
      experimentId: number;
      files: File[];
      onProgress?: (percent: number) => void;
    }) => fastqsApi.uploadFastqs(experimentId, files, onProgress),
    onSuccess: (_, { experimentId }) => {
      void queryClient.invalidateQueries({ queryKey: ['fastqs', experimentId] });
      void queryClient.invalidateQueries({ queryKey: ['experiments'] });
    },
  });
}

export function useDeleteFastq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      experimentId,
      fastqId,
    }: {
      experimentId: number;
      fastqId: number;
    }) => fastqsApi.deleteFastq(experimentId, fastqId),
    onSuccess: (_, { experimentId }) => {
      void queryClient.invalidateQueries({ queryKey: ['fastqs', experimentId] });
      void queryClient.invalidateQueries({ queryKey: ['experiments'] });
    },
  });
}
