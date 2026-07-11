// frontend/src/components/pearson-correlation/PearsonSelectSamplesStep.tsx
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Card } from '@/components/layout/Card';
import { Checkbox } from '@/components/ui/checkbox';
import type { JobOutput } from '@/api/types';
import { resolveReactionBigwig } from '@/lib/bigwig-utils';
import { cn } from '@/lib/cn';

export interface PearsonSample {
  reactionId: number;
  shortName: string;
  label: string;
  bigwigPath: string;
}

interface PearsonSelectSamplesStepProps {
  reactions: { reaction_id: number; short_name: string }[];
  alignmentOutputs: JobOutput[];
  samples: PearsonSample[];
  setSamples: (samples: PearsonSample[]) => void;
  /** Which file category to resolve bigWig paths from */
  fileCategory?: 'bigwig' | 'normalization_bigwig';
}

export function PearsonSelectSamplesStep({
  reactions,
  alignmentOutputs,
  samples,
  setSamples,
  fileCategory = 'bigwig',
}: PearsonSelectSamplesStepProps) {
  function toggleReaction(reactionId: number, shortName: string) {
    const exists = samples.find((s) => s.reactionId === reactionId);
    if (exists) {
      setSamples(samples.filter((s) => s.reactionId !== reactionId));
    } else {
      setSamples([
        ...samples,
        {
          reactionId,
          shortName,
          label: shortName,
          bigwigPath: resolveReactionBigwig(reactionId, alignmentOutputs, fileCategory),
        },
      ]);
    }
  }

  function toggleAll() {
    if (samples.length === reactions.length) {
      setSamples([]);
    } else {
      setSamples(
        reactions.map((r) => ({
          reactionId: r.reaction_id,
          shortName: r.short_name,
          label: r.short_name,
          bigwigPath: resolveReactionBigwig(r.reaction_id, alignmentOutputs, fileCategory),
        })),
      );
    }
  }

  function updateLabel(reactionId: number, label: string) {
    setSamples(
      samples.map((s) => (s.reactionId === reactionId ? { ...s, label } : s)),
    );
  }

  function moveSample(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= samples.length) return;
    const next = [...samples];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setSamples(next);
  }

  const minSamplesValid = samples.length >= 2;

  return (
    <Card>
      <h3 className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Select Samples ({samples.length} selected)
      </h3>

      {!minSamplesValid && samples.length > 0 && (
        <div className="mb-3 rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-warning">
          At least 2 samples are required for correlation analysis.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2">
                <Checkbox
                  checked={
                    reactions.length > 0 && samples.length === reactions.length
                      ? true
                      : samples.length > 0
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={toggleAll}
                  aria-label="Select all samples"
                />
              </th>
              <th className="px-3 py-2">Short Name</th>
              <th className="px-3 py-2">Label</th>
              <th className="px-3 py-2">Order</th>
            </tr>
          </thead>
          <tbody>
            {reactions.map((r) => {
              const selected = samples.find((s) => s.reactionId === r.reaction_id);
              const idx = samples.findIndex((s) => s.reactionId === r.reaction_id);
              return (
                <tr
                  key={r.reaction_id}
                  className={cn(
                    'border-b border-b-border border-l-2 transition-colors duration-150 last:border-b-0',
                    selected ? 'border-l-primary bg-accent' : 'border-l-transparent hover:bg-muted/50',
                  )}
                >
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={!!selected}
                      onCheckedChange={() => toggleReaction(r.reaction_id, r.short_name)}
                      aria-label={`Select ${r.short_name}`}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">{r.short_name}</td>
                  <td className="px-3 py-2">
                    {selected ? (
                      <input
                        type="text"
                        value={selected.label}
                        onChange={(e) => updateLabel(r.reaction_id, e.target.value)}
                        className="w-full rounded-md border border-input bg-card px-2 py-1 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
                      />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {selected && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => moveSample(idx, -1)}
                          disabled={idx <= 0}
                          aria-label={`Move ${r.short_name} up`}
                          className="rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30"
                          title="Move up"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSample(idx, 1)}
                          disabled={idx >= samples.length - 1}
                          aria-label={`Move ${r.short_name} down`}
                          className="rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30"
                          title="Move down"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
