// frontend/src/components/trimming/FastpReportsPanel.tsx
import { type ColumnDef } from '@tanstack/react-table';
import { FileText } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useMemo, useState } from 'react';

import type { JobOutput } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { useJobOutputs } from '@/hooks/useJobs';
import { formatBytes } from '@/lib/utils';
import { FastpReportModal } from './FastpReportModal';

interface FastpReportsPanelProps {
  jobId: number;
}

export function FastpReportsPanel({ jobId }: FastpReportsPanelProps) {
  const { data: outputs, isLoading } = useJobOutputs(jobId, 'fastp_html');
  const [selectedOutput, setSelectedOutput] = useState<{ id: number; filename: string } | null>(
    null,
  );

  const columns: ColumnDef<JobOutput, unknown>[] = useMemo(
    () => [
      { accessorKey: 'filename', header: 'Report' },
      {
        accessorKey: 'fileSizeBytes',
        header: 'Size',
        cell: ({ getValue }) => {
          const bytes = getValue() as number | null;
          return bytes != null ? <span className="font-mono">{formatBytes(bytes)}</span> : '--';
        },
      },
      {
        id: 'view',
        header: '',
        cell: ({ row }) => (
          <Button
            variant="outlined"
            onClick={() =>
              setSelectedOutput({ id: row.original.id, filename: row.original.filename })
            }
            className="text-xs"
          >
            View Report
          </Button>
        ),
        size: 120,
        enableSorting: false,
      },
    ],
    [],
  );

  if (isLoading) {
    return (
      <Card>
        <div className="flex h-20 items-center justify-center">
          <Spinner />
        </div>
      </Card>
    );
  }

  if (!outputs || outputs.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={FileText}
          title="No fastp reports"
          description="fastp HTML reports will appear here after trimming completes."
        />
      </Card>
    );
  }

  return (
    <>
      <Card>
        <h4 className="mb-3 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          fastp Quality Reports
        </h4>
        <p className="mb-4 text-xs text-muted-foreground">
          Click &quot;View Report&quot; to open the interactive fastp HTML report for each sample
          pair.
        </p>
        <DataTable data={outputs} columns={columns} pageSize={25} />
      </Card>

      <FastpReportModal
        isOpen={selectedOutput !== null}
        onClose={() => setSelectedOutput(null)}
        jobId={jobId}
        outputId={selectedOutput?.id ?? null}
        filename={selectedOutput?.filename ?? ''}
      />
    </>
  );
}
