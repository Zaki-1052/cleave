// frontend/src/components/rnaseq-de/Deseq2DetailsStep.tsx
import { Card } from '@/components/layout/Card';
import { Field } from '@/components/ui/Field';

interface Deseq2DetailsStepProps {
  name: string;
  setName: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
}

export function Deseq2DetailsStep({
  name,
  setName,
  notes,
  setNotes,
}: Deseq2DetailsStepProps) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <Card className="flex-[2]">
        <h3 className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          DE Analysis Details
        </h3>

        <div className="mb-4">
          <div className="flex items-center justify-between">
            <label htmlFor="de-name" className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Analysis Name <span className="text-destructive">*</span>
            </label>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{name.length} / 30</span>
          </div>
          <input
            id="de-name"
            type="text"
            required
            maxLength={30}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter DE analysis name"
            className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
          />
        </div>

        <Field label="Notes" htmlFor="de-notes">
          <textarea
            id="de-notes"
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes about this DE analysis"
          />
        </Field>
      </Card>

      <Card className="flex-[3]">
        <h3 className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          About
        </h3>

        <div className="space-y-4 text-sm text-foreground">
          <div>
            <h4 className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              What is DESeq2?
            </h4>
            <p>
              DESeq2 is a Bioconductor R package for differential gene expression analysis of RNA-seq
              count data. It models count data using a negative binomial distribution, estimates
              dispersion, and identifies genes with statistically significant expression changes
              between experimental conditions.
            </p>
          </div>

          <div>
            <h4 className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              What does the pipeline do?
            </h4>
            <p>
              The pipeline imports quantification data from Salmon (via tximport) or featureCounts,
              builds a DESeq2 dataset with your condition assignments, runs differential expression
              analysis, and generates publication-ready plots including volcano, MA, PCA, sample
              distance heatmap, and top genes heatmap.
            </p>
          </div>

          <div>
            <h4 className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Outputs
            </h4>
            <p>
              Full DE results table (gene names, fold changes, p-values, FDR), DESeq2-normalized
              count matrix, volcano plot, MA plot, PCA plot, sample distance heatmap, top 50 DE genes
              heatmap, and a summary of up/downregulated genes.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
