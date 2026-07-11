// frontend/src/components/alignment/AlignmentQCReportPanel.tsx
import { type ColumnDef } from '@tanstack/react-table';
import { AlertCircle, ChevronDown, Download, ImageOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { downloadQCCsv, getOutputSignedUrl } from '@/api/jobs';
import type { AlignmentReactionMetrics, AnalysisJob, JobOutput, SpikeInReactionResult } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useJobOutputs, useQCReport } from '@/hooks/useJobs';
import { cn } from '@/lib/cn';
import { useChartToken } from '@/lib/chart-theme';
import { GENOME_DISPLAY_NAMES } from '@/lib/constants';
import { formatNumber } from '@/lib/utils';

interface AlignmentQCReportPanelProps {
  jobId: number;
  job: AnalysisJob;
}

const columns: ColumnDef<AlignmentReactionMetrics, unknown>[] = [
  { accessorKey: 'shortName', header: 'Short Name' },
  {
    accessorKey: 'totalReadPairs',
    header: 'Total Read Pairs',
    cell: ({ getValue }) => <span className="font-mono">{formatNumber(getValue() as number)}</span>,
  },
  {
    accessorKey: 'alignedReadPairs',
    header: 'Aligned Read Pairs',
    cell: ({ getValue }) => <span className="font-mono">{formatNumber(getValue() as number)}</span>,
  },
  {
    accessorKey: 'uniquelyAlignedReadPairs',
    header: 'Uniquely Aligned Read Pairs',
    cell: ({ getValue }) => <span className="font-mono">{formatNumber(getValue() as number)}</span>,
  },
  {
    accessorKey: 'uniqueAlignmentRate',
    header: 'Unique Alignment Rate (%)',
    cell: ({ getValue }) => <span className="font-mono">{(getValue() as number).toFixed(2)}</span>,
  },
  {
    accessorKey: 'duplicationRate',
    header: 'Duplication Rate (%)',
    cell: ({ getValue }) => <span className="font-mono">{(getValue() as number).toFixed(2)}</span>,
  },
  {
    accessorKey: 'chrmBandwidth',
    header: 'chrM Bandwidth (%)',
    cell: ({ getValue }) => <span className="font-mono">{(getValue() as number).toFixed(2)}</span>,
  },
  {
    accessorKey: 'ecoliReadPairs',
    header: 'E. coli Read Pairs',
    cell: ({ getValue }) => <span className="font-mono">{formatNumber(getValue() as number)}</span>,
  },
  {
    accessorKey: 'ecoliAlignmentRate',
    header: 'E. coli Alignment Rate (%)',
    cell: ({ getValue }) => <span className="font-mono">{(getValue() as number).toFixed(2)}</span>,
  },
  {
    accessorKey: 'ecoliNormalizationFactor',
    header: 'E. coli Norm. Factor',
    cell: ({ getValue }) => <span className="font-mono">{(getValue() as number).toFixed(6)}</span>,
  },
];

