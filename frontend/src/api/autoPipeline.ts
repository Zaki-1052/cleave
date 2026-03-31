// frontend/src/api/autoPipeline.ts
import client from './client';
import type { AnalysisJob } from './types';

export interface AutoPipelineConfig {
  referenceGenome: string;
  peakCaller?: string;
  peakSize?: string;
  macs2Qvalue?: number;
  fragmentFilter?: boolean;
  includeNormalization?: boolean;
  includeDiffbind?: boolean;
  includeHeatmap?: boolean;
  includePearson?: boolean;
}

export async function startAutoPipeline(
  experimentId: number,
  config: AutoPipelineConfig,
): Promise<{ status: string }> {
  const { data } = await client.post(
    `/experiments/${experimentId}/auto-pipeline`,
    config,
  );
  return data;
}

export async function cancelAutoPipeline(
  experimentId: number,
): Promise<{ status: string }> {
  const { data } = await client.post(
    `/experiments/${experimentId}/auto-pipeline/cancel`,
  );
  return data;
}

export async function dismissAutoPipeline(
  experimentId: number,
): Promise<{ status: string }> {
  const { data } = await client.post(
    `/experiments/${experimentId}/auto-pipeline/dismiss`,
  );
  return data;
}

export async function retryAutoPipeline(
  experimentId: number,
): Promise<AnalysisJob> {
  const { data } = await client.post(
    `/experiments/${experimentId}/auto-pipeline/retry`,
  );
  return data;
}
