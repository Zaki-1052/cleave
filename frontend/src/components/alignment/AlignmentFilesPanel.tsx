// frontend/src/components/alignment/AlignmentFilesPanel.tsx
import { type ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';

import { batchDownloadJobFiles } from '@/api/jobs';
import type { JobOutput } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { useJobOutputs } from '@/hooks/useJobs';
import { ALIGNMENT_FILE_CATEGORIES } from '@/lib/constants';
import { formatBytes } from '@/lib/utils';

interface AlignmentFilesPanelProps {
  jobId: number;
  categories?: readonly { value: string; label: string; description: string }[];
}

export function AlignmentFilesPanel({ jobId, categories }: AlignmentFilesPanelProps) {
  const fileCategories = categories ?? ALIGNMENT_FILE_CATEGORIES;
  const [selectedCategory, setSelectedCategory] = useState(
    fileCategories[0].value,
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: outputs, isLoading } = useJobOutputs(jobId, selectedCategory);

  const categoryInfo = fileCategories.find((c) => c.value === selectedCategory);

  function handleCategoryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedCategory(e.target.value);
    setSelectedIds(new Set());
  }

  function toggleSelection(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    if (!outputs) return;
    if (selectedIds.size === outputs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(outputs.map((o) => o.id)));
    }
  }

  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (selectedIds.size === 0) return;
    if (selectedIds.size === 1) {
      const [id] = selectedIds;
      window.open(`/api/v1/jobs/${jobId}/files/${id}/download`, '_blank');
      return;
    }
    setDownloading(true);
    try {
      await batchDownloadJobFiles(jobId, [...selectedIds]);
    } finally {
      setDownloading(false);
    }
  }

  const columns: ColumnDef<JobOutput, unknown>[] = useMemo(
    () => [
      {
        id: 'select',
        header: () => (
          <input
            type="checkbox"
            checked={outputs != null && outputs.length > 0 && selectedIds.size === outputs.length}
            onChange={toggleAll}
            aria-label="Select all files"
            className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={selectedIds.has(row.original.id)}
            onChange={() => toggleSelection(row.original.id)}
            aria-label={`Select ${row.original.filename}`}
            className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        ),
        size: 40,
        enableSorting: false,
      },
      {
        accessorKey: 'filename',
        header: 'Filename',
        cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span>,
      },
      { accessorKey: 'fileType', header: 'Type' },
      {
        accessorKey: 'fileSizeBytes',
        header: 'Size',
        cell: ({ getValue }) => {
          const bytes = getValue() as number | null;
          return bytes != null ? (
            <span className="font-mono tabular-nums">{formatBytes(bytes)}</span>
          ) : (
            '--'
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, outputs],
  );

  return (
    <Card>
      {/* Category selector + description */}
      <div className="mb-4 flex items-start gap-4">
        <div className="shrink-0">
          <label
            htmlFor="alignment-file-category"
            className="mb-1 block font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
          >
            Files
          </label>
          <select
            id="alignment-file-category"
            value={selectedCategory}
            onChange={handleCategoryChange}
            className="rounded-md border border-input bg-card px-3 py-1.5 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
          >
            {fileCategories.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
        {categoryInfo && (
          <p className="mt-5 text-xs text-muted-foreground">{categoryInfo.description}</p>
        )}
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex items-center gap-2">
        <Button
          variant="outline"
          onClick={handleDownload}
          disabled={selectedIds.size === 0 || downloading}
          className="text-xs"
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {downloading ? 'Downloading...' : `Download (${selectedIds.size})`}
        </Button>
      </div>

      {/* Files table */}
      <DataTable data={outputs ?? []} columns={columns} pageSize={25} isLoading={isLoading} />
    </Card>
  );
}
