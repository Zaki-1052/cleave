// frontend/src/components/rnaseq-qc/QCPerSamplePanel.tsx
import { type ColumnDef } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/layout/Card';
import { DataTable } from '@/components/ui/DataTable';
import { downloadRnaseqQCDashboardCsv } from '@/api/jobs';
import { useRnaseqQCDashboardReport } from '@/hooks/useJobs';
import type { RSeQCReactionMetrics } from '@/api/types';

interface QCPerSamplePanelProps {
  jobId: number;
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtInt(v: number): string {
  return v.toLocaleString();
}

export function QCPerSamplePanel({ jobId }: QCPerSamplePanelProps) {
  const { data: report, isLoading } = useRnaseqQCDashboardReport(jobId);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadRnaseqQCDashboardCsv(jobId);
    } catch {
      toast.error('Failed to download metrics CSV');
    } finally {
      setDownloading(false);
    }
  }

  const columns: ColumnDef<RSeQCReactionMetrics, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'shortName',
        header: 'Short Name',
        cell: ({ getValue }) => (
          <span className="font-medium">{getValue() as string}</span>
        ),
      },
      {
        accessorKey: 'inferredStrandedness',
        header: 'Strandedness',
        cell: ({ getValue }) => {
          const val = getValue() as string;
          const colors =
            val === 'sense'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
              : val === 'antisense'
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
          return (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors}`}>
              {val}
            </span>
          );
        },
      },
      {
        accessorKey: 'fractionSense',
        header: 'Sense %',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{fmtPct(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: 'fractionAntisense',
        header: 'Antisense %',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{fmtPct(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: 'cdsExonsTags',
        header: 'CDS Reads',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{fmtInt(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: 'fiveUtrExonsTags',
        header: "5'UTR",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{fmtInt(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: 'threeUtrExonsTags',
        header: "3'UTR",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{fmtInt(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: 'intronTags',
        header: 'Intron',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{fmtInt(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: 'intergenicTags',
        header: 'Intergenic',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{fmtInt(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: 'coverageSkewness',
        header: 'Coverage Skewness',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{(getValue() as number).toFixed(2)}</span>
        ),
      },
      {
        accessorKey: 'innerDistanceMean',
        header: 'Inner Dist. Mean',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{(getValue() as number).toFixed(1)}</span>
        ),
      },
    ],
    [],
  );

  if (isLoading) {
    return (
      <Card>
        <div className="flex h-40 items-center justify-center">
          <Spinner size="lg" />
        </div>
      </Card>
    );
  }

  if (!report || report.metrics.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">No per-sample RSeQC metrics available.</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm font-semibold uppercase text-muted-foreground">
            Per-Sample RSeQC Metrics
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {report.metrics.length} reaction(s) &middot; Modules: {report.modulesRun.join(', ')}
          </p>
        </div>
        <Button
          variant="outlined"
          onClick={handleDownload}
          disabled={downloading}
          className="text-xs"
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {downloading ? 'Downloading...' : 'Download CSV'}
        </Button>
      </div>
      <DataTable data={report.metrics} columns={columns} pageSize={25} />
    </Card>
  );
}
