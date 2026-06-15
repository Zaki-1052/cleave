// frontend/src/components/rnaseq-pathway/PathwayKEGGPanel.tsx
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Card } from '@/components/layout/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
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
    return <Card><div className="flex h-40 items-center justify-center"><Spinner size="lg" /></div></Card>;
  }

  if (error || !report) {
    return (
      <Card>
        <p className="text-sm text-red-600 dark:text-red-400">
          {error instanceof Error ? error.message : 'Failed to load pathway report.'}
        </p>
      </Card>
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
            <div className="text-lg font-semibold font-display">{report.keggPathways}</div>
            <div className="text-xs text-muted-foreground">KEGG Pathways</div>
          </div>
        </div>
      </Card>

      {keggPlot?.outputIdPng != null && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="font-display text-sm font-semibold">KEGG Pathway Enrichment</h4>
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={!pngUrl}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:opacity-40"
            >
              <Download className="h-3 w-3" />
              PNG
            </button>
          </div>
          {imgError ? (
            <div className="flex h-48 items-center justify-center rounded border border-border bg-muted">
              <p className="text-xs text-red-500">Failed to load plot.</p>
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
          <p className="py-6 text-center text-sm text-muted-foreground">
            No significant KEGG pathways found at the current FDR threshold.
          </p>
        </Card>
      )}

      {report.keggPreview.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-display text-sm font-semibold">KEGG Results</h4>
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
