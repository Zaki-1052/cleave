// frontend/src/components/rnaseq-de/Deseq2DetailsStep.tsx
import { Card } from '@/components/layout/Card';

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
    <div className="flex gap-6">
      <Card className="flex-[2]">
        <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          DE Analysis Details
        </h3>

        <div className="mb-4">
          <div className="flex items-center justify-between">
            <label className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Analysis Name <span className="text-red-500">*</span>
            </label>
            <span className="text-xs text-muted-foreground">{name.length} / 30</span>
          </div>
          <input
            type="text"
            required
            maxLength={30}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter DE analysis name"
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
            placeholder="Optional notes about this DE analysis"
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
            <h4 className="mb-1 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
            <h4 className="mb-1 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
