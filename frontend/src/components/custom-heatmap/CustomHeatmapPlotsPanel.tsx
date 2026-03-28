// frontend/src/components/custom-heatmap/CustomHeatmapPlotsPanel.tsx
import { useEffect, useState } from 'react';

import { getOutputSignedUrl, downloadHeatmapMatrix } from '@/api/jobs';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { useCustomHeatmapReport } from '@/hooks/useJobs';

interface CustomHeatmapPlotsPanelProps {
  jobId: number;
}

export function CustomHeatmapPlotsPanel({ jobId }: CustomHeatmapPlotsPanelProps) {
  const { data: report, isLoading, error } = useCustomHeatmapReport(jobId);
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [matrixDownloading, setMatrixDownloading] = useState(false);

  const plotOutput = report?.plotOutput;

  useEffect(() => {
    if (plotOutput?.outputIdPng != null) {
      getOutputSignedUrl(jobId, plotOutput.outputIdPng)
        .then((res) => setPngUrl(res.url))
        .catch(() => setImgError(true));
    }
  }, [jobId, plotOutput?.outputIdPng]);

  useEffect(() => {
    if (plotOutput?.outputIdSvg != null) {
      getOutputSignedUrl(jobId, plotOutput.outputIdSvg)
        .then((res) => setSvgUrl(res.url))
        .catch(() => { /* SVG download unavailable — non-critical */ });
    }
  }, [jobId, plotOutput?.outputIdSvg]);

  if (isLoading) {
    return (
      <Card>
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
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

  function handleDownloadPng() {
    if (!pngUrl) return;
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = 'custom_heatmap.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function handleDownloadSvg() {
    if (!svgUrl) return;
    const link = document.createElement('a');
    link.href = svgUrl;
    link.download = 'custom_heatmap.svg';
    document.body.appendChild(link);
    link.click();
    link.remove();
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
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">Reference-Point Heatmap</h4>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={!pngUrl}
            className="text-xs text-primary hover:text-primary/80 disabled:text-gray-300"
          >
            PNG
          </button>
          {plotOutput?.outputIdSvg != null && (
            <button
              type="button"
              onClick={handleDownloadSvg}
              disabled={!svgUrl}
              className="text-xs text-primary hover:text-primary/80 disabled:text-gray-300"
            >
              SVG
            </button>
          )}
          {report.matrixOutputId != null && (
            <Button
              variant="outlined"
              size="sm"
              onClick={handleDownloadMatrix}
              disabled={matrixDownloading}
            >
              {matrixDownloading ? 'Downloading...' : 'Matrix (.gz)'}
            </Button>
          )}
        </div>
      </div>

      <p className="mb-4 text-xs text-gray-500">
        Signal around the {report.referencePoint} of reference regions in <strong>{report.bedLabel}</strong>,
        with a {report.flankingUpstream} bp upstream and {report.flankingDownstream} bp downstream flanking window.
        {report.sampleCount} sample{report.sampleCount !== 1 ? 's' : ''} shown.
      </p>

      {imgError ? (
        <div className="flex h-64 items-center justify-center rounded border border-gray-200 bg-gray-50">
          <p className="text-xs text-red-500">Failed to load heatmap image.</p>
        </div>
      ) : pngUrl ? (
        <img
          src={`${pngUrl}&display=inline`}
          alt="Custom reference-point heatmap"
          className="mx-auto max-w-full rounded border border-gray-100"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-64 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}
    </Card>
  );
}
