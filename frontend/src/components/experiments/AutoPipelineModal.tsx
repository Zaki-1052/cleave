// frontend/src/components/experiments/AutoPipelineModal.tsx
import { useState, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/layout/Card';
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
  const detectedGenome = useMemo(() => {
    const orgs = [...new Set(reactions.map((r) => r.organism))];
    if (orgs.length === 1) {
      const org = orgs[0]!.toLowerCase();
      if (org === 'mouse') return 'mm10';
      if (org === 'human') return 'hg38';
      if (org === 'drosophila') return 'dm6';
      if (org === 'yeast') return 'saccer3';
    }
    return '';
  }, [reactions]);

  const isMouse = detectedGenome === 'mm10';

  const [referenceGenome, setReferenceGenome] = useState(detectedGenome);
  const [peakCaller, setPeakCaller] = useState('macs2');
  const [peakSize, setPeakSize] = useState('narrow');
  const [includeNormalization, setIncludeNormalization] = useState(isMouse);
  const [includeDiffbind, setIncludeDiffbind] = useState(true);
  const [includeHeatmap, setIncludeHeatmap] = useState(true);
  const [includePearson, setIncludePearson] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nonIggReactions = reactions.filter(
    (r) => !r.shortName.toLowerCase().includes('igg'),
  );

  async function handleStart() {
    setSubmitting(true);
    setError(null);
    try {
      const config: AutoPipelineConfig = {
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

  const steps = [
    { name: 'FastQC', included: true, note: 'Already runs on upload' },
    { name: 'Trimming', included: true, note: 'If adapters detected' },
    { name: 'Alignment', included: true, note: `${referenceGenome || '?'}` },
    { name: 'Peak Calling', included: true, note: `${peakCaller} ${peakSize}` },
    {
      name: 'Roman Normalization',
      included: isMouse && includeNormalization,
      note: isMouse ? '50bp quantile normalization' : 'Mouse only',
    },
    { name: 'DiffBind', included: includeDiffbind, note: 'If conditions detectable' },
    { name: 'Custom Heatmaps', included: includeHeatmap, note: 'Peak BEDs + bigWigs' },
    { name: 'Pearson Correlation', included: includePearson, note: 'Genome-wide' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Run Full Pipeline" className="max-w-2xl">
      <div className="space-y-5 p-6">
        <Card>
          <h3 className="mb-3 text-sm font-semibold uppercase text-gray-500">
            Pipeline Configuration
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Reference Genome
              </label>
              <select
                value={referenceGenome}
                onChange={(e) => setReferenceGenome(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Select...</option>
                <option value="mm10">Mouse mm10</option>
                <option value="hg38">Human hg38</option>
                <option value="hg19">Human hg19</option>
                <option value="dm6">Drosophila dm6</option>
                <option value="sacCer3">Yeast sacCer3</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Peak Caller
              </label>
              <select
                value={`${peakCaller}-${peakSize}`}
                onChange={(e) => {
                  const [caller, size] = e.target.value.split('-');
                  setPeakCaller(caller!);
                  setPeakSize(size!);
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="macs2-narrow">MACS2 Narrow (q=0.01)</option>
                <option value="macs2-broad">MACS2 Broad</option>
                <option value="sicer2-broad">SICER2 Broad</option>
                <option value="seacr-stringent">SEACR Stringent</option>
                <option value="seacr-relaxed">SEACR Relaxed</option>
              </select>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-semibold uppercase text-gray-500">
            Optional Analysis Steps
          </h3>
          <div className="space-y-2">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={isMouse && includeNormalization}
                onChange={(e) => setIncludeNormalization(e.target.checked)}
                disabled={!isMouse}
                className="rounded text-primary disabled:opacity-50"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">
                  Roman Normalization
                </span>
                {!isMouse && (
                  <span className="ml-2 text-xs text-gray-400">(mouse only)</span>
                )}
              </div>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={includeDiffbind}
                onChange={(e) => setIncludeDiffbind(e.target.checked)}
                className="rounded text-primary"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">DiffBind</span>
                <span className="ml-2 text-xs text-gray-400">
                  (auto-detects ctrl/mut from reaction names)
                </span>
              </div>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={includeHeatmap}
                onChange={(e) => setIncludeHeatmap(e.target.checked)}
                className="rounded text-primary"
              />
              <span className="text-sm font-medium text-gray-700">Custom Heatmaps</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={includePearson}
                onChange={(e) => setIncludePearson(e.target.checked)}
                className="rounded text-primary"
              />
              <span className="text-sm font-medium text-gray-700">
                Pearson Correlation
              </span>
            </label>
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-semibold uppercase text-gray-500">
            Pipeline Summary
          </h3>
          <div className="space-y-1">
            {steps.map((step, i) => (
              <div
                key={step.name}
                className={`flex items-center gap-2 text-sm ${
                  step.included ? 'text-gray-700' : 'text-gray-400 line-through'
                }`}
              >
                <span className="w-5 text-center text-xs text-gray-400">
                  {step.included ? i + 1 : '-'}
                </span>
                <span className={step.included ? 'font-medium' : ''}>{step.name}</span>
                <span className="text-xs text-gray-400">{step.note}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            {nonIggReactions.length} reaction(s) will be processed. IgG controls are
            auto-assigned for peak calling.
          </p>
        </Card>

        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
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
