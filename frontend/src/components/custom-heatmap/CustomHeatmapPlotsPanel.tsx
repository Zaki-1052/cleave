// frontend/src/components/custom-heatmap/CustomHeatmapPlotsPanel.tsx
import { Download, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getOutputSignedUrl, downloadHeatmapMatrix } from '@/api/jobs';
import type { CustomHeatmapPlotInfo } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useCustomHeatmapReport } from '@/hooks/useJobs';

interface CustomHeatmapPlotsPanelProps {
  jobId: number;
}

export function CustomHeatmapPlotsPanel({ jobId }: CustomHeatmapPlotsPanelProps) {
  const { data: report, isLoading, error } = useCustomHeatmapReport(jobId);
  const [matrixDownloading, setMatrixDownloading] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <div className="mb-2 flex items-center justify-between">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="mb-3 h-4 w-3/4" />
              <Skeleton className="h-48 w-full" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <p className="text-sm text-foreground/80">
          {error instanceof Error ? error.message : 'Failed to load heatmap report.'}
        </p>
      </div>
    );
  }

  async function handleDownloadMatrix() {
    setMatrixDownloading(true);
    try {
      await downloadHeatmapMatrix(jobId);
    } finally {
      setMatrixDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Signal around the {report.referencePoint} of reference regions in{' '}
          <strong>{report.bedLabel}</strong>, with a <span className="font-mono tabular-nums">{report.flankingUpstream}</span> bp upstream and{' '}
          <span className="font-mono tabular-nums">{report.flankingDownstream}</span> bp downstream flanking window.{' '}
          <span className="font-mono tabular-nums">{report.sampleCount}</span> sample{report.sampleCount !== 1 ? 's' : ''} shown.
        </p>
        {report.matrixOutputId != null && (
          <Button
            variant="outline"
            onClick={handleDownloadMatrix}
            disabled={matrixDownloading}
            className="flex items-center gap-1 text-xs"
          >
            <Download className="mr-1 h-3 w-3" />
            {matrixDownloading ? 'Downloading...' : 'Matrix (.gz)'}
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PlotCard
          jobId={jobId}
          plotInfo={report.plotOutput}
          label="Reference-Point Heatmap"
          description="Per-region signal heatmap showing enrichment patterns around reference points."
          filenameBase="custom_heatmap"
        />
        <PlotCard
          jobId={jobId}
          plotInfo={report.profileOutput}
          label="Profile Plot"
          description="Mean signal curve showing average enrichment around reference points across all regions."
          filenameBase="custom_heatmap_profile"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable plot card — fetches signed URL and renders image
// ---------------------------------------------------------------------------

interface PlotCardProps {
  jobId: number;
  plotInfo: CustomHeatmapPlotInfo;
  label: string;
  description: string;
  filenameBase: string;
}

function PlotCard({ jobId, plotInfo, label, description, filenameBase }: PlotCardProps) {
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (plotInfo.outputIdPng != null) {
      getOutputSignedUrl(jobId, plotInfo.outputIdPng)
        .then((res) => setPngUrl(res.url))
        .catch(() => setImgError(true));
    }
  }, [jobId, plotInfo.outputIdPng]);

  useEffect(() => {
    if (plotInfo.outputIdSvg != null) {
      getOutputSignedUrl(jobId, plotInfo.outputIdSvg)
        .then((res) => setSvgUrl(res.url))
        .catch(() => { /* SVG unavailable — non-critical */ });
    }
  }, [jobId, plotInfo.outputIdSvg]);

  if (plotInfo.outputIdPng == null && plotInfo.outputIdSvg == null) {
    return null;
  }

  function handleDownloadPng() {
    if (!pngUrl) return;
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = `${filenameBase}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function handleDownloadSvg() {
    if (!svgUrl) return;
    const link = document.createElement('a');
    link.href = svgUrl;
    link.download = `${filenameBase}.svg`;
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
          {plotInfo.outputIdSvg != null && (
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

      <p className="mb-3 text-xs text-muted-foreground">{description}</p>

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
        <Skeleton className="h-48 w-full" />
      )}
    </Card>
  );
}
