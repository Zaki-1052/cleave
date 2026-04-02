// frontend/src/components/diffbind/DiffBindSettingsStep.tsx
import { DIFFBIND_ANALYSIS_METHODS } from '@/lib/constants';
import type { JobOutput } from '@/api/types';
import type { SampleAssignment } from './AssignConditionsStep';
import { TrainingHint } from '@/components/ui/TrainingHint';

interface PeakCallingReaction {
  reaction_id: number;
  short_name: string;
}

interface DiffBindSettingsStepProps {
  selectedReactions: PeakCallingReaction[];
  assignments: Map<number, SampleAssignment>;
  analysisMethod: string;
  setAnalysisMethod: (v: string) => void;
  customPeaksetOutputId: number | null;
  setCustomPeaksetOutputId: (v: number | null) => void;
  bedOutputs: JobOutput[];
  isTrainingProject?: boolean;
}

/** Derive a summary of conditions and sample counts from the assignments. */
function buildConditionSummary(
  selectedReactions: PeakCallingReaction[],
  assignments: Map<number, SampleAssignment>,
): { condition: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const rxn of selectedReactions) {
    const a = assignments.get(rxn.reaction_id);
    if (a && a.condition.trim()) {
      const key = a.condition.trim();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([condition, count]) => ({ condition, count }));
}

export function DiffBindSettingsStep({
  selectedReactions,
  assignments,
  analysisMethod,
  setAnalysisMethod,
  customPeaksetOutputId,
  setCustomPeaksetOutputId,
  bedOutputs,
  isTrainingProject = false,
}: DiffBindSettingsStepProps) {
  const needsCustomPeakset =
    analysisMethod === 'deseq2_peaklist' || analysisMethod === 'edger_peaklist';

  const conditionSummary = buildConditionSummary(selectedReactions, assignments);

  return (
    <div className="space-y-6">
      {/* Analysis method selection */}
      <div>
        <h4 className="mb-3 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Analysis Method <span className="text-red-500">*</span>
        </h4>
        <TrainingHint visible={isTrainingProject}>
          DiffBind compares binding between conditions. DESeq2 with consensus peakset is standard —
          it builds peaks from all samples. edgeR uses TMM normalization. Custom peakset lets you
          supply your own regions.
        </TrainingHint>
        {!analysisMethod && isTrainingProject && (
          <p className="mb-2 text-xs font-medium text-amber-600 dark:text-amber-400">
            Please select an analysis method below.
          </p>
        )}
        <div className="space-y-2">
          {DIFFBIND_ANALYSIS_METHODS.map((method) => (
            <label
              key={method.value}
              className={`flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 transition-colors ${
                analysisMethod === method.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted'
              }`}
            >
              <input
                type="radio"
                name="analysis-method"
                value={method.value}
                checked={analysisMethod === method.value}
                onChange={(e) => setAnalysisMethod(e.target.value)}
                className="h-4 w-4 text-primary focus:ring-primary"
              />
              <div>
                <span className="text-sm font-medium text-foreground">{method.label}</span>
                {method.value === 'deseq2_consensus' && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Standard analysis using DiffBind&apos;s consensus peakset derived from
                    overlapping peaks across samples.
                  </p>
                )}
                {method.value === 'deseq2_peaklist' && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    DESeq2 analysis using a custom BED file as the peakset instead of the consensus.
                  </p>
                )}
                {method.value === 'edger_peaklist' && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    edgeR analysis using a custom BED file as the peakset. Alternative statistical
                    method to DESeq2.
                  </p>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Custom peakset selector — only for peaklist modes */}
      {needsCustomPeakset && (
        <div>
          <label
            htmlFor="db-custom-peakset"
            className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Custom Peakset (BED) <span className="text-red-500">*</span>
          </label>
          {bedOutputs.length === 0 ? (
            <p className="mt-1 text-sm text-amber-600">
              No BED files available from the selected peak calling run.
            </p>
          ) : (
            <select
              id="db-custom-peakset"
              value={customPeaksetOutputId ?? ''}
              onChange={(e) =>
                setCustomPeaksetOutputId(e.target.value ? Number(e.target.value) : null)
              }
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="">Select a BED file...</option>
              {bedOutputs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.filename}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Select a BED file from the peak calling outputs to use as the peakset for differential
            analysis.
          </p>
        </div>
      )}

      {/* Summary */}
      <div className="rounded-md border border-border p-4">
        <h4 className="mb-3 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Analysis Summary
        </h4>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Total Samples:</span>{' '}
            <span className="font-medium text-foreground">{selectedReactions.length}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Conditions:</span>{' '}
            <span className="font-medium text-foreground">{conditionSummary.length}</span>
          </div>
        </div>

        {conditionSummary.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-md border border-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-muted">
                  <th className="px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Condition
                  </th>
                  <th className="px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Replicates
                  </th>
                </tr>
              </thead>
              <tbody>
                {conditionSummary.map((cs) => (
                  <tr key={cs.condition} className="border-b last:border-b-0">
                    <td className="px-3 py-1.5 font-medium text-foreground">{cs.condition}</td>
                    <td className="px-3 py-1.5 text-foreground">{cs.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
