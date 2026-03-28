// frontend/src/components/custom-heatmap/SelectSamplesStep.tsx
import { useState } from 'react';
import { Card } from '@/components/layout/Card';
import { useJobs, useJobOutputs } from '@/hooks/useJobs';
import type { AnalysisJob, Experiment, JobOutput } from '@/api/types';
import type { HeatmapSample } from './NewCustomHeatmapWizard';

interface SelectSamplesStepProps {
  experiment: Experiment;
  alignmentJobId: number | null;
  reactions: { reaction_id: number; short_name: string }[];
  alignmentOutputs: JobOutput[];
  samples: HeatmapSample[];
  setSamples: (samples: HeatmapSample[]) => void;
  bedSource: 'peak_calling' | 'upload';
  setBedSource: (source: 'peak_calling' | 'upload') => void;
  bedPath: string;
  setBedPath: (path: string) => void;
  bedLabel: string;
  setBedLabel: (label: string) => void;
  bedOutputId: number | null;
  setBedOutputId: (id: number | null) => void;
  bedUploading: boolean;
  onBedUpload: (file: File) => void;
}

function resolveReactionBigwig(reactionId: number, outputs: JobOutput[]): string {
  const bw = outputs.find(
    (o) => o.reactionId === reactionId && o.fileCategory === 'bigwig' && o.fileType === 'bw',
  );
  return bw?.filePath ?? '';
}

export function SelectSamplesStep({
  experiment,
  reactions,
  alignmentOutputs,
  samples,
  setSamples,
  bedSource,
  setBedSource,
  bedPath,
  setBedPath,
  bedLabel,
  setBedLabel,
  bedOutputId,
  setBedOutputId,
  bedUploading,
  onBedUpload,
}: SelectSamplesStepProps) {
  // Fetch peak calling jobs for BED file selection
  const { data: jobsData } = useJobs(experiment.id, 1, 100);
  const peakCallingJobs = (jobsData?.items ?? []).filter(
    (j: AnalysisJob) => j.jobType === 'peak_calling' && j.status === 'complete',
  );

  // If a peak calling job is selected for BED source, fetch its BED outputs
  const [selectedPeakJobId, setSelectedPeakJobId] = useState<number | null>(null);
  const { data: peakOutputs } = useJobOutputs(selectedPeakJobId, 'bed');
  const bedOutputs: JobOutput[] = peakOutputs ?? [];

  function toggleReaction(reactionId: number, shortName: string) {
    const exists = samples.find((s) => s.reactionId === reactionId);
    if (exists) {
      setSamples(samples.filter((s) => s.reactionId !== reactionId));
    } else {
      setSamples([
        ...samples,
        {
          reactionId,
          shortName,
          label: shortName,
          bigwigPath: resolveReactionBigwig(reactionId, alignmentOutputs),
        },
      ]);
    }
  }

  function toggleAll() {
    if (samples.length === reactions.length) {
      setSamples([]);
    } else {
      setSamples(
        reactions.map((r) => ({
          reactionId: r.reaction_id,
          shortName: r.short_name,
          label: r.short_name,
          bigwigPath: resolveReactionBigwig(r.reaction_id, alignmentOutputs),
        })),
      );
    }
  }

  function updateLabel(reactionId: number, label: string) {
    setSamples(
      samples.map((s) => (s.reactionId === reactionId ? { ...s, label } : s)),
    );
  }

  function moveSample(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= samples.length) return;
    const next = [...samples];
    [next[index], next[target]] = [next[target], next[index]];
    setSamples(next);
  }

  function handleSelectBedOutput(outputId: number) {
    const output = bedOutputs.find((o) => o.id === outputId);
    if (output) {
      setBedOutputId(outputId);
      setBedPath(output.filePath);
      setBedLabel(output.filename);
    }
  }

  return (
    <div className="space-y-6">
      {/* BED file source */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500">
          Reference Points (BED File)
        </h3>
        <div className="mb-4 flex gap-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              checked={bedSource === 'peak_calling'}
              onChange={() => {
                setBedSource('peak_calling');
                setBedPath('');
                setBedLabel('');
                setBedOutputId(null);
              }}
              className="text-primary"
            />
            <span className="text-sm">From Peak Calling</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              checked={bedSource === 'upload'}
              onChange={() => {
                setBedSource('upload');
                setBedPath('');
                setBedLabel('');
                setBedOutputId(null);
                setSelectedPeakJobId(null);
              }}
              className="text-primary"
            />
            <span className="text-sm">Upload BED File</span>
          </label>
        </div>

        {bedSource === 'peak_calling' && (
          <div className="space-y-3">
            {peakCallingJobs.length === 0 ? (
              <p className="text-sm text-gray-500">
                No completed peak calling runs available.
              </p>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Peak Calling Run
                  </label>
                  <select
                    value={selectedPeakJobId ?? ''}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      setSelectedPeakJobId(id);
                      setBedPath('');
                      setBedLabel('');
                      setBedOutputId(null);
                    }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Select a peak calling run...</option>
                    {peakCallingJobs.map((j: AnalysisJob) => (
                      <option key={j.id} value={j.id}>
                        {j.name}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedPeakJobId && bedOutputs.length > 0 && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      BED File
                    </label>
                    <select
                      value={bedOutputId ?? ''}
                      onChange={(e) =>
                        e.target.value ? handleSelectBedOutput(Number(e.target.value)) : null
                      }
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">Select a BED file...</option>
                      {bedOutputs.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.filename}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {bedSource === 'upload' && (
          <div className="space-y-3">
            <div>
              <input
                type="file"
                accept=".bed"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onBedUpload(file);
                }}
                className="text-sm text-gray-600"
                disabled={bedUploading}
              />
              {bedUploading && (
                <p className="mt-1 text-xs text-primary">Uploading...</p>
              )}
            </div>
          </div>
        )}

        {bedPath && (
          <div className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            Selected: <strong>{bedLabel}</strong>
          </div>
        )}
      </Card>

      {/* Sample selection */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500">
          Select Samples ({samples.length} selected)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs font-medium uppercase text-gray-500">
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={samples.length === reactions.length && reactions.length > 0}
                    ref={(el) => {
                      if (el) el.indeterminate = samples.length > 0 && samples.length < reactions.length;
                    }}
                    onChange={toggleAll}
                    className="rounded text-primary"
                  />
                </th>
                <th className="px-3 py-2">Short Name</th>
                <th className="px-3 py-2">Heatmap Label</th>
                <th className="px-3 py-2">Order</th>
              </tr>
            </thead>
            <tbody>
              {reactions.map((r) => {
                const selected = samples.find((s) => s.reactionId === r.reaction_id);
                const idx = samples.findIndex((s) => s.reactionId === r.reaction_id);
                return (
                  <tr key={r.reaction_id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={!!selected}
                        onChange={() => toggleReaction(r.reaction_id, r.short_name)}
                        className="rounded text-primary"
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-800">{r.short_name}</td>
                    <td className="px-3 py-2">
                      {selected ? (
                        <input
                          type="text"
                          value={selected.label}
                          onChange={(e) => updateLabel(r.reaction_id, e.target.value)}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-primary focus:outline-none"
                        />
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {selected && (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => moveSample(idx, -1)}
                            disabled={idx <= 0}
                            className="rounded px-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSample(idx, 1)}
                            disabled={idx >= samples.length - 1}
                            className="rounded px-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                            title="Move down"
                          >
                            ↓
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
