// frontend/src/components/rnaseq-alignment/RnaseqAlignmentDetailsStep.tsx
import { Card } from '@/components/layout/Card';

interface RnaseqAlignmentDetailsStepProps {
  name: string;
  setName: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
}

export function RnaseqAlignmentDetailsStep({
  name,
  setName,
  notes,
  setNotes,
}: RnaseqAlignmentDetailsStepProps) {
  return (
    <div className="flex gap-6">
      <Card className="flex-[2]">
        <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Alignment Details
        </h3>

        <div className="mb-4">
          <div className="flex items-center justify-between">
            <label className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Alignment Name <span className="text-red-500">*</span>
            </label>
            <span className="text-xs text-muted-foreground">{name.length} / 30</span>
          </div>
          <input
            type="text"
            required
            maxLength={30}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter alignment name"
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notes
          </label>
          <textarea
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes about this alignment run"
          />
        </div>
      </Card>

      <Card className="flex-[3]">
        <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          About
        </h3>

        <div className="space-y-4 text-sm text-foreground">
          <div>
            <h4 className="mb-1 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              What is RNA-seq Alignment?
            </h4>
            <p>
              RNA-seq alignment maps paired-end transcriptomic reads to a reference genome using
              STAR, a splice-aware aligner that handles intron-spanning reads. Salmon simultaneously
              quantifies transcript-level expression via pseudo-alignment.
            </p>
          </div>

          <div>
            <h4 className="mb-1 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              What does the pipeline do?
            </h4>
            <p>
              The RNA-seq Alignment Pipeline runs STAR splice-aware alignment to produce
              coordinate-sorted BAMs and transcriptomic BAMs, followed by Salmon quantification
              for transcript-level TPM and estimated counts. RPKM-normalized bigWig signal tracks
              are generated via deepTools bamCoverage for genome browser visualization. A QC report
              is produced with STAR mapping statistics and Salmon quantification metrics.
            </p>
          </div>

          <div>
            <h4 className="mb-1 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Outputs
            </h4>
            <p>
              Sorted BAMs, transcriptome BAMs, bigWig signal tracks (smoothed for IGV and unsmoothed
              for downstream analysis), Salmon quant.sf quantification files, STAR alignment logs,
              and a combined QC report with STAR and Salmon metrics.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
