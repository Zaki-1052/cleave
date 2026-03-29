// frontend/src/components/diffbind/DiffBindInputPanel.tsx
import type { AnalysisJob } from '@/api/types';
import { DIFFBIND_ANALYSIS_METHODS } from '@/lib/constants';

interface DiffBindInputPanelProps {
  job: AnalysisJob;
}

interface SampleParam {
  reaction_id: number;
  short_name: string;
  condition: string;
  replicate: number;
  peak_caller?: string;
}

export function DiffBindInputPanel({ job }: DiffBindInputPanelProps) {
  const samples = (job.params?.samples as SampleParam[] | undefined) ?? [];
  const analysisMethod = (job.params?.analysis_method as string) ?? '';
  const methodLabel =
    DIFFBIND_ANALYSIS_METHODS.find((m) => m.value === analysisMethod)?.label ?? analysisMethod;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-gray-500">
          Sample Sheet
        </h3>
        <span className="text-xs text-gray-500">
          Method: <span className="font-medium text-gray-700">{methodLabel}</span>
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-primary/10">
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                Short Name
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                Condition
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                Replicate
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                Peak Caller
              </th>
            </tr>
          </thead>
          <tbody>
            {samples.map((s) => (
              <tr key={s.reaction_id} className="border-b hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-800">{s.short_name}</td>
                <td className="px-3 py-2 text-gray-700">{s.condition}</td>
                <td className="px-3 py-2 font-mono text-gray-700">{s.replicate}</td>
                <td className="px-3 py-2 text-gray-700">{s.peak_caller ?? '—'}</td>
              </tr>
            ))}
            {samples.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-sm text-gray-400">
                  No sample data available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
