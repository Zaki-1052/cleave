// frontend/src/components/diffbind/DiffBindDetailsStep.tsx
import { Card } from '@/components/layout/Card';

interface DiffBindDetailsStepProps {
  name: string;
  setName: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
}

export function DiffBindDetailsStep({
  name,
  setName,
  notes,
  setNotes,
}: DiffBindDetailsStepProps) {
  return (
    <div className="flex gap-6">
      <Card className="flex-[2]">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
          DiffBind Details
        </h3>

        <div className="mb-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              DiffBind Name <span className="text-red-500">*</span>
            </label>
            <span className="text-xs text-gray-400">{name.length} / 30</span>
          </div>
          <input
            type="text"
            required
            maxLength={30}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter DiffBind analysis name"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Notes
          </label>
          <textarea
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes about this DiffBind analysis"
          />
        </div>
      </Card>

      <Card className="flex-[3]">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
          About
        </h3>

        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              What is DiffBind?
            </h4>
            <p>
              DiffBind is a Bioconductor R package for identifying differentially bound genomic
              regions between experimental conditions in CUT&amp;RUN and CUT&amp;Tag data. It
              compares peak sets across conditions (e.g., control vs. mutant) to find regions with
              statistically significant changes in binding affinity.
            </p>
          </div>

          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              What does the pipeline do?
            </h4>
            <p>
              The DiffBind pipeline builds a sample sheet from your selected reactions, loads BAM
              files and peak sets, computes a consensus peakset or uses a custom one, counts reads
              in peaks, normalizes across samples, and performs differential binding analysis using
              DESeq2 or edgeR. PCA, MA, volcano, and correlation heatmap plots are generated
              automatically.
            </p>
          </div>

          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Outputs
            </h4>
            <p>
              Differential binding results (fold change, p-values, FDR), normalized read counts
              matrix, PCA plot, MA plot, volcano plot, correlation heatmaps, the DiffBind sample
              sheet CSV, and supporting logs.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
