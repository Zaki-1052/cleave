// frontend/src/components/igv/SelectReactionsModal.tsx
import { useEffect, useRef, useState } from 'react';
import type { Reaction } from '@/api/types';
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
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0">
              <tr className="border-b bg-primary/10">
                <th className="w-10 px-3 py-2">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    checked={allChecked}
                    onChange={handleToggleAll}
                    aria-label="Select all reactions"
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                </th>
                <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Short Name
                </th>
                <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Organism
                </th>
                <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                    className={`border-b transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted'}`}
                    onClick={() => handleToggle(r.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggle(r.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${r.shortName}`}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-foreground">{r.shortName}</td>
                    <td className="px-3 py-2 text-foreground">{r.organism}</td>
                    <td className="px-3 py-2 text-foreground">{r.assayType}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {localIds.size} of {reactions.length} reaction{reactions.length !== 1 ? 's' : ''}{' '}
          selected
        </p>
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={localIds.size === 0}
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </div>
    </Modal>
  );
}
