// frontend/src/api/experiments.ts
import client from './client';
import type { Experiment, PaginatedResponse } from './types';

export async function getExperiments(
  projectId?: number,
  page = 1,
  perPage = 25,
): Promise<PaginatedResponse<Experiment>> {
  const { data } = await client.get<PaginatedResponse<Experiment>>('/experiments', {
    params: { projectId, page, perPage },
  });
  return data;
}

export async function createExperiment(
  projectId: number,
  name: string,
  assayType: string,
  description?: string,
): Promise<Experiment> {
  const { data } = await client.post<Experiment>('/experiments', {
    name,
    assayType,
    description,
  }, {
    params: { projectId },
  });
  return data;
}

export async function getExperiment(id: number): Promise<Experiment> {
  const { data } = await client.get<Experiment>(`/experiments/${id}`);
  return data;
}

export async function updateExperiment(
  id: number,
  updates: { name?: string; description?: string; assayType?: string },
): Promise<Experiment> {
  const { data } = await client.patch<Experiment>(`/experiments/${id}`, updates);
  return data;
}

export async function deleteExperiment(id: number): Promise<void> {
  await client.delete(`/experiments/${id}`);
}
