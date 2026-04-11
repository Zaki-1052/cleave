// frontend/src/components/rnaseq-feature-counts/FeatureCountsSettingsStep.tsx
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { STRANDEDNESS_OPTIONS } from '@/lib/constants';

interface Reaction {
  reaction_id: number;
  short_name: string;
  bam_path: string;
}

interface FeatureCountsSettingsStepProps {
  referenceGenome: string;
  strandedness: number;
  onStrandednessChange: (value: number) => void;
  inferredStrandedness: number;
  inferredLibraryType: string;
  reactions: Reaction[];
}

export function FeatureCountsSettingsStep({
  referenceGenome,
  strandedness,
  onStrandednessChange,
  inferredStrandedness,
  inferredLibraryType,
  reactions,
}: FeatureCountsSettingsStepProps) {
  const inferredLabel = STRANDEDNESS_OPTIONS.find((o) => o.value === inferredStrandedness)?.label ?? 'Unknown';

  return (
    <div className="space-y-6">
      {/* Reference genome (read-only) */}
      <div>
        <label className="font-display text-sm font-medium text-foreground">
          Reference Genome
        </label>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="inline-block rounded bg-muted px-2 py-0.5 font-mono text-xs">
            {referenceGenome || 'N/A'}
          </span>{' '}
          (inherited from alignment job)
        </p>
      </div>

      {/* Strandedness selector */}
      <div>
        <label className="font-display text-sm font-medium text-foreground">
          Strandedness
        </label>
        <p className="mt-1 mb-2 text-xs text-muted-foreground">
          Auto-detected from Salmon library type:{' '}
          <span className="font-mono">{inferredLibraryType}</span> → {inferredLabel}
        </p>
        <Select
          value={String(strandedness)}
          onValueChange={(val) => onStrandednessChange(Number(val))}
        >
          <SelectTrigger className="w-[300px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STRANDEDNESS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Reactions summary */}
      <div>
        <label className="font-display text-sm font-medium text-foreground">
          Reactions ({reactions.length})
        </label>
        <p className="mt-1 mb-2 text-xs text-muted-foreground">
          All reactions will be counted in a single featureCounts invocation producing a combined gene-by-sample count matrix.
        </p>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Short Name</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">BAM File</th>
              </tr>
            </thead>
            <tbody>
              {reactions.map((rxn) => (
                <tr key={rxn.reaction_id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{rxn.short_name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground truncate max-w-[300px]">
                    {rxn.bam_path ? rxn.bam_path.split('/').pop() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
