// frontend/src/components/peak-calling/PeakCallingQCReportPanel.tsx
import { Download } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import type { AnalysisJob } from '@/api/types';
import { downloadPeakCallingQCCsv, downloadTopPeaksCsv } from '@/api/jobs';
import { Card } from '@/components/layout/Card';
import { PeakAnnotationChart } from '@/components/peak-calling/PeakAnnotationChart';
import { usePeakCallingQCReport } from '@/hooks/useJobs';
import { formatNumber } from '@/lib/utils';

interface PeakCallingQCReportPanelProps {
  jobId: number;
  job: AnalysisJob;
}

function fripColor(frip: number): string {
  if (frip >= 0.2) return 'text-green-700 bg-green-50';
  if (frip >= 0.1) return 'text-amber-700 bg-amber-50';
  return 'text-red-700 bg-red-50';
}

export function PeakCallingQCReportPanel({ jobId, job }: PeakCallingQCReportPanelProps) {
  const { data: report, isLoading, error } = usePeakCallingQCReport(jobId);

  const genome = (job.params?.reference_genome as string) ?? '';

  async function handleDownloadCsv() {
    await downloadPeakCallingQCCsv(jobId);
  }

  if (isLoading) {
    return (
      <Card>
        <div className="flex h-40 items-center justify-center">
          <Spinner size="lg" />
        </div>
      </Card>
    );
  }

  if (error || !report) {
    return (
      <Card>
        <p className="text-sm text-red-600">
          {error instanceof Error ? error.message : 'Failed to load QC report.'}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reference Genome
          </span>
          <span className="rounded-md border border-border px-3 py-1 text-sm text-foreground">
            {genome}
          </span>
        </div>
        <span className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          QC Report
        </span>
      </div>

      {/* Main content: table + info panel */}
      <div className="flex gap-6">
        <div className="flex-1">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Peak Calling Stats and Metrics
              </h3>
              <button
                onClick={handleDownloadCsv}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-dark"
              >
                <Download className="h-3.5 w-3.5" />
                Download Data as CSV
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-primary/10">
                    <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Short Name
                    </th>
                    <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Control
                    </th>
                    <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Peak Caller
                    </th>
                    <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Peak Size
                    </th>
                    <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Threshold
                    </th>
                    <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                      Unique Read Pairs
                    </th>
                    <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                      Called Peaks
                    </th>
                    <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                      Reads in Peaks
                    </th>
                    <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                      FRiP
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.metrics.map((m) => (
                    <tr key={m.shortName} className="border-b hover:bg-muted">
                      <td className="px-3 py-2 font-medium text-foreground">{m.shortName}</td>
                      <td className="px-3 py-2 text-foreground">{m.controlShortName || '—'}</td>
                      <td className="px-3 py-2 text-foreground">{m.peakCaller}</td>
                      <td className="px-3 py-2 text-foreground capitalize">{m.peakSize}</td>
                      <td className="px-3 py-2 font-mono text-foreground">{m.significanceThreshold}</td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">
                        {formatNumber(m.uniquelyAlignedReadPairs)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">
                        {formatNumber(m.calledPeaks)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">
                        {formatNumber(m.readsInPeaks)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`rounded px-2 py-0.5 font-mono text-xs font-medium ${fripColor(m.frip)}`}>
                          {m.frip.toFixed(4)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Top Called Peaks */}
          {report.topPeaks && report.topPeaks.length > 0 && (
            <Card className="mt-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Top Called Peaks
                </h3>
                <button
                  onClick={() => void downloadTopPeaksCsv(jobId)}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-dark"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Data as CSV
                </button>
              </div>
              <div className="space-y-3">
                {report.topPeaks.map((tp) => (
                  <div key={tp.shortName}>
                    <h4 className="mb-1 text-xs font-medium text-muted-foreground">{tp.shortName}</h4>
                    <div className="flex flex-wrap gap-1">
                      {tp.topPeaks.map((peak, i) => (
                        <span
                          key={i}
                          className="rounded bg-muted px-2 py-0.5 text-xs font-mono text-foreground"
                        >
                          {peak}
                        </span>
                      ))}
                      {tp.topPeaks.length === 0 && (
                        <span className="text-xs text-muted-foreground">No peaks called</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Peak Annotation Plots */}
          {report.annotations && report.annotations.length > 0 && (
            <PeakAnnotationChart
              jobId={jobId}
              annotations={report.annotations}
              referenceGenome={genome}
              metrics={report.metrics}
            />
          )}
        </div>

        {/* Info panel */}
        <div className="w-80 shrink-0">
          <Card>
            <h3 className="font-display mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              About Peak Calling Stats
            </h3>
            <div className="space-y-3 text-xs text-muted-foreground">
              <div>
                <h4 className="font-semibold text-foreground">FRiP (Fraction of Reads in Peaks)</h4>
                <p>
                  The ratio of unique reads associated with statistically significant peaks. High-quality FRiP is &gt;0.2, indicating robust enrichment at peak regions.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground">Called Peaks</h4>
                <p>
                  Number of statistically significant peaks identified. More peaks does not necessarily mean better quality — trustworthiness is multifactorial.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground">Reads in Peaks</h4>
                <p>
                  Total unique reads overlapping called peaks, used to compute FRiP.
                </p>
              </div>
              <div className="border-t pt-3">
                <h4 className="font-semibold text-foreground">FRiP Color Coding</h4>
                <div className="mt-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded bg-green-500" />
                    <span>&ge; 0.2 — High quality</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded bg-amber-500" />
                    <span>0.1 – 0.2 — Moderate</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded bg-red-500" />
                    <span>&lt; 0.1 — Low quality</span>
                  </div>
                </div>
              </div>
              <div className="border-t pt-3">
                <h4 className="font-semibold text-foreground">About Peak Annotation Plots</h4>
                <p>
                  Visual breakdown of where peaks fall relative to genomic features
                  (e.g., promoters, exons, intergenic). Helps contextualize your peaks
                  biologically and is useful for qualitative assessments of replicate datasets.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
