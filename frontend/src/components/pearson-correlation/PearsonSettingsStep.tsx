// frontend/src/components/pearson-correlation/PearsonSettingsStep.tsx
import { useState } from 'react';
import { Card } from '@/components/layout/Card';
import { useJobs, useJobOutputs } from '@/hooks/useJobs';
import { uploadBedFile } from '@/api/jobs';
import type { AnalysisJob, Experiment, JobOutput } from '@/api/types';
import type { PearsonSample } from './PearsonSelectSamplesStep';
import { GENOME_DISPLAY_NAMES } from '@/lib/constants';

interface PearsonSettingsStepProps {
  experiment: Experiment;
  referenceGenome: string;
  samples: PearsonSample[];
  restrictBed: boolean;
  setRestrictBed: (v: boolean) => void;
  bedSource: 'peak_calling' | 'upload';
  setBedSource: (source: 'peak_calling' | 'upload') => void;
  bedPath: string;
  setBedPath: (path: string) => void;
  bedLabel: string;
  setBedLabel: (label: string) => void;
  setSubmitError: (e: string | null) => void;
}

export function PearsonSettingsStep({
  experiment,
  referenceGenome,
  samples,
  restrictBed,
  setRestrictBed,
  bedSource,
  setBedSource,
  bedPath,
  setBedPath,
  bedLabel,
  setBedLabel,
  setSubmitError,
}: PearsonSettingsStepProps) {
  // Fetch peak calling jobs for BED file selection
  const { data: jobsData } = useJobs(experiment.id, 1, 100);
  const peakCallingJobs = (jobsData?.items ?? []).filter(
    (j: AnalysisJob) => j.jobType === 'peak_calling' && j.status === 'complete',
  );

  const [selectedPeakJobId, setSelectedPeakJobId] = useState<number | null>(null);
  const { data: peakOutputs } = useJobOutputs(selectedPeakJobId, 'bed');
  const bedOutputs: JobOutput[] = peakOutputs ?? [];
  const [bedUploading, setBedUploading] = useState(false);

  function clearBed() {
    setBedPath('');
    setBedLabel('');
    setSelectedPeakJobId(null);
  }

  function handleToggleRestrict(checked: boolean) {
    setRestrictBed(checked);
    if (!checked) {
      clearBed();
      setBedSource('peak_calling');
    }
  }

  function handleSelectBedOutput(outputId: number) {
    const output = bedOutputs.find((o) => o.id === outputId);
    if (output) {
      setBedPath(output.filePath);
      setBedLabel(output.filename);
    }
  }

  async function handleBedUpload(file: File) {
    setBedUploading(true);
    try {
      const result = await uploadBedFile(experiment.id, file);
      setBedPath(result.path);
      setBedLabel(file.name);
    } catch {
      setSubmitError('Failed to upload BED file.');
    } finally {
      setBedUploading(false);
    }
  }

  const genomeLabel = GENOME_DISPLAY_NAMES[referenceGenome] ?? referenceGenome;

  return (
    <div className="space-y-6">
      {/* Settings card */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold uppercase text-muted-foreground">
          Correlation Settings
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Reference Genome
            </label>
            <input
              type="text"
              value={genomeLabel}
              readOnly
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Inherited from the selected alignment run.
            </p>
          </div>

          {/* Optional BED restriction */}
          <div>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={restrictBed}
                onChange={(e) => handleToggleRestrict(e.target.checked)}
                className="rounded text-primary"
              />
              <span className="text-sm font-medium text-foreground">
                Restrict to specific genomic regions (BED file)
              </span>
            </label>
            <p className="ml-6 mt-1 text-xs text-muted-foreground">
              Optionally restrict the correlation matrix to signal within specific peak regions.
            </p>
          </div>

          {restrictBed && (
            <div className="ml-6 space-y-3 rounded-md border border-border p-3">
              <div className="flex gap-4">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    checked={bedSource === 'peak_calling'}
                    onChange={() => {
                      setBedSource('peak_calling');
                      clearBed();
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
                      clearBed();
                    }}
                    className="text-primary"
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
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          Peak Calling Run
                        </label>
                        <select
                          value={selectedPeakJobId ?? ''}
                          onChange={(e) => {
                            const val = e.target.value ? Number(e.target.value) : null;
                            setSelectedPeakJobId(val);
                            setBedPath('');
                            setBedLabel('');
                          }}
                          className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            BED File
                          </label>
                          <select
                            value={bedPath ? bedOutputs.find((o) => o.filePath === bedPath)?.id ?? '' : ''}
                            onChange={(e) =>
                              e.target.value ? handleSelectBedOutput(Number(e.target.value)) : null
                            }
                            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                  <input
                    type="file"
                    accept=".bed"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleBedUpload(file);
                    }}
                    className="text-sm text-muted-foreground"
                    disabled={bedUploading}
                  />
                  {bedUploading && (
                    <p className="text-xs text-primary">Uploading...</p>
                  )}
                </div>
              )}

              {bedPath && (
                <div className="rounded-md bg-green-50 dark:bg-green-950 px-3 py-2 text-sm text-green-700 dark:text-green-300">
                  Selected: <strong>{bedLabel}</strong>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Summary card */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Summary</h3>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            <strong>Genome:</strong> {genomeLabel}
          </p>
          <p>
            <strong>Samples:</strong> {samples.length}
          </p>
          <p>
            <strong>Labels:</strong>{' '}
            {samples.map((s) => s.label).join(', ') || '(none)'}
          </p>
          <p>
            <strong>Region restriction:</strong>{' '}
            {restrictBed ? bedLabel || '(select a BED file)' : 'None (genome-wide)'}
          </p>
        </div>
      </Card>
    </div>
  );
}
