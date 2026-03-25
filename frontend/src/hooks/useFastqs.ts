// frontend/src/hooks/useFastqs.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as fastqsApi from '@/api/fastqs';

export function useFastqs(experimentId: number, page = 1, perPage = 25) {
  return useQuery({
    queryKey: ['fastqs', experimentId, { page, perPage }],
    queryFn: () => fastqsApi.getFastqs(experimentId, page, perPage),
    enabled: !!experimentId,
    // Poll every 5s while any file is still pending FastQC
    refetchInterval: (query) => {
      const items = query.state.data?.items;
      if (items?.some((f) => f.totalReads === null)) {
        return 5000;
      }
      return false;
    },
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

export function useFastqcSummary(experimentId: number, fastqId: number | null) {
  return useQuery({
    queryKey: ['fastqc-summary', experimentId, fastqId],
    queryFn: () => fastqsApi.getFastqcSummary(experimentId, fastqId!),
    enabled: fastqId !== null,
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
