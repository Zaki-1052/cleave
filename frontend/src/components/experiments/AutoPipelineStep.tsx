// frontend/src/components/experiments/AutoPipelineStep.tsx
import { useEffect, useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import { AutoPipelineConfigPanel } from './AutoPipelineConfigPanel';
import { useReactions } from '@/hooks/useReactions';

interface AutoPipelineStepProps {
  experimentId: number;
  assayType: string;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  referenceGenome: string;
  setReferenceGenome: (v: string) => void;
  peakCaller: string;
  setPeakCaller: (v: string) => void;
  peakSize: string;
  setPeakSize: (v: string) => void;
  includeNormalization: boolean;
  setIncludeNormalization: (v: boolean) => void;
  includeDiffbind: boolean;
  setIncludeDiffbind: (v: boolean) => void;
  includeHeatmap: boolean;
  setIncludeHeatmap: (v: boolean) => void;
  includePearson: boolean;
  setIncludePearson: (v: boolean) => void;
}

export function AutoPipelineStep({
  experimentId,
  assayType,
  enabled,
  setEnabled,
  referenceGenome,
  setReferenceGenome,
  peakCaller,
  setPeakCaller,
  peakSize,
  setPeakSize,
  includeNormalization,
  setIncludeNormalization,
  includeDiffbind,
  setIncludeDiffbind,
  includeHeatmap,
  setIncludeHeatmap,
  includePearson,
  setIncludePearson,
}: AutoPipelineStepProps) {
  const isRnaseq = assayType === 'RNA-seq';
  const { data: reactionsData } = useReactions(experimentId);
  const reactions = useMemo(() => reactionsData?.items ?? [], [reactionsData?.items]);
  const [removeDuplicates, setRemoveDuplicates] = useState(false);
  const [includeQc, setIncludeQc] = useState(true);
  const [includeDe, setIncludeDe] = useState(true);

  const detectedGenome = useMemo(() => {
    const orgs = [...new Set(reactions.map((r) => r.organism))];
    if (orgs.length === 1) {
      const org = orgs[0]!.toLowerCase();
      if (org === 'mouse') return 'mm10';
      if (org === 'human') return 'hg38';
      if (org === 'drosophila') return 'dm6';
      if (org === 'yeast') return 'saccer3';
    }
    return 'mm10';
  }, [reactions]);

  // Auto-detect genome when toggle is first enabled
  useEffect(() => {
    if (enabled && !referenceGenome && detectedGenome) {
      setReferenceGenome(detectedGenome);
    }
  }, [enabled, referenceGenome, detectedGenome, setReferenceGenome]);

  const description = isRnaseq
    ? 'Automatically run FastQC, trimming (fastp), alignment (STAR+Salmon), and DE analysis after creating this experiment.'
    : 'Automatically run FastQC, trimming, alignment, and peak calling after creating this experiment.';

  return (
    <div className="space-y-5">
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/50">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded text-primary"
        />
        <Zap className="h-5 w-5 text-primary" />
        <div>
          <span className="text-sm font-semibold text-foreground">
            Run Full Pipeline when done
          </span>
          <p className="text-xs text-muted-foreground">
            {description}
          </p>
        </div>
      </label>

      {enabled ? (
        <AutoPipelineConfigPanel
          reactions={reactions}
          assayType={assayType}
          referenceGenome={referenceGenome}
          setReferenceGenome={setReferenceGenome}
          peakCaller={peakCaller}
          setPeakCaller={setPeakCaller}
          peakSize={peakSize}
          setPeakSize={setPeakSize}
          includeNormalization={includeNormalization}
          setIncludeNormalization={setIncludeNormalization}
          includeDiffbind={includeDiffbind}
          setIncludeDiffbind={setIncludeDiffbind}
          includeHeatmap={includeHeatmap}
          setIncludeHeatmap={setIncludeHeatmap}
          includePearson={includePearson}
          setIncludePearson={setIncludePearson}
          removeDuplicates={removeDuplicates}
          setRemoveDuplicates={setRemoveDuplicates}
          includeQc={includeQc}
          setIncludeQc={setIncludeQc}
          includeDe={includeDe}
          setIncludeDe={setIncludeDe}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            You can also start the full pipeline later from the experiment page
            using the "Run Full Pipeline" button.
          </p>
        </div>
      )}
    </div>
  );
}
