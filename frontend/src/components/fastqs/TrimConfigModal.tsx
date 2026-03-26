// frontend/src/components/fastqs/TrimConfigModal.tsx
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

const ADAPTER_FILES = [
  'Truseq3.PE.fa',
  'NexteraPE-PE.fa',
  'TruSeqAdapters.fa',
  'Truseq3.SE.fa',
];

export interface TrimParams {
  adapterFile: string;
  illuminaclip: string;
  leading: number;
  trailing: number;
  slidingwindow: string;
  minlen: number;
  kseqLength: number;
}

const DEFAULT_PARAMS: TrimParams = {
  adapterFile: 'Truseq3.PE.fa',
  illuminaclip: '2:15:4:4:true',
  leading: 20,
  trailing: 20,
  slidingwindow: '4:15',
  minlen: 25,
  kseqLength: 42,
};

interface TrimConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (params: TrimParams) => void;
  isSubmitting?: boolean;
}

export function TrimConfigModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
}: TrimConfigModalProps) {
  const [params, setParams] = useState<TrimParams>(DEFAULT_PARAMS);

  function handleChange(key: keyof TrimParams, value: string | number) {
    setParams((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    onSubmit(params);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Configure Trimming">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
            Adapter File
          </label>
          <select
            value={params.adapterFile}
            onChange={(e) => handleChange('adapterFile', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            {ADAPTER_FILES.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
            ILLUMINACLIP
          </label>
          <input
            type="text"
            value={params.illuminaclip}
            onChange={(e) => handleChange('illuminaclip', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-400">
            seed:palindrome:simple:minAdapterLen:keepBothReads
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
              Leading Quality
            </label>
            <input
              type="number"
              value={params.leading}
              onChange={(e) => handleChange('leading', Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
              Trailing Quality
            </label>
            <input
              type="number"
              value={params.trailing}
              onChange={(e) => handleChange('trailing', Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
              Sliding Window
            </label>
            <input
              type="text"
              value={params.slidingwindow}
              onChange={(e) => handleChange('slidingwindow', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">windowSize:requiredQuality</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
              Min Length
            </label>
            <input
              type="number"
              value={params.minlen}
              onChange={(e) => handleChange('minlen', Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
            kseq_test Target Length (bp)
          </label>
          <input
            type="number"
            value={params.kseqLength}
            onChange={(e) => handleChange('kseqLength', Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-400">
            Fixed-length trim after adapter removal (default 42bp)
          </p>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outlined" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Starting...' : 'Start Trimming'}
        </Button>
      </div>
    </Modal>
  );
}
