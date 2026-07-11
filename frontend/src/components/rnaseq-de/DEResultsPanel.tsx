// frontend/src/components/rnaseq-de/DEResultsPanel.tsx
import { type ColumnDef } from '@tanstack/react-table';
import { AlertCircle, Download, ExternalLink, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { downloadRnaseqDECounts, downloadRnaseqDEResults } from '@/api/jobs';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useRnaseqDEReport } from '@/hooks/useJobs';
import { formatNumber } from '@/lib/utils';

interface DEResultsPanelProps {
  jobId: number;
  organism: string | null;
}

function significanceColor(padj: number): string {
  if (padj < 0.05) return 'text-success bg-success/10';
  if (padj < 0.1) return 'text-warning bg-warning/10';
  return 'text-destructive bg-destructive/10';
}

function ensemblUrl(geneId: string, organism: string | null): string | null {
  if (!geneId) return null;
  let species: string | null = null;
  if (organism === 'mm10') {
    species = 'Mus_musculus';
  } else if (organism === 'hg38' || organism === 'hg19') {
    species = 'Homo_sapiens';
  } else if (geneId.startsWith('ENSMUSG')) {
    species = 'Mus_musculus';
  } else if (geneId.startsWith('ENSG')) {
    species = 'Homo_sapiens';
  }
  if (!species) return null;
  return `https://ensembl.org/${species}/Gene/Summary?g=${encodeURIComponent(geneId)}`;
}

