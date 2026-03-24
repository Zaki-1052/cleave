// frontend/src/api/projects.ts
import client from './client';
import type { PaginatedResponse, Project } from './types';

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
