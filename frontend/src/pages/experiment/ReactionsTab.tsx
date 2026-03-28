// frontend/src/pages/experiment/ReactionsTab.tsx
import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ReactionsEditor } from '@/components/reactions/ReactionsEditor';
import { useReactions, usePrefixes } from '@/hooks/useReactions';
import type { Experiment, PrefixInfo, Reaction } from '@/api/types';

interface ExperimentContext {
  experiment: Experiment;
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

export default function ReactionsTab() {
  const { experiment } = useOutletContext<ExperimentContext>();
  const { data, isLoading } = useReactions(experiment.id);
  const { data: prefixes } = usePrefixes(experiment.id);
  const [showEditor, setShowEditor] = useState(false);

  const reactions = data?.items ?? [];
  const prefixList = useMemo<PrefixInfo[]>(() => prefixes ?? [], [prefixes]);

  const prefixMap = useMemo(() => {
    const map = new Map<string, PrefixInfo>();
    for (const p of prefixList) {
      map.set(p.prefix, p);
    }
    return map;
  }, [prefixList]);

  const columns: ColumnDef<Reaction, unknown>[] = useMemo(
    () => [
      { accessorKey: 'fastqPrefix', header: 'FASTQ Prefix' },
      {
        id: 'r1File',
        header: 'R1 File',
        cell: (info) => {
          const p = prefixMap.get(info.row.original.fastqPrefix);
          return p?.hasR1 ? <CheckIcon /> : <span className="text-gray-300">{'\u2014'}</span>;
        },
      },
      {
        id: 'r2File',
        header: 'R2 File',
        cell: (info) => {
          const p = prefixMap.get(info.row.original.fastqPrefix);
          return p?.hasR2 ? <CheckIcon /> : <span className="text-gray-300">{'\u2014'}</span>;
        },
      },
      { accessorKey: 'shortName', header: 'Short Name' },
      { accessorKey: 'assayType', header: 'Assay Type' },
      { accessorKey: 'organism', header: 'Organism' },
    ],
    [prefixMap],
  );

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Reactions
          </h3>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => setShowEditor(true)}>
              Edit
            </Button>
          </div>
        </div>

        {reactions.length > 0 ? (
          <DataTable data={reactions} columns={columns} />
        ) : (
          <p className="py-8 text-center text-sm text-gray-400">
            No reactions defined yet. Click Edit to add reactions.
          </p>
        )}
      </Card>

      <Modal
        isOpen={showEditor}
        onClose={() => setShowEditor(false)}
        title="Edit Reactions"
        className="max-w-5xl max-h-[85vh] flex flex-col"
      >
        <div className="overflow-y-auto">
          <ReactionsEditor
            experimentId={experiment.id}
            assayType={experiment.assayType}
          />
        </div>
      </Modal>
    </>
  );
}
