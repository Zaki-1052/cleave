// frontend/src/api/admin.ts
import client from './client';
import type { PaginatedResponse } from './types';

// ── Admin-specific types ──────────────────────────────────────────────────

export interface AdminUser {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  isSuperuser: boolean;
  isVerified: boolean;
  projectCount: number;
  createdAt: string;
}

export interface AdminUserUpdate {
  isSuperuser?: boolean;
  isActive?: boolean;
}

export interface AdminProject {
  id: number;
  name: string;
  description: string | null;
  createdBy: number | null;
  creatorEmail: string | null;
  storageBytes: number;
  isReference: boolean;
  status: string;
  memberCount: number;
  experimentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminJob {
  id: number;
  experimentId: number;
  experimentName: string;
  projectId: number;
  projectName: string;
  jobType: string;
  name: string;
  status: string;
  launchedBy: number | null;
  launcherEmail: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  createdAt: string;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalProjects: number;
  totalExperiments: number;
  totalJobs: number;
  jobsByStatus: Record<string, number>;
  storageUsedBytes: number;
  storageQuotaBytes: number;
  diskTotal: number;
  diskUsed: number;
  diskFree: number;
}

// ── API functions ─────────────────────────────────────────────────────────

export async function getAdminStats(): Promise<AdminStats> {
  const { data } = await client.get<AdminStats>('/admin/stats');
  return data;
}

export async function getAdminUsers(
  page = 1,
  perPage = 25,
  search?: string,
  role?: string,
  active?: string,
): Promise<PaginatedResponse<AdminUser>> {
  const { data } = await client.get<PaginatedResponse<AdminUser>>('/admin/users', {
    params: {
      page,
      perPage,
      ...(search && { search }),
      ...(role && { role }),
      ...(active && { active }),
    },
  });
  return data;
}

export async function updateAdminUser(
  userId: number,
  updates: AdminUserUpdate,
): Promise<AdminUser> {
  const { data } = await client.patch<AdminUser>(`/admin/users/${userId}`, updates);
  return data;
}

export async function getAdminProjects(
  page = 1,
  perPage = 25,
  search?: string,
): Promise<PaginatedResponse<AdminProject>> {
  const { data } = await client.get<PaginatedResponse<AdminProject>>('/admin/projects', {
    params: {
      page,
      perPage,
      ...(search && { search }),
    },
  });
  return data;
}

export async function deleteAdminProject(projectId: number): Promise<void> {
  await client.delete(`/admin/projects/${projectId}`);
}

export async function getAdminJobs(
  page = 1,
  perPage = 25,
  search?: string,
  status?: string,
): Promise<PaginatedResponse<AdminJob>> {
  const { data } = await client.get<PaginatedResponse<AdminJob>>('/admin/jobs', {
    params: {
      page,
      perPage,
      ...(search && { search }),
      ...(status && { status }),
    },
  });
  return data;
}

export async function terminateAdminJob(jobId: number): Promise<AdminJob> {
  const { data } = await client.post<AdminJob>(`/admin/jobs/${jobId}/terminate`);
  return data;
}

export async function triggerCleanup(): Promise<Record<string, unknown>> {
  const { data } = await client.post<Record<string, unknown>>('/admin/cleanup');
  return data;
}
