// frontend/src/components/fastqs/FastpConfigModal.tsx
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

export interface FastpParams {
  qualifiedQualityPhred: number;
  lengthRequired: number;
  cutFront: boolean;
  cutTail: boolean;
  cutWindowSize: number;
  cutMeanQuality: number;
  detectAdapterForPe: boolean;
}

const DEFAULT_PARAMS: FastpParams = {
  qualifiedQualityPhred: 20,
  lengthRequired: 25,
  cutFront: true,
  cutTail: true,
  cutWindowSize: 4,
  cutMeanQuality: 15,
  detectAdapterForPe: true,
};

interface FastpConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (params: FastpParams) => void;
  isSubmitting?: boolean;
}

export function FastpConfigModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
}: FastpConfigModalProps) {
  const [params, setParams] = useState<FastpParams>(DEFAULT_PARAMS);

  function handleChange<K extends keyof FastpParams>(key: K, value: FastpParams[K]) {
    setParams((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Configure fastp Trimming">
      <p className="mb-4 text-xs text-muted-foreground">
        fastp auto-detects adapters for paired-end RNA-seq reads. No kseq fixed-length trimming is applied.
      </p>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="fastp-qual-phred" className="mb-1 block font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Quality Threshold (Phred)
            </label>
            <input
              id="fastp-qual-phred"
              type="number"
              value={params.qualifiedQualityPhred}
              onChange={(e) => handleChange('qualifiedQualityPhred', Number(e.target.value))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="fastp-min-len" className="mb-1 block font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Min Read Length
            </label>
            <input
              id="fastp-min-len"
              type="number"
              value={params.lengthRequired}
              onChange={(e) => handleChange('lengthRequired', Number(e.target.value))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="fastp-win-size" className="mb-1 block font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sliding Window Size
            </label>
            <input
              id="fastp-win-size"
              type="number"
              value={params.cutWindowSize}
              onChange={(e) => handleChange('cutWindowSize', Number(e.target.value))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="fastp-win-qual" className="mb-1 block font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Window Mean Quality
            </label>
            <input
              id="fastp-win-qual"
              type="number"
              value={params.cutMeanQuality}
              onChange={(e) => handleChange('cutMeanQuality', Number(e.target.value))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={params.detectAdapterForPe}
              onChange={(e) => handleChange('detectAdapterForPe', e.target.checked)}
              className="rounded border-border"
              aria-label="Auto-detect adapters"
            />
            Auto-detect adapters for paired-end reads
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={params.cutFront}
              onChange={(e) => handleChange('cutFront', e.target.checked)}
              className="rounded border-border"
              aria-label="Cut front low-quality bases"
            />
            Cut low-quality bases from read front
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={params.cutTail}
              onChange={(e) => handleChange('cutTail', e.target.checked)}
              className="rounded border-border"
              aria-label="Cut tail low-quality bases"
            />
            Cut low-quality bases from read tail
          </label>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outlined" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSubmit(params)} disabled={isSubmitting}>
          {isSubmitting ? 'Starting...' : 'Start Trimming'}
        </Button>
      </div>
    </Modal>
  );
}
