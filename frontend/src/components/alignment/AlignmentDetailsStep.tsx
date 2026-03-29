// frontend/src/components/alignment/AlignmentDetailsStep.tsx
import { Card } from '@/components/layout/Card';

interface AlignmentDetailsStepProps {
  name: string;
  setName: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
}

export function AlignmentDetailsStep({
  name,
  setName,
  notes,
  setNotes,
}: AlignmentDetailsStepProps) {
  return (
    <div className="flex gap-6">
      <Card className="flex-[2]">
        <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-gray-500">
          Alignment Details
        </h3>

        <div className="mb-4">
          <div className="flex items-center justify-between">
            <label className="font-display text-xs font-semibold uppercase tracking-wide text-gray-500">
              Alignment Name <span className="text-red-500">*</span>
            </label>
            <span className="text-xs text-gray-400">{name.length} / 30</span>
          </div>
          <input
            type="text"
            required
            maxLength={30}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter alignment name"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label className="font-display text-xs font-semibold uppercase tracking-wide text-gray-500">
            Notes
          </label>
          <textarea
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes about this alignment run"
          />
        </div>
      </Card>

      <Card className="flex-[3]">
        <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-gray-500">
          About
        </h3>

        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <h4 className="mb-1 font-display text-xs font-semibold uppercase tracking-wide text-gray-500">
              What is Alignment?
            </h4>
            <p>
              Alignment maps paired-end CUT&RUN or CUT&Tag sequencing files to a reference genome,
              revealing where sequences are enriched across the genome.
            </p>
          </div>

          <div>
            <h4 className="mb-1 font-display text-xs font-semibold uppercase tracking-wide text-gray-500">
              What does the pipeline do?
            </h4>
            <p>
              The CUT&RUN/Tag Alignment Pipeline automates the mapping of raw sequences to a
              reference genome and removes reads that align to more than one location
              (multi-aligned reads), those from known false positive regions (ENCODE DAC Exclusion
              List), and duplicate reads by default. A detailed QC Report is generated, including
              key quality metrics such as SNAP-CUTANA Spike-in nucleosome analysis, E. coli
              spike-in read depth, and mitochondrial read percentages.
            </p>
          </div>

          <div>
            <h4 className="mb-1 font-display text-xs font-semibold uppercase tracking-wide text-gray-500">
              Outputs
            </h4>
            <p>
              Interactive QC report (sequencing stats, spike-in analysis, heatmaps), unique BAMs,
              bigWigs (smoothed for IGV and unsmoothed for heatmaps), raw/filtered BAMs, and
              supporting logs.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
