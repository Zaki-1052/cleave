// frontend/src/api/experimentEvents.ts
import client from './client';
import type { ExperimentEvent, PaginatedResponse } from './types';

export async function listExperimentHistory(
  experimentId: number,
  page = 1,
  perPage = 25,
): Promise<PaginatedResponse<ExperimentEvent>> {
  const { data } = await client.get<PaginatedResponse<ExperimentEvent>>(
    `/experiments/${experimentId}/history`,
    { params: { page, perPage } },
  );
  return data;
}
