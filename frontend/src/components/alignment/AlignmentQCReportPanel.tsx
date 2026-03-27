// frontend/src/components/alignment/AlignmentQCReportPanel.tsx
import { type ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';

import { downloadQCCsv } from '@/api/jobs';
import type { AlignmentReactionMetrics, AnalysisJob, SpikeInReactionResult } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { useQCReport } from '@/hooks/useJobs';
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
    cell: ({ getValue }) => formatNumber(getValue() as number),
  },
  {
    accessorKey: 'alignedReadPairs',
    header: 'Aligned Read Pairs',
    cell: ({ getValue }) => formatNumber(getValue() as number),
  },
  {
    accessorKey: 'uniquelyAlignedReadPairs',
    header: 'Uniquely Aligned Read Pairs',
    cell: ({ getValue }) => formatNumber(getValue() as number),
  },
  {
    accessorKey: 'uniqueAlignmentRate',
    header: 'Unique Alignment Rate (%)',
    cell: ({ getValue }) => (getValue() as number).toFixed(2),
  },
  {
    accessorKey: 'duplicationRate',
    header: 'Duplication Rate (%)',
    cell: ({ getValue }) => (getValue() as number).toFixed(2),
  },
  {
    accessorKey: 'chrmBandwidth',
    header: 'chrM Bandwidth (%)',
    cell: ({ getValue }) => (getValue() as number).toFixed(2),
  },
  {
    accessorKey: 'ecoliReadPairs',
    header: 'E. coli Read Pairs',
    cell: ({ getValue }) => formatNumber(getValue() as number),
  },
  {
    accessorKey: 'ecoliAlignmentRate',
    header: 'E. coli Alignment Rate (%)',
    cell: ({ getValue }) => (getValue() as number).toFixed(2),
  },
  {
    accessorKey: 'ecoliNormalizationFactor',
    header: 'E. coli Norm. Factor',
    cell: ({ getValue }) => (getValue() as number).toFixed(6),
  },
];