export function AlignmentQCReportPanel({ jobId, job }: AlignmentQCReportPanelProps) {
  const { data: report, isLoading, error } = useQCReport(jobId);
  const [downloading, setDownloading] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const hasSpikeIn = useMemo(() => {
    const reactions = (job.params?.reactions as Array<{ cutana_spike_in?: string }>) ?? [];
    return reactions.some((r) => r.cutana_spike_in && r.cutana_spike_in !== 'None');
  }, [job.params]);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadQCCsv(jobId);
    } finally {
      setDownloading(false);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="mb-3">
          <Skeleton className="h-8 w-40" />
        </div>
        <DataTable data={[]} columns={columns} pageSize={25} isLoading />
      </Card>
    );
  }

  if (error || !report) {
    return (
      <Card>
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-foreground/80">
            {error instanceof Error ? error.message : 'Failed to load QC report.'}
          </p>
        </div>
      </Card>
    );
  }

  const genomeName =
    GENOME_DISPLAY_NAMES[report.referenceGenome] ?? report.referenceGenome;

  return (
    <div className="space-y-4">
      {/* Metrics table */}
      <Card>
        {/* Header row */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Reference Genome
            </span>
            <span className="font-mono text-sm text-foreground">{genomeName}</span>
          </div>
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            QC Report
          </h3>
        </div>

        {/* Toolbar */}
        <div className="mb-3 flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={downloading}
            className="text-xs"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {downloading ? 'Downloading...' : 'Download Data as CSV'}
          </Button>
        </div>

        {/* Metrics table */}
        <DataTable data={report.metrics} columns={columns} pageSize={25} />
      </Card>

      {/* Info panel — collapsible, below table */}
      <Card>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setInfoOpen((v) => !v)}
        >
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            About Seq Stats &amp; Alignment Metrics
          </h3>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-150', infoOpen && 'rotate-180')} />
            {infoOpen ? 'Hide' : 'Show'}
          </span>
        </button>
        {infoOpen && (
          <div className="mt-3 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <span className="font-semibold text-foreground">Total Read Pairs</span>
              <p>
                Total sequencing reads/read pairs generated after merging R1 and R2
                files from paired-end data. These are aligned to the selected reference
                genome.
              </p>
            </div>
            <div>
              <span className="font-semibold text-foreground">Aligned Read Pairs</span>
              <p>
                Number of read pairs that successfully mapped to the reference genome at
                any mapping quality.
              </p>
            </div>
            <div>
              <span className="font-semibold text-foreground">
                Uniquely Aligned Read Pairs
              </span>
              <p>
                Read pairs that mapped to exactly one location in the reference genome.
                Multi-mappers are excluded.
              </p>
            </div>
            <div>
              <span className="font-semibold text-foreground">
                Unique Alignment Rate (%)
              </span>
              <p>
                Percentage of total read pairs that aligned uniquely. Target samples
                typically show 70-95%. IgG controls may be lower (20-40%) due to
                non-specific binding and E. coli spike-in reads.
              </p>
            </div>
            <div>
              <span className="font-semibold text-foreground">Duplication Rate (%)</span>
              <p>
                Percentage of aligned reads that are PCR or optical duplicates. Rates
                above 30% may indicate low library complexity or over-amplification.
              </p>
            </div>
            <div>
              <span className="font-semibold text-foreground">chrM Bandwidth (%)</span>
              <p>
                Percentage of reads mapping to the mitochondrial genome. High values may
                indicate poor nuclear enrichment.
              </p>
            </div>
            <div>
              <span className="font-semibold text-foreground">E. coli Read Pairs</span>
              <p>
                Number of reads aligning to the E. coli K12 MG1655 genome. IgG samples
                will have the highest counts. Used for spike-in normalization.
              </p>
            </div>
            <div>
              <span className="font-semibold text-foreground">
                E. coli Alignment Rate (%)
              </span>
              <p>
                Percentage of total read pairs aligning to E. coli. Goal is 0.2-5% for
                target samples. High rates may indicate incorrect spike-in
                reconstitution.
              </p>
            </div>
            <div>
              <span className="font-semibold text-foreground">
                E. coli Norm. Factor
              </span>
              <p>
                Ratio of E. coli spike-in reads to uniquely aligned reads
                (ecoli_reads / unique_reads). Used as a scalar for spike-in
                normalization of bigWig files via bamCoverage --scaleFactor.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* SNAP-CUTANA Spike-in section */}
      <Card>
        <h3 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          SNAP-CUTANA K-MetStat Spike-in
        </h3>
        {report.spikeInResults && report.spikeInResults.length > 0 ? (
          <SpikeInHeatmap results={report.spikeInResults} />
        ) : hasSpikeIn ? (
          <p className="text-sm text-muted-foreground">
            Spike-in barcode data is being processed...
          </p>
        ) : (
          <EmptyState
            icon={ImageOff}
            title="No spike-in data yet"
            description="No SNAP-CUTANA spike-in data available for this alignment."
          />
        )}
      </Card>

      {/* TSS Heatmap */}
      <HeatmapSection
        jobId={jobId}
        category="tss_heatmap"
        title="TSS Heatmap"
        description="This heatmap shows read enrichment around Transcription Start Sites (TSS) across the genome. Each heatmap is individually sorted from highest to lowest signal."
      />

      {/* Gene Body Heatmap */}
      <HeatmapSection
        jobId={jobId}
        category="genebody_heatmap"
        title="Gene Body Heatmap"
        description="This heatmap shows read enrichment around Gene Bodies across the genome. Variable gene lengths are normalized to the same window size. Each heatmap is individually sorted from highest to lowest signal."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Heatmap section — renders PNG images from job outputs with download buttons
// ---------------------------------------------------------------------------

interface HeatmapSectionProps {
  jobId: number;
  category: string;
  title: string;
  description: string;
}

function HeatmapSection({ jobId, category, title, description }: HeatmapSectionProps) {
  const { data: outputs, isLoading } = useJobOutputs(jobId, category);
  const [infoOpen, setInfoOpen] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <h3 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (!outputs || outputs.length === 0) {
    return (
      <Card>
        <h3 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h3>
        <EmptyState
          icon={ImageOff}
          title="No heatmaps yet"
          description={`No ${title.toLowerCase()} data available for this alignment.`}
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h3>
        <button
          type="button"
          className="flex items-center gap-1 rounded-md text-xs text-primary transition-colors duration-150 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setInfoOpen((v) => !v)}
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-150', infoOpen && 'rotate-180')} />
          {infoOpen ? 'Hide' : 'About ' + title}
        </button>
      </div>

      {infoOpen && (
        <p className="mb-4 rounded-md bg-muted p-3 text-xs text-muted-foreground">
          {description}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {outputs.map((output) => (
          <HeatmapImage key={output.id} jobId={jobId} output={output} />
        ))}
      </div>
    </Card>
  );
}

function HeatmapImage({ jobId, output }: { jobId: number; output: JobOutput }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getOutputSignedUrl(jobId, output.id)
      .then((res) => setSignedUrl(res.url))
      .catch(() => setError(true));
  }, [jobId, output.id]);

  function handleDownload() {
    if (!signedUrl) return;
    const link = document.createElement('a');
    link.href = signedUrl;
    link.download = output.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // Extract short name from filename like "h3k4me3_tss_heatmap.png" → "h3k4me3"
  const label = output.filename.replace(/_tss_heatmap\.png$|_genebody_heatmap\.png$/, '');

  if (error) {
    return (
      <div className="rounded-md border border-border p-3">
        <p className="font-mono text-xs text-muted-foreground">{label}</p>
        <p className="mt-2 text-xs text-destructive">Failed to load heatmap.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-mono text-xs font-medium text-foreground">{label}</p>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!signedUrl}
          className="inline-flex items-center rounded-md text-xs text-primary transition-colors duration-150 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground/50"
          title="Download PNG"
        >
          <Download className="mr-1 h-3 w-3" />
          Download PNG
        </button>
      </div>
      {signedUrl ? (
        <img
          src={`${signedUrl}&display=inline`}
          alt={`${label} heatmap`}
          className="w-full rounded-md"
        />
      ) : (
        <Skeleton className="h-48 w-full" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spike-in heatmap
// ---------------------------------------------------------------------------

/** Splice an alpha channel into a concrete `hsl(H S% L%)` string from chart-theme. */
function withAlpha(hslColor: string, alpha: number): string {
  return hslColor.replace(/\)$/, ` / ${alpha})`);
}

function SpikeInHeatmap({ results }: { results: SpikeInReactionResult[] }) {
  // Semantic scale sourced from tokens (theme-reactive, no raw rgb/hex).
  const passColor = useChartToken('--success');
  const warnColor = useChartToken('--warning');
  const failColor = useChartToken('--destructive');
  const onTargetColor = useChartToken('--info');
  const onTargetText = useChartToken('--info-foreground');
  const failText = useChartToken('--destructive-foreground');

  function cellStyle(pct: number, isOnTarget: boolean): { backgroundColor: string; color?: string } {
    if (isOnTarget) return { backgroundColor: onTargetColor, color: onTargetText };
    if (pct <= 20) return { backgroundColor: withAlpha(passColor, Math.max(0.15, (pct / 20) * 0.6)) };
    if (pct <= 50) return { backgroundColor: withAlpha(warnColor, 0.3 + ((pct - 20) / 30) * 0.5) };
    return { backgroundColor: withAlpha(failColor, 0.4 + Math.min((pct - 50) / 50, 1) * 0.5), color: failText };
  }

  if (results.length === 0) return null;
  const ptmNames = results[0]?.ptmResults.map((r) => r.ptmName) ?? [];

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-border bg-muted px-2 py-1.5 text-left font-semibold text-muted-foreground">
                Reaction
              </th>
              {ptmNames.map((ptm) => (
                <th
                  key={ptm}
                  className="border border-border bg-muted px-1.5 py-1.5 text-center font-semibold text-muted-foreground"
                  style={{ writingMode: 'vertical-lr', minWidth: 32, height: 100 }}
                >
                  {ptm}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((rxn) => (
              <tr key={rxn.shortName}>
                <td className="border border-border px-2 py-1.5 font-medium text-foreground whitespace-nowrap">
                  {rxn.shortName}
                </td>
                {rxn.ptmResults.map((ptmRes) => {
                  const isOnTarget = ptmRes.ptmName === rxn.onTargetPtm;
                  return (
                    <td
                      key={ptmRes.ptmName}
                      className="border border-border px-1 py-1 text-center font-mono tabular-nums"
                      style={cellStyle(ptmRes.pctRecovery, isOnTarget)}
                      title={`${ptmRes.ptmName}: ${ptmRes.rawCount} reads (${ptmRes.pctRecovery.toFixed(1)}%)${isOnTarget ? ' [on-target]' : ''}`}
                    >
                      {ptmRes.pctRecovery.toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: withAlpha(passColor, 0.4) }} />
          <span>Pass (&lt;20%)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: withAlpha(warnColor, 0.6) }} />
          <span>Warning (20-50%)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: withAlpha(failColor, 0.7) }} />
          <span>Fail (&gt;50%)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: onTargetColor }} />
          <span>On-target</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Values show % recovery relative to the on-target PTM. Off-target recovery &lt;20% indicates assay success per CUTANA QC criteria.
      </p>
    </div>
  );
}
