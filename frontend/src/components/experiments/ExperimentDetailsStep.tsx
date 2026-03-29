// frontend/src/components/experiments/ExperimentDetailsStep.tsx
import { ASSAY_TYPES } from '@/lib/constants';

interface ExperimentDetailsStepProps {
  name: string;
  setName: (v: string) => void;
  assayType: string;
  setAssayType: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  error: string | null;
}

export function ExperimentDetailsStep({
  name,
  setName,
  assayType,
  setAssayType,
  description,
  setDescription,
  error,
}: ExperimentDetailsStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between">
          <label className="font-display text-xs font-semibold uppercase tracking-wide text-gray-500">
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
        <label htmlFor="wizard-assay-type" className="font-display text-xs font-semibold uppercase tracking-wide text-gray-500">
          Assay Type <span className="text-red-500">*</span>
        </label>
        <select
          id="wizard-assay-type"
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
        <label className="font-display text-xs font-semibold uppercase tracking-wide text-gray-500">
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

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}
