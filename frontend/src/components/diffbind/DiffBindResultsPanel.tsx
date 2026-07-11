// frontend/src/components/diffbind/DiffBindResultsPanel.tsx
import { type ColumnDef } from '@tanstack/react-table';
import { AlertCircle, Download, Table2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { downloadDiffBindCounts, downloadDiffBindResults } from '@/api/jobs';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDiffBindReport } from '@/hooks/useJobs';
import { formatNumber } from '@/lib/utils';

interface DiffBindResultsPanelProps {
  jobId: number;
}

/** Significance tint for FDR / p-value pills: success (significant) → warning → destructive. */
function fdrColor(fdr: number): string {
  if (fdr < 0.05) return 'text-success bg-success/10';
  if (fdr < 0.1) return 'text-warning bg-warning/10';
  return 'text-destructive bg-destructive/10';
}

function formatCellValue(value: string | number, columnName: string): React.ReactNode {
  const lowerCol = columnName.toLowerCase();

  if (typeof value === 'number') {
    // FDR and p.value columns: color-coded pill, right-aligned
    if (lowerCol === 'fdr' || lowerCol === 'p.value') {
      return (
        <span className="block text-right">
          <span className={`rounded px-2 py-0.5 font-mono text-xs font-medium tabular-nums ${fdrColor(value)}`}>
            {value.toExponential(2)}
          </span>
        </span>
      );
    }

    let text: string;
    if (lowerCol === 'fold') {
      text = value.toFixed(3);
    } else if (lowerCol === 'start' || lowerCol === 'end' || lowerCol === 'width') {
      // Genomic coordinates (integers): format with commas
      text = formatNumber(value);
    } else if (lowerCol.startsWith('conc')) {
      // Concentration columns: 2 decimal places
      text = value.toFixed(2);
    } else {
      text = Number.isInteger(value) ? formatNumber(value) : value.toFixed(4);
    }

    return <span className="block text-right font-mono tabular-nums">{text}</span>;
  }

  return String(value);
}

export function DiffBindResultsPanel({ jobId }: DiffBindResultsPanelProps) {
  const { data: report, isLoading, error } = useDiffBindReport(jobId);
  const [downloadingResults, setDownloadingResults] = useState(false);
  const [downloadingCounts, setDownloadingCounts] = useState(false);

  // Build columns dynamically from report.columnNames
  const columns: ColumnDef<Record<string, string | number>, unknown>[] = useMemo(() => {
    if (!report) return [];
    return report.columnNames.map((colName) => ({
      accessorKey: colName,
      header: colName,
      cell: ({ getValue }) => formatCellValue(getValue() as string | number, colName),
    }));
  }, [report]);

  async function handleDownloadResults() {
    setDownloadingResults(true);
    try {
      await downloadDiffBindResults(jobId);
    } finally {
      setDownloadingResults(false);
    }
  }

  async function handleDownloadCounts() {
    setDownloadingCounts(true);
    try {
      await downloadDiffBindCounts(jobId);
    } finally {
      setDownloadingCounts(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-2 h-8 w-20" />
            </Card>
          ))}
        </div>
        <Card>
          <Skeleton className="h-4 w-48" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <p className="text-sm text-foreground/80">
          {error instanceof Error ? error.message : 'Failed to load DiffBind report.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Total Peaks
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-foreground">
            {formatNumber(report.totalPeaks)}
          </p>
        </Card>
        <Card>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Significant (FDR &lt; 0.05)
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-success">
            {formatNumber(report.significantPeaks005)}
          </p>
        </Card>
        <Card>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Significant (FDR &lt; 0.01)
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-success">
            {formatNumber(report.significantPeaks001)}
          </p>
        </Card>
      </div>

      {/* Results table */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Differential Binding Results
          </h3>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleDownloadResults}
              disabled={downloadingResults}
              className="text-xs"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {downloadingResults ? 'Downloading...' : 'Download Results TSV'}
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadCounts}
              disabled={downloadingCounts}
              className="text-xs"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {downloadingCounts ? 'Downloading...' : 'Download Normalized Counts'}
            </Button>
          </div>
        </div>

        {report.resultsPreview.length > 0 ? (
          <DataTable data={report.resultsPreview} columns={columns} pageSize={25} />
        ) : (
          <EmptyState
            icon={Table2}
            title="No results"
            description="No differential binding results are available for this analysis."
          />
        )}
      </Card>

      {/* Info panel */}
      <Card>
        <h3 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          About DiffBind Results
        </h3>
        <div className="space-y-3 text-xs text-muted-foreground">
          <div>
            <h4 className="font-semibold text-foreground">Conditions</h4>
            <p>
              Comparing: {report.conditions.join(' vs. ')}
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-foreground">Fold Change</h4>
            <p>
              Log2 fold change between conditions. Positive values indicate enrichment in the first
              condition; negative values indicate enrichment in the second condition.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-foreground">FDR (False Discovery Rate)</h4>
            <p>
              Adjusted p-value controlling for multiple testing. Peaks with FDR &lt; 0.05 are
              considered statistically significant.
            </p>
          </div>
          <div className="border-t border-border pt-3">
            <h4 className="font-semibold text-foreground">FDR Color Coding</h4>
            <div className="mt-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded bg-success" />
                <span>&lt; 0.05 — Significant</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded bg-warning" />
                <span>0.05 – 0.1 — Suggestive</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded bg-destructive" />
                <span>&ge; 0.1 — Not significant</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
