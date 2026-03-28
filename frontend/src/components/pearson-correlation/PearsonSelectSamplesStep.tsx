// frontend/src/components/pearson-correlation/PearsonSelectSamplesStep.tsx
import { Card } from '@/components/layout/Card';
import type { JobOutput } from '@/api/types';

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
}

function resolveReactionBigwig(reactionId: number, outputs: JobOutput[]): string {
  const bw = outputs.find(
    (o) => o.reactionId === reactionId && o.fileCategory === 'bigwig' && o.fileType === 'bw',
  );
  return bw?.filePath ?? '';
}

export function PearsonSelectSamplesStep({
  reactions,
  alignmentOutputs,
  samples,
  setSamples,
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
    [next[index], next[target]] = [next[target], next[index]];
    setSamples(next);
  }

  const minSamplesValid = samples.length >= 2;

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500">
        Select Samples ({samples.length} selected)
      </h3>

      {!minSamplesValid && samples.length > 0 && (
        <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          At least 2 samples are required for correlation analysis.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs font-medium uppercase text-gray-500">
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={samples.length === reactions.length && reactions.length > 0}
                  ref={(el) => {
                    if (el) el.indeterminate = samples.length > 0 && samples.length < reactions.length;
                  }}
                  onChange={toggleAll}
                  className="rounded text-primary"
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
                <tr key={r.reaction_id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={!!selected}
                      onChange={() => toggleReaction(r.reaction_id, r.short_name)}
                      className="rounded text-primary"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-800">{r.short_name}</td>
                  <td className="px-3 py-2">
                    {selected ? (
                      <input
                        type="text"
                        value={selected.label}
                        onChange={(e) => updateLabel(r.reaction_id, e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-primary focus:outline-none"
                      />
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {selected && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => moveSample(idx, -1)}
                          disabled={idx <= 0}
                          className="rounded px-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSample(idx, 1)}
                          disabled={idx >= samples.length - 1}
                          className="rounded px-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                          title="Move down"
                        >
                          ↓
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
