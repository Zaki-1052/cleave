// frontend/src/components/peak-calling/PeakCallingInputPanel.tsx
import type { AnalysisJob } from '@/api/types';
import { GENOME_DISPLAY_NAMES } from '@/lib/constants';

interface PeakCallingInputPanelProps {
  job: AnalysisJob;
}

interface ReactionParam {
  reaction_id: number;
  short_name: string;
  igg_short_name: string | null;
}

export function PeakCallingInputPanel({ job }: PeakCallingInputPanelProps) {
  const reactions = (job.params?.reactions as ReactionParam[] | undefined) ?? [];
  const genome = (job.params?.reference_genome as string) ?? '';
  const peakCaller = (job.params?.peak_caller as string) ?? '';
  const peakSize = (job.params?.peak_size as string) ?? '';

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-gray-500">Reactions</h3>
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-primary/10">
              <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-gray-600">
                Short Name
              </th>
              <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-gray-600">
                IgG Control
              </th>
              <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-gray-600">
                Reference Genome
              </th>
              <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-gray-600">
                Peak Caller
              </th>
              <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-gray-600">
                Peak Size
              </th>
            </tr>
          </thead>
          <tbody>
            {reactions.map((r) => (
              <tr key={r.reaction_id} className="border-b hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-800">{r.short_name}</td>
                <td className="px-3 py-2 text-gray-700">{r.igg_short_name ?? '—'}</td>
                <td className="px-3 py-2 text-gray-700">
                  {GENOME_DISPLAY_NAMES[genome] ?? genome}
                </td>
                <td className="px-3 py-2 text-gray-700">{peakCaller}</td>
                <td className="px-3 py-2 text-gray-700 capitalize">{peakSize}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
