// frontend/src/pages/experiment/AllFilesTab.tsx
import { useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { type ColumnDef } from '@tanstack/react-table';
import { ChevronRight, Download, File, Folder, FolderOpen, FolderTree } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/cn';
import { useExperimentFiles } from '@/hooks/useFiles';
import { downloadFile, batchDownloadFiles } from '@/api/files';
import { formatBytes } from '@/lib/utils';
import type { Experiment, FileNode } from '@/api/types';

function findNode(node: FileNode, path: string): FileNode | null {
  if (node.path === path) return node;
  if (!node.children) return null;
  for (const child of node.children) {
    const found = findNode(child, path);
    if (found) return found;
  }
  return null;
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  selectedPath: string;
  expandedPaths: Set<string>;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
}

function TreeNode({
  node,
  depth,
  selectedPath,
  expandedPaths,
  onSelect,
  onToggle,
}: TreeNodeProps) {
  const isExpanded = expandedPaths.has(node.path);
  const isActive = selectedPath === node.path;
  const hasChildren = node.children && node.children.some((c) => c.type === 'folder');

  return (
    <div>
      <button
        className={cn(
          'flex w-full items-center gap-1 px-2 py-1.5 text-left text-sm transition-colors duration-150',
          isActive
            ? 'bg-accent font-semibold text-primary'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        )}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={() => {
          onSelect(node.path);
          if (!isExpanded) onToggle(node.path);
        }}
      >
        <span
          className="inline-block w-4 text-center text-xs text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.path);
          }}
        >
          {hasChildren ? <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} /> : ''}
        </span>
        {isExpanded ? <FolderOpen className="h-4 w-4 text-muted-foreground" /> : <Folder className="h-4 w-4 text-muted-foreground" />}
        <span className="truncate">{node.name}</span>
      </button>
      {isExpanded &&
        node.children
          ?.filter((c) => c.type === 'folder')
          .map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
    </div>
  );
}

export default function AllFilesTab() {
  const { experiment } = useOutletContext<{ experiment: Experiment }>();
  const { data, isLoading, error } = useExperimentFiles(experiment.id);

  const [selectedPath, setSelectedPath] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set([''])
  );
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(
    () => new Set()
  );
  const [downloading, setDownloading] = useState(false);

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleSelect = useCallback((path: string) => {
    setSelectedPath(path);
    setSelectedFiles(new Set());
  }, []);

  const handleToggleFile = useCallback((path: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleDownload = useCallback(async () => {
    if (selectedFiles.size === 0) return;
    setDownloading(true);
    try {
      const paths = [...selectedFiles] as [string, ...string[]];
      if (paths.length === 1) {
        await downloadFile(experiment.id, paths[0]);
      } else {
        await batchDownloadFiles(experiment.id, paths);
      }
    } finally {
      setDownloading(false);
    }
  }, [selectedFiles, experiment.id]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 md:flex-row">
        <Card className="w-full shrink-0 p-0 md:w-64">
          <div className="border-b border-border px-3 py-2">
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="space-y-2 p-3">
            {['w-5/6', 'w-2/3', 'w-3/4', 'w-1/2', 'w-4/5', 'w-3/5'].map((w, i) => (
              <Skeleton key={i} className={cn('h-5', w)} />
            ))}
          </div>
        </Card>

        <Card className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-9 w-32" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load file tree.
        </div>
      </Card>
    );
  }

  if (!data || data.totalFiles === 0) {
    return (
      <EmptyState
        icon={FolderTree}
        title="No files yet"
        description="Upload FASTQs to get started."
      />
    );
  }

  const selectedNode = findNode(data.root, selectedPath);
  const tableItems = selectedNode?.children ?? [];

  const columns: ColumnDef<FileNode, unknown>[] = [
    {
      id: 'select',
      header: () => null,
      cell: ({ row }) => {
        const node = row.original;
        if (node.type === 'folder') return null;
        return (
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border"
            checked={selectedFiles.has(node.path)}
            onChange={() => handleToggleFile(node.path)}
            aria-label={`Select ${node.name}`}
          />
        );
      },
      size: 40,
      enableSorting: false,
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const node = row.original;
        if (node.type === 'folder') {
          return (
            <button
              type="button"
              className="flex items-center gap-2 text-primary hover:underline"
              onClick={() => {
                handleSelect(node.path);
                if (!expandedPaths.has(node.path)) handleToggle(node.path);
              }}
            >
              <Folder className="h-4 w-4 text-muted-foreground" />
              {node.name}
            </button>
          );
        }
        return (
          <span className="flex items-center gap-2">
            <File className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono">{node.name}</span>
          </span>
        );
      },
    },
    {
      accessorKey: 'type',
      header: 'Type/Class',
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'size',
      header: 'Size',
      cell: ({ getValue }) => {
        const v = getValue<number | null>();
        return v != null ? (
          <span className="block text-right font-mono tabular-nums">{formatBytes(v)}</span>
        ) : (
          ''
        );
      },
    },
  ];

  const folderName = selectedNode?.name ?? 'Root';

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <Card className="max-h-[600px] w-full shrink-0 overflow-y-auto p-0 md:w-64">
        <div className="border-b border-border px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Directory Tree
        </div>
        <TreeNode
          node={data.root}
          depth={0}
          selectedPath={selectedPath}
          expandedPaths={expandedPaths}
          onSelect={handleSelect}
          onToggle={handleToggle}
        />
      </Card>

      <Card className="min-w-0 flex-1">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="min-w-0 truncate font-mono text-sm font-medium text-foreground">
            {folderName}
          </h3>
          <Button
            variant="default"
            disabled={selectedFiles.size === 0 || downloading}
            onClick={handleDownload}
          >
            <Download className="h-3.5 w-3.5" />
            {downloading ? 'Downloading...' : `Download${selectedFiles.size > 0 ? ` (${selectedFiles.size})` : ''}`}
          </Button>
        </div>
        <DataTable data={tableItems} columns={columns} />
      </Card>
    </div>
  );
}
