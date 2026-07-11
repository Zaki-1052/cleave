// frontend/src/components/normalization/NormalizationResultsPanel.tsx
import { Download, AlertCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useEffect, useState } from 'react';

import {
  getOutputSignedUrl,
  downloadNormalizationFactors,
} from '@/api/jobs';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
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
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-8 w-28" />
        </div>
        <Card>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-3 w-2/3" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </Card>
        <Card>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-48 w-full" />
        </Card>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-foreground/80">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <span>
          {error instanceof Error ? error.message : 'Failed to load normalization report.'}
        </span>
      </div>
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
        <p className="text-xs text-muted-foreground">
          Roman normalization of {report.sampleCount} sample
          {report.sampleCount !== 1 ? 's' : ''} on {report.referenceGenome}.
          Reference sample: {report.referenceSample}.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadFactors}
            loading={factorsDownloading}
            className="text-xs"
          >
            <Download className="mr-1 h-3 w-3" />
            Factors CSV
          </Button>
        </div>
      </div>

      {/* Normalization factors table */}
      <Card>
        <h4 className="mb-3 font-display text-sm font-semibold text-foreground">Normalization Factors</h4>
        <p className="mb-3 text-xs text-muted-foreground">
          99th percentile signal values and normalization factors for each sample.
          All samples are normalized relative to the reference sample (NF = 1.0).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm tabular-nums">
            <thead>
              <tr className="border-b-2 border-border">
                <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Sample Name
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  99th Percentile
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
                      ? 'border-b border-border/70 bg-accent'
                      : 'border-b border-border/70 transition-colors duration-150 hover:bg-accent/50'
                  }
                >
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {entry.sampleName}
                    {idx === 0 && (
                      <span className="ml-2 font-mono text-[11px] text-info">(reference)</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                    {entry.percentile99.toFixed(4)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
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
          <h4 className="font-display text-sm font-semibold text-foreground">Normalization Factor Plot</h4>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={!pngUrl}
              className="flex items-center gap-1 rounded-sm text-xs font-medium text-primary transition-colors duration-150 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            >
              <Download className="h-3 w-3" />
              PNG
            </button>
            {report.plotOutputIdSvg != null && (
              <button
                type="button"
                onClick={handleDownloadSvg}
                disabled={!svgUrl}
                className="flex items-center gap-1 rounded-sm text-xs font-medium text-primary transition-colors duration-150 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
              >
                <Download className="h-3 w-3" />
                SVG
              </button>
            )}
          </div>
        </div>

        <p className="mb-3 text-xs text-muted-foreground">
          Bar chart of per-sample normalization factors derived from 99th percentile signal values.
          A factor of 1.0 indicates the reference sample; values above 1.0 indicate higher
          signal relative to the reference.
        </p>

        {imgError ? (
          <div className="flex h-48 items-center justify-center rounded-md border border-border bg-muted">
            <p className="text-xs text-destructive">Failed to load plot.</p>
          </div>
        ) : pngUrl ? (
          <img
            src={`${pngUrl}&display=inline`}
            alt="Normalization Factor Bar Chart"
            className="w-full rounded-md border border-border"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-48 items-center justify-center">
            <Spinner />
          </div>
        )}
      </Card>
    </div>
  );
}
