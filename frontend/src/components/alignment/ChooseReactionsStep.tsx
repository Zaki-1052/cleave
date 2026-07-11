// frontend/src/components/alignment/ChooseReactionsStep.tsx
import { useEffect, useRef } from 'react';
import { Inbox } from 'lucide-react';
import type { Reaction } from '@/api/types';
import { EmptyState } from '@/components/ui/EmptyState';

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
      <EmptyState
        icon={Inbox}
        title="No reactions found"
        description="Add reactions to this experiment before creating an alignment run."
      />
    );
  }

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        Select the reactions to include in this alignment run.
      </p>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-sm tabular-nums">
          <thead>
            <tr className="border-b-2 border-border">
              <th className="w-10 px-4 py-2.5">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  checked={allChecked}
                  onChange={onToggleAll}
                  aria-label="Select all reactions"
                  className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </th>
              <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                FASTQ Prefix
              </th>
              <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Short Name
              </th>
              <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Organism
              </th>
              <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
                  className={`cursor-pointer border-b border-border/70 transition-colors duration-150 ${isSelected ? 'bg-accent' : 'hover:bg-accent/50'}`}
                  onClick={() => onToggle(r.id)}
                >
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggle(r.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${r.shortName}`}
                      className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-foreground">{r.fastqPrefix}</td>
                  <td className="px-4 py-2.5 font-medium text-foreground">{r.shortName}</td>
                  <td className="px-4 py-2.5 text-foreground">{r.organism}</td>
                  <td className="px-4 py-2.5 text-foreground">{r.assayType}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">{selectedIds.size}</span> of{' '}
        <span className="font-mono tabular-nums">{reactions.length}</span> reaction
        {reactions.length !== 1 ? 's' : ''} selected
      </p>
    </div>
  );
}