export function AlignmentQCReportPanel({ jobId, job }: AlignmentQCReportPanelProps) {
  const { data: report, isLoading, error } = useQCReport(jobId);
  const [downloading, setDownloading] = useState(false);

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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
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
      {/* Main two-column layout */}
      <div className="flex gap-4">
        {/* Left: Metrics table */}
        <div className="min-w-0 flex-1">
          <Card>
            {/* Header row */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Reference Genome
                </span>
                <span className="text-sm font-medium text-gray-800">{genomeName}</span>
              </div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
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
                {downloading ? 'Downloading...' : 'Download Data as CSV'}
              </Button>
            </div>

            {/* Metrics table */}
            <DataTable data={report.metrics} columns={columns} pageSize={25} />
          </Card>
        </div>

        {/* Right: Info panel */}
        <div className="w-80 shrink-0">
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-primary">
              About Seq Stats & Alignment Metrics
            </h3>
            <div className="space-y-3 text-xs text-gray-600">
              <div>
                <span className="font-semibold text-gray-700">Total Read Pairs</span>
                <p>
                  Total sequencing reads/read pairs generated after merging R1 and R2
                  files from paired-end data. These are aligned to the selected reference
                  genome.
                </p>
              </div>
              <div>
                <span className="font-semibold text-gray-700">Aligned Read Pairs</span>
                <p>
                  Number of read pairs that successfully mapped to the reference genome at
                  any mapping quality.
                </p>
              </div>
              <div>
                <span className="font-semibold text-gray-700">
                  Uniquely Aligned Read Pairs
                </span>
                <p>
                  Read pairs that mapped to exactly one location in the reference genome.
                  Multi-mappers are excluded.
                </p>
              </div>
              <div>
                <span className="font-semibold text-gray-700">
                  Unique Alignment Rate (%)
                </span>
                <p>
                  Percentage of total read pairs that aligned uniquely. Target samples
                  typically show 70-95%. IgG controls may be lower (20-40%) due to
                  non-specific binding and E. coli spike-in reads.
                </p>
              </div>
              <div>
                <span className="font-semibold text-gray-700">Duplication Rate (%)</span>
                <p>
                  Percentage of aligned reads that are PCR or optical duplicates. Rates
                  above 30% may indicate low library complexity or over-amplification.
                </p>
              </div>
              <div>
                <span className="font-semibold text-gray-700">chrM Bandwidth (%)</span>
                <p>
                  Percentage of reads mapping to the mitochondrial genome. High values may
                  indicate poor nuclear enrichment.
                </p>
              </div>
              <div>
                <span className="font-semibold text-gray-700">E. coli Read Pairs</span>
                <p>
                  Number of reads aligning to the E. coli K12 MG1655 genome. IgG samples
                  will have the highest counts. Used for spike-in normalization.
                </p>
              </div>
              <div>
                <span className="font-semibold text-gray-700">
                  E. coli Alignment Rate (%)
                </span>
                <p>
                  Percentage of total read pairs aligning to E. coli. Goal is 0.2-5% for
                  target samples. High rates may indicate incorrect spike-in
                  reconstitution.
                </p>
              </div>
              <div>
                <span className="font-semibold text-gray-700">
                  E. coli Norm. Factor
                </span>
                <p>
                  Ratio of E. coli spike-in reads to uniquely aligned reads
                  (ecoli_reads / unique_reads). Used as a scalar for spike-in
                  normalization of bigWig files via bamCoverage --scaleFactor.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* SNAP-CUTANA Spike-in section */}
      <Card>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          SNAP-CUTANA K-MetStat Spike-in
        </h3>
        {report.spikeInResults && report.spikeInResults.length > 0 ? (
          <SpikeInHeatmap results={report.spikeInResults} />
        ) : hasSpikeIn ? (
          <p className="text-sm text-gray-500">
            Spike-in barcode data is being processed...
          </p>
        ) : (
          <p className="text-sm text-gray-400">
            No SNAP-CUTANA spike-in data available for this alignment.
          </p>
        )}
      </Card>
    </div>
  );
}

function spikeInCellColor(pct: number, isOnTarget: boolean): string {
  if (isOnTarget) return 'rgb(59, 130, 246)';
  if (pct <= 20) return `rgba(34, 197, 94, ${Math.max(0.15, pct / 20 * 0.6)})`;
  if (pct <= 50) return `rgba(234, 179, 8, ${0.3 + (pct - 20) / 30 * 0.5})`;
  return `rgba(239, 68, 68, ${0.4 + Math.min((pct - 50) / 50, 1) * 0.5})`;
}

function SpikeInHeatmap({ results }: { results: SpikeInReactionResult[] }) {
  if (results.length === 0) return null;
  const ptmNames = results[0].ptmResults.map((r) => r.ptmName);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-gray-200 bg-gray-50 px-2 py-1.5 text-left font-semibold text-gray-600">
                Reaction
              </th>
              {ptmNames.map((ptm) => (
                <th
                  key={ptm}
                  className="border border-gray-200 bg-gray-50 px-1.5 py-1.5 text-center font-semibold text-gray-600"
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
                <td className="border border-gray-200 px-2 py-1.5 font-medium text-gray-700 whitespace-nowrap">
                  {rxn.shortName}
                </td>
                {rxn.ptmResults.map((ptmRes) => {
                  const isOnTarget = ptmRes.ptmName === rxn.onTargetPtm;
                  return (
                    <td
                      key={ptmRes.ptmName}
                      className="border border-gray-200 px-1 py-1 text-center font-mono"
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
      <div className="flex items-center gap-4 text-xs text-gray-500">
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
      <p className="text-xs text-gray-400">
        Values show % recovery relative to the on-target PTM. Off-target recovery &lt;20% indicates assay success per CUTANA QC criteria.
      </p>
    </div>
  );
}
