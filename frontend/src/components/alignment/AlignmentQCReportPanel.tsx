// frontend/src/components/alignment/AlignmentQCReportPanel.tsx
import { type ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';

import { downloadQCCsv } from '@/api/jobs';
import type { AlignmentReactionMetrics, AnalysisJob } from '@/api/types';
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
            </div>
          </Card>
        </div>
      </div>

      {/* SNAP-CUTANA Spike-in section */}
      <Card>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          SNAP-CUTANA K-MetStat Spike-in
        </h3>
        {hasSpikeIn ? (
          <p className="text-sm text-gray-500">
            Spike-in QC heatmap will be available in a future update.
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
