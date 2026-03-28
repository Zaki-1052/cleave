// frontend/src/components/alignment/ChooseReactionsStep.tsx
import { useEffect, useRef } from 'react';
import type { Reaction } from '@/api/types';

interface ChooseReactionsStepProps {
  reactions: Reaction[];
  selectedIds: Set<number>;
  onToggle: (reactionId: number) => void;
  onToggleAll: () => void;
}

export function ChooseReactionsStep({
  reactions,
  selectedIds,
  onToggle,
  onToggleAll,
}: ChooseReactionsStepProps) {
  const allChecked = reactions.length > 0 && selectedIds.size === reactions.length;
  const someChecked = selectedIds.size > 0 && selectedIds.size < reactions.length;

  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someChecked;
    }
  }, [someChecked]);

  if (reactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm font-medium text-gray-600">No reactions found for this experiment.</p>
        <p className="mt-1 text-sm text-gray-400">
          Please add reactions before creating an alignment.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-sm text-gray-600">
        Select the reactions to include in this alignment run.
      </p>
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-primary/10">
              <th className="w-10 px-3 py-2">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  checked={allChecked}
                  onChange={onToggleAll}
                  aria-label="Select all reactions"
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                FASTQ Prefix
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                Short Name
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                Organism
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                Assay Type
              </th>
            </tr>
          </thead>
          <tbody>
            {reactions.map((r) => {
              const isSelected = selectedIds.has(r.id);
              return (
                <tr
                  key={r.id}
                  className={`border-b transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-gray-50'}`}
                  onClick={() => onToggle(r.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggle(r.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${r.shortName}`}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                  </td>
                  <td className="px-3 py-2 text-gray-700">{r.fastqPrefix}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">{r.shortName}</td>
                  <td className="px-3 py-2 text-gray-700">{r.organism}</td>
                  <td className="px-3 py-2 text-gray-700">{r.assayType}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-400">
        {selectedIds.size} of {reactions.length} reaction{reactions.length !== 1 ? 's' : ''} selected
      </p>
    </div>
  );
}
