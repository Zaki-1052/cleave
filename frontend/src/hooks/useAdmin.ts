// frontend/src/hooks/useAdmin.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as adminApi from '@/api/admin';
import type { AdminUserUpdate } from '@/api/admin';

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => adminApi.getAdminStats(),
    staleTime: 30_000,
  });
}

export function useAdminUsers(
  page: number,
  perPage: number,
  search?: string,
  role?: string,
  active?: string,
) {
  return useQuery({
    queryKey: ['admin', 'users', { page, perPage, search, role, active }],
    queryFn: () => adminApi.getAdminUsers(page, perPage, search, role, active),
  });
}

export function useUpdateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, updates }: { userId: number; updates: AdminUserUpdate }) =>
      adminApi.updateAdminUser(userId, updates),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}

export function useAdminProjects(page: number, perPage: number, search?: string) {
  return useQuery({
    queryKey: ['admin', 'projects', { page, perPage, search }],
    queryFn: () => adminApi.getAdminProjects(page, perPage, search),
  });
}

export function useDeleteAdminProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: number) => adminApi.deleteAdminProject(projectId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'projects'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}

export function useAdminJobs(
  page: number,
  perPage: number,
  search?: string,
  status?: string,
) {
  return useQuery({
    queryKey: ['admin', 'jobs', { page, perPage, search, status }],
    queryFn: () => adminApi.getAdminJobs(page, perPage, search, status),
  });
}

export function useTerminateAdminJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: number) => adminApi.terminateAdminJob(jobId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'jobs'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}

export function useTriggerCleanup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => adminApi.triggerCleanup(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}
