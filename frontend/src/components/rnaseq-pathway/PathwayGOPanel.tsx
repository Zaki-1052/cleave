// frontend/src/components/rnaseq-pathway/PathwayGOPanel.tsx
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Card } from '@/components/layout/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { getOutputSignedUrl, downloadPathwayGOResults, downloadPathwayGeneList } from '@/api/jobs';
import { usePathwayReport } from '@/hooks/useJobs';
import type { PathwayPlotInfo } from '@/api/types';
import type { ColumnDef } from '@tanstack/react-table';

interface PathwayGOPanelProps {
  jobId: number;
}

const GO_PLOT_LABELS: Record<string, string> = {
  go_bp: 'GO — Biological Process',
  go_mf: 'GO — Molecular Function',
  go_cc: 'GO — Cellular Component',
};

export function PathwayGOPanel({ jobId }: PathwayGOPanelProps) {
  const { data: report, isLoading, error } = usePathwayReport(jobId);
  const [ontologyFilter, setOntologyFilter] = useState('');

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

  const totalGo = report.goBpTerms + report.goMfTerms + report.goCcTerms;

  const goPlots = report.plotOutputs.filter(
    (p) => ['go_bp', 'go_mf', 'go_cc'].includes(p.plotType) && p.outputIdPng !== null,
  );

  const filteredPreview = ontologyFilter
    ? report.goPreview.filter((row) => row['ontology'] === ontologyFilter)
    : report.goPreview;

  const columns: ColumnDef<Record<string, string | number>>[] = report.goColumnNames
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

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="rounded-md border border-border bg-muted/50 px-4 py-2 text-center">
            <div className="text-lg font-semibold font-display">{totalGo}</div>
            <div className="text-xs text-muted-foreground">Total GO Terms</div>
          </div>
          <div className="rounded-md border border-border bg-muted/50 px-4 py-2 text-center">
            <div className="text-lg font-semibold font-display">{report.goBpTerms}</div>
            <div className="text-xs text-muted-foreground">BP</div>
          </div>
          <div className="rounded-md border border-border bg-muted/50 px-4 py-2 text-center">
            <div className="text-lg font-semibold font-display">{report.goMfTerms}</div>
            <div className="text-xs text-muted-foreground">MF</div>
          </div>
          <div className="rounded-md border border-border bg-muted/50 px-4 py-2 text-center">
            <div className="text-lg font-semibold font-display">{report.goCcTerms}</div>
            <div className="text-xs text-muted-foreground">CC</div>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {report.mappedEntrezGenes} of {report.totalInputGenes} genes mapped to Entrez IDs
          ({report.unmappedGenes} unmapped)
        </p>
      </Card>

      {goPlots.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {goPlots.map((plot) => (
            <GOPlotCard key={plot.plotType} jobId={jobId} plot={plot} />
          ))}
        </div>
      )}

      {totalGo === 0 && (
        <Card>
          <p className="py-6 text-center text-sm text-muted-foreground">
            No significant GO terms found at the current FDR threshold.
          </p>
        </Card>
      )}

      {filteredPreview.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-display text-sm font-semibold">GO Enrichment Results</h4>
            <div className="flex items-center gap-2">
              <Select value={ontologyFilter} onValueChange={setOntologyFilter}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  <SelectItem value="BP">BP</SelectItem>
                  <SelectItem value="MF">MF</SelectItem>
                  <SelectItem value="CC">CC</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadPathwayGOResults(jobId)}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Download CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadPathwayGeneList(jobId)}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Gene List
              </Button>
            </div>
          </div>
          <DataTable columns={columns} data={filteredPreview} pageSize={15} />
        </Card>
      )}
    </div>
  );
}

function GOPlotCard({ jobId, plot }: { jobId: number; plot: PathwayPlotInfo }) {
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const label = GO_PLOT_LABELS[plot.plotType] ?? plot.plotType;

  useEffect(() => {
    if (plot.outputIdPng !== null) {
      getOutputSignedUrl(jobId, plot.outputIdPng)
        .then((res) => setPngUrl(res.url))
        .catch(() => setImgError(true));
    }
  }, [jobId, plot.outputIdPng]);

  function handleDownload() {
    if (!pngUrl) return;
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = `${plot.plotType}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-display text-xs font-semibold text-foreground">{label}</h4>
        <button
          type="button"
          onClick={handleDownload}
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
          alt={label}
          className="w-full rounded border border-border"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-48 items-center justify-center rounded border border-border bg-muted">
          <Spinner />
        </div>
      )}
    </Card>
  );
}
