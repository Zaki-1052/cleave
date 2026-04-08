// frontend/src/components/rnaseq-alignment/RnaseqAlignmentQCReportPanel.tsx
import { type ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { downloadRnaseqQCCsv } from '@/api/jobs';
import type { RnaseqAlignmentReactionMetrics } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Spinner } from '@/components/ui/Spinner';
import { useRnaseqQCReport } from '@/hooks/useJobs';
import { formatNumber } from '@/lib/utils';

interface RnaseqAlignmentQCReportPanelProps {
  jobId: number;
}

const MAPPING_COLORS = {
  uniquelyMapped: '#1E88E5',
  multiMapped: '#FFA000',
  unmapped: '#9E9E9E',
};

export function RnaseqAlignmentQCReportPanel({ jobId }: RnaseqAlignmentQCReportPanelProps) {
  const { data: report, isLoading } = useRnaseqQCReport(jobId);
  const [showInfo, setShowInfo] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const starColumns: ColumnDef<RnaseqAlignmentReactionMetrics, unknown>[] = useMemo(
    () => [
      { accessorKey: 'shortName', header: 'Short Name' },
      {
        accessorKey: 'totalInputReads',
        header: 'Total Reads',
        cell: ({ getValue }) => (
          <span className="font-mono">{formatNumber(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: 'uniquelyMappedReads',
        header: 'Uniquely Mapped',
        cell: ({ getValue }) => (
          <span className="font-mono">{formatNumber(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: 'uniqueMappingRate',
        header: 'Unique Rate (%)',
        cell: ({ getValue }) => (
          <span className="font-mono">{(getValue() as number).toFixed(2)}</span>
        ),
      },
      {
        accessorKey: 'multiMappedRate',
        header: 'Multi-Mapped (%)',
        cell: ({ getValue }) => (
          <span className="font-mono">{(getValue() as number).toFixed(2)}</span>
        ),
      },
      {
        accessorKey: 'unmappedRate',
        header: 'Unmapped (%)',
        cell: ({ getValue }) => (
          <span className="font-mono">{(getValue() as number).toFixed(2)}</span>
        ),
      },
      {
        accessorKey: 'averageMappedLength',
        header: 'Avg Length',
        cell: ({ getValue }) => (
          <span className="font-mono">{(getValue() as number).toFixed(1)}</span>
        ),
      },
      {
        accessorKey: 'numSplices',
        header: 'Splices',
        cell: ({ getValue }) => (
          <span className="font-mono">{formatNumber(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: 'mismatchRate',
        header: 'Mismatch (%)',
        cell: ({ getValue }) => (
          <span className="font-mono">{(getValue() as number).toFixed(2)}</span>
        ),
      },
    ],
    [],
  );

  const salmonColumns: ColumnDef<RnaseqAlignmentReactionMetrics, unknown>[] = useMemo(
    () => [
      { accessorKey: 'shortName', header: 'Short Name' },
      {
        accessorKey: 'salmonMappingRate',
        header: 'Mapping Rate (%)',
        cell: ({ getValue }) => (
          <span className="font-mono">{(getValue() as number).toFixed(2)}</span>
        ),
      },
      { accessorKey: 'salmonLibraryType', header: 'Library Type' },
      {
        accessorKey: 'salmonNumProcessed',
        header: 'Processed Reads',
        cell: ({ getValue }) => (
          <span className="font-mono">{formatNumber(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: 'salmonFragLengthMean',
        header: 'Frag Length Mean',
        cell: ({ getValue }) => (
          <span className="font-mono">{(getValue() as number).toFixed(1)}</span>
        ),
      },
      {
        accessorKey: 'salmonFragLengthSd',
        header: 'Frag Length SD',
        cell: ({ getValue }) => (
          <span className="font-mono">{(getValue() as number).toFixed(1)}</span>
        ),
      },
    ],
    [],
  );

  const chartData = useMemo(() => {
    if (!report) return [];
    return report.metrics.map((m) => ({
      name: m.shortName,
      'Uniquely Mapped': m.uniqueMappingRate,
      'Multi-Mapped': m.multiMappedRate,
      Unmapped: m.unmappedRate,
    }));
  }, [report]);

  async function handleDownloadCsv() {
    setDownloading(true);
    try {
      await downloadRnaseqQCCsv(jobId);
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

  if (!report) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">QC report data not available.</p>
      </Card>
    );
  }

  const chartHeight = Math.max(200, report.metrics.length * 40 + 60);

  return (
    <div className="space-y-4">
      {/* Info panel (collapsible) */}
      <Card>
        <button
          type="button"
          onClick={() => setShowInfo(!showInfo)}
          className="flex w-full items-center justify-between text-sm font-medium text-foreground"
        >
          <span className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            About These Metrics
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${showInfo ? 'rotate-180' : ''}`} />
        </button>
        {showInfo && (
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            <p><strong>STAR Metrics:</strong> Total input reads, uniquely mapped reads and rate, multi-mapped rate, unmapped rate, average mapped read length, total splice junctions detected, and mismatch rate per base.</p>
            <p><strong>Salmon Metrics:</strong> Pseudo-alignment mapping rate, auto-detected library type (strandedness), total processed reads, and fragment length distribution (mean and standard deviation).</p>
            <p><strong>Unique Mapping Rate:</strong> Typically 70-90% for RNA-seq. Lower rates may indicate contamination, rRNA, or adapter issues.</p>
            <p><strong>Multi-Mapped Rate:</strong> 5-15% is normal. High rates may indicate repetitive sequences or gene families.</p>
            <p><strong>Salmon Library Type:</strong> IU = unstranded, ISR = reverse-stranded (dUTP), ISF = forward-stranded. Salmon auto-detects this.</p>
          </div>
        )}
      </Card>

      {/* STAR Alignment Metrics */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            STAR Alignment Metrics
          </h3>
          <span className="text-xs text-muted-foreground">
            Genome: {report.referenceGenome}
          </span>
        </div>
        <DataTable data={report.metrics} columns={starColumns} pageSize={25} />
      </Card>

      {/* Salmon Quantification Metrics */}
      <Card>
        <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Salmon Quantification Metrics
        </h3>
        <DataTable data={report.metrics} columns={salmonColumns} pageSize={25} />
      </Card>

      {/* Mapping Rates Chart */}
      {chartData.length > 0 && (
        <Card>
          <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            STAR Mapping Rates
          </h3>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30, top: 5, bottom: 5 }}>
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: number, name: string) => [`${value.toFixed(2)}%`, name]}
              />
              <Legend />
              <Bar dataKey="Uniquely Mapped" stackId="mapping" fill={MAPPING_COLORS.uniquelyMapped} />
              <Bar dataKey="Multi-Mapped" stackId="mapping" fill={MAPPING_COLORS.multiMapped} />
              <Bar dataKey="Unmapped" stackId="mapping" fill={MAPPING_COLORS.unmapped} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* CSV Download */}
      <div className="flex justify-end">
        <Button variant="outlined" onClick={handleDownloadCsv} disabled={downloading}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {downloading ? 'Downloading...' : 'Download QC Metrics CSV'}
        </Button>
      </div>
    </div>
  );
}
