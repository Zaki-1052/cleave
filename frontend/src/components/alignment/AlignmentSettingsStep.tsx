// frontend/src/components/alignment/AlignmentSettingsStep.tsx
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Reaction } from '@/api/types';
import { GENOME_DISPLAY_NAMES, REFERENCE_GENOMES } from '@/lib/constants';

interface AlignmentSettingsStepProps {
  selectedReactions: Reaction[];
  referenceGenome: string;
  setReferenceGenome: (v: string) => void;
  removeDuplicates: boolean;
  setRemoveDuplicates: (v: boolean) => void;
  removeDacExclusion: boolean;
  setRemoveDacExclusion: (v: boolean) => void;
  bamCoverageBinSize: number;
  setBamCoverageBinSize: (v: number) => void;
  smoothedBinSize: number;
  setSmoothedBinSize: (v: number) => void;
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
}: AlignmentSettingsStepProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

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
          className="text-xs font-semibold uppercase tracking-wide text-gray-500"
        >
          Reference Genome <span className="text-red-500">*</span>
        </label>
        {hasMixedOrganisms && (
          <p className="mt-1 text-xs text-amber-600">
            Warning: Selected reactions contain mixed organisms. All will be aligned to the same
            reference genome.
          </p>
        )}
        <select
          id="alignment-reference-genome"
          value={referenceGenome}
          onChange={(e) => setReferenceGenome(e.target.value)}
          className="mt-1 w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
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
      </div>

      {/* Reactions table */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Reactions
        </h4>
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-primary/10">
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Short Name
                </th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Organism
                </th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Reference Genome
                </th>
              </tr>
            </thead>
            <tbody>
              {selectedReactions.map((r) => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-800">{r.shortName}</td>
                  <td className="px-3 py-2 text-gray-700">{r.organism}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {referenceGenome ? (GENOME_DISPLAY_NAMES[referenceGenome] ?? referenceGenome) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="rounded-md border border-gray-200">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <span>Advanced Settings</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
          />
        </button>

        {showAdvanced && (
          <div className="border-t px-4 py-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={removeDuplicates}
                  onChange={(e) => setRemoveDuplicates(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                Remove Duplicate Reads
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={removeDacExclusion}
                  onChange={(e) => setRemoveDacExclusion(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                Remove ENCODE DAC Exclusion List Regions
              </label>

              <div>
                <label
                  htmlFor="bam-coverage-bin-size"
                  className="text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  BAM Coverage Bin Size <span className="text-red-500">*</span>
                </label>
                <input
                  id="bam-coverage-bin-size"
                  type="number"
                  min={1}
                  value={bamCoverageBinSize}
                  onChange={(e) => setBamCoverageBinSize(Number(e.target.value) || 20)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label
                  htmlFor="smoothed-bin-size"
                  className="text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  Smoothed BAM Coverage Bin Size <span className="text-red-500">*</span>
                </label>
                <input
                  id="smoothed-bin-size"
                  type="number"
                  min={1}
                  value={smoothedBinSize}
                  onChange={(e) => setSmoothedBinSize(Number(e.target.value) || 100)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
