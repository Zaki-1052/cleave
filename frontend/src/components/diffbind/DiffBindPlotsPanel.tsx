// frontend/src/components/diffbind/DiffBindPlotsPanel.tsx
import { Download } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useEffect, useState } from 'react';

import { getOutputSignedUrl } from '@/api/jobs';
import type { DiffBindPlotInfo } from '@/api/types';
import { Card } from '@/components/layout/Card';
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
          {error instanceof Error ? error.message : 'Failed to load DiffBind plots.'}
        </p>
      </Card>
    );
  }

  // Filter out plots where the PNG output is missing (e.g., edgeR mode has no heatmaps)
  const availablePlots = report.plotOutputs.filter((p) => p.outputIdPng !== null);

  if (availablePlots.length === 0) {
    return (
      <Card>
        <p className="py-6 text-center text-sm text-gray-400">
          No plots available for this DiffBind analysis.
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
        <h4 className="font-display text-sm font-semibold text-gray-700">{label}</h4>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={!pngUrl}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:text-gray-300"
          >
            <Download className="h-3 w-3" />
            PNG
          </button>
          {plot.outputIdSvg !== null && (
            <button
              type="button"
              onClick={handleDownloadSvg}
              disabled={!svgUrl}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:text-gray-300"
            >
              <Download className="h-3 w-3" />
              SVG
            </button>
          )}
        </div>
      </div>

      {description && (
        <p className="mb-3 text-xs text-gray-500">{description}</p>
      )}

      {imgError ? (
        <div className="flex h-48 items-center justify-center rounded border border-gray-200 bg-gray-50">
          <p className="text-xs text-red-500">Failed to load plot.</p>
        </div>
      ) : pngUrl ? (
        <img
          src={`${pngUrl}&display=inline`}
          alt={`${label}`}
          className="w-full rounded border border-gray-100"
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
