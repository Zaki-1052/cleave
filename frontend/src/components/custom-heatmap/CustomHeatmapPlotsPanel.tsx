// frontend/src/components/custom-heatmap/CustomHeatmapPlotsPanel.tsx
import { Download, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getOutputSignedUrl, downloadHeatmapMatrix } from '@/api/jobs';
import type { CustomHeatmapPlotInfo } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { useCustomHeatmapReport } from '@/hooks/useJobs';

interface CustomHeatmapPlotsPanelProps {
  jobId: number;
}

export function CustomHeatmapPlotsPanel({ jobId }: CustomHeatmapPlotsPanelProps) {
  const { data: report, isLoading, error } = useCustomHeatmapReport(jobId);
  const [matrixDownloading, setMatrixDownloading] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  if (error || !report) {
    return (
      <Card>
        <p className="text-sm text-red-600">
          {error instanceof Error ? error.message : 'Failed to load heatmap report.'}
        </p>
      </Card>
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
        <p className="text-xs text-gray-500">
          Signal around the {report.referencePoint} of reference regions in{' '}
          <strong>{report.bedLabel}</strong>, with a <span className="font-mono">{report.flankingUpstream}</span> bp upstream and{' '}
          <span className="font-mono">{report.flankingDownstream}</span> bp downstream flanking window.{' '}
          <span className="font-mono">{report.sampleCount}</span> sample{report.sampleCount !== 1 ? 's' : ''} shown.
        </p>
        {report.matrixOutputId != null && (
          <Button
            variant="outlined"
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
        <h4 className="font-display text-sm font-semibold uppercase tracking-wide text-gray-500">{label}</h4>
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
          {plotInfo.outputIdSvg != null && (
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

      <p className="mb-3 text-xs text-gray-500">{description}</p>

      {imgError ? (
        <div className="flex h-48 items-center justify-center rounded border border-gray-200 bg-gray-50">
          <p className="text-xs text-red-500">Failed to load plot.</p>
        </div>
      ) : pngUrl ? (
        <img
          src={`${pngUrl}&display=inline`}
          alt={label}
          className="w-full rounded border border-gray-100"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
    </Card>
  );
}
