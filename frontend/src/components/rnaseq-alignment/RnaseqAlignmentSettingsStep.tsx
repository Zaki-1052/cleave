// frontend/src/components/rnaseq-alignment/RnaseqAlignmentSettingsStep.tsx
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Reaction } from '@/api/types';
import { GENOME_DISPLAY_NAMES, RNASEQ_REFERENCE_GENOMES } from '@/lib/constants';
import { TrainingHint } from '@/components/ui/TrainingHint';

interface RnaseqAlignmentSettingsStepProps {
  selectedReactions: Reaction[];
  referenceGenome: string;
  setReferenceGenome: (v: string) => void;
  removeDuplicates: boolean | null;
  setRemoveDuplicates: (v: boolean) => void;
  bamCoverageBinSize: number;
  setBamCoverageBinSize: (v: number) => void;
  smoothedBinSize: number;
  setSmoothedBinSize: (v: number) => void;
  isTrainingProject?: boolean;
}

export function RnaseqAlignmentSettingsStep({
  selectedReactions,
  referenceGenome,
  setReferenceGenome,
  removeDuplicates,
  setRemoveDuplicates,
  bamCoverageBinSize,
  setBamCoverageBinSize,
  smoothedBinSize,
  setSmoothedBinSize,
  isTrainingProject = false,
}: RnaseqAlignmentSettingsStepProps) {
  const [showAdvanced, setShowAdvanced] = useState(isTrainingProject);

  const organisms = [...new Set(selectedReactions.map((r) => r.organism))];

  const genomeOptions: { value: string; label: string; organism: string }[] = [];
  for (const org of organisms) {
    const genomes = RNASEQ_REFERENCE_GENOMES[org] ?? [];
    for (const g of genomes) {
      genomeOptions.push({ ...g, organism: org });
    }
  }

  const hasMixedOrganisms = organisms.length > 1;

  return (
    <div className="space-y-6">
      {/* Reference Genome */}
      <div>
        <label
          htmlFor="rnaseq-reference-genome"
          className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Reference Genome <span className="text-red-500">*</span>
        </label>
        {hasMixedOrganisms && (
          <p className="mt-1 text-xs text-amber-600">
            Warning: Selected reactions contain mixed organisms. All will be aligned to the same
            reference genome.
          </p>
        )}
        {genomeOptions.length === 0 && (
          <p className="mt-1 text-xs text-red-600">
            No supported RNA-seq reference genomes for the selected organisms. RNA-seq alignment
            currently supports Mouse (mm10) and Human (hg38).
          </p>
        )}
        <select
          id="rnaseq-reference-genome"
          value={referenceGenome}
          onChange={(e) => setReferenceGenome(e.target.value)}
          className="mt-1 w-full max-w-sm rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
        >
          <option value="" disabled>
            Select reference genome
          </option>
          {hasMixedOrganisms
            ? organisms.map((org) => (
                <optgroup key={org} label={org}>
                  {(RNASEQ_REFERENCE_GENOMES[org] ?? []).map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </optgroup>
              ))
            : genomeOptions.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
        </select>
        <TrainingHint visible={isTrainingProject}>
          The reference genome must match your organism. Mouse uses mm10, human uses hg38.
          STAR and Salmon indices must be pre-built for the selected genome.
        </TrainingHint>
      </div>

      {/* Reactions table */}
      <div>
        <h4 className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Reactions
        </h4>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-primary/10">
                <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Short Name
                </th>
                <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Organism
                </th>
                <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Reference Genome
                </th>
              </tr>
            </thead>
            <tbody>
              {selectedReactions.map((r) => (
                <tr key={r.id} className="border-b hover:bg-muted">
                  <td className="px-3 py-2 font-medium text-foreground">{r.shortName}</td>
                  <td className="px-3 py-2 text-foreground">{r.organism}</td>
                  <td className="px-3 py-2 text-foreground">
                    {referenceGenome ? (GENOME_DISPLAY_NAMES[referenceGenome] ?? referenceGenome) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="rounded-md border border-border">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-muted"
        >
          <span>Advanced Settings</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
          />
        </button>

        {showAdvanced && (
          <div className="border-t px-4 py-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={removeDuplicates === true}
                    ref={(el) => { if (el) el.indeterminate = removeDuplicates === null; }}
                    onChange={(e) => setRemoveDuplicates(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  Remove Duplicate Reads
                  {removeDuplicates === null && (
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                      (choose)
                    </span>
                  )}
                </label>
                <p className="ml-6 mt-1 text-xs text-muted-foreground">
                  Duplicate removal is controversial for RNA-seq. Highly expressed genes naturally
                  produce many identical fragments. Default is OFF for RNA-seq.
                </p>
                <TrainingHint visible={isTrainingProject}>
                  Unlike CUT&RUN, RNA-seq duplicate removal can discard real biological signal from
                  highly expressed genes. Leave OFF unless you have a specific reason to enable it.
                </TrainingHint>
              </div>

              <div />

              <div>
                <label
                  htmlFor="rnaseq-bam-coverage-bin-size"
                  className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  BAM Coverage Bin Size <span className="text-red-500">*</span>
                </label>
                <input
                  id="rnaseq-bam-coverage-bin-size"
                  type="number"
                  min={1}
                  value={bamCoverageBinSize}
                  onChange={(e) => setBamCoverageBinSize(Number(e.target.value) || 20)}
                  className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label
                  htmlFor="rnaseq-smoothed-bin-size"
                  className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Smoothed BAM Coverage Bin Size <span className="text-red-500">*</span>
                </label>
                <input
                  id="rnaseq-smoothed-bin-size"
                  type="number"
                  min={1}
                  value={smoothedBinSize}
                  onChange={(e) => setSmoothedBinSize(Number(e.target.value) || 100)}
                  className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
