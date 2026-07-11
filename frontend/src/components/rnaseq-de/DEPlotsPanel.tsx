// frontend/src/components/rnaseq-de/DEPlotsPanel.tsx
import { AlertCircle, Download, ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getOutputSignedUrl } from '@/api/jobs';
import type { RnaseqDEPlotInfo } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useRnaseqDEReport } from '@/hooks/useJobs';

interface DEPlotsPanelProps {
  jobId: number;
}

const PLOT_LABELS: Record<string, string> = {
  volcano: 'Volcano Plot',
  ma: 'MA Plot',
  pca: 'PCA Plot',
  distance_heatmap: 'Sample Distance Heatmap',
  gene_heatmap: 'Top Genes Heatmap',
};

const PLOT_DESCRIPTIONS: Record<string, string> = {
  volcano: 'Log2 fold change vs. -log10(adjusted p-value). Points in the upper corners represent the most significant differentially expressed genes.',
  ma: 'Mean expression (baseMean) vs. log2 fold change. Significantly differential genes are highlighted in blue.',
  pca: 'Principal component analysis of regularized log-transformed counts. Replicates of the same condition should cluster together.',
  distance_heatmap: 'Euclidean distance heatmap between all samples based on regularized log-transformed expression. Similar samples cluster together.',
  gene_heatmap: 'Heatmap of the top 50 differentially expressed genes (by adjusted p-value), showing expression patterns across conditions.',
};

export function DEPlotsPanel({ jobId }: DEPlotsPanelProps) {
  const { data: report, isLoading, error } = useRnaseqDEReport(jobId);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <div className="mb-2 flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="mb-3 h-3 w-4/5" />
            <Skeleton className="h-48 w-full rounded border border-border" />
          </Card>
        ))}
      </div>
    );
  }

  if (error || !report) {
    return (
      <Card>
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-foreground/80">
            {error instanceof Error ? error.message : 'Failed to load DE plots.'}
          </p>
        </div>
      </Card>
    );
  }

  const availablePlots = report.plotOutputs.filter((p) => p.outputIdPng !== null);

  if (availablePlots.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ImageOff}
          title="No plots available"
          description="This DE analysis produced no plots."
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {availablePlots.map((plot) => (
        <PlotCard key={plot.plotType} jobId={jobId} plot={plot} />
      ))}
    </div>
  );
}

interface PlotCardProps {
  jobId: number;
  plot: RnaseqDEPlotInfo;
}

function PlotCard({ jobId, plot }: PlotCardProps) {
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const label = PLOT_LABELS[plot.plotType] ?? plot.plotType;
  const description = PLOT_DESCRIPTIONS[plot.plotType] ?? '';

  useEffect(() => {
    if (plot.outputIdPng !== null) {
      getOutputSignedUrl(jobId, plot.outputIdPng)
        .then((res) => setPngUrl(res.url))
        .catch(() => setImgError(true));
    }
  }, [jobId, plot.outputIdPng]);

  useEffect(() => {
    if (plot.outputIdSvg !== null) {
      getOutputSignedUrl(jobId, plot.outputIdSvg)
        .then((res) => setSvgUrl(res.url))
        .catch(() => {
          /* SVG download unavailable — non-critical */
        });
    }
  }, [jobId, plot.outputIdSvg]);

  function handleDownloadPng() {
    if (!pngUrl) return;
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = `${plot.plotType}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function handleDownloadSvg() {
    if (!svgUrl) return;
    const link = document.createElement('a');
    link.href = svgUrl;
    link.download = `${plot.plotType}.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-display text-sm font-semibold text-foreground">{label}</h4>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={!pngUrl}
            className="flex items-center gap-1 rounded-md text-xs text-primary transition-colors duration-150 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            <Download className="h-3 w-3" />
            PNG
          </button>
          {plot.outputIdSvg !== null && (
            <button
              type="button"
              onClick={handleDownloadSvg}
              disabled={!svgUrl}
              className="flex items-center gap-1 rounded-md text-xs text-primary transition-colors duration-150 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            >
              <Download className="h-3 w-3" />
              SVG
            </button>
          )}
        </div>
      </div>

      {description && (
        <p className="mb-3 text-xs text-muted-foreground">{description}</p>
      )}

      {imgError ? (
        <div className="flex h-48 items-center justify-center rounded border border-border bg-muted">
          <p className="text-xs text-destructive">Failed to load plot.</p>
        </div>
      ) : pngUrl ? (
        <img
          src={`${pngUrl}&display=inline`}
          alt={label}
          className="w-full rounded border border-border"
          onError={() => setImgError(true)}
        />
      ) : (
        <Skeleton className="h-48 w-full rounded border border-border" />
      )}
    </Card>
  );
}
