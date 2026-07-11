// frontend/src/components/alignment/AlignmentSettingsStep.tsx
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Reaction } from '@/api/types';
import { GENOME_DISPLAY_NAMES, REFERENCE_GENOMES } from '@/lib/constants';
import { TrainingHint } from '@/components/ui/TrainingHint';

interface AlignmentSettingsStepProps {
  selectedReactions: Reaction[];
  referenceGenome: string;
  setReferenceGenome: (v: string) => void;
  removeDuplicates: boolean | null;
  setRemoveDuplicates: (v: boolean) => void;
  removeDacExclusion: boolean | null;
  setRemoveDacExclusion: (v: boolean) => void;
  bamCoverageBinSize: number;
  setBamCoverageBinSize: (v: number) => void;
  smoothedBinSize: number;
  setSmoothedBinSize: (v: number) => void;
  isTrainingProject?: boolean;
}

export function AlignmentSettingsStep({
  selectedReactions,
  referenceGenome,
  setReferenceGenome,
  removeDuplicates,
  setRemoveDuplicates,
  removeDacExclusion,
  setRemoveDacExclusion,
  bamCoverageBinSize,
  setBamCoverageBinSize,
  smoothedBinSize,
  setSmoothedBinSize,
  isTrainingProject = false,
}: AlignmentSettingsStepProps) {
  // Force advanced settings open in training mode
  const [showAdvanced, setShowAdvanced] = useState(isTrainingProject);

  // Collect unique organisms from selected reactions
  const organisms = [...new Set(selectedReactions.map((r) => r.organism))];

  // Build available genome options from the organisms
  const genomeOptions: { value: string; label: string; organism: string }[] = [];
  for (const org of organisms) {
    const genomes = REFERENCE_GENOMES[org] ?? [];
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
          htmlFor="alignment-reference-genome"
          className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
        >
          Reference Genome <span className="text-destructive">*</span>
        </label>
        {hasMixedOrganisms && (
          <p className="mt-1 text-xs text-warning">
            Warning: Selected reactions contain mixed organisms. All will be aligned to the same
            reference genome.
          </p>
        )}
        <select
          id="alignment-reference-genome"
          value={referenceGenome}
          onChange={(e) => setReferenceGenome(e.target.value)}
          className="mt-1 w-full max-w-sm rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
        >
          <option value="" disabled>
            Select reference genome
          </option>
          {hasMixedOrganisms
            ? organisms.map((org) => (
                <optgroup key={org} label={org}>
                  {(REFERENCE_GENOMES[org] ?? []).map((g) => (
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
          The reference genome must match your organism. Mouse uses mm10, human uses hg38 or hg19.
          Aligning to the wrong genome produces misleading results.
        </TrainingHint>
      </div>

      {/* Reactions table */}
      <div>
        <h4 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Reactions
        </h4>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm tabular-nums">
            <thead>
              <tr className="border-b-2 border-border">
                <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Short Name
                </th>
                <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Organism
                </th>
                <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Reference Genome
                </th>
              </tr>
            </thead>
            <tbody>
              {selectedReactions.map((r) => (
                <tr key={r.id} className="border-b border-border/70 transition-colors duration-150 hover:bg-accent/50">
                  <td className="px-4 py-2.5 font-medium text-foreground">{r.shortName}</td>
                  <td className="px-4 py-2.5 text-foreground">{r.organism}</td>
                  <td className="px-4 py-2.5 font-mono text-foreground">
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
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span>Advanced Settings</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-150 ${showAdvanced ? 'rotate-180' : ''}`}
          />
        </button>

        {showAdvanced && (
          <div className="border-t border-border px-4 py-4">
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              <div>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={removeDuplicates === true}
                    ref={(el) => { if (el) el.indeterminate = removeDuplicates === null; }}
                    onChange={(e) => setRemoveDuplicates(e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  Remove Duplicate Reads
                  {removeDuplicates === null && (
                    <span className="text-xs font-medium text-warning">
                      (choose)
                    </span>
                  )}
                </label>
                <TrainingHint visible={isTrainingProject}>
                  PCR duplicates are identical read pairs from amplification, not biology. Removing
                  them prevents artificial signal inflation. Recommended for CUT&RUN/CUT&Tag.
                </TrainingHint>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={removeDacExclusion === true}
                    ref={(el) => { if (el) el.indeterminate = removeDacExclusion === null; }}
                    onChange={(e) => setRemoveDacExclusion(e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  Remove ENCODE DAC Exclusion List Regions
                  {removeDacExclusion === null && (
                    <span className="text-xs font-medium text-warning">
                      (choose)
                    </span>
                  )}
                </label>
                <TrainingHint visible={isTrainingProject}>
                  The ENCODE DAC exclusion list contains genomic regions with anomalous signal in
                  any experiment (e.g., centromeres, telomeres). Removing reads here reduces false peaks.
                </TrainingHint>
              </div>

              <div>
                <label
                  htmlFor="bam-coverage-bin-size"
                  className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
                >
                  BAM Coverage Bin Size <span className="text-destructive">*</span>
                </label>
                <input
                  id="bam-coverage-bin-size"
                  type="number"
                  min={1}
                  value={bamCoverageBinSize}
                  onChange={(e) => setBamCoverageBinSize(Number(e.target.value) || 20)}
                  className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-sm tabular-nums text-foreground outline-none transition-colors duration-150 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
                />
              </div>

              <div>
                <label
                  htmlFor="smoothed-bin-size"
                  className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
                >
                  Smoothed BAM Coverage Bin Size <span className="text-destructive">*</span>
                </label>
                <input
                  id="smoothed-bin-size"
                  type="number"
                  min={1}
                  value={smoothedBinSize}
                  onChange={(e) => setSmoothedBinSize(Number(e.target.value) || 100)}
                  className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-sm tabular-nums text-foreground outline-none transition-colors duration-150 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
