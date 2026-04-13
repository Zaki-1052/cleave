// frontend/src/components/rnaseq-de/DEPlotsPanel.tsx
import { Download } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useEffect, useState } from 'react';

import { getOutputSignedUrl } from '@/api/jobs';
import type { RnaseqDEPlotInfo } from '@/api/types';
import { Card } from '@/components/layout/Card';
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
          {error instanceof Error ? error.message : 'Failed to load DE plots.'}
        </p>
      </Card>
    );
  }

  const availablePlots = report.plotOutputs.filter((p) => p.outputIdPng !== null);

  if (availablePlots.length === 0) {
    return (
      <Card>
        <p className="py-6 text-center text-sm text-muted-foreground">
          No plots available for this DE analysis.
        </p>
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
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:opacity-40"
          >
            <Download className="h-3 w-3" />
            PNG
          </button>
          {plot.outputIdSvg !== null && (
            <button
              type="button"
              onClick={handleDownloadSvg}
              disabled={!svgUrl}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:opacity-40"
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
        <div className="flex h-48 items-center justify-center">
          <Spinner />
        </div>
      )}
    </Card>
  );
}
