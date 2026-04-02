// frontend/src/components/peak-calling/PeakCallingSettingsStep.tsx
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  BLACKLIST_OPTIONS,
  GENOME_DISPLAY_NAMES,
  PEAK_CALLERS,
  PEAK_CALLING_DEFAULTS,
  PEAK_SIZES,
} from '@/lib/constants';
import { TrainingHint } from '@/components/ui/TrainingHint';

interface AlignmentReaction {
  reaction_id: number;
  short_name: string;
}

interface PeakCallingSettingsStepProps {
  selectedReactions: AlignmentReaction[];
  referenceGenome: string;
  peakCaller: string;
  setPeakCaller: (v: string) => void;
  peakSize: string;
  setPeakSize: (v: string) => void;
  iggReactionId: number | null;
  setIggReactionId: (v: number | null) => void;
  qValue: number;
  setQValue: (v: number) => void;
  broadCutoff: number;
  setBroadCutoff: (v: number) => void;
  seacrThreshold: number;
  setSeacrThreshold: (v: number) => void;
  sicer2Fdr: number;
  setSicer2Fdr: (v: number) => void;
  fragmentFilter: boolean | null;
  setFragmentFilter: (v: boolean) => void;
  fragmentSize: number;
  setFragmentSize: (v: number) => void;
  blacklist: string;
  setBlacklist: (v: string) => void;
  isTrainingProject?: boolean;
}

