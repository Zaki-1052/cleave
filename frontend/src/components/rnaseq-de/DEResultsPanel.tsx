// frontend/src/components/rnaseq-de/DEResultsPanel.tsx
import { type ColumnDef } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useMemo, useState } from 'react';

import { downloadRnaseqDECounts, downloadRnaseqDEResults } from '@/api/jobs';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { useRnaseqDEReport } from '@/hooks/useJobs';
import { formatNumber } from '@/lib/utils';

interface DEResultsPanelProps {
  jobId: number;
}

function significanceColor(padj: number): string {
  if (padj < 0.05) return 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950';
  if (padj < 0.1) return 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950';
  return 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950';
}

function formatCellValue(value: string | number, columnName: string): React.ReactNode {
  const lowerCol = columnName.toLowerCase();

  if (typeof value === 'number') {
    // p-value and adjusted p-value: exponential notation with color coding
    if (lowerCol === 'padj' || lowerCol === 'pvalue') {
      return (
        <span className={`rounded px-2 py-0.5 font-mono text-xs font-medium ${significanceColor(value)}`}>
          {value.toExponential(2)}
        </span>
      );
    }
    // Log2 fold change: color coded by direction when significant
    if (lowerCol === 'log2foldchange') {
      const color = value > 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400';
      return <span className={`font-mono ${color}`}>{value.toFixed(3)}</span>;
    }
    // baseMean: comma-formatted with 1 decimal
    if (lowerCol === 'basemean') {
      return <span className="font-mono">{value.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</span>;
    }
    // lfcSE and stat: 3 decimal places
    if (lowerCol === 'lfcse' || lowerCol === 'stat') {
      return <span className="font-mono">{value.toFixed(3)}</span>;
    }
    // Default numeric
    return (
      <span className="font-mono">
        {Number.isInteger(value) ? formatNumber(value) : value.toFixed(4)}
      </span>
    );
  }

  return String(value);
}

export function DEResultsPanel({ jobId }: DEResultsPanelProps) {
  const { data: report, isLoading, error } = useRnaseqDEReport(jobId);
  const [downloadingResults, setDownloadingResults] = useState(false);
  const [downloadingCounts, setDownloadingCounts] = useState(false);

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
      await downloadRnaseqDEResults(jobId);
    } finally {
      setDownloadingResults(false);
    }
  }

  async function handleDownloadCounts() {
    setDownloadingCounts(true);
    try {
      await downloadRnaseqDECounts(jobId);
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
          {error instanceof Error ? error.message : 'Failed to load DE results.'}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Total Genes
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">
            {formatNumber(report.totalGenes)}
          </p>
        </Card>
        <Card>
          <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Significant (padj &lt; 0.05)
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-green-700 dark:text-green-400">
            {formatNumber(report.significantGenes005)}
          </p>
        </Card>
        <Card>
          <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Significant (padj &lt; 0.01)
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-green-800 dark:text-green-300">
            {formatNumber(report.significantGenes001)}
          </p>
        </Card>
        <Card>
          <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Upregulated
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-red-600 dark:text-red-400">
            {formatNumber(report.upregulated)}
          </p>
        </Card>
        <Card>
          <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Downregulated
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-blue-600 dark:text-blue-400">
            {formatNumber(report.downregulated)}
          </p>
        </Card>
      </div>

      {/* Results table */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Differential Expression Results
          </h3>
          <div className="flex items-center gap-2">
            <Button
              variant="outlined"
              onClick={handleDownloadResults}
              disabled={downloadingResults}
              className="text-xs"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {downloadingResults ? 'Downloading...' : 'Download Results (TSV)'}
            </Button>
            <Button
              variant="outlined"
              onClick={handleDownloadCounts}
              disabled={downloadingCounts}
              className="text-xs"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {downloadingCounts ? 'Downloading...' : 'Download Counts (CSV)'}
            </Button>
          </div>
        </div>

        {report.resultsPreview.length > 0 ? (
          <DataTable data={report.resultsPreview} columns={columns} pageSize={25} />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No differential expression results available.
          </p>
        )}
      </Card>

      {/* Info panel */}
      <Card>
        <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          About DE Results
        </h3>
        <div className="space-y-3 text-xs text-muted-foreground">
          <div>
            <h4 className="font-semibold text-foreground">Conditions</h4>
            <p>
              Comparing: {report.conditions.join(' vs. ')}
              {report.referenceCondition && (
                <span> (reference: {report.referenceCondition})</span>
              )}
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-foreground">log2FoldChange</h4>
            <p>
              Log2 fold change between conditions. Positive values (red) indicate upregulation;
              negative values (blue) indicate downregulation relative to the reference condition.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-foreground">padj (Adjusted p-value)</h4>
            <p>
              Benjamini-Hochberg adjusted p-value controlling false discovery rate. Genes with
              padj &lt; 0.05 are considered statistically significant.
            </p>
          </div>
          <div className="border-t pt-3">
            <h4 className="font-semibold text-foreground">Significance Color Coding</h4>
            <div className="mt-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded bg-green-500" />
                <span>padj &lt; 0.05 — Significant</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded bg-amber-500" />
                <span>0.05 &le; padj &lt; 0.1 — Suggestive</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded bg-red-500" />
                <span>padj &ge; 0.1 — Not significant</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
