// frontend/src/api/reactions.ts
import client from './client';
import type {
  CsvImportResponse,
  PaginatedResponse,
  PrefixInfo,
  Reaction,
  ReactionCreatePayload,
  ReactionUpdatePayload,
} from './types';

export async function getReactions(
  experimentId: number,
  page = 1,
  perPage = 100,
): Promise<PaginatedResponse<Reaction>> {
  const { data } = await client.get<PaginatedResponse<Reaction>>(
    `/experiments/${experimentId}/reactions`,
    { params: { page, perPage } },
  );
  return data;
}

export async function createReaction(
  experimentId: number,
  payload: ReactionCreatePayload,
): Promise<Reaction> {
  const { data } = await client.post<Reaction>(
    `/experiments/${experimentId}/reactions`,
    payload,
  );
  return data;
}

export async function bulkCreateReactions(
  experimentId: number,
  reactions: ReactionCreatePayload[],
): Promise<CsvImportResponse> {
  const { data } = await client.post<CsvImportResponse>(
    `/experiments/${experimentId}/reactions/bulk`,
    { reactions },
  );
  return data;
}

export async function importReactionsCsv(
  experimentId: number,
  file: File,
): Promise<CsvImportResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await client.post<CsvImportResponse>(
    `/experiments/${experimentId}/reactions/import-csv`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

export async function downloadTemplate(experimentId: number): Promise<void> {
  const { data } = await client.get(`/experiments/${experimentId}/reactions/template`, {
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'reaction_template.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function getPrefixes(experimentId: number): Promise<PrefixInfo[]> {
  const { data } = await client.get<PrefixInfo[]>(
    `/experiments/${experimentId}/reactions/prefixes`,
  );
  return data;
}

export async function updateReaction(
  experimentId: number,
  reactionId: number,
  payload: ReactionUpdatePayload,
): Promise<Reaction> {
  const { data } = await client.patch<Reaction>(
    `/experiments/${experimentId}/reactions/${reactionId}`,
    payload,
  );
  return data;
}

export async function deleteReaction(
  experimentId: number,
  reactionId: number,
): Promise<void> {
  await client.delete(`/experiments/${experimentId}/reactions/${reactionId}`);
}
