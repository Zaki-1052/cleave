// frontend/src/components/peak-calling/PeakCallingDetailsStep.tsx
import { Card } from '@/components/layout/Card';

interface PeakCallingDetailsStepProps {
  name: string;
  setName: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
}

export function PeakCallingDetailsStep({
  name,
  setName,
  notes,
  setNotes,
}: PeakCallingDetailsStepProps) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <Card className="flex-[2]">
        <h3 className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Peak Calling Details
        </h3>

        <div className="mb-4">
          <div className="flex items-center justify-between">
            <label className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Peak Calling Name <span className="text-destructive">*</span>
            </label>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{name.length} / 30</span>
          </div>
          <input
            type="text"
            required
            maxLength={30}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter peak calling name"
            className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
          />
        </div>

        <div>
          <label className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Notes
          </label>
          <textarea
            className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes about this peak calling run"
          />
        </div>
      </Card>

      <Card className="flex-[3]">
        <h3 className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          About
        </h3>

        <div className="space-y-4 text-sm text-foreground">
          <div>
            <h4 className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              What is Peak Calling?
            </h4>
            <p>
              Peak calling pinpoints genomic regions where aligned reads are significantly enriched
              over background, defining protein or histone mark-containing domains.
            </p>
          </div>

          <div>
            <h4 className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              What does the pipeline do?
            </h4>
            <p>
              The CUT&RUN/Tag Peak Calling Pipeline calls peaks with MACS2 or SEACR and
              annotates the nearest genomic feature with HOMER. It is recommended that users
              designate an IgG control to subtract background signal. All metrics, including number
              of peaks, FRiP scores, and reads in peaks are compiled into a comprehensive QC Report.
            </p>
          </div>

          <div>
            <h4 className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Outputs
            </h4>
            <p>
              QC report (peak stats, FRiP, annotation plots), BED files, FRiP tables, HOMER
              annotation files &amp; stats, and supporting logs ready for review in IGV and
              downstream tertiary analysis.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
