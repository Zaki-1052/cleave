// frontend/src/components/experiments/AutoPipelineModal.tsx
import { useState, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { AutoPipelineConfigPanel } from './AutoPipelineConfigPanel';
import { startAutoPipeline, type AutoPipelineConfig } from '@/api/autoPipeline';
import type { Experiment, Reaction } from '@/api/types';

interface AutoPipelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  experiment: Experiment;
  reactions: Reaction[];
  onStarted: () => void;
}

export function AutoPipelineModal({
  isOpen,
  onClose,
  experiment,
  reactions,
  onStarted,
}: AutoPipelineModalProps) {
  const isRnaseq = experiment.assayType === 'RNA-seq';

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

  const [referenceGenome, setReferenceGenome] = useState(detectedGenome);
  // CUT&RUN state
  const [peakCaller, setPeakCaller] = useState('SEACR');
  const [peakSize, setPeakSize] = useState('stringent');
  const [includeNormalization, setIncludeNormalization] = useState(true);
  const [includeDiffbind, setIncludeDiffbind] = useState(true);
  const [includeHeatmap, setIncludeHeatmap] = useState(true);
  const [includePearson, setIncludePearson] = useState(true);
  // RNA-seq state
  const [removeDuplicates, setRemoveDuplicates] = useState(false);
  const [includeQc, setIncludeQc] = useState(true);
  const [includeDe, setIncludeDe] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMouse = referenceGenome === 'mm10';

  async function handleStart() {
    setSubmitting(true);
    setError(null);
    try {
      const config: AutoPipelineConfig = isRnaseq
        ? {
            referenceGenome,
            removeDuplicates,
            includeQc,
            includeDe,
          }
        : {
            referenceGenome,
            peakCaller,
            peakSize,
            macs2Qvalue: 0.01,
            fragmentFilter: true,
            includeNormalization: isMouse && includeNormalization,
            includeDiffbind,
            includeHeatmap,
            includePearson,
          };
      await startAutoPipeline(experiment.id, config);
      onStarted();
      onClose();
    } catch {
      setError('Failed to start auto-pipeline. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Run Full Pipeline" className="max-w-2xl">
      <div className="space-y-5 p-6">
        <AutoPipelineConfigPanel
          reactions={reactions}
          assayType={experiment.assayType}
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

        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outlined" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleStart}
            disabled={!referenceGenome || submitting}
          >
            {submitting ? 'Starting...' : 'Start Full Pipeline'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
