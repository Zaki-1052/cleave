// frontend/src/api/projects.ts
import client from './client';
import type { Member, PaginatedResponse, Project } from './types';

export async function getProjects(
  page = 1,
  perPage = 25,
): Promise<PaginatedResponse<Project>> {
  const { data } = await client.get<PaginatedResponse<Project>>('/projects', {
    params: { page, perPage },
  });
  return data;
}

export async function createProject(name: string, description?: string): Promise<Project> {
  const { data } = await client.post<Project>('/projects', { name, description });
  return data;
}

export async function getProject(id: number): Promise<Project> {
  const { data } = await client.get<Project>(`/projects/${id}`);
  return data;
}

export async function updateProject(
  id: number,
  updates: { name?: string; description?: string },
): Promise<Project> {
  const { data } = await client.patch<Project>(`/projects/${id}`, updates);
  return data;
}

export async function deleteProject(id: number): Promise<void> {
  await client.delete(`/projects/${id}`);
}

export async function getMembers(projectId: number): Promise<Member[]> {
  const { data } = await client.get<Member[]>(`/projects/${projectId}/members`);
  return data;
}

export async function addMember(
  projectId: number,
  email: string,
  role: string,
): Promise<Member> {
  const { data } = await client.post<Member>(`/projects/${projectId}/members`, {
    email,
    role,
  });
  return data;
}

export async function updateMemberRole(
  projectId: number,
  userId: number,
  role: string,
): Promise<Member> {
  const { data } = await client.patch<Member>(
    `/projects/${projectId}/members/${userId}`,
    { role },
  );
  return data;
}

export async function removeMember(
  projectId: number,
  userId: number,
): Promise<void> {
  await client.delete(`/projects/${projectId}/members/${userId}`);
}

export interface StorageInfo {
  quotaBytes: number;
  disk: { total: number; used: number; free: number };
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const { data } = await client.get<StorageInfo>('/admin/storage-info');
  return data;
}
