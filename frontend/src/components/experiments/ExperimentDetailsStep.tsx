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
          <label htmlFor="wizard-name" className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Experiment Name <span className="text-destructive">*</span>
          </label>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{name.length} / 100</span>
        </div>
        <input
          id="wizard-name"
          type="text"
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter experiment name"
          className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
        />
      </div>

      <div>
        <label htmlFor="wizard-assay-type" className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Assay Type <span className="text-destructive">*</span>
        </label>
        <select
          id="wizard-assay-type"
          required
          value={assayType}
          onChange={(e) => setAssayType(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
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
        <label htmlFor="wizard-description" className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Description
        </label>
        <textarea
          id="wizard-description"
          className="rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional experiment description"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
