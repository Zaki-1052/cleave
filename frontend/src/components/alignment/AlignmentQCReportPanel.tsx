// frontend/src/components/alignment/AlignmentQCReportPanel.tsx
import { type ColumnDef } from '@tanstack/react-table';
import { ChevronDown, Download } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useEffect, useMemo, useState } from 'react';

import { downloadQCCsv, getOutputSignedUrl } from '@/api/jobs';
import type { AlignmentReactionMetrics, AnalysisJob, JobOutput, SpikeInReactionResult } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { useJobOutputs, useQCReport } from '@/hooks/useJobs';
import { cn } from '@/lib/cn';
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

  const genomeName =
    GENOME_DISPLAY_NAMES[report.referenceGenome] ?? report.referenceGenome;

  return (
    <div className="space-y-4">
      {/* Metrics table */}
      <Card>
        {/* Header row */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Reference Genome
            </span>
            <span className="text-sm font-medium text-foreground">{genomeName}</span>
          </div>
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            QC Report
          </h3>
        </div>

        {/* Toolbar */}
        <div className="mb-3 flex items-center gap-2">
          <Button
            variant="outlined"
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
          className="flex w-full items-center justify-between"
          onClick={() => setInfoOpen((v) => !v)}
        >
          <h3 className="font-display text-sm font-semibold text-primary">
            About Seq Stats & Alignment Metrics
          </h3>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', infoOpen && 'rotate-180')} />
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
        <h3 className="font-display mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          SNAP-CUTANA K-MetStat Spike-in
        </h3>
        {report.spikeInResults && report.spikeInResults.length > 0 ? (
          <SpikeInHeatmap results={report.spikeInResults} />
        ) : hasSpikeIn ? (
          <p className="text-sm text-muted-foreground">
            Spike-in barcode data is being processed...
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No SNAP-CUTANA spike-in data available for this alignment.
          </p>
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
        <h3 className="font-display mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <div className="flex h-32 items-center justify-center">
          <Spinner size="lg" />
        </div>
      </Card>
    );
  }

  if (!outputs || outputs.length === 0) {
    return (
      <Card>
        <h3 className="font-display mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">No {title.toLowerCase()} data available.</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
          onClick={() => setInfoOpen((v) => !v)}
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', infoOpen && 'rotate-180')} />
          {infoOpen ? 'Hide' : 'About ' + title}
        </button>
      </div>

      {infoOpen && (
        <p className="mb-4 rounded bg-muted p-3 text-xs text-muted-foreground">
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
      <div className="rounded border border-border p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-2 text-xs text-red-500">Failed to load heatmap.</p>
      </div>
    );
  }

  return (
    <div className="rounded border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!signedUrl}
          className="text-xs text-primary hover:text-primary/80 disabled:text-muted-foreground/50"
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
          className="w-full rounded"
        />
      ) : (
        <div className="flex h-48 items-center justify-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spike-in heatmap
// ---------------------------------------------------------------------------

function spikeInCellColor(pct: number, isOnTarget: boolean): string {
  if (isOnTarget) return 'rgb(59, 130, 246)';
  if (pct <= 20) return `rgba(34, 197, 94, ${Math.max(0.15, pct / 20 * 0.6)})`;
  if (pct <= 50) return `rgba(234, 179, 8, ${0.3 + (pct - 20) / 30 * 0.5})`;
  return `rgba(239, 68, 68, ${0.4 + Math.min((pct - 50) / 50, 1) * 0.5})`;
}

function SpikeInHeatmap({ results }: { results: SpikeInReactionResult[] }) {
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
                      className="border border-border px-1 py-1 text-center font-mono"
                      style={{
                        backgroundColor: spikeInCellColor(ptmRes.pctRecovery, isOnTarget),
                        color: isOnTarget || ptmRes.pctRecovery > 50 ? 'white' : 'inherit',
                      }}
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
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: 'rgba(34, 197, 94, 0.4)' }} />
          <span>Pass (&lt;20%)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: 'rgba(234, 179, 8, 0.6)' }} />
          <span>Warning (20-50%)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.7)' }} />
          <span>Fail (&gt;50%)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: 'rgb(59, 130, 246)' }} />
          <span>On-target</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Values show % recovery relative to the on-target PTM. Off-target recovery &lt;20% indicates assay success per CUTANA QC criteria.
      </p>
    </div>
  );
}
