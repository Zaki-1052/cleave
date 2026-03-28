// frontend/src/components/peak-calling/PeakAnnotationChart.tsx
import { useCallback, useMemo, useRef } from 'react';
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

const ANNOTATION_COLORS: Record<string, string> = {
  Promoter: '#E65100',
  Exon: '#43A047',
  Intron: '#1E88E5',
  Intergenic: '#FDD835',
  '3UTR': '#8E24AA',
  '5UTR': '#D81B60',
  TTS: '#AB47BC',
  ncRNA: '#C62828',
  miRNA: '#4A148C',
  pseudo: '#FF8F00',
};

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
      ctx.fillStyle = '#ffffff';
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
  }, []);

  const handleDownloadCsv = useCallback(async () => {
    await downloadPeakAnnotationCsv(jobId);
  }, [jobId]);

  const barHeight = 40;
  const chartHeight = Math.max(250, annotations.length * barHeight + 100);

  return (
    <Card className="mt-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          {referenceGenome} Feature Distribution
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadPng}
            className="text-xs font-medium text-primary hover:text-primary-dark"
          >
            Download Image as PNG
          </button>
          <button
            onClick={handleDownloadCsv}
            className="text-xs font-medium text-primary hover:text-primary-dark"
          >
            Download Data as CSV
          </button>
        </div>
      </div>
      <div ref={chartRef}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
            <YAxis type="category" dataKey="shortName" width={110} tick={{ fontSize: 12 }} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const shortName = label as string;
                const m = metricsMap.get(shortName);
                const hoveredEntry = payload.find((p) => p.value && (p.value as number) > 0);
                return (
                  <div className="rounded border border-gray-300 bg-white px-3 py-2 text-xs shadow-lg">
                    <p className="mb-1 font-semibold text-gray-800">{shortName}</p>
                    {hoveredEntry && (
                      <>
                        <p>Annotation={hoveredEntry.name}</p>
                        <p>Percentage (%)={(hoveredEntry.value as number).toFixed(5)}</p>
                      </>
                    )}
                    {m && (
                      <>
                        <p>Control Short Name={m.controlShortName || 'N/A'}</p>
                        <p>Peak Type={m.peakSize}</p>
                        <p>Peak Caller={m.peakCaller}</p>
                        <p>Significance Threshold={m.significanceThreshold}</p>
                      </>
                    )}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {ANNOTATION_CATEGORIES.map((cat) => (
              <Bar
                key={cat}
                dataKey={cat}
                stackId="stack"
                fill={ANNOTATION_COLORS[cat]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
