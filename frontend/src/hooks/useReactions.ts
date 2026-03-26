// frontend/src/hooks/useReactions.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as reactionsApi from '@/api/reactions';
import type { ReactionCreatePayload, ReactionUpdatePayload } from '@/api/types';

export function useReactions(experimentId: number, page = 1, perPage = 100) {
  return useQuery({
    queryKey: ['reactions', experimentId, { page, perPage }],
    queryFn: () => reactionsApi.getReactions(experimentId, page, perPage),
    enabled: !!experimentId,
  });
}

export function usePrefixes(experimentId: number) {
  return useQuery({
    queryKey: ['prefixes', experimentId],
    queryFn: () => reactionsApi.getPrefixes(experimentId),
    enabled: !!experimentId,
  });
}

export function useCreateReaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      experimentId,
      data,
    }: {
      experimentId: number;
      data: ReactionCreatePayload;
    }) => reactionsApi.createReaction(experimentId, data),
    onSuccess: (_, { experimentId }) => {
      void queryClient.invalidateQueries({ queryKey: ['reactions', experimentId] });
    },
  });
}

export function useBulkCreateReactions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      experimentId,
      reactions,
    }: {
      experimentId: number;
      reactions: ReactionCreatePayload[];
    }) => reactionsApi.bulkCreateReactions(experimentId, reactions),
    onSuccess: (_, { experimentId }) => {
      void queryClient.invalidateQueries({ queryKey: ['reactions', experimentId] });
    },
  });
}

export function useImportReactionsCsv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      experimentId,
      file,
    }: {
      experimentId: number;
      file: File;
    }) => reactionsApi.importReactionsCsv(experimentId, file),
    onSuccess: (_, { experimentId }) => {
      void queryClient.invalidateQueries({ queryKey: ['reactions', experimentId] });
    },
  });
}

export function useUpdateReaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      experimentId,
      reactionId,
      data,
    }: {
      experimentId: number;
      reactionId: number;
      data: ReactionUpdatePayload;
    }) => reactionsApi.updateReaction(experimentId, reactionId, data),
    onSuccess: (_, { experimentId }) => {
      void queryClient.invalidateQueries({ queryKey: ['reactions', experimentId] });
    },
  });
}

export function useDeleteReaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      experimentId,
      reactionId,
    }: {
      experimentId: number;
      reactionId: number;
    }) => reactionsApi.deleteReaction(experimentId, reactionId),
    onSuccess: (_, { experimentId }) => {
      void queryClient.invalidateQueries({ queryKey: ['reactions', experimentId] });
    },
  });
}
