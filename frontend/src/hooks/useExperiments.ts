// frontend/src/hooks/useExperiments.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export function useCreateExperiment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      name,
      assayType,
      description,
    }: {
      projectId: number;
      name: string;
      assayType: string;
      description?: string;
    }) => experimentsApi.createExperiment(projectId, name, assayType, description),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['experiments'] });
    },
  });
}

export function useUpdateExperiment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: number;
      updates: { name?: string; description?: string; assayType?: string };
    }) => experimentsApi.updateExperiment(id, updates),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['experiments'] });
      void queryClient.invalidateQueries({ queryKey: ['experiments', data.id] });
    },
  });
}

export function useDeleteExperiment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => experimentsApi.deleteExperiment(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['experiments'] });
    },
  });
}
