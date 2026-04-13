// frontend/src/components/rnaseq-de/Deseq2SettingsStep.tsx
import { RNASEQ_DE_QUANTIFICATION_SOURCES } from '@/lib/constants';
import type { SampleAssignment } from './AssignConditionsStep';
import { TrainingHint } from '@/components/ui/TrainingHint';

interface AlignmentReaction {
  reaction_id: number;
  short_name: string;
}

interface Deseq2SettingsStepProps {
  selectedReactions: AlignmentReaction[];
  assignments: Map<number, SampleAssignment>;
  quantificationSource: string;
  setQuantificationSource: (v: string) => void;
  referenceCondition: string;
  setReferenceCondition: (v: string) => void;
  fdrThreshold: number;
  setFdrThreshold: (v: number) => void;
  lfcThreshold: number;
  setLfcThreshold: (v: number) => void;
  hasFeatureCountsJob: boolean;
  isTrainingProject?: boolean;
}

function buildConditionSummary(
  selectedReactions: AlignmentReaction[],
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

function getUniqueConditions(
  selectedReactions: AlignmentReaction[],
  assignments: Map<number, SampleAssignment>,
): string[] {
  const conditions = new Set<string>();
  for (const rxn of selectedReactions) {
    const a = assignments.get(rxn.reaction_id);
    if (a && a.condition.trim()) {
      conditions.add(a.condition.trim());
    }
  }
  return [...conditions];
}

export function Deseq2SettingsStep({
  selectedReactions,
  assignments,
  quantificationSource,
  setQuantificationSource,
  referenceCondition,
  setReferenceCondition,
  fdrThreshold,
  setFdrThreshold,
  lfcThreshold,
  setLfcThreshold,
  hasFeatureCountsJob,
  isTrainingProject = false,
}: Deseq2SettingsStepProps) {
  const conditionSummary = buildConditionSummary(selectedReactions, assignments);
  const uniqueConditions = getUniqueConditions(selectedReactions, assignments);

  return (
    <div className="space-y-6">
      {/* Quantification source */}
      <div>
        <h4 className="mb-3 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Quantification Source <span className="text-red-500">*</span>
        </h4>
        <TrainingHint visible={isTrainingProject}>
          Salmon (via tximport) is the default and recommended approach for RNA-seq DE analysis. It
          uses transcript-level abundance estimates for gene-level inference. featureCounts provides
          gene-level counts directly from aligned BAMs.
        </TrainingHint>
        <div className="space-y-2">
          {RNASEQ_DE_QUANTIFICATION_SOURCES.map((source) => {
            const isDisabled = source.value === 'featurecounts' && !hasFeatureCountsJob;
            return (
              <label
                key={source.value}
                className={`flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 transition-colors ${
                  quantificationSource === source.value
                    ? 'border-primary bg-primary/5'
                    : isDisabled
                      ? 'cursor-not-allowed border-border opacity-50'
                      : 'border-border hover:bg-muted'
                }`}
              >
                <input
                  type="radio"
                  name="quant-source"
                  value={source.value}
                  checked={quantificationSource === source.value}
                  onChange={(e) => setQuantificationSource(e.target.value)}
                  disabled={isDisabled}
                  className="h-4 w-4 text-primary focus:ring-primary"
                />
                <div>
                  <span className="text-sm font-medium text-foreground">{source.label}</span>
                  {source.value === 'salmon' && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Transcript-level quantification via tximport. Recommended for most RNA-seq
                      analyses.
                    </p>
                  )}
                  {source.value === 'featurecounts' && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Gene-level read counting from aligned BAMs.
                      {!hasFeatureCountsJob && (
                        <span className="ml-1 text-amber-600">
                          No completed featureCounts job available for this alignment.
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Reference condition */}
      <div>
        <label
          htmlFor="de-ref-condition"
          className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Reference Condition
        </label>
        <p className="mb-2 text-xs text-muted-foreground">
          The baseline condition for fold change calculation (typically &quot;ctrl&quot; or
          &quot;untreated&quot;). If left blank, DESeq2 will choose alphabetically.
        </p>
        <select
          id="de-ref-condition"
          value={referenceCondition}
          onChange={(e) => setReferenceCondition(e.target.value)}
          className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
        >
          <option value="">Auto (alphabetical)</option>
          {uniqueConditions.map((cond) => (
            <option key={cond} value={cond}>
              {cond}
            </option>
          ))}
        </select>
      </div>

      {/* Thresholds */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="de-fdr"
            className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            FDR Threshold
          </label>
          <input
            id="de-fdr"
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={fdrThreshold}
            onChange={(e) => setFdrThreshold(Number(e.target.value) || 0.05)}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Adjusted p-value cutoff for significance (default: 0.05).
          </p>
        </div>
        <div>
          <label
            htmlFor="de-lfc"
            className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Log2 Fold Change Threshold
          </label>
          <input
            id="de-lfc"
            type="number"
            min={0}
            step={0.1}
            value={lfcThreshold}
            onChange={(e) => setLfcThreshold(Number(e.target.value) || 0)}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Minimum absolute log2 fold change filter (0 = no filter).
          </p>
        </div>
      </div>

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
