// frontend/src/components/reactions/AutoFillReactionsModal.tsx
import { useState } from 'react';
import { Check, Sparkles, Trash2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { useSuggestReactions, useBulkCreateReactions } from '@/hooks/useReactions';
import { ORGANISMS } from '@/lib/constants';
import type { ReactionSuggestion, ReactionCreatePayload } from '@/api/types';

interface AutoFillReactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  experimentId: number;
  assayType: string;
}

const selectClass =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25';
const cellInputClass =
  'w-full rounded-md border border-input bg-card px-2 py-1 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25';

export function AutoFillReactionsModal({
  isOpen,
  onClose,
  experimentId,
  assayType,
}: AutoFillReactionsModalProps) {
  const suggestMutation = useSuggestReactions();
  const bulkCreateMutation = useBulkCreateReactions();

  const [organism, setOrganism] = useState<string>(ORGANISMS[1]);
  const [suggestions, setSuggestions] = useState<ReactionSuggestion[]>([]);
  const [skippedPrefixes, setSkippedPrefixes] = useState<string[]>([]);
  const [hasFetched, setHasFetched] = useState(false);

  function handleClose() {
    setSuggestions([]);
    setSkippedPrefixes([]);
    setHasFetched(false);
    onClose();
  }

  async function handleGenerate() {
    try {
      const result = await suggestMutation.mutateAsync({
        experimentId,
        organism,
        assayType,
      });
      setSuggestions(result.suggestions);
      setSkippedPrefixes(result.skippedPrefixes);
      setHasFetched(true);
    } catch {
      toast.error('Failed to generate suggestions');
    }
  }

  function updateSuggestion(index: number, field: string, value: string | number | null) {
    setSuggestions((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    );
  }

  function removeSuggestion(index: number) {
    setSuggestions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreate() {
    const payloads: ReactionCreatePayload[] = suggestions.map((s) => ({
      fastqPrefix: s.fastqPrefix,
      shortName: s.shortName,
      organism: s.organism,
      assayType: s.assayType,
      experimentalCondition: s.experimentalCondition || null,
      replicateNumber: s.replicateNumber,
      antibodyVendor: s.antibodyVendor || null,
    }));

    try {
      const result = await bulkCreateMutation.mutateAsync({
        experimentId,
        reactions: payloads,
      });
      toast.success(`Created ${result.created} reactions`);
      handleClose();
    } catch (err) {
      const apiErr = err as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(apiErr.response?.data?.detail ?? apiErr.message ?? 'Failed to create reactions');
    }
  }

  const isPending = suggestMutation.isPending || bulkCreateMutation.isPending;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Auto-fill Reactions from Filenames">
      <div className="space-y-4">
        <div className="flex items-end gap-3">
          <Field label="Organism" htmlFor="autofill-organism" required className="flex-1">
            <select
              id="autofill-organism"
              value={organism}
              onChange={(e) => setOrganism(e.target.value)}
              className={selectClass}
              disabled={hasFetched}
            >
              {ORGANISMS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>
          {!hasFetched && (
            <Button onClick={() => void handleGenerate()} disabled={isPending}>
              {suggestMutation.isPending ? <Spinner size="sm" /> : <Sparkles className="h-4 w-4" />}
              Generate Suggestions
            </Button>
          )}
        </div>

        {hasFetched && skippedPrefixes.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-info/25 bg-info/10 px-3 py-2 text-sm text-foreground/80">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            <span>
              {skippedPrefixes.length} prefix{skippedPrefixes.length > 1 ? 'es' : ''} already
              {skippedPrefixes.length > 1 ? ' have' : ' has'} reactions and {skippedPrefixes.length > 1 ? 'were' : 'was'} skipped.
            </span>
          </div>
        )}

        {hasFetched && suggestions.length === 0 && (
          <EmptyState
            icon={Check}
            title="Nothing to auto-fill"
            description="All uploaded FASTQs already have reactions assigned."
          />
        )}

        {suggestions.length > 0 && (
          <div className="max-h-[50vh] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                <tr className="border-b text-left">
                  <th className="px-3 py-2 font-medium text-muted-foreground">FASTQ Prefix</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Short Name</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Condition</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Rep</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">R1/R2</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s, i) => (
                  <tr key={s.fastqPrefix} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="max-w-[200px] truncate px-3 py-2 font-mono text-xs" title={s.fastqPrefix}>
                      {s.fastqPrefix}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={s.shortName}
                        onChange={(e) => updateSuggestion(i, 'shortName', e.target.value)}
                        className={cellInputClass}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={s.experimentalCondition ?? ''}
                        onChange={(e) => updateSuggestion(i, 'experimentalCondition', e.target.value || null)}
                        placeholder="—"
                        className={`${cellInputClass} ${s.autoDetectedFields.includes('experimentalCondition') ? 'border-primary/40 bg-primary/5' : ''}`}
                      />
                    </td>
                    <td className="w-16 px-2 py-1.5">
                      <input
                        type="number"
                        min="1"
                        value={s.replicateNumber ?? ''}
                        onChange={(e) => updateSuggestion(i, 'replicateNumber', e.target.value ? parseInt(e.target.value, 10) : null)}
                        placeholder="—"
                        className={`${cellInputClass} ${s.autoDetectedFields.includes('replicateNumber') ? 'border-primary/40 bg-primary/5' : ''}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1.5">
                        {s.hasR1 && <Check className="h-4 w-4 text-success" />}
                        {s.hasR2 && <Check className="h-4 w-4 text-success" />}
                        <span className="text-xs text-muted-foreground">
                          {s.hasR1 && s.hasR2 ? 'R1+R2' : s.hasR1 ? 'R1' : 'R2'}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => removeSuggestion(i)}
                        className="rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title="Remove"
                        aria-label="Remove suggestion"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" type="button" onClick={handleClose}>
            Cancel
          </Button>
          {suggestions.length > 0 && (
            <Button onClick={() => void handleCreate()} disabled={isPending}>
              {bulkCreateMutation.isPending ? 'Creating...' : `Create ${suggestions.length} Reaction${suggestions.length > 1 ? 's' : ''}`}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
