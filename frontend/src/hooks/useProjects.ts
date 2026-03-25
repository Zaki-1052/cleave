// frontend/src/hooks/useProjects.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as projectsApi from '@/api/projects';

export function useProjects(page = 1, perPage = 25) {
  return useQuery({
    queryKey: ['projects', page, perPage],
    queryFn: () => projectsApi.getProjects(page, perPage),
  });
}

export function useProject(id: number) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => projectsApi.getProject(id),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) =>
      projectsApi.createProject(name, description),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => projectsApi.deleteProject(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useMembers(projectId: number) {
  return useQuery({
    queryKey: ['projects', projectId, 'members'],
    queryFn: () => projectsApi.getMembers(projectId),
    enabled: !!projectId,
  });
}

export function useAddMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      email,
      role,
    }: {
      projectId: number;
      email: string;
      role: string;
    }) => projectsApi.addMember(projectId, email, role),
    onSuccess: (_, { projectId }) => {
      void queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'members'],
      });
    },
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      userId,
      role,
    }: {
      projectId: number;
      userId: number;
      role: string;
    }) => projectsApi.updateMemberRole(projectId, userId, role),
    onSuccess: (_, { projectId }) => {
      void queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'members'],
      });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      userId,
    }: {
      projectId: number;
      userId: number;
    }) => projectsApi.removeMember(projectId, userId),
    onSuccess: (_, { projectId }) => {
      void queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'members'],
      });
    },
  });
}
