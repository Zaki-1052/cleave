// frontend/src/components/reactions/ReactionsEditor.tsx
import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { CsvUploadZone } from './CsvUploadZone';
import { ReactionFormModal } from './ReactionFormModal';
import { useReactions, usePrefixes, useDeleteReaction } from '@/hooks/useReactions';
import type { PrefixInfo, Reaction } from '@/api/types';

type OptionalColumn = { key: keyof Reaction; label: string };

const CUTANDRUN_OPTIONAL_COLUMNS: OptionalColumn[] = [
  { key: 'cutanaSpikeIn', label: 'CUTANA Spike in' },
  { key: 'cutanaSpikeInTarget', label: 'CUTANA Spike in Target' },
  { key: 'ecoliSpikeIn', label: 'E.coli Spike in' },
  { key: 'cellType', label: 'Cell Type' },
  { key: 'cellNumber', label: 'Cell Number' },
  { key: 'samplePrep', label: 'Sample Prep' },
  { key: 'experimentalCondition', label: 'Experimental Condition' },
  { key: 'antibodyVendor', label: 'Antibody Vendor' },
  { key: 'antibodyCatNo', label: 'Antibody Cat No' },
  { key: 'antibodyLotNo', label: 'Antibody Lot No' },
  { key: 'cutanaSpikeIn2', label: 'CUTANA Spike in 2' },
  { key: 'cutanaSpikeInTarget2', label: 'CUTANA Spike in Target 2' },
];

const RNASEQ_OPTIONAL_COLUMNS: OptionalColumn[] = [
  { key: 'treatment', label: 'Treatment' },
  { key: 'timepoint', label: 'Timepoint' },
  { key: 'genotype', label: 'Genotype' },
  { key: 'replicateNumber', label: 'Replicate Number' },
  { key: 'cellType', label: 'Cell Type' },
  { key: 'cellNumber', label: 'Cell Number' },
  { key: 'samplePrep', label: 'Sample Prep' },
  { key: 'experimentalCondition', label: 'Experimental Condition' },
];

interface ReactionsEditorProps {
  experimentId: number;
  assayType: string;
}

export function ReactionsEditor({ experimentId, assayType }: ReactionsEditorProps) {
  const { data: reactionsData, isLoading } = useReactions(experimentId);
  const { data: prefixes } = usePrefixes(experimentId);
  const deleteMutation = useDeleteReaction();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Reaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Reaction | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [visibleOptional, setVisibleOptional] = useState<Set<string>>(new Set());
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  const reactions = reactionsData?.items ?? [];
  const optionalColumns = assayType === 'RNA-seq'
    ? RNASEQ_OPTIONAL_COLUMNS
    : CUTANDRUN_OPTIONAL_COLUMNS;
  const prefixList = useMemo<PrefixInfo[]>(() => prefixes ?? [], [prefixes]);

  // Lookup map: prefix string → PrefixInfo
  const prefixMap = useMemo(() => {
    const map = new Map<string, PrefixInfo>();
    for (const p of prefixList) {
      map.set(p.prefix, p);
    }
    return map;
  }, [prefixList]);

  // Build columns dynamically based on visible optional set
  const columns = useMemo<ColumnDef<Reaction, unknown>[]>(() => {
    const base: ColumnDef<Reaction, unknown>[] = [
      { accessorKey: 'fastqPrefix', header: 'FASTQ Prefix' },
      {
        id: 'r1File',
        header: 'R1 File',
        cell: (info) => {
          const p = prefixMap.get(info.row.original.fastqPrefix);
          return p?.hasR1 ? <Check className="h-5 w-5 text-green-500" /> : <span className="text-muted-foreground/50">{'\u2014'}</span>;
        },
      },
      {
        id: 'r2File',
        header: 'R2 File',
        cell: (info) => {
          const p = prefixMap.get(info.row.original.fastqPrefix);
          return p?.hasR2 ? <Check className="h-5 w-5 text-green-500" /> : <span className="text-muted-foreground/50">{'\u2014'}</span>;
        },
      },
      { accessorKey: 'shortName', header: 'Short Name' },
      { accessorKey: 'assayType', header: 'Assay Type' },
      { accessorKey: 'organism', header: 'Organism' },
    ];

    // Add optional columns that are toggled on
    for (const col of optionalColumns) {
      if (visibleOptional.has(col.key)) {
        base.push({
          accessorKey: col.key,
          header: col.label,
          cell: (info) => {
            const val = info.getValue();
            if (typeof val === 'boolean') return val ? 'Yes' : 'No';
            if (typeof val === 'number') return String(val);
            return (val as string | null) ?? '\u2014';
          },
        });
      }
    }

    // Actions column
    base.push({
      id: 'actions',
      header: '',
      cell: (info) => (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditTarget(info.row.original)}
            className="text-muted-foreground hover:text-primary"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setDeleteTarget(info.row.original);
            }}
            className="text-muted-foreground hover:text-red-500"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    });

    return base;
  }, [prefixMap, visibleOptional, optionalColumns]);

  function toggleColumn(key: string) {
    setVisibleOptional((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    deleteMutation.mutate(
      { experimentId, reactionId: deleteTarget.id },
      {
        onSuccess: () => {
          toast.success('Reaction deleted');
          setDeleteTarget(null);
        },
        onError: () => setDeleteError('Failed to delete reaction. Please try again.'),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* CSV Upload Section */}
      <CsvUploadZone experimentId={experimentId} onImportComplete={() => {}} />

      {/* OR Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-4 text-sm text-muted-foreground">OR</span>
        </div>
      </div>

      {/* Manual Reactions Section */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h4 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Reactions
          </h4>
          <div className="flex gap-2">
            <div className="relative">
              <Button
                variant="outlined"
                onClick={() => setShowColumnPicker(!showColumnPicker)}
              >
                Customize Columns
              </Button>
              {showColumnPicker && (
                <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border bg-card p-3 shadow-lg">
                  <div className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Optional Columns
                  </div>
                  {optionalColumns.map((col) => (
                    <label
                      key={col.key}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={visibleOptional.has(col.key)}
                        onChange={() => toggleColumn(col.key)}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <Button variant="primary" onClick={() => setShowAddForm(true)}>
              + Add Reaction
            </Button>
          </div>
        </div>

        {reactions.length > 0 ? (
          <DataTable data={reactions} columns={columns} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No reactions defined yet. Add reactions manually or upload a CSV above.
          </p>
        )}
      </div>

      {/* Add Reaction Modal */}
      <ReactionFormModal
        isOpen={showAddForm}
        onClose={() => setShowAddForm(false)}
        experimentId={experimentId}
        prefixes={prefixList}
        assayType={assayType}
      />

      {/* Edit Reaction Modal */}
      <ReactionFormModal
        isOpen={editTarget !== null}
        onClose={() => setEditTarget(null)}
        experimentId={experimentId}
        prefixes={prefixList}
        assayType={assayType}
        existingReaction={editTarget ?? undefined}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Reaction"
      >
        <p className="mb-4 text-sm text-foreground">
          Are you sure you want to delete reaction{' '}
          <span className="font-medium">{deleteTarget?.shortName}</span>? This
          action cannot be undone.
        </p>
        {deleteError && (
          <p className="mb-3 text-sm text-red-600">{deleteError}</p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="outlined" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
