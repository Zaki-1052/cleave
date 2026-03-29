// frontend/src/pages/experiment/ReactionsTab.tsx
import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Check } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
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
    ],
    [prefixMap],
  );

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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
          <p className="py-8 text-center text-sm text-muted-foreground">
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
