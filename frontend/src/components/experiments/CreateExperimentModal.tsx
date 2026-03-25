// frontend/src/components/experiments/CreateExperimentModal.tsx
import { type FormEvent, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useCreateExperiment } from '@/hooks/useExperiments';
import { ASSAY_TYPES } from '@/lib/constants';
import type { Experiment } from '@/api/types';

interface CreateExperimentModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  onCreated: (experiment: Experiment) => void;
}

export function CreateExperimentModal({
  isOpen,
  onClose,
  projectId,
  onCreated,
}: CreateExperimentModalProps) {
  const [name, setName] = useState('');
  const [assayType, setAssayType] = useState('');
  const [description, setDescription] = useState('');
  const createExperiment = useCreateExperiment();

  function handleClose() {
    setName('');
    setAssayType('');
    setDescription('');
    createExperiment.reset();
    onClose();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createExperiment.mutate(
      {
        projectId,
        name: name.trim(),
        assayType,
        description: description.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          onCreated(data);
        },
      },
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="New Experiment">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Experiment Name <span className="text-red-500">*</span>
            </label>
            <span className="text-xs text-gray-400">{name.length} / 100</span>
          </div>
          <input
            type="text"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter experiment name"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Assay Type <span className="text-red-500">*</span>
          </label>
          <select
            required
            value={assayType}
            onChange={(e) => setAssayType(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="" disabled>
              Select assay type
            </option>
            {ASSAY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Description
          </label>
          <textarea
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional experiment description"
          />
        </div>

        {createExperiment.isError && (
          <p className="text-sm text-red-500">
            Failed to create experiment. Please try again.
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outlined" type="button" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!name.trim() || !assayType || createExperiment.isPending}
          >
            {createExperiment.isPending ? 'Creating...' : 'Create Experiment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
