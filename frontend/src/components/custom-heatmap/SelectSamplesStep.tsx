// frontend/src/components/custom-heatmap/SelectSamplesStep.tsx
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Card } from '@/components/layout/Card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/Field';
import { useJobs, useJobOutputs } from '@/hooks/useJobs';
import { resolveReactionBigwig } from '@/lib/bigwig-utils';
import type { AnalysisJob, Experiment, JobOutput } from '@/api/types';
import type { HeatmapSample } from './NewCustomHeatmapWizard';
import { cn } from '@/lib/cn';

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
  /** Which file category to resolve bigWig paths from */
  fileCategory?: 'bigwig' | 'normalization_bigwig';
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
  fileCategory = 'bigwig',
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
          bigwigPath: resolveReactionBigwig(reactionId, alignmentOutputs, fileCategory),
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
    [next[index], next[target]] = [next[target]!, next[index]!];
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
        <h3 className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
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
              className="accent-[hsl(var(--primary))]"
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
              className="accent-[hsl(var(--primary))]"
            />
            <span className="text-sm">Upload BED File</span>
          </label>
        </div>

        {bedSource === 'peak_calling' && (
          <div className="space-y-3">
            {peakCallingJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No completed peak calling runs available.
              </p>
            ) : (
              <>
                <Field label="Peak Calling Run">
                  <select
                    value={selectedPeakJobId ?? ''}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      setSelectedPeakJobId(id);
                      setBedPath('');
                      setBedLabel('');
                      setBedOutputId(null);
                    }}
                    className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Select a peak calling run...</option>
                    {peakCallingJobs.map((j: AnalysisJob) => (
                      <option key={j.id} value={j.id}>
                        {j.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {selectedPeakJobId && bedOutputs.length > 0 && (
                  <Field label="BED File">
                    <select
                      value={bedOutputId ?? ''}
                      onChange={(e) =>
                        e.target.value ? handleSelectBedOutput(Number(e.target.value)) : null
                      }
                      className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">Select a BED file...</option>
                      {bedOutputs.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.filename}
                        </option>
                      ))}
                    </select>
                  </Field>
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
                className="text-sm text-muted-foreground"
                disabled={bedUploading}
              />
              {bedUploading && (
                <p className="mt-1 text-xs text-primary">Uploading...</p>
              )}
            </div>
          </div>
        )}

        {bedPath && (
          <div className="mt-3 rounded-md border border-success/25 bg-success/10 px-3 py-2 text-sm text-success">
            Selected: <strong>{bedLabel}</strong>
          </div>
        )}
      </Card>

      {/* Sample selection */}
      <Card>
        <h3 className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Select Samples ({samples.length} selected)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">
                  <Checkbox
                    checked={
                      reactions.length > 0 && samples.length === reactions.length
                        ? true
                        : samples.length > 0
                          ? 'indeterminate'
                          : false
                    }
                    onCheckedChange={toggleAll}
                    aria-label="Select all samples"
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
                  <tr
                    key={r.reaction_id}
                    className={cn(
                      'border-b border-b-border border-l-2 transition-colors duration-150 last:border-b-0',
                      selected ? 'border-l-primary bg-accent' : 'border-l-transparent hover:bg-muted/50',
                    )}
                  >
                    <td className="px-3 py-2">
                      <Checkbox
                        checked={!!selected}
                        onCheckedChange={() => toggleReaction(r.reaction_id, r.short_name)}
                        aria-label={`Select ${r.short_name}`}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-foreground">{r.short_name}</td>
                    <td className="px-3 py-2">
                      {selected ? (
                        <input
                          type="text"
                          value={selected.label}
                          onChange={(e) => updateLabel(r.reaction_id, e.target.value)}
                          className="w-full rounded-md border border-input bg-card px-2 py-1 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
                        />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {selected && (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => moveSample(idx, -1)}
                            disabled={idx <= 0}
                            aria-label={`Move ${r.short_name} up`}
                            className="rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30"
                            title="Move up"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSample(idx, 1)}
                            disabled={idx >= samples.length - 1}
                            aria-label={`Move ${r.short_name} down`}
                            className="rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30"
                            title="Move down"
                          >
                            <ChevronDown className="h-4 w-4" />
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
