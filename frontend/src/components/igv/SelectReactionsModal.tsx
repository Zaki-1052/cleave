// frontend/src/components/igv/SelectReactionsModal.tsx
import { useEffect, useRef, useState } from 'react';
import type { Reaction } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface SelectReactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  reactions: Reaction[];
  selectedIds: Set<number>;
  onApply: (ids: Set<number>) => void;
}

export function SelectReactionsModal({
  isOpen,
  onClose,
  reactions,
  selectedIds,
  onApply,
}: SelectReactionsModalProps) {
  const [localIds, setLocalIds] = useState<Set<number>>(new Set(selectedIds));
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // Sync local state when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalIds(new Set(selectedIds));
    }
  }, [isOpen, selectedIds]);

  const allChecked = reactions.length > 0 && localIds.size === reactions.length;
  const someChecked = localIds.size > 0 && localIds.size < reactions.length;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someChecked;
    }
  }, [someChecked]);

  function handleToggle(id: number) {
    setLocalIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleToggleAll() {
    if (allChecked) {
      setLocalIds(new Set());
    } else {
      setLocalIds(new Set(reactions.map((r) => r.id)));
    }
  }

  function handleApply() {
    onApply(localIds);
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Select Reactions" className="max-w-3xl">
      <div>
        <p className="mb-3 text-sm text-muted-foreground">
          Select reactions to display in the genome browser.
        </p>
        <div className="max-h-80 overflow-y-auto rounded-md border border-border">
          <table className="w-full text-left text-sm tabular-nums">
            <thead className="sticky top-0">
              <tr className="border-b-2 border-border bg-muted">
                <th className="w-10 px-4 py-2.5">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    checked={allChecked}
                    onChange={handleToggleAll}
                    aria-label="Select all reactions"
                    className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
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
                const isSelected = localIds.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className={`cursor-pointer border-b border-border/70 transition-colors duration-150 ${isSelected ? 'bg-accent' : 'hover:bg-accent/50'}`}
                    onClick={() => handleToggle(r.id)}
                  >
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggle(r.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${r.shortName}`}
                        className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </td>
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
          <span className="font-mono tabular-nums">{localIds.size}</span> of{' '}
          <span className="font-mono tabular-nums">{reactions.length}</span> reaction
          {reactions.length !== 1 ? 's' : ''} selected
        </p>
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={localIds.size === 0}>
            Apply
          </Button>
        </div>
      </div>
    </Modal>
  );
}
