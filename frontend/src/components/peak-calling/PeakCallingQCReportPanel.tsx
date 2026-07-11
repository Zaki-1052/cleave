// frontend/src/components/peak-calling/PeakCallingQCReportPanel.tsx
import { Download } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
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
  if (frip >= 0.2) return 'bg-success/10 text-success ring-success/25';
  if (frip >= 0.1) return 'bg-warning/10 text-warning ring-warning/25';
  return 'bg-destructive/10 text-destructive ring-destructive/30';
}

export function PeakCallingQCReportPanel({ jobId, job }: PeakCallingQCReportPanelProps) {
  const { data: report, isLoading, error } = usePeakCallingQCReport(jobId);

  const genome = (job.params?.reference_genome as string) ?? '';

  async function handleDownloadCsv() {
    await downloadPeakCallingQCCsv(jobId);
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1">
            <Card>
              <Skeleton className="h-4 w-48" />
              <div className="mt-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            </Card>
          </div>
          <div className="w-full shrink-0 lg:w-80">
            <Card>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-1.5 h-4 w-5/6" />
              <Skeleton className="mt-1.5 h-4 w-2/3" />
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <Card>
        <p className="text-sm text-destructive">
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
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Reference Genome
          </span>
          <span className="rounded-md border border-border px-3 py-1 font-mono text-sm text-foreground">
            {genome}
          </span>
        </div>
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          QC Report
        </span>
      </div>

      {/* Main content: table + info panel */}
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Peak Calling Stats and Metrics
              </h3>
              <button
                onClick={handleDownloadCsv}
                className="flex items-center gap-1 rounded text-xs font-medium text-primary transition-colors duration-150 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Download className="h-3.5 w-3.5" />
                Download Data as CSV
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-border">
                    <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      Short Name
                    </th>
                    <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      Control
                    </th>
                    <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      Peak Caller
                    </th>
                    <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      Peak Size
                    </th>
                    <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      Threshold
                    </th>
                    <th className="px-3 py-2 text-right font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      Unique Read Pairs
                    </th>
                    <th className="px-3 py-2 text-right font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      Called Peaks
                    </th>
                    <th className="px-3 py-2 text-right font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      Reads in Peaks
                    </th>
                    <th className="px-3 py-2 text-right font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      FRiP
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.metrics.map((m) => (
                    <tr key={m.shortName} className="border-b border-border/70 transition-colors duration-150 hover:bg-accent/50">
                      <td className="px-3 py-2 font-medium text-foreground">{m.shortName}</td>
                      <td className="px-3 py-2 text-foreground">{m.controlShortName || '—'}</td>
                      <td className="px-3 py-2 text-foreground">{m.peakCaller}</td>
                      <td className="px-3 py-2 text-foreground capitalize">{m.peakSize}</td>
                      <td className="px-3 py-2 font-mono tabular-nums text-foreground">{m.significanceThreshold}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                        {formatNumber(m.uniquelyAlignedReadPairs)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                        {formatNumber(m.calledPeaks)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                        {formatNumber(m.readsInPeaks)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`rounded px-2 py-0.5 font-mono text-xs font-medium tabular-nums ring-1 ring-inset ${fripColor(m.frip)}`}>
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
                <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Top Called Peaks
                </h3>
                <button
                  onClick={() => void downloadTopPeaksCsv(jobId)}
                  className="flex items-center gap-1 rounded text-xs font-medium text-primary transition-colors duration-150 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Data as CSV
                </button>
              </div>
              <div className="space-y-3">
                {report.topPeaks.map((tp) => (
                  <div key={tp.shortName}>
                    <h4 className="mb-1 font-medium text-foreground">{tp.shortName}</h4>
                    <div className="flex flex-wrap gap-1">
                      {tp.topPeaks.map((peak, i) => (
                        <span
                          key={i}
                          className="rounded bg-muted px-2 py-0.5 font-mono text-xs tabular-nums text-foreground"
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
        <div className="w-full shrink-0 lg:w-80">
          <Card>
            <h3 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
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
                    <span className="inline-block h-3 w-3 rounded bg-success" />
                    <span>&ge; 0.2 — High quality</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded bg-warning" />
                    <span>0.1 – 0.2 — Moderate</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded bg-destructive" />
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
