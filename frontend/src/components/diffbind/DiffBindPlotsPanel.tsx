// frontend/src/components/diffbind/DiffBindPlotsPanel.tsx
import { AlertCircle, Download, LineChart } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getOutputSignedUrl } from '@/api/jobs';
import type { DiffBindPlotInfo } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDiffBindReport } from '@/hooks/useJobs';

interface DiffBindPlotsPanelProps {
  jobId: number;
}

const PLOT_LABELS: Record<string, string> = {
  pca: 'PCA Plot',
  ma: 'MA Plot',
  volcano: 'Volcano Plot',
  heatmap_group: 'Heatmap (Group)',
  heatmap_condition: 'Heatmap (Condition)',
};

const PLOT_DESCRIPTIONS: Record<string, string> = {
  pca: 'Principal Component Analysis showing sample clustering. Replicates of the same condition should group together.',
  ma: 'Mean-Average plot showing log2 fold change vs. mean concentration. Significantly differential peaks are highlighted.',
  volcano: 'Volcano plot showing statistical significance (-log10 p-value) vs. fold change. Points in the upper corners represent the most significant differentially bound regions.',
  heatmap_group: 'Correlation heatmap grouped by overall sample similarity, showing the binding affinity relationship between all samples.',
  heatmap_condition: 'Binding affinity heatmap showing differentially bound regions colored by experimental condition.',
};

export function DiffBindPlotsPanel({ jobId }: DiffBindPlotsPanelProps) {
  const { data: report, isLoading, error } = useDiffBindReport(jobId);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <PlotCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <p className="text-sm text-foreground/80">
          {error instanceof Error ? error.message : 'Failed to load DiffBind plots.'}
        </p>
      </div>
    );
  }

  // Filter out plots where the PNG output is missing (e.g., edgeR mode has no heatmaps)
  const availablePlots = report.plotOutputs.filter((p) => p.outputIdPng !== null);

  if (availablePlots.length === 0) {
    return (
      <EmptyState
        icon={LineChart}
        title="No plots available"
        description="No plots were generated for this DiffBind analysis."
      />
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

// ---------------------------------------------------------------------------
// Loading placeholder — mirrors a plot card's title row, description, and image
// ---------------------------------------------------------------------------

function PlotCardSkeleton() {
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="mb-3 h-3 w-full" />
      <Skeleton className="h-48 w-full rounded-md" />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Individual plot card — fetches signed URL and renders image
// ---------------------------------------------------------------------------

interface PlotCardProps {
  jobId: number;
  plot: DiffBindPlotInfo;
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
        <div className="flex h-48 items-center justify-center rounded-md border border-destructive/30 bg-destructive/10">
          <span className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            Failed to load plot.
          </span>
        </div>
      ) : pngUrl ? (
        <img
          src={`${pngUrl}&display=inline`}
          alt={`${label}`}
          className="w-full rounded border border-border"
          onError={() => setImgError(true)}
        />
      ) : (
        <Skeleton className="h-48 w-full rounded-md" />
      )}
    </Card>
  );
}