export function PeakCallingSettingsStep({
  selectedReactions,
  referenceGenome,
  peakCaller,
  setPeakCaller,
  peakSize,
  setPeakSize,
  iggReactionId,
  setIggReactionId,
  qValue,
  setQValue,
  broadCutoff,
  setBroadCutoff,
  seacrThreshold,
  setSeacrThreshold,
  sicer2Fdr,
  setSicer2Fdr,
  fragmentFilter,
  setFragmentFilter,
  fragmentSize,
  setFragmentSize,
  blacklist,
  setBlacklist,
  isTrainingProject = false,
}: PeakCallingSettingsStepProps) {
  // Force advanced settings open in training mode
  const [showAdvanced, setShowAdvanced] = useState(isTrainingProject);

  const availablePeakSizes = PEAK_SIZES[peakCaller] ?? [];

  function handlePeakCallerChange(newCaller: string) {
    setPeakCaller(newCaller);
    const sizes = PEAK_SIZES[newCaller] ?? [];
    const firstSize = sizes[0];
    if (firstSize && !sizes.some((s) => s.value === peakSize)) {
      setPeakSize(firstSize.value);
    }
  }

  // Detect IgG reactions by short_name containing "igg" (case-insensitive)
  const iggCandidates = selectedReactions.filter((r) =>
    r.short_name.toLowerCase().includes('igg'),
  );

  return (
    <div className="space-y-6">
      {/* Peak caller + peak size global controls */}
      <div className="flex gap-4">
        <div className="flex-1">
          <label htmlFor="pc-peak-caller" className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Peak Caller <span className="text-red-500">*</span>
          </label>
          <select
            id="pc-peak-caller"
            value={peakCaller}
            onChange={(e) => handlePeakCallerChange(e.target.value)}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {!peakCaller && (
              <option value="" disabled>
                Select peak caller
              </option>
            )}
            {PEAK_CALLERS.map((pc) => (
              <option key={pc.value} value={pc.value}>
                {pc.label}
              </option>
            ))}
          </select>
          <TrainingHint visible={isTrainingProject}>
            SEACR is designed for CUT&RUN&apos;s low background. MACS2 is the most widely published
            caller. SICER2 specializes in broad histone marks like H3K27me3.
          </TrainingHint>
        </div>

        <div className="flex-1">
          <label htmlFor="pc-peak-size" className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Peak Size <span className="text-red-500">*</span>
          </label>
          <select
            id="pc-peak-size"
            value={peakSize}
            onChange={(e) => setPeakSize(e.target.value)}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {!peakSize && (
              <option value="" disabled>
                Select peak size
              </option>
            )}
            {availablePeakSizes.map((ps) => (
              <option key={ps.value} value={ps.value}>
                {ps.label}
              </option>
            ))}
          </select>
          <TrainingHint visible={isTrainingProject}>
            Narrow peaks suit sharp marks (H3K4me3, CTCF). Broad peaks suit diffuse marks
            (H3K27me3). SEACR uses stringent (fewer, high-confidence) vs relaxed (more, exploratory).
          </TrainingHint>
        </div>

        <div className="flex-1">
          <label htmlFor="pc-igg-control" className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            IgG Control
          </label>
          <select
            id="pc-igg-control"
            value={iggReactionId ?? ''}
            onChange={(e) => setIggReactionId(e.target.value ? Number(e.target.value) : null)}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="">None</option>
            {selectedReactions.map((r) => (
              <option key={r.reaction_id} value={r.reaction_id}>
                {r.short_name}
              </option>
            ))}
          </select>
          {iggCandidates.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">
              No IgG control detected. It is recommended to designate an IgG control for background
              subtraction.
            </p>
          )}
        </div>
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
                  IgG Control
                </th>
                <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Reference Genome
                </th>
                <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Peak Caller
                </th>
                <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Peak Size
                </th>
              </tr>
            </thead>
            <tbody>
              {selectedReactions.map((r) => {
                const iggName =
                  iggReactionId !== null
                    ? selectedReactions.find((x) => x.reaction_id === iggReactionId)?.short_name ??
                      '—'
                    : '—';
                return (
                  <tr key={r.reaction_id} className="border-b hover:bg-muted">
                    <td className="px-3 py-2 font-medium text-foreground">{r.short_name}</td>
                    <td className="px-3 py-2 text-foreground">{iggName}</td>
                    <td className="px-3 py-2 text-foreground">
                      {GENOME_DISPLAY_NAMES[referenceGenome] ?? referenceGenome}
                    </td>
                    <td className="px-3 py-2 text-foreground">{peakCaller}</td>
                    <td className="px-3 py-2 text-foreground capitalize">{peakSize}</td>
                  </tr>
                );
              })}
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
              {/* Threshold — conditional on peak caller + size */}
              {peakCaller === 'MACS2' && peakSize === 'narrow' && (
                <div>
                  <label htmlFor="pc-q-value" className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Q-Value Threshold
                  </label>
                  <input
                    id="pc-q-value"
                    type="number"
                    step="0.001"
                    min={0}
                    max={1}
                    value={qValue}
                    onChange={(e) =>
                      setQValue(Number(e.target.value) || PEAK_CALLING_DEFAULTS.q_value)
                    }
                    className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Default: 0.01 (lab standard). CUTANA Cloud uses 0.05.
                  </p>
                </div>
              )}

              {peakCaller === 'MACS2' && peakSize === 'broad' && (
                <div>
                  <label htmlFor="pc-broad-cutoff" className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Broad Cutoff
                  </label>
                  <input
                    id="pc-broad-cutoff"
                    type="number"
                    step="0.01"
                    min={0}
                    max={1}
                    value={broadCutoff}
                    onChange={(e) =>
                      setBroadCutoff(
                        Number(e.target.value) || PEAK_CALLING_DEFAULTS.broad_cutoff,
                      )
                    }
                    className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Default: 0.1</p>
                </div>
              )}

              {peakCaller === 'SEACR' && (
                <div>
                  <label htmlFor="pc-seacr-threshold" className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    SEACR Threshold
                  </label>
                  <input
                    id="pc-seacr-threshold"
                    type="number"
                    step="0.001"
                    min={0}
                    max={1}
                    value={seacrThreshold}
                    onChange={(e) =>
                      setSeacrThreshold(
                        Number(e.target.value) || PEAK_CALLING_DEFAULTS.seacr_threshold,
                      )
                    }
                    className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Top fraction of regions by AUC. Default: 0.01 (top 1%).
                  </p>
                </div>
              )}

              {peakCaller === 'SICER2' && (
                <div>
                  <label htmlFor="pc-sicer2-fdr" className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    SICER2 FDR
                  </label>
                  <input
                    id="pc-sicer2-fdr"
                    type="number"
                    step="0.001"
                    min={0}
                    max={1}
                    value={sicer2Fdr}
                    onChange={(e) =>
                      setSicer2Fdr(
                        Number(e.target.value) || PEAK_CALLING_DEFAULTS.sicer2_fdr,
                      )
                    }
                    className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Default: 0.01</p>
                </div>
              )}

              {/* Fragment filter — always visible */}
              <div>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={fragmentFilter === true}
                    ref={(el) => { if (el) el.indeterminate = fragmentFilter === null; }}
                    onChange={(e) => setFragmentFilter(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  Fragment Size Filter (&lt;{fragmentSize}bp)
                  {fragmentFilter === null && (
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                      (choose)
                    </span>
                  )}
                </label>
                <TrainingHint visible={isTrainingProject}>
                  CUT&RUN produces sub-nucleosomal fragments (&lt;120bp) that represent true binding.
                  Filtering to these enriches signal and improves peak calling.
                </TrainingHint>
              </div>

              {fragmentFilter === true && (
                <div>
                  <label htmlFor="pc-fragment-size" className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Fragment Size (bp)
                  </label>
                  <input
                    id="pc-fragment-size"
                    type="number"
                    min={1}
                    value={fragmentSize}
                    onChange={(e) =>
                      setFragmentSize(
                        Number(e.target.value) || PEAK_CALLING_DEFAULTS.fragment_size,
                      )
                    }
                    className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sub-nucleosomal fragments (&lt;120bp) represent the biologically relevant
                    CUT&RUN signal. Default: 120.
                  </p>
                </div>
              )}

              {/* Blacklist selection */}
              <div className="col-span-2">
                <label htmlFor="pc-blacklist" className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Blacklist Subtraction
                </label>
                <select
                  id="pc-blacklist"
                  value={blacklist}
                  onChange={(e) => setBlacklist(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  {!blacklist && (
                    <option value="" disabled>
                      Select blacklist mode
                    </option>
                  )}
                  {BLACKLIST_OPTIONS.filter(
                    (opt) =>
                      opt.value === 'encode_dac' ||
                      opt.value === 'none' ||
                      referenceGenome === 'mm10',
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Peaks overlapping blacklist regions are removed after calling.
                  The lab custom blacklist (255 regions) is available for mm10 only.
                </p>
                <TrainingHint visible={isTrainingProject}>
                  Blacklist regions are known artifact loci. ENCODE DAC is the standard set.
                  The lab custom list adds 255 mm10-specific regions.
                </TrainingHint>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
