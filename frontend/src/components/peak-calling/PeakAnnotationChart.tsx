// frontend/src/components/peak-calling/PeakAnnotationChart.tsx
import { useCallback, useMemo, useRef } from 'react';
import { Download } from 'lucide-react';
import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { downloadPeakAnnotationCsv } from '@/api/jobs';
import type { PeakAnnotationResult, PeakCallingReactionMetrics } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { ChartTooltipContent } from '@/components/ui/ChartTooltip';
import { extendChartPalette, useChartAxisProps, useChartPalette, useChartToken } from '@/lib/chart-theme';

// Fixed category order — each category keeps a stable color regardless of which are
// present, by mapping category index → palette index (never by render order).
const ANNOTATION_CATEGORIES = [
  'Promoter',
  'Exon',
  'Intron',
  'Intergenic',
  '3UTR',
  '5UTR',
  'TTS',
  'ncRNA',
  'miRNA',
  'pseudo',
] as const;

interface PeakAnnotationChartProps {
  jobId: number;
  annotations: PeakAnnotationResult[];
  referenceGenome: string;
  metrics?: PeakCallingReactionMetrics[];
}

export function PeakAnnotationChart({
  jobId,
  annotations,
  referenceGenome,
  metrics,
}: PeakAnnotationChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const axisProps = useChartAxisProps();
  const cardBg = useChartToken('--card');

  // Re-render when the theme flips (useChartPalette subscribes), then derive the
  // 10-color paired palette; concrete hsl() strings keep the SVG→PNG export safe.
  const basePalette = useChartPalette();
  const palette = useMemo(() => {
    // basePalette identity changes on theme flip → recompute the extended palette.
    void basePalette;
    return extendChartPalette(ANNOTATION_CATEGORIES.length);
  }, [basePalette]);

  // Build lookup: shortName → metrics for rich tooltip
  const metricsMap = useMemo(() => {
    const map = new Map<string, PeakCallingReactionMetrics>();
    if (metrics) {
      for (const m of metrics) map.set(m.shortName, m);
    }
    return map;
  }, [metrics]);

  const chartData = annotations.map((a) => {
    const row: Record<string, string | number> = { shortName: a.shortName };
    for (const cat of ANNOTATION_CATEGORIES) {
      row[cat] = a.categories[cat] ?? 0;
    }
    return row;
  });

  const handleDownloadPng = useCallback(() => {
    const svgEl = chartRef.current?.querySelector('svg');
    if (!svgEl) return;

    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      ctx.scale(2, 2);
      ctx.fillStyle = cardBg;
      ctx.fillRect(0, 0, img.width, img.height);
      ctx.drawImage(img, 0, 0);
      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = 'peak_annotation.png';
      a.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [cardBg]);

  const handleDownloadCsv = useCallback(async () => {
    await downloadPeakAnnotationCsv(jobId);
  }, [jobId]);

  const barHeight = 40;
  const chartHeight = Math.max(250, annotations.length * barHeight + 100);

  return (
    <Card className="mt-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {referenceGenome} Feature Distribution
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadPng}
            className="flex items-center gap-1 rounded text-xs font-medium text-primary transition-colors duration-150 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Download className="h-3 w-3" />
            Download PNG
          </button>
          <button
            onClick={handleDownloadCsv}
            className="flex items-center gap-1 rounded text-xs font-medium text-primary transition-colors duration-150 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Download className="h-3 w-3" />
            Download CSV
          </button>
        </div>
      </div>
      <div ref={chartRef}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} {...axisProps} />
            <YAxis type="category" dataKey="shortName" width={110} {...axisProps} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const shortName = label as string;
                const m = metricsMap.get(shortName);
                const annotationRows = payload
                  .filter((p) => p.value && (p.value as number) > 0)
                  .map((p) => ({ name: p.name as string, value: p.value as number, color: p.color }));
                const metricRows = m
                  ? [
                      { name: 'Peak Caller', value: m.peakCaller, color: 'transparent' },
                      { name: 'Peak Type', value: m.peakSize, color: 'transparent' },
                      { name: 'Threshold', value: m.significanceThreshold, color: 'transparent' },
                      { name: 'Control', value: m.controlShortName || 'N/A', color: 'transparent' },
                    ]
                  : [];
                return (
                  <ChartTooltipContent
                    active
                    label={shortName}
                    payload={[...annotationRows, ...metricRows]}
                    formatValue={(value, entry) =>
                      entry.color === 'transparent'
                        ? String(value ?? 'N/A')
                        : `${Number(value).toFixed(5)}%`
                    }
                  />
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)' }} />
            {ANNOTATION_CATEGORIES.map((cat, i) => (
              <Bar key={cat} dataKey={cat} stackId="stack" fill={palette[i]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
