// frontend/src/components/normalization/NormalizationResultsPanel.tsx
import { Download, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  getOutputSignedUrl,
  downloadNormalizationFactors,
} from '@/api/jobs';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { useRomanNormalizationReport } from '@/hooks/useJobs';

interface NormalizationResultsPanelProps {
  jobId: number;
}

export function NormalizationResultsPanel({ jobId }: NormalizationResultsPanelProps) {
  const { data: report, isLoading, error } = useRomanNormalizationReport(jobId);

  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [factorsDownloading, setFactorsDownloading] = useState(false);

  useEffect(() => {
    if (!report) return;
    if (report.plotOutputIdPng != null) {
      getOutputSignedUrl(jobId, report.plotOutputIdPng)
        .then((res) => setPngUrl(res.url))
        .catch(() => setImgError(true));
    }
  }, [jobId, report]);

  useEffect(() => {
    if (!report) return;
    if (report.plotOutputIdSvg != null) {
      getOutputSignedUrl(jobId, report.plotOutputIdSvg)
        .then((res) => setSvgUrl(res.url))
        .catch(() => { /* SVG unavailable -- non-critical */ });
    }
  }, [jobId, report]);

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
          {error instanceof Error ? error.message : 'Failed to load normalization report.'}
        </p>
      </Card>
    );
  }

  async function handleDownloadFactors() {
    setFactorsDownloading(true);
    try {
      await downloadNormalizationFactors(jobId);
    } finally {
      setFactorsDownloading(false);
    }
  }

  function handleDownloadPng() {
    if (!pngUrl) return;
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = 'normalization_factors.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function handleDownloadSvg() {
    if (!svgUrl) return;
    const link = document.createElement('a');
    link.href = svgUrl;
    link.download = 'normalization_factors.svg';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Roman normalization of {report.sampleCount} sample
          {report.sampleCount !== 1 ? 's' : ''} on {report.referenceGenome}.
          Reference sample: {report.referenceSample}.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outlined"
            onClick={handleDownloadFactors}
            disabled={factorsDownloading}
            className="flex items-center gap-1 text-xs"
          >
            <Download className="mr-1 h-3 w-3" />
            {factorsDownloading ? 'Downloading...' : 'Factors CSV'}
          </Button>
        </div>
      </div>

      {/* Normalization factors table */}
      <Card>
        <h4 className="mb-3 font-display text-sm font-semibold text-gray-700">Normalization Factors</h4>
        <p className="mb-3 text-xs text-gray-500">
          99th percentile signal values and normalization factors for each sample.
          All samples are normalized relative to the reference sample (NF = 1.0).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-2 font-display text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Sample Name
                </th>
                <th className="px-4 py-2 font-display text-xs font-semibold uppercase tracking-wide text-gray-500">
                  99th Percentile
                </th>
                <th className="px-4 py-2 font-display text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Normalization Factor
                </th>
              </tr>
            </thead>
            <tbody>
              {report.normalizationFactors.map((entry, idx) => (
                <tr
                  key={entry.sampleName}
                  className={
                    idx === 0
                      ? 'border-b border-gray-100 bg-blue-50'
                      : 'border-b border-gray-100 hover:bg-gray-50'
                  }
                >
                  <td className="px-4 py-2 font-medium text-gray-700">
                    {entry.sampleName}
                    {idx === 0 && (
                      <span className="ml-2 text-xs text-blue-600">(reference)</span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono tabular-nums text-gray-600">
                    {entry.percentile99.toFixed(4)}
                  </td>
                  <td className="px-4 py-2 font-mono tabular-nums text-gray-600">
                    {entry.normalizationFactor.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Bar chart image */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-display text-sm font-semibold text-gray-700">Normalization Factor Plot</h4>
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
            {report.plotOutputIdSvg != null && (
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

        <p className="mb-3 text-xs text-gray-500">
          Bar chart of per-sample normalization factors derived from 99th percentile signal values.
          A factor of 1.0 indicates the reference sample; values above 1.0 indicate higher
          signal relative to the reference.
        </p>

        {imgError ? (
          <div className="flex h-48 items-center justify-center rounded border border-gray-200 bg-gray-50">
            <p className="text-xs text-red-500">Failed to load plot.</p>
          </div>
        ) : pngUrl ? (
          <img
            src={`${pngUrl}&display=inline`}
            alt="Normalization Factor Bar Chart"
            className="w-full rounded border border-gray-100"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
      </Card>
    </div>
  );
}
