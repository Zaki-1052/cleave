// frontend/src/components/alignment/AlignmentInputPanel.tsx
import { type ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';

import type { AnalysisJob } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { DataTable } from '@/components/ui/DataTable';
import { useReactions } from '@/hooks/useReactions';
import { GENOME_DISPLAY_NAMES } from '@/lib/constants';

interface AlignmentInputPanelProps {
  job: AnalysisJob;
  experimentId: number;
}

interface InputRow {
  shortName: string;
  assayType: string;
  organism: string;
  referenceGenome: string;
  cutanaSpikeIn: string;
  ecoliSpikeIn: string;
}

const columns: ColumnDef<InputRow, unknown>[] = [
  { accessorKey: 'shortName', header: 'Short Name' },
  { accessorKey: 'assayType', header: 'Assay Type' },
  { accessorKey: 'organism', header: 'Organism' },
  { accessorKey: 'referenceGenome', header: 'Reference Genome' },
  { accessorKey: 'cutanaSpikeIn', header: 'CUTANA Spike in' },
  { accessorKey: 'ecoliSpikeIn', header: 'E.coli Spike in' },
];

export function AlignmentInputPanel({ job, experimentId }: AlignmentInputPanelProps) {
  const { data: reactionsData } = useReactions(experimentId);

  const genome = job.params?.reference_genome as string | undefined;
  const genomeDisplay = genome ? (GENOME_DISPLAY_NAMES[genome] ?? genome) : 'N/A';

  const rows: InputRow[] = useMemo(() => {
    const reactions = reactionsData?.items ?? [];
    const reactionsMap = new Map(reactions.map((r) => [r.id, r]));
    const jobReactions = (job.params?.reactions ?? []) as Array<{
      reaction_id: number;
      short_name: string;
      cutana_spike_in?: string;
      ecoli_spike_in?: boolean;
    }>;

    return jobReactions.map((jr) => {
      const reaction = reactionsMap.get(jr.reaction_id);
      return {
        shortName: jr.short_name,
        assayType: reaction?.assayType ?? 'N/A',
        organism: reaction?.organism ?? 'N/A',
        referenceGenome: genomeDisplay,
        cutanaSpikeIn: jr.cutana_spike_in ?? 'None',
        ecoliSpikeIn: jr.ecoli_spike_in ? 'Yes' : 'No',
      };
    });
  }, [job.params, reactionsData, genomeDisplay]);

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Reactions
      </h3>
      <DataTable data={rows} columns={columns} pageSize={25} />
    </Card>
  );
}
