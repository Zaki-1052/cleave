// frontend/src/components/peak-calling/ChooseReactionsStep.tsx
import { useEffect, useRef } from 'react';

interface AlignmentReaction {
  reaction_id: number;
  short_name: string;
}

interface ChooseReactionsStepProps {
  reactions: AlignmentReaction[];
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
}

export function ChooseReactionsStep({
  reactions,
  selectedIds,
  onToggle,
  onToggleAll,
}: ChooseReactionsStepProps) {
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const allChecked = reactions.length > 0 && selectedIds.size === reactions.length;
  const someChecked = selectedIds.size > 0 && !allChecked;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someChecked;
    }
  }, [someChecked]);

  if (reactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <h3 className="text-sm font-medium text-muted-foreground">No reactions available</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The selected alignment has no reactions.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Select which reactions from the alignment to include in peak calling.
      </p>

      <div className="overflow-x-auto rounded-md border border-border">
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
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
              </th>
              <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Short Name
              </th>
            </tr>
          </thead>
          <tbody>
            {reactions.map((rxn) => {
              const isSelected = selectedIds.has(rxn.reaction_id);
              return (
                <tr
                  key={rxn.reaction_id}
                  onClick={() => onToggle(rxn.reaction_id)}
                  className={`cursor-pointer border-b transition-colors ${
                    isSelected ? 'bg-primary/5' : 'hover:bg-muted'
                  }`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggle(rxn.reaction_id)}
                      aria-label={`Select ${rxn.short_name}`}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">{rxn.short_name}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {selectedIds.size} of {reactions.length} reaction{reactions.length !== 1 ? 's' : ''}{' '}
        selected
      </p>
    </div>
  );
}
