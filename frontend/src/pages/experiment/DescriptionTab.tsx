// frontend/src/pages/experiment/DescriptionTab.tsx
import { useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Experiment } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DetailRow } from '@/components/ui/DetailRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { StorageGauge } from '@/components/ui/StorageGauge';
import { useStorageInfo } from '@/hooks/useProjects';
import { useUpdateExperiment } from '@/hooks/useExperiments';
import { formatDate, getDisplayName } from '@/lib/utils';
import { cn } from '@/lib/cn';

interface ExperimentContext {
  experiment: Experiment;
  isReadOnly: boolean;
}

export default function DescriptionTab() {
  const { experiment, isReadOnly } = useOutletContext<ExperimentContext>();
  const { data: storageInfo } = useStorageInfo();
  const updateMutation = useUpdateExperiment();

  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const descInputRef = useRef<HTMLTextAreaElement>(null);

  const creatorName = experiment.creator
    ? getDisplayName(experiment.creator)
    : 'Unknown';

  function startEditingName() {
    setDraftName(experiment.name);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 0);
  }

  function startEditingDesc() {
    setDraftDesc(experiment.description ?? '');
    setEditingDesc(true);
    setTimeout(() => descInputRef.current?.focus(), 0);
  }

  function saveName() {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed.length > 100) {
      toast.error('Name must be 1-100 characters');
      return;
    }
    if (trimmed === experiment.name) {
      setEditingName(false);
      return;
    }
    updateMutation.mutate(
      { id: experiment.id, updates: { name: trimmed } },
      {
        onSuccess: () => {
          setEditingName(false);
          toast.success('Name updated');
        },
        onError: () => toast.error('Failed to update name'),
      },
    );
  }

  function saveDesc() {
    const value = draftDesc.trim() || undefined;
    if (value === (experiment.description ?? undefined)) {
      setEditingDesc(false);
      return;
    }
    updateMutation.mutate(
      { id: experiment.id, updates: { description: value } },
      {
        onSuccess: () => {
          setEditingDesc(false);
          toast.success('Description updated');
        },
        onError: () => toast.error('Failed to update description'),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <Card className="md:flex-[2]">
        <h3 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Details
        </h3>
        <div>
          <DetailRow label="Name">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  ref={nameInputRef}
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveName();
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                  maxLength={100}
                  className="w-full rounded-md border border-input bg-card px-2 py-0.5 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
                  disabled={updateMutation.isPending}
                />
                <button type="button" onClick={saveName} disabled={updateMutation.isPending} aria-label="Save name" className="rounded-md p-1 text-success transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => setEditingName(false)} aria-label="Cancel editing name" className="rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <span className="group inline-flex items-center gap-1.5">
                {experiment.name}
                {!isReadOnly && (
                  <button type="button" onClick={startEditingName} aria-label="Edit name" className="rounded-md p-1 text-muted-foreground opacity-0 transition-all duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100">
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </span>
            )}
          </DetailRow>
          <DetailRow label="Experiment ID"><span className="font-mono">{experiment.id}</span></DetailRow>
          <DetailRow label="Created By">{creatorName}</DetailRow>
          <DetailRow label="Created Date">{formatDate(experiment.createdAt)}</DetailRow>
          <DetailRow label="Status">
            <StatusBadge status={experiment.status} />
          </DetailRow>
          <DetailRow label="Size">
            <StorageGauge
              usedBytes={experiment.storageBytes}
              quotaBytes={storageInfo?.quotaBytes}
            />
          </DetailRow>
        </div>
      </Card>
      <Card className="md:flex-[3]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Description
          </h3>
          {!isReadOnly && !editingDesc && (
            <button type="button" onClick={startEditingDesc} aria-label="Edit description" className="rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {editingDesc ? (
          <div className="space-y-2">
            <textarea
              ref={descInputRef}
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingDesc(false);
              }}
              rows={4}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
              placeholder="Add a description..."
              disabled={updateMutation.isPending}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" type="button" onClick={() => setEditingDesc(false)}>
                Cancel
              </Button>
              <Button size="sm" type="button" onClick={saveDesc} loading={updateMutation.isPending}>
                Save
              </Button>
            </div>
          </div>
        ) : experiment.description ? (
          <p className="text-sm text-foreground">{experiment.description}</p>
        ) : (
          <button
            type="button"
            onClick={!isReadOnly ? startEditingDesc : undefined}
            className={cn(
              'rounded text-sm text-muted-foreground transition-colors duration-150',
              !isReadOnly && 'cursor-pointer hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            {isReadOnly ? 'No description provided' : 'Click to add a description...'}
          </button>
        )}
      </Card>
    </div>
  );
}
