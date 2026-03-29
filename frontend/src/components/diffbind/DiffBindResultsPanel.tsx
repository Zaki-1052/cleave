// frontend/src/components/diffbind/DiffBindResultsPanel.tsx
import { type ColumnDef } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useMemo, useState } from 'react';

import { downloadDiffBindCounts, downloadDiffBindResults } from '@/api/jobs';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { useDiffBindReport } from '@/hooks/useJobs';
import { formatNumber } from '@/lib/utils';

interface DiffBindResultsPanelProps {
  jobId: number;
}

function fdrColor(fdr: number): string {
  if (fdr < 0.05) return 'text-green-700 bg-green-50';
  if (fdr < 0.1) return 'text-amber-700 bg-amber-50';
  return 'text-red-700 bg-red-50';
}

function formatCellValue(value: string | number, columnName: string): React.ReactNode {
  const lowerCol = columnName.toLowerCase();

  if (typeof value === 'number') {
    // FDR and p.value columns: color-coded
    if (lowerCol === 'fdr' || lowerCol === 'p.value') {
      return (
        <span className={`rounded px-2 py-0.5 font-mono text-xs font-medium ${fdrColor(value)}`}>
          {value.toExponential(2)}
        </span>
      );
    }
    // Fold change
    if (lowerCol === 'fold') {
      return <span className="font-mono">{value.toFixed(3)}</span>;
    }
    // Genomic coordinates (integers): format with commas
    if (lowerCol === 'start' || lowerCol === 'end' || lowerCol === 'width') {
      return <span className="font-mono">{formatNumber(value)}</span>;
    }
    // Concentration columns: 2 decimal places
    if (lowerCol.startsWith('conc')) {
      return <span className="font-mono">{value.toFixed(2)}</span>;
    }
    // Default numeric
    return (
      <span className="font-mono">
        {typeof value === 'number' && Number.isInteger(value)
          ? formatNumber(value)
          : value.toFixed(4)}
      </span>
    );
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
          {error instanceof Error ? error.message : 'Failed to load DiffBind report.'}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Total Peaks
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">
            {formatNumber(report.totalPeaks)}
          </p>
        </Card>
        <Card>
          <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Significant (FDR &lt; 0.05)
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-green-700">
            {formatNumber(report.significantPeaks005)}
          </p>
        </Card>
        <Card>
          <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Significant (FDR &lt; 0.01)
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-green-800">
            {formatNumber(report.significantPeaks001)}
          </p>
        </Card>
      </div>

      {/* Results table */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Differential Binding Results
          </h3>
          <div className="flex items-center gap-2">
            <Button
              variant="outlined"
              onClick={handleDownloadResults}
              disabled={downloadingResults}
              className="text-xs"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {downloadingResults ? 'Downloading...' : 'Download Results TSV'}
            </Button>
            <Button
              variant="outlined"
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
          <p className="py-6 text-center text-sm text-muted-foreground">
            No differential binding results available.
          </p>
        )}
      </Card>

      {/* Info panel */}
      <Card>
        <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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
          <div className="border-t pt-3">
            <h4 className="font-semibold text-foreground">FDR Color Coding</h4>
            <div className="mt-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded bg-green-500" />
                <span>&lt; 0.05 — Significant</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded bg-amber-500" />
                <span>0.05 – 0.1 — Suggestive</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded bg-red-500" />
                <span>&ge; 0.1 — Not significant</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
