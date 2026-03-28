// frontend/src/components/pearson-correlation/PearsonCorrelationPlotsPanel.tsx
import { useEffect, useState } from 'react';

import {
  getOutputSignedUrl,
  downloadPearsonCorrelation,
  downloadPearsonCoverage,
} from '@/api/jobs';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { usePearsonCorrelationReport } from '@/hooks/useJobs';

interface PearsonCorrelationPlotsPanelProps {
  jobId: number;
}

export function PearsonCorrelationPlotsPanel({ jobId }: PearsonCorrelationPlotsPanelProps) {
  const { data: report, isLoading, error } = usePearsonCorrelationReport(jobId);

  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [corrDownloading, setCorrDownloading] = useState(false);
  const [covDownloading, setCovDownloading] = useState(false);

  useEffect(() => {
    if (!report) return;
    if (report.plotOutput.outputIdPng != null) {
      getOutputSignedUrl(jobId, report.plotOutput.outputIdPng)
        .then((res) => setPngUrl(res.url))
        .catch(() => setImgError(true));
    }
  }, [jobId, report]);

  useEffect(() => {
    if (!report) return;
    if (report.plotOutput.outputIdSvg != null) {
      getOutputSignedUrl(jobId, report.plotOutput.outputIdSvg)
        .then((res) => setSvgUrl(res.url))
        .catch(() => { /* SVG unavailable -- non-critical */ });
    }
  }, [jobId, report]);

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
          {error instanceof Error ? error.message : 'Failed to load correlation report.'}
        </p>
      </Card>
    );
  }

  async function handleDownloadCorrelation() {
    setCorrDownloading(true);
    try {
      await downloadPearsonCorrelation(jobId);
    } finally {
      setCorrDownloading(false);
    }
  }

  async function handleDownloadCoverage() {
    setCovDownloading(true);
    try {
      await downloadPearsonCoverage(jobId);
    } finally {
      setCovDownloading(false);
    }
  }

  function handleDownloadPng() {
    if (!pngUrl) return;
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = 'pearson_correlation.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function handleDownloadSvg() {
    if (!svgUrl) return;
    const link = document.createElement('a');
    link.href = svgUrl;
    link.download = 'pearson_correlation.svg';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Pairwise Pearson correlation of {report.sampleCount} sample
          {report.sampleCount !== 1 ? 's' : ''} on {report.referenceGenome}.
          {report.maskingApplied ? ' Zero-coverage bins removed.' : ''}
          {report.restrictBedLabel
            ? ` Restricted to regions in ${report.restrictBedLabel}.`
            : ' Genome-wide analysis.'}
        </p>
        <div className="flex items-center gap-2">
          {report.correlationMatrixOutputId != null && (
            <Button
              variant="outlined"
              onClick={handleDownloadCorrelation}
              disabled={corrDownloading}
              className="text-xs"
            >
              {corrDownloading ? 'Downloading...' : 'Correlation CSV'}
            </Button>
          )}
          {report.coverageMatrixOutputId != null && (
            <Button
              variant="outlined"
              onClick={handleDownloadCoverage}
              disabled={covDownloading}
              className="text-xs"
            >
              {covDownloading ? 'Downloading...' : 'Coverage CSV'}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-700">Correlation Heatmap</h4>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={!pngUrl}
              className="text-xs text-primary hover:text-primary/80 disabled:text-gray-300"
            >
              PNG
            </button>
            {report.plotOutput.outputIdSvg != null && (
              <button
                type="button"
                onClick={handleDownloadSvg}
                disabled={!svgUrl}
                className="text-xs text-primary hover:text-primary/80 disabled:text-gray-300"
              >
                SVG
              </button>
            )}
          </div>
        </div>

        <p className="mb-3 text-xs text-gray-500">
          Pairwise Pearson correlation coefficients displayed as a color-coded heatmap.
          Values range from -1 (inverse correlation) to +1 (perfect correlation).
          Replicates of the same condition should show high correlation (&gt;0.9).
        </p>

        {imgError ? (
          <div className="flex h-48 items-center justify-center rounded border border-gray-200 bg-gray-50">
            <p className="text-xs text-red-500">Failed to load plot.</p>
          </div>
        ) : pngUrl ? (
          <img
            src={`${pngUrl}&display=inline`}
            alt="Pearson Correlation Heatmap"
            className="w-full rounded border border-gray-100"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-48 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}
      </Card>
    </div>
  );
}
