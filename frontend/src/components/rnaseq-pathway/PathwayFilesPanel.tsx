// frontend/src/components/rnaseq-pathway/PathwayFilesPanel.tsx
import { AlignmentFilesPanel } from '@/components/alignment/AlignmentFilesPanel';
import { RNASEQ_PATHWAY_FILE_CATEGORIES } from '@/lib/constants';

interface PathwayFilesPanelProps {
  jobId: number;
  experimentId: number;
}

export function PathwayFilesPanel({ jobId }: PathwayFilesPanelProps) {
  return (
    <AlignmentFilesPanel
      jobId={jobId}
      categories={RNASEQ_PATHWAY_FILE_CATEGORIES}
    />
  );
}
