// frontend/src/components/rnaseq-alignment/RnaseqAlignmentInputPanel.tsx
import { type ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';

import type { AnalysisJob } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { DataTable } from '@/components/ui/DataTable';
import { useReactions } from '@/hooks/useReactions';
import { GENOME_DISPLAY_NAMES } from '@/lib/constants';

interface RnaseqAlignmentInputPanelProps {
  job: AnalysisJob;
  experimentId: number;
}

interface InputRow {
  shortName: string;
  assayType: string;
  organism: string;
  referenceGenome: string;
}

const columns: ColumnDef<InputRow, unknown>[] = [
  { accessorKey: 'shortName', header: 'Short Name' },
  { accessorKey: 'assayType', header: 'Assay Type' },
  { accessorKey: 'organism', header: 'Organism' },
  { accessorKey: 'referenceGenome', header: 'Reference Genome' },
];

export function RnaseqAlignmentInputPanel({ job, experimentId }: RnaseqAlignmentInputPanelProps) {
  const { data: reactionsData } = useReactions(experimentId);

  const genome = job.params?.reference_genome as string | undefined;
  const genomeDisplay = genome ? (GENOME_DISPLAY_NAMES[genome] ?? genome) : 'N/A';

  const rows: InputRow[] = useMemo(() => {
    const reactions = reactionsData?.items ?? [];
    const reactionsMap = new Map(reactions.map((r) => [r.id, r]));
    const jobReactions = (job.params?.reactions ?? []) as Array<{
      reaction_id: number;
      short_name: string;
    }>;

    return jobReactions.map((jr) => {
      const reaction = reactionsMap.get(jr.reaction_id);
      return {
        shortName: jr.short_name,
        assayType: reaction?.assayType ?? 'N/A',
        organism: reaction?.organism ?? 'N/A',
        referenceGenome: genomeDisplay,
      };
    });
  }, [job.params, reactionsData, genomeDisplay]);

  return (
    <Card>
      <h3 className="font-display mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Reactions
      </h3>
      <DataTable data={rows} columns={columns} pageSize={25} />
    </Card>
  );
}
