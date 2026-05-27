// frontend/src/pages/experiment/DescriptionTab.tsx
import { useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Experiment } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { DetailRow } from '@/components/ui/DetailRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { StorageGauge } from '@/components/ui/StorageGauge';
import { useStorageInfo } from '@/hooks/useProjects';
import { useUpdateExperiment } from '@/hooks/useExperiments';
import { formatDate, getDisplayName } from '@/lib/utils';

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
    const value = draftDesc.trim() || null;
    if (value === (experiment.description ?? null)) {
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
    <div className="flex gap-4">
      <Card className="flex-[2]">
        <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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
                  className="w-full rounded border border-border bg-background px-2 py-0.5 text-sm focus:border-primary focus:outline-none"
                  disabled={updateMutation.isPending}
                />
                <button type="button" onClick={saveName} disabled={updateMutation.isPending} className="text-green-600 hover:text-green-700 dark:text-green-400">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => setEditingName(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <span className="group inline-flex items-center gap-1.5">
                {experiment.name}
                {!isReadOnly && (
                  <button type="button" onClick={startEditingName} className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground">
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
      <Card className="flex-[3]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Description
          </h3>
          {!isReadOnly && !editingDesc && (
            <button type="button" onClick={startEditingDesc} className="text-muted-foreground hover:text-foreground">
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
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Add a description..."
              disabled={updateMutation.isPending}
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingDesc(false)} className="rounded px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted">
                Cancel
              </button>
              <button type="button" onClick={saveDesc} disabled={updateMutation.isPending} className="rounded bg-primary px-2.5 py-1 text-xs text-white hover:bg-primary/90">
                Save
              </button>
            </div>
          </div>
        ) : experiment.description ? (
          <p className="text-sm text-foreground">{experiment.description}</p>
        ) : (
          <button
            type="button"
            onClick={!isReadOnly ? startEditingDesc : undefined}
            className={`text-sm text-muted-foreground ${!isReadOnly ? 'cursor-pointer hover:text-foreground' : ''}`}
          >
            {isReadOnly ? 'No description provided' : 'Click to add a description...'}
          </button>
        )}
      </Card>
    </div>
  );
}
