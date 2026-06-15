// frontend/src/components/experiments/AutoPipelineConfigPanel.tsx
import { Card } from '@/components/layout/Card';
import type { Reaction } from '@/api/types';

interface AutoPipelineConfigPanelProps {
  reactions: Reaction[];
  assayType: string;
  referenceGenome: string;
  setReferenceGenome: (v: string) => void;
  // CUT&RUN-specific
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
  // RNA-seq-specific
  removeDuplicates: boolean;
  setRemoveDuplicates: (v: boolean) => void;
  includeQc: boolean;
  setIncludeQc: (v: boolean) => void;
  includeDe: boolean;
  setIncludeDe: (v: boolean) => void;
}

export function AutoPipelineConfigPanel({
  reactions,
  assayType,
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
  removeDuplicates,
  setRemoveDuplicates,
  includeQc,
  setIncludeQc,
  includeDe,
  setIncludeDe,
}: AutoPipelineConfigPanelProps) {
  const isRnaseq = assayType === 'RNA-seq';
  const isMouse = referenceGenome === 'mm10';

  const nonIggReactions = reactions.filter(
    (r) => !r.shortName.toLowerCase().includes('igg'),
  );

  if (isRnaseq) {
    return <RnaseqConfigPanel
      reactions={reactions}
      referenceGenome={referenceGenome}
      setReferenceGenome={setReferenceGenome}
      removeDuplicates={removeDuplicates}
      setRemoveDuplicates={setRemoveDuplicates}
      includeQc={includeQc}
      setIncludeQc={setIncludeQc}
      includeDe={includeDe}
      setIncludeDe={setIncludeDe}
    />;
  }

  // CUT&RUN / CUT&Tag config
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
    <div className="space-y-5">
      <Card>
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
          Pipeline Configuration
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Reference Genome
            </label>
            <select
              value={referenceGenome}
              onChange={(e) => setReferenceGenome(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
            <label className="mb-1 block text-sm font-medium text-foreground">
              Peak Caller
            </label>
            <select
              value={`${peakCaller}-${peakSize}`}
              onChange={(e) => {
                const [caller, size] = e.target.value.split('-');
                setPeakCaller(caller!);
                setPeakSize(size!);
              }}
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="SEACR-stringent">SEACR Stringent (lab default)</option>
              <option value="SEACR-relaxed">SEACR Relaxed</option>
              <option value="MACS2-narrow">MACS2 Narrow (q=0.01)</option>
              <option value="MACS2-broad">MACS2 Broad</option>
              <option value="SICER2-broad">SICER2 Broad</option>
            </select>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
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
              <span className="text-sm font-medium text-foreground">
                Roman Normalization
              </span>
              {!isMouse && (
                <span className="ml-2 text-xs text-muted-foreground">(mouse only)</span>
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
              <span className="text-sm font-medium text-foreground">DiffBind</span>
              <span className="ml-2 text-xs text-muted-foreground">
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
            <span className="text-sm font-medium text-foreground">Custom Heatmaps</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={includePearson}
              onChange={(e) => setIncludePearson(e.target.checked)}
              className="rounded text-primary"
            />
            <span className="text-sm font-medium text-foreground">
              Pearson Correlation
            </span>
          </label>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
          Pipeline Summary
        </h3>
        <div className="space-y-1">
          {steps.map((step, i) => (
            <div
              key={step.name}
              className={`flex items-center gap-2 text-sm ${
                step.included ? 'text-foreground' : 'text-muted-foreground line-through'
              }`}
            >
              <span className="w-5 text-center text-xs text-muted-foreground">
                {step.included ? i + 1 : '-'}
              </span>
              <span className={step.included ? 'font-medium' : ''}>{step.name}</span>
              <span className="text-xs text-muted-foreground">{step.note}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {nonIggReactions.length} reaction(s) will be processed. IgG controls are
          auto-assigned for peak calling.
        </p>
      </Card>
    </div>
  );
}


// ---------------------------------------------------------------------------
// RNA-seq config panel (rendered when assayType === 'RNA-seq')
// ---------------------------------------------------------------------------

interface RnaseqConfigPanelProps {
  reactions: Reaction[];
  referenceGenome: string;
  setReferenceGenome: (v: string) => void;
  removeDuplicates: boolean;
  setRemoveDuplicates: (v: boolean) => void;
  includeQc: boolean;
  setIncludeQc: (v: boolean) => void;
  includeDe: boolean;
  setIncludeDe: (v: boolean) => void;
}

function RnaseqConfigPanel({
  reactions,
  referenceGenome,
  setReferenceGenome,
  removeDuplicates,
  setRemoveDuplicates,
  includeQc,
  setIncludeQc,
  includeDe,
  setIncludeDe,
}: RnaseqConfigPanelProps) {
  const steps = [
    { name: 'FastQC', included: true, note: 'Already runs on upload' },
    { name: 'Trimming (fastp)', included: true, note: 'Adapter + quality trimming' },
    { name: 'Alignment (STAR + Salmon)', included: true, note: `${referenceGenome || '?'} + BigWigs` },
    { name: 'QC Dashboard (RSeQC+MultiQC)', included: includeQc, note: 'Read distribution, coverage, strandedness' },
    { name: 'DE Analysis (DESeq2)', included: includeDe, note: 'If conditions detectable' },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
          Pipeline Configuration
        </h3>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Reference Genome
          </label>
          <select
            value={referenceGenome}
            onChange={(e) => setReferenceGenome(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Select...</option>
            <option value="mm10">Mouse mm10</option>
            <option value="hg38">Human hg38</option>
          </select>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
          Advanced Settings
        </h3>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={removeDuplicates}
            onChange={(e) => setRemoveDuplicates(e.target.checked)}
            className="rounded text-primary"
          />
          <div>
            <span className="text-sm font-medium text-foreground">
              Remove Duplicate Reads
            </span>
            <span className="ml-2 text-xs text-muted-foreground">
              (not recommended for RNA-seq)
            </span>
          </div>
        </label>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
          Optional Analysis Steps
        </h3>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={includeQc}
            onChange={(e) => setIncludeQc(e.target.checked)}
            className="rounded text-primary"
          />
          <div>
            <span className="text-sm font-medium text-foreground">QC Dashboard</span>
            <span className="ml-2 text-xs text-muted-foreground">
              (RSeQC read distribution, coverage, strandedness + MultiQC)
            </span>
          </div>
        </label>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={includeDe}
            onChange={(e) => setIncludeDe(e.target.checked)}
            className="rounded text-primary"
          />
          <div>
            <span className="text-sm font-medium text-foreground">DE Analysis</span>
            <span className="ml-2 text-xs text-muted-foreground">
              (auto-detects conditions from reaction names or treatment field)
            </span>
          </div>
        </label>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
          Pipeline Summary
        </h3>
        <div className="space-y-1">
          {steps.map((step, i) => (
            <div
              key={step.name}
              className={`flex items-center gap-2 text-sm ${
                step.included ? 'text-foreground' : 'text-muted-foreground line-through'
              }`}
            >
              <span className="w-5 text-center text-xs text-muted-foreground">
                {step.included ? i + 1 : '-'}
              </span>
              <span className={step.included ? 'font-medium' : ''}>{step.name}</span>
              <span className="text-xs text-muted-foreground">{step.note}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {reactions.length} reaction(s) will be processed.
        </p>
      </Card>
    </div>
  );
}
