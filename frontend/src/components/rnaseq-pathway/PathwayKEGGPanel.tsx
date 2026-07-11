// frontend/src/components/rnaseq-pathway/PathwayKEGGPanel.tsx
import { useEffect, useState } from 'react';
import { AlertCircle, Download, SearchX } from 'lucide-react';
import { Card } from '@/components/layout/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { getOutputSignedUrl, downloadPathwayKEGGResults } from '@/api/jobs';
import { usePathwayReport } from '@/hooks/useJobs';
import type { ColumnDef } from '@tanstack/react-table';

interface PathwayKEGGPanelProps {
  jobId: number;
}

export function PathwayKEGGPanel({ jobId }: PathwayKEGGPanelProps) {
  const { data: report, isLoading, error } = usePathwayReport(jobId);
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const keggPlot = report?.plotOutputs.find((p) => p.plotType === 'kegg');

  useEffect(() => {
    if (keggPlot?.outputIdPng != null) {
      getOutputSignedUrl(jobId, keggPlot.outputIdPng)
        .then((res) => setPngUrl(res.url))
        .catch(() => setImgError(true));
    }
  }, [jobId, keggPlot?.outputIdPng]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <Skeleton className="h-16 w-44" />
        </Card>
        <Card>
          <Skeleton className="mb-3 h-4 w-40" />
          <Skeleton className="h-48 w-full rounded" />
        </Card>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <p className="text-sm text-foreground/80">
          {error instanceof Error ? error.message : 'Failed to load pathway report.'}
        </p>
      </div>
    );
  }

  const columns: ColumnDef<Record<string, string | number>>[] = report.keggColumnNames
    .filter((col) => col !== 'geneID')
    .map((col) => ({
      accessorKey: col,
      header: col,
      cell: ({ getValue }) => {
        const val = getValue();
        if (typeof val === 'number') {
          return val < 0.001 ? val.toExponential(2) : val.toFixed(4);
        }
        return String(val ?? '');
      },
    }));

  function handleDownloadPng() {
    if (!pngUrl) return;
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = 'kegg.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-4">
          <div className="rounded-md border border-border bg-muted/50 px-4 py-2 text-center">
            <div className="font-mono text-lg font-semibold tabular-nums text-foreground">{report.keggPathways}</div>
            <div className="text-xs text-muted-foreground">KEGG Pathways</div>
          </div>
        </div>
      </Card>

      {keggPlot?.outputIdPng != null && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">KEGG Pathway Enrichment</h4>
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={!pngUrl}
              className="flex items-center gap-1 rounded text-xs text-primary transition-colors duration-150 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            >
              <Download className="h-3 w-3" />
              PNG
            </button>
          </div>
          {imgError ? (
            <div className="flex h-48 items-center justify-center rounded border border-border bg-muted">
              <p className="text-xs text-destructive">Failed to load plot.</p>
            </div>
          ) : pngUrl ? (
            <img
              src={`${pngUrl}&display=inline`}
              alt="KEGG Pathway Enrichment"
              className="w-full rounded border border-border"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex h-48 items-center justify-center rounded border border-border bg-muted">
              <Spinner />
            </div>
          )}
        </Card>
      )}

      {report.keggPathways === 0 && (
        <Card>
          <EmptyState
            icon={SearchX}
            title="No KEGG pathways"
            description="No significant KEGG pathways found at the current FDR threshold."
          />
        </Card>
      )}

      {report.keggPreview.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">KEGG Results</h4>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadPathwayKEGGResults(jobId)}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Download CSV
            </Button>
          </div>
          <DataTable columns={columns} data={report.keggPreview} pageSize={15} />
        </Card>
      )}
    </div>
  );
}
