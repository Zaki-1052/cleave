// frontend/src/pages/experiment/AllFilesTab.tsx
import { useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { type ColumnDef } from '@tanstack/react-table';
import { ChevronDown, ChevronRight, Download, File, Folder, FolderOpen, Loader2 } from 'lucide-react';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
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
        className={`flex w-full items-center gap-1 px-2 py-1.5 text-left text-sm transition-colors ${
          isActive
            ? 'bg-white font-semibold text-primary'
            : 'text-gray-600 hover:bg-white/50'
        }`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={() => {
          onSelect(node.path);
          if (!isExpanded) onToggle(node.path);
        }}
      >
        <span
          className="inline-block w-4 text-center text-xs text-gray-400"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.path);
          }}
        >
          {hasChildren ? (isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : ''}
        </span>
        {isExpanded ? <FolderOpen className="h-4 w-4 text-gray-400" /> : <Folder className="h-4 w-4 text-gray-400" />}
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
      <Card>
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
          Failed to load file tree.
        </div>
      </Card>
    );
  }

  if (!data || data.totalFiles === 0) {
    return (
      <Card>
        <h3 className="font-display mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          All Files
        </h3>
        <p className="text-sm text-gray-400">
          No files found. Upload FASTQs to get started.
        </p>
      </Card>
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
            className="h-4 w-4 rounded border-gray-300"
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
              <Folder className="h-4 w-4 text-gray-400" />
              {node.name}
            </button>
          );
        }
        return (
          <span className="flex items-center gap-2">
            <File className="h-4 w-4 text-gray-400" />
            <span className="font-mono">{node.name}</span>
          </span>
        );
      },
    },
    {
      accessorKey: 'type',
      header: 'Type/Class',
      cell: ({ getValue }) => (
        <span className="text-gray-500">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'size',
      header: 'Size',
      cell: ({ getValue }) => {
        const v = getValue<number | null>();
        return v != null ? <span className="font-mono">{formatBytes(v)}</span> : '';
      },
    },
  ];

  const folderName = selectedNode?.name ?? 'Root';

  return (
    <div className="flex gap-4">
      <Card className="max-h-[600px] w-64 shrink-0 overflow-y-auto p-0">
        <div className="border-b px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-gray-500">
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
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-gray-500">
            {folderName}
          </h3>
          <Button
            variant="primary"
            disabled={selectedFiles.size === 0 || downloading}
            onClick={handleDownload}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {downloading ? 'Downloading...' : `Download${selectedFiles.size > 0 ? ` (${selectedFiles.size})` : ''}`}
          </Button>
        </div>
        <DataTable data={tableItems} columns={columns} />
      </Card>
    </div>
  );
}
