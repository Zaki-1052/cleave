// frontend/src/components/normalization/NormalizationSelectSamplesStep.tsx
import { ChevronUp, ChevronDown, Info, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/layout/Card';
import type { JobOutput } from '@/api/types';

export interface NormalizationSample {
  reactionId: number;
  shortName: string;
  label: string;
  bigwigPath: string;
}

interface NormalizationSelectSamplesStepProps {
  reactions: { reaction_id: number; short_name: string }[];
  alignmentOutputs: JobOutput[];
  samples: NormalizationSample[];
  setSamples: (samples: NormalizationSample[]) => void;
}

function resolveReactionBigwig(reactionId: number, outputs: JobOutput[]): string {
  const bw = outputs.find(
    (o) => o.reactionId === reactionId && o.fileCategory === 'bigwig' && o.fileType === 'bw',
  );
  return bw?.filePath ?? '';
}

export function NormalizationSelectSamplesStep({
  reactions,
  alignmentOutputs,
  samples,
  setSamples,
}: NormalizationSelectSamplesStepProps) {
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
          bigwigPath: resolveReactionBigwig(reactionId, alignmentOutputs),
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
          bigwigPath: resolveReactionBigwig(r.reaction_id, alignmentOutputs),
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

      <div className="mb-3 flex items-start gap-2 rounded-md border border-info/25 bg-info/10 px-3 py-2 text-sm text-foreground/80">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <span>
          The first sample becomes the normalization reference (NF = 1.0). Use the arrows to
          reorder.
        </span>
      </div>

      {!minSamplesValid && samples.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-foreground/80">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>At least 2 samples are required for normalization.</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b-2 border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={samples.length === reactions.length && reactions.length > 0}
                  ref={(el) => {
                    if (el) el.indeterminate = samples.length > 0 && samples.length < reactions.length;
                  }}
                  onChange={toggleAll}
                  aria-label="Select all samples"
                  className="rounded border-input text-primary"
                />
              </th>
              <th className="px-3 py-2.5">Short Name</th>
              <th className="px-3 py-2.5">Label</th>
              <th className="px-3 py-2.5">Order</th>
            </tr>
          </thead>
          <tbody>
            {reactions.map((r) => {
              const selected = samples.find((s) => s.reactionId === r.reaction_id);
              const idx = samples.findIndex((s) => s.reactionId === r.reaction_id);
              return (
                <tr
                  key={r.reaction_id}
                  className="border-b border-border/70 transition-colors duration-150 last:border-b-0 hover:bg-accent/50"
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={!!selected}
                      onChange={() => toggleReaction(r.reaction_id, r.short_name)}
                      aria-label={`Select ${r.short_name}`}
                      className="rounded border-input text-primary"
                    />
                  </td>
                  <td className="px-3 py-2.5 font-medium text-foreground">{r.short_name}</td>
                  <td className="px-3 py-2.5">
                    {selected ? (
                      <input
                        type="text"
                        value={selected.label}
                        onChange={(e) => updateLabel(r.reaction_id, e.target.value)}
                        aria-label={`Label for ${r.short_name}`}
                        className="w-full rounded-md border border-input bg-card px-2 py-1 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
                      />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {selected && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => moveSample(idx, -1)}
                          disabled={idx <= 0}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
                          aria-label="Move up"
                          title="Move up"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSample(idx, 1)}
                          disabled={idx >= samples.length - 1}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
                          aria-label="Move down"
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