function formatCellValue(value: string | number, columnName: string): React.ReactNode {
  const lowerCol = columnName.toLowerCase();

  if (typeof value === 'number') {
    if (lowerCol === 'padj' || lowerCol === 'pvalue') {
      return (
        <span className={`rounded px-2 py-0.5 font-mono text-xs font-medium tabular-nums ${significanceColor(value)}`}>
          {value.toExponential(2)}
        </span>
      );
    }
    if (lowerCol === 'log2foldchange') {
      const color = value > 0 ? 'text-destructive' : 'text-info';
      return <span className={`font-mono tabular-nums ${color}`}>{value.toFixed(3)}</span>;
    }
    if (lowerCol === 'basemean') {
      return <span className="font-mono tabular-nums">{value.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</span>;
    }
    if (lowerCol === 'lfcse' || lowerCol === 'stat') {
      return <span className="font-mono tabular-nums">{value.toFixed(3)}</span>;
    }
    return (
      <span className="font-mono tabular-nums">
        {Number.isInteger(value) ? formatNumber(value) : value.toFixed(4)}
      </span>
    );
  }

  return String(value);
}

export function DEResultsPanel({ jobId, organism }: DEResultsPanelProps) {
  const { data: report, isLoading, error } = useRnaseqDEReport(jobId);
  const [downloadingResults, setDownloadingResults] = useState(false);
  const [downloadingCounts, setDownloadingCounts] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [significanceFilter, setSignificanceFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState('all');

  const filteredData = useMemo(() => {
    if (!report) return [];
    let rows = report.resultsPreview;

    if (searchText.trim()) {
      const term = searchText.trim().toLowerCase();
      rows = rows.filter((row) => {
        const geneName = String(row['gene_name'] ?? '').toLowerCase();
        const geneId = String(row['gene_id'] ?? '').toLowerCase();
        return geneName.includes(term) || geneId.includes(term);
      });
    }

    if (significanceFilter === 'padj005') {
      rows = rows.filter((row) => {
        const padj = typeof row['padj'] === 'number' ? row['padj'] : 1;
        return padj < 0.05;
      });
    } else if (significanceFilter === 'padj001') {
      rows = rows.filter((row) => {
        const padj = typeof row['padj'] === 'number' ? row['padj'] : 1;
        return padj < 0.01;
      });
    }

    if (directionFilter === 'up') {
      rows = rows.filter((row) => {
        const lfc = typeof row['log2FoldChange'] === 'number' ? row['log2FoldChange'] : 0;
        const padj = typeof row['padj'] === 'number' ? row['padj'] : 1;
        return lfc > 0 && padj < 0.05;
      });
    } else if (directionFilter === 'down') {
      rows = rows.filter((row) => {
        const lfc = typeof row['log2FoldChange'] === 'number' ? row['log2FoldChange'] : 0;
        const padj = typeof row['padj'] === 'number' ? row['padj'] : 1;
        return lfc < 0 && padj < 0.05;
      });
    }

    return rows;
  }, [report, searchText, significanceFilter, directionFilter]);

  const columns: ColumnDef<Record<string, string | number>, unknown>[] = useMemo(() => {
    if (!report) return [];
    return report.columnNames.map((colName) => ({
      accessorKey: colName,
      header: colName,
      cell: ({ row, getValue }) => {
        const value = getValue() as string | number;

        if (colName === 'gene_name') {
          const geneId = String(row.original['gene_id'] ?? '');
          const url = ensemblUrl(geneId, organism);
          if (url) {
            return (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary transition-colors duration-150 hover:text-primary/80 hover:underline"
              >
                {String(value)}
                <ExternalLink className="h-3 w-3" />
              </a>
            );
          }
        }

        return formatCellValue(value, colName);
      },
    }));
  }, [report, organism]);

  const hasActiveFilters = searchText.trim() !== '' || significanceFilter !== 'all' || directionFilter !== 'all';

  function handleDownloadFilteredCsv() {
    if (!report || filteredData.length === 0) return;
    const cols = report.columnNames;
    const header = cols.join(',');
    const csvRows = filteredData.map((row) =>
      cols.map((col) => {
        const val = row[col];
        if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return String(val ?? '');
      }).join(','),
    );
    const csv = [header, ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'de_results_filtered.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

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
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="mt-2 h-7 w-1/2" />
            </Card>
          ))}
        </div>
        <Card>
          <Skeleton className="h-4 w-1/3" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (error || !report) {
    return (
      <Card>
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-foreground/80">
            {error instanceof Error ? error.message : 'Failed to load DE results.'}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Card>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Total Genes
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-foreground">
            {formatNumber(report.totalGenes)}
          </p>
        </Card>
        <Card>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Significant (padj &lt; 0.05)
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-success">
            {formatNumber(report.significantGenes005)}
          </p>
        </Card>
        <Card>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Significant (padj &lt; 0.01)
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-success">
            {formatNumber(report.significantGenes001)}
          </p>
        </Card>
        <Card>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Upregulated
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-destructive">
            {formatNumber(report.upregulated)}
          </p>
        </Card>
        <Card>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Downregulated
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-info">
            {formatNumber(report.downregulated)}
          </p>
        </Card>
      </div>

      {/* Results table */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Differential Expression Results
          </h3>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleDownloadResults}
              disabled={downloadingResults}
              className="text-xs"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {downloadingResults ? 'Downloading...' : 'Download Results (TSV)'}
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadCounts}
              disabled={downloadingCounts}
              className="text-xs"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {downloadingCounts ? 'Downloading...' : 'Download Counts (CSV)'}
            </Button>
          </div>
        </div>

        {/* Filter toolbar */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search gene name or ID..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="rounded-md border border-input bg-card py-1.5 pl-8 pr-3 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
            />
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>

          <Select value={significanceFilter} onValueChange={setSignificanceFilter}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All genes</SelectItem>
              <SelectItem value="padj005">padj &lt; 0.05</SelectItem>
              <SelectItem value="padj001">padj &lt; 0.01</SelectItem>
            </SelectContent>
          </Select>

          <Select value={directionFilter} onValueChange={setDirectionFilter}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All directions</SelectItem>
              <SelectItem value="up">Upregulated</SelectItem>
              <SelectItem value="down">Downregulated</SelectItem>
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="outline" className="h-8 text-xs" onClick={handleDownloadFilteredCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export filtered ({filteredData.length})
            </Button>
          )}
        </div>

        {/* Row count indicator */}
        <p className="mb-2 text-xs text-muted-foreground">
          Showing <span className="font-mono tabular-nums">{filteredData.length}</span> of{' '}
          <span className="font-mono tabular-nums">{formatNumber(report.totalGenes)}</span> genes
          {report.resultsPreview.length < report.totalGenes && (
            <span className="ml-1">
              (preview limited to <span className="font-mono tabular-nums">{report.resultsPreview.length}</span> rows &mdash; download full results for complete data)
            </span>
          )}
        </p>

        <DataTable
          data={filteredData}
          columns={columns}
          pageSize={25}
          emptyMessage={
            hasActiveFilters
              ? 'No genes match the current filters.'
              : 'No differential expression results available.'
          }
        />
      </Card>

      {/* Info panel */}
      <Card>
        <h3 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
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
          <div>
            <h4 className="font-semibold text-foreground">Gene Links</h4>
            <p>
              Gene names link to their Ensembl gene page for detailed annotation,
              expression data, and cross-references. Links open in a new tab.
            </p>
          </div>
          <div className="border-t border-border pt-3">
            <h4 className="font-semibold text-foreground">Significance Color Coding</h4>
            <div className="mt-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded bg-success" />
                <span>padj &lt; 0.05 &mdash; Significant</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded bg-warning" />
                <span>0.05 &le; padj &lt; 0.1 &mdash; Suggestive</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded bg-destructive" />
                <span>padj &ge; 0.1 &mdash; Not significant</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
