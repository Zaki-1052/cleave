# Prompt for Opus: Build the Sanitization Transform Script

Paste this entire prompt into a fresh Opus (Claude Opus) session. Make sure the working directory is the `frontend/` folder of the crud-app project.

---

## Context

I have a React/TypeScript frontend (~35k lines, 211 files) for a bioinformatics pipeline runner app called "Cleave." The app lets users create projects and experiments, upload data files, configure and launch analysis jobs (alignment, peak calling, differential expression, etc.), and view results with plots and QC reports.

I need you to write a Node.js script (`scripts/sanitize.mjs`) that creates a complete copy of `src/` into a sibling directory `src-sanitized/`, with ALL biology-specific terminology replaced by generic CRUD/data-processing equivalents. The goal is to produce a fully working frontend that is indistinguishable in structure, styling, and component hierarchy from the original — but reads as a generic "data processing pipeline" app with no biology content.

**Why:** I need to use a different AI model on the UI that has an overzealous safety filter triggered by biology terms. The sanitized copy lets that model redesign the UI, and then I back-port the design changes to the real app.

## What the script must do

1. **Copy `src/` to `src-sanitized/`** (delete `src-sanitized/` first if it exists)
2. **Rename directories** according to the directory mapping table below
3. **Rename files** according to the file mapping table below
4. **Find-and-replace all domain terms** in file contents according to the content mapping table below
5. **Update all import paths** to match the new file/directory names
6. **Verify the result compiles** — print a reminder at the end to run `npx tsc --noEmit` with the `src-sanitized` paths

The script must be idempotent (safe to re-run). Use `node:fs` and `node:path` only — no external dependencies.

## Mapping Strategy

The app has two "assay type" branches: `CUT&RUN`/`CUT&Tag` and `RNA-seq`. In the sanitized version, these become two generic workflow categories. The domain model maps like this:

### Conceptual mapping (this is the mental model — the tables below are the actual replacements)

| Biology concept | Generic equivalent |
|---|---|
| Cleave (app name) | Forge |
| Experiment | Workflow |
| Reaction | Sample / Record |
| Assay Type | Workflow Category |
| CUT&RUN, CUT&Tag | Category A, Category B |
| RNA-seq | Category C |
| FASTQ files | Data Files |
| Trimming / fastp | Preprocessing |
| Alignment / STAR / Bowtie2 / HISAT2 | Processing Step A / Mapper |
| Peak Calling / MACS2 / SEACR | Detection / Detector |
| DiffBind | Comparative Analysis |
| DESeq2 / DE Analysis | Differential Analysis |
| featureCounts | Aggregation |
| Normalization / Roman | Scaling |
| Custom Heatmap / deepTools | Visualization |
| Pearson Correlation | Correlation |
| Pathway Analysis / KEGG / GO | Enrichment Analysis |
| RSeQC / QC Dashboard / MultiQC | Quality Check |
| IGV | Data Viewer |
| BigWig | Signal File |
| BAM / SAM | Processed File |
| BED | Region File |
| Genome / Reference Genome | Reference Dataset |
| Organism (Human/Mouse/etc.) | Source (Source A / Source B / etc.) |
| Gene / Transcript | Feature / Item |
| Antibody | Marker |
| Spike-in / CutanaSpikeIn / E. coli | Control / Standard |
| FRIP | Score Metric |
| Salmon | Quantifier |
| Splice / Junction | Junction |
| PTM / Histone | Tag / Label |

### Directory rename mapping

```
rnaseq-alignment     → category-c-processing
rnaseq-de            → differential-analysis
rnaseq-feature-counts → aggregation
rnaseq-pathway       → enrichment-analysis
rnaseq-qc            → quality-check
alignment            → processing
peak-calling         → detection
diffbind             → comparative-analysis
custom-heatmap       → visualization
pearson-correlation  → correlation
normalization        → scaling
trimming             → preprocessing
fastqs               → data-files
reactions            → records
igv                  → data-viewer
```

### File rename mapping (apply AFTER directory renames)

These are the most important renames. Apply them as substring replacements on filenames:

```
# RNA-seq pipeline files
RnaseqAlignment      → CategoryCProcessing
NewRnaseqAlignmentWizard → NewCategoryCProcessingWizard
RnaseqAlignmentTab   → CategoryCProcessingTab
RnaseqAlignmentSettingsStep → CategoryCProcessingSettingsStep
RnaseqAlignmentDetailsStep → CategoryCProcessingDetailsStep
RnaseqAlignmentInputPanel → CategoryCProcessingInputPanel
RnaseqAlignmentQCReportPanel → CategoryCProcessingReportPanel

FeatureCounts        → Aggregation
NewFeatureCountsWizard → NewAggregationWizard
FeatureCountsTab     → AggregationTab
FeatureCountsSettingsStep → AggregationSettingsStep

Deseq2               → DiffAnalysis
NewDeseq2Wizard      → NewDiffAnalysisWizard
Deseq2DetailsStep    → DiffAnalysisDetailsStep
Deseq2SettingsStep   → DiffAnalysisSettingsStep
DEAnalysis           → DiffAnalysis
DEFilesPanel         → DiffAnalysisFilesPanel
DEInfoPanel          → DiffAnalysisInfoPanel
DEInputPanel         → DiffAnalysisInputPanel
DEPlotsPanel         → DiffAnalysisPlotsPanel
DEResultsPanel       → DiffAnalysisResultsPanel

NewRnaseqQCWizard    → NewQualityCheckWizard
RnaseqQC             → QualityCheck
QCFilesPanel         → QualityCheckFilesPanel
QCOverviewPanel      → QualityCheckOverviewPanel
QCPerSamplePanel     → QualityCheckPerSamplePanel

NewPathwayWizard     → NewEnrichmentWizard
PathwayKEGGPanel     → EnrichmentCategoryPanel
PathwayGOPanel       → EnrichmentGroupPanel
PathwayFilesPanel    → EnrichmentFilesPanel

# CUT&RUN pipeline files
NewAlignmentWizard   → NewProcessingWizard
AlignmentDetailsStep → ProcessingDetailsStep
AlignmentSettingsStep → ProcessingSettingsStep
AlignmentFilesPanel  → ProcessingFilesPanel
AlignmentInfoPanel   → ProcessingInfoPanel
AlignmentInputPanel  → ProcessingInputPanel
AlignmentQCReportPanel → ProcessingReportPanel
ChooseReactionsStep  → ChooseRecordsStep

NewPeakCallingWizard → NewDetectionWizard
PeakCallingDetailsStep → DetectionDetailsStep
PeakCallingSettingsStep → DetectionSettingsStep
PeakCallingFilesPanel → DetectionFilesPanel
PeakCallingInfoPanel → DetectionInfoPanel
PeakCallingInputPanel → DetectionInputPanel
PeakCallingQCReportPanel → DetectionReportPanel
PeakAnnotationChart  → DetectionAnnotationChart
ChooseAlignmentStep  → ChooseProcessingStep

NewDiffBindWizard    → NewComparativeWizard
DiffBindDetailsStep  → ComparativeDetailsStep
DiffBindSettingsStep → ComparativeSettingsStep
DiffBindFilesPanel   → ComparativeFilesPanel
DiffBindInfoPanel    → ComparativeInfoPanel
DiffBindInputPanel   → ComparativeInputPanel
DiffBindPlotsPanel   → ComparativePlotsPanel
DiffBindResultsPanel → ComparativeResultsPanel
ChoosePeakCallingStep → ChooseDetectionStep
AssignConditionsStep → AssignGroupsStep

NewCustomHeatmapWizard → NewVisualizationWizard
CustomHeatmapFilesPanel → VisualizationFilesPanel
CustomHeatmapPlotsPanel → VisualizationPlotsPanel
SelectSamplesStep    → SelectRecordsStep

NewPearsonCorrelationWizard → NewCorrelationWizard
PearsonCorrelationFilesPanel → CorrelationFilesPanel
PearsonCorrelationPlotsPanel → CorrelationPlotsPanel
PearsonSelectSamplesStep → CorrelationSelectRecordsStep
PearsonSettingsStep  → CorrelationSettingsStep

NewNormalizationWizard → NewScalingWizard
NormalizationSettingsStep → ScalingSettingsStep
NormalizationSelectSamplesStep → ScalingSelectRecordsStep
NormalizationFilesPanel → ScalingFilesPanel
NormalizationResultsPanel → ScalingResultsPanel

# Data files
FastpConfigModal     → PreprocessConfigModal
FastpReportModal     → PreprocessReportModal
FastpReportsPanel    → PreprocessReportsPanel
FastqcReportModal    → DataQualityReportModal
TrimConfigModal      → PreprocessSettingsModal
FileUploadZone       → FileUploadZone (no change)
ServerImportModal    → ServerImportModal (no change)
LocalImportModal     → LocalImportModal (no change)
CsvUploadZone        → CsvUploadZone (no change)

# Reactions
ReactionsEditor      → RecordsEditor
ReactionFormModal    → RecordFormModal
AutoFillReactionsModal → AutoFillRecordsModal

# IGV
IGVPanel             → DataViewerPanel
SelectReactionsModal → SelectRecordsModal

# Layout
CleaveIcon           → ForgeIcon

# Tabs (pages/experiment/)
FastqsTab            → DataFilesTab
ReactionsTab         → RecordsTab
AlignmentTab         → ProcessingTab
PeakCallingTab       → DetectionTab
DiffBindTab          → ComparativeTab
CustomHeatmapTab     → VisualizationTab
PearsonCorrelationTab → CorrelationTab
NormalizationTab     → ScalingTab
TrimmingTab          → PreprocessingTab
DEAnalysisTab        → DiffAnalysisTab
RnaseqQCTab          → QualityCheckTab
PathwayAnalysisTab   → EnrichmentTab
FeatureCountsTab     → AggregationTab
```

### Content replacement mapping (apply to ALL `.ts` and `.tsx` files)

Apply these replacements IN ORDER (longest match first to avoid partial replacements). This is the critical part — every string, comment, variable name, type name, and user-visible label must be sanitized.

```javascript
// === PHASE 1: Multi-word / compound terms (longest first) ===

// App name
'cleave-frontend'        → 'forge-frontend'
'Cleave'                 → 'Forge'
'cleave'                 → 'forge'

// Assay types (user-visible strings)
'CUT&RUN'                → 'Category A'
'CUT&Tag'                → 'Category B'
'RNA-seq'                → 'Category C'
'CUT\\u0026RUN'          → 'Category A'    // URL-encoded ampersand in some contexts

// RNA-seq pipeline compound terms
'rnaseq_trimming'        → 'cat_c_preprocess'
'rnaseq_alignment'       → 'cat_c_processing'
'rnaseq_feature_counts'  → 'aggregation'
'rnaseq_de'              → 'diff_analysis'
'rnaseq_qc'              → 'quality_check'
'rnaseq_pathway'         → 'enrichment'
'RnaseqAlignment'        → 'CategoryCProcessing'
'RnaseqDE'               → 'DiffAnalysis'
'rnaseqDE'               → 'diffAnalysis'
'Rnaseq'                 → 'CategoryC'
'rnaseq'                 → 'categoryC'
'RNA'                    → 'Cat C'         // CAREFUL: only in biology contexts, see note below

// Tool names
'DESeq2'                 → 'DiffEngine'
'Deseq2'                 → 'DiffAnalysis'
'deseq2'                 → 'diffAnalysis'
'MACS2'                  → 'Detector1'
'SEACR'                  → 'Detector2'
'SICER2'                 → 'Detector3'
'Bowtie2'                → 'Mapper1'
'STAR'                   → 'Mapper2'       // CAREFUL: only when referring to the aligner
'HISAT2'                 → 'Mapper3'
'Salmon'                 → 'Quantifier'
'salmon'                 → 'quantifier'
'deepTools'              → 'PlotEngine'
'HOMER'                  → 'Annotator'
'Picard'                 → 'Deduplicator'
'samtools'               → 'filetools'
'tximport'               → 'importutil'
'featureCounts'          → 'Aggregator'
'featurecount'           → 'aggregation'
'RSeQC'                  → 'QualityEngine'
'rseqc'                  → 'qualityEngine'
'MultiQC'                → 'QualitySummary'
'multiqc'                → 'qualitySummary'
'fastp'                  → 'preprocessor'
'Fastp'                  → 'Preprocessor'
'DiffBind'               → 'ComparativeEngine'
'diffbind'               → 'comparativeEngine'
'Diffbind'               → 'ComparativeEngine'

// Genomics file formats
'bigWig'                 → 'signal file'
'BigWig'                 → 'Signal File'
'bigwig'                 → 'signal_file'
'FASTQ'                  → 'Data File'
'FASTQs'                 → 'Data Files'
'fastq'                  → 'datafile'
'Fastq'                  → 'Datafile'
'FASTQC'                 → 'DataQuality'
'FastQC'                 → 'DataQuality'
'fastqc'                 → 'dataQuality'
'Fastqc'                 → 'DataQuality'
'.bam'                   → '.processed'
'.BAM'                   → '.PROCESSED'
'BAM'                    → 'Processed File'
'BAI'                    → 'Index File'
'.bai'                   → '.index'
'BED'                    → 'Region'
'.bed'                   → '.region'
'SAM'                    → 'Raw Processed'
'.sam'                   → '.rawprocessed'
'.gz'                    → '.gz'           // keep as-is

// Biology terms - compound first
'spike-in'               → 'control'
'spike_in'               → 'control'
'SpikeIn'                → 'Control'
'spikeIn'                → 'control'
'Spike-In'               → 'Control'
'Spike In'               → 'Control'

// CutanaSpikeIn fields (very specific — match before generic 'cutana')
'cutanaSpikeInTarget2'   → 'controlStandardTarget2'
'cutanaSpikeInTarget'    → 'controlStandardTarget'
'cutanaSpikeIn2'         → 'controlStandard2'
'cutanaSpikeIn'          → 'controlStandard'
'CutanaSpikeIn'          → 'ControlStandard'
'CUTANA'                 → 'CONTROL_STANDARD'
'Cutana'                 → 'ControlStandard'
'KMetStat'               → 'StandardPanel'

// Histone marks (replace all H3K*/H4K* patterns)
// These appear in CUTANA_SPIKE_IN_TARGETS array
'H3K4me1'                → 'Tag-A1'
'H3K4me2'                → 'Tag-A2'
'H3K4me3'                → 'Tag-A3'
'H3K9me1'                → 'Tag-B1'
'H3K9me2'                → 'Tag-B2'
'H3K9me3'                → 'Tag-B3'
'H3K27me1'               → 'Tag-C1'
'H3K27me2'               → 'Tag-C2'
'H3K27me3'               → 'Tag-C3'
'H3K36me1'               → 'Tag-D1'
'H3K36me2'               → 'Tag-D2'
'H3K36me3'               → 'Tag-D3'
'H4K20me1'               → 'Tag-E1'
'H4K20me2'               → 'Tag-E2'
'H4K20me3'               → 'Tag-E3'

// Organisms → Sources
'Human'                  → 'Source A'
'Mouse'                  → 'Source B'
'Drosophila'             → 'Source C'
'Yeast'                  → 'Source D'

// Reference genomes → Reference datasets
'GRCh38/hg38'            → 'RefSet-A1'
'hg38'                   → 'ref_a1'
'hg19'                   → 'ref_a2'
'mm10'                   → 'ref_b1'
'dm6'                    → 'ref_c1'
'sacCer3'                → 'ref_d1'

// E. coli
'ecoliSpikeIn'           → 'externalControl'
'ecoliAlignmentRate'     → 'externalControlRate'
'ecoliReadPairs'         → 'externalControlPairs'
'ecoliNormalizationFactor' → 'externalControlFactor'
'E. coli'                → 'External Control'
'ecoli'                  → 'externalControl'
'Ecoli'                  → 'ExternalControl'

// === PHASE 2: Single-word / shorter terms ===

// Core domain model
'Experiment'             → 'Workflow'
'experiment'             → 'workflow'
'Reaction'               → 'Record'
'reaction'               → 'record'
'assayType'              → 'workflowCategory'
'AssayType'              → 'WorkflowCategory'
'assay type'             → 'workflow category'
'Assay Type'             → 'Workflow Category'
'Assay'                  → 'Category'
'assay'                  → 'category'

// Analysis types
'alignment'              → 'processing'
'Alignment'              → 'Processing'
'peak_calling'           → 'detection'
'Peak Calling'           → 'Detection'
'PeakCalling'            → 'Detection'
'peakCalling'            → 'detection'
'peak calling'           → 'detection'
'DiffBind'               → 'Comparative'     // if not already caught above
'roman_normalization'    → 'scaling'
'Normalization'          → 'Scaling'
'normalization'          → 'scaling'
'custom_heatmap'         → 'visualization'
'Custom Heatmap'         → 'Visualization'
'CustomHeatmap'          → 'Visualization'
'customHeatmap'          → 'visualization'
'pearson_correlation'    → 'correlation'
'Pearson Correlation'    → 'Correlation'
'PearsonCorrelation'     → 'Correlation'
'pearsonCorrelation'     → 'correlation'
'Pearson'                → 'Correlation'
'pearson'                → 'correlation'
'trimming'               → 'preprocessing'
'Trimming'               → 'Preprocessing'

// Genomics terms
'genome'                 → 'reference'
'Genome'                 → 'Reference'
'genomic'                → 'reference'
'Genomic'                → 'Reference'
'organism'               → 'source'
'Organism'               → 'Source'
'gene'                   → 'feature'         // CAREFUL: context-sensitive
'Gene'                   → 'Feature'
'genes'                  → 'features'
'Genes'                  → 'Features'
'transcript'             → 'item'
'Transcript'             → 'Item'
'antibody'               → 'marker'
'Antibody'               → 'Marker'
'genotype'               → 'variant'
'Genotype'               → 'Variant'
'replicate'              → 'repeat'
'Replicate'              → 'Repeat'

// Sequencing-specific
'sequencing read'        → 'data record'
'read pair'              → 'record pair'
'Read Pair'              → 'Record Pair'
'readPairs'              → 'recordPairs'
'ReadPairs'              → 'RecordPairs'
'totalReads'             → 'totalRecords'
'uniquelyAligned'        → 'uniquelyMatched'
'uniquelyMapped'         → 'uniquelyMatched'
'uniqueAlignment'        → 'uniqueMatch'
'duplicationRate'        → 'duplicateRate'
'chrmBandwidth'          → 'regionBandwidth'
'mapped'                 → 'matched'
'Mapped'                 → 'Matched'
'unmapped'               → 'unmatched'
'Unmapped'               → 'Unmatched'
'mapping'                → 'matching'
'Mapping'                → 'Matching'

// DE/stats terms
'differentially expressed' → 'significantly different'
'Differentially Expressed' → 'Significantly Different'
'fold change'            → 'ratio change'
'Fold Change'            → 'Ratio Change'
'log2FC'                 → 'log2Ratio'
'log2 fold change'       → 'log2 ratio change'
'upregulated'            → 'increased'
'Upregulated'            → 'Increased'
'downregulated'          → 'decreased'
'Downregulated'          → 'Decreased'
'p-value'                → 'significance'
'FDR'                    → 'Adj. Significance'
'fdr'                    → 'adjSignificance'
'adjusted p-value'       → 'adjusted significance'

// Pathway/GO/KEGG
'pathway'                → 'enrichment'
'Pathway'                → 'Enrichment'
'KEGG'                   → 'CategoryEnrich'
'kegg'                   → 'categoryEnrich'
'Gene Ontology'          → 'Group Ontology'
'GO '                    → 'Group '          // note trailing space to avoid false positives
'goBp'                   → 'groupBp'
'goMf'                   → 'groupMf'
'goCc'                   → 'groupCc'
'Biological Process'     → 'Process Class'
'Molecular Function'     → 'Function Class'
'Cellular Component'     → 'Component Class'
'GSEA'                   → 'SetEnrich'
'gsea'                   → 'setEnrich'
'Entrez'                 → 'Identifier'
'entrez'                 → 'identifier'

// QC-specific
'FRIP'                   → 'ScoreMetric'
'FRiP'                   → 'ScoreMetric'
'frip'                   → 'scoreMetric'
'strandedness'           → 'directionality'
'Strandedness'           → 'Directionality'
'splice'                 → 'junction'
'Splice'                 → 'Junction'
'TSS'                    → 'Start Point'
'TES'                    → 'End Point'
'promoter'               → 'start region'
'exon'                   → 'segment'
'intron'                 → 'gap'
'intergenic'             → 'outer region'
'CDS'                    → 'core segment'
'UTR'                    → 'terminal'
'coverage'               → 'signal depth'
'Coverage'               → 'Signal Depth'
'enrichment'             → 'enrichment'       // keep as-is (already generic)

// Peak calling specific
'peak'                   → 'region hit'       // CAREFUL: context-sensitive
'Peak'                   → 'Region Hit'
'peaks'                  → 'region hits'
'Peaks'                  → 'Region Hits'
'narrow'                 → 'precise'
'Narrow'                 → 'Precise'
'broad'                  → 'wide'
'Broad'                  → 'Wide'
'stringent'              → 'strict'
'Stringent'              → 'Strict'
'relaxed'                → 'lenient'
'Relaxed'                → 'Lenient'
'q_value'                → 'threshold'
'q-value'                → 'threshold'
'blacklist'              → 'exclusion list'
'Blacklist'              → 'Exclusion List'
'ENCODE DAC'             → 'Standard'
'Lab Custom'             → 'Custom'

// PTM
'PTM'                    → 'Tag'
'ptm'                    → 'tag'
'ptmName'                → 'tagName'
'ptmResults'             → 'tagResults'
'pctRecovery'            → 'pctRecovery'      // keep (generic enough)
'barcode'                → 'identifier'
'Barcode'                → 'Identifier'

// Misc
'samplePrep'             → 'prepMethod'
'cellType'               → 'sourceType'
'cellNumber'             → 'sourceCount'
'antibodyVendor'         → 'markerVendor'
'antibodyCatNo'          → 'markerCatalogNo'
'antibodyLotNo'          → 'markerLotNo'
'treatment'              → 'condition'
'Treatment'              → 'Condition'
'timepoint'              → 'timepoint'         // keep (generic enough)
'IGV'                    → 'DataViewer'
'igv'                    → 'dataViewer'

// Route paths (in App.tsx and elsewhere)
'fastqs'                 → 'data-files'
'reactions'              → 'records'
'peaks'                  → 'detection'
'diffbind'               → 'comparative'
'heatmaps'               → 'visualizations'
'correlations'           → 'correlations'      // keep
'normalization'          → 'scaling'
'feature-counts'         → 'aggregation'
'de/'                    → 'diff-analysis/'
'rnaseq-qc'              → 'quality-check'
'pathway'                → 'enrichment'

// Library type (Salmon-specific)
'ISR'                    → 'TypeA'             // only in SALMON_LIB_TYPE context
'ISF'                    → 'TypeB'
'IU'                     → 'TypeC'
```

## Important implementation notes

1. **Order matters.** Process replacements longest-first within each phase. The mapping above is already roughly ordered, but your script should sort by length (descending) to prevent partial matches. For example, `'rnaseq_feature_counts'` must be replaced before `'rnaseq'`.

2. **Context-sensitive replacements.** Some terms like `STAR`, `Gene`, `peak`, `mapped`, `RNA`, `GO ` are common English words. Handle these carefully:
   - `STAR` — only replace when it's the aligner name (e.g., "STAR alignment", "STAR Logs", variable names like `star_log`). Don't replace the word "star" in other contexts. Best approach: target the specific compound strings (`'STAR '` with trailing space, `'star_log'`, `'STAR)` etc.) rather than bare `STAR`.
   - `Gene` / `gene` — replace in compound identifiers (`totalGenes`, `significantGenes`, `Gene Body`, `gene_heatmap`) but leave `general`, `generate`, `generic` alone. Use word-boundary-aware matching.
   - `peak` — same, target compound forms (`calledPeaks`, `Peak Calling`, `peak_calling`, `readsInPeaks`).
   - `RNA` — only in `RNA-seq` context (already covered by compound replacement above). Don't break random occurrences.
   - `GO ` — the trailing space avoids matching `GO` inside words, but watch for `GO\n` or `GO,` patterns too.
   - `BAM` — appears in many compounds (`AlignmentReactionMetrics` has no literal BAM); target it in file format contexts.

3. **Import path updates.** After renaming files and directories, all import statements like `import { X } from '@/components/alignment/NewAlignmentWizard'` must update to `import { X } from '@/components/processing/NewProcessingWizard'`. The safest approach: do a second pass over all files after renaming, matching the OLD import paths and replacing with NEW ones.

4. **docs-content.ts** (2,656 lines) — this file contains extensive documentation text with heavy biology terminology. Apply the same replacements. The descriptions won't be perfectly coherent as generic text, but that's fine — coherence isn't needed, just absence of biology terms.

5. **The CSS / Tailwind config / index.css** — these contain NO biology terms and should be copied verbatim. The design system is already domain-agnostic. Only change `Cleave` → `Forge` if it appears in comments.

6. **package.json** — copy and change the `name` field from `cleave-frontend` to `forge-frontend`.

7. **Don't touch** `node_modules/`, `dist/`, or anything outside `src/` (except package.json).

## Script structure suggestion

```javascript
// scripts/sanitize.mjs
import { cpSync, rmSync, readdirSync, renameSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';

const SRC = 'src';
const OUT = 'src-sanitized';

// 1. Fresh copy
rmSync(OUT, { recursive: true, force: true });
cpSync(SRC, OUT, { recursive: true });

// 2. Directory renames (deepest first to avoid path conflicts)
const DIR_MAP = { /* ... */ };

// 3. File renames
const FILE_MAP = { /* ... */ };

// 4. Content replacements (longest-first sorted)
const REPLACEMENTS = [ /* [pattern, replacement] pairs, sorted by pattern length desc */ ];

// 5. Walk all .ts/.tsx files, apply replacements
// 6. Also handle package.json

// Helper: walk directory tree
function walk(dir) { /* ... */ }

// Helper: apply replacements to file content
function sanitize(content) { /* ... */ }
```

## Verification checklist

After the script runs, these should all be true:
- [ ] No file or directory under `src-sanitized/` contains any of: `fastq`, `rnaseq`, `genome`, `gene` (as a standalone word), `RNA`, `alignment` (as a domain concept), `peak`, `DiffBind`, `DESeq`, `MACS`, `SEACR`, `organism`, `antibody`, `spike`, `cutana`, `ecoli`, `KEGG`, `pathway`, `IGV`, `bigwig`, `BAM`, `HOMER`, `Picard`, `Salmon`, `STAR` (as aligner), `histone`, `PTM`, `CUT&RUN`, `CUT&Tag`, `Cleave`
- [ ] All imports resolve (no broken `@/components/...` paths)
- [ ] `npx tsc --noEmit` passes (or has only pre-existing type errors unrelated to renaming)
- [ ] The Tailwind config, CSS custom properties, and all component styling are identical to the original
- [ ] Route structure in App.tsx uses the new generic paths

## What NOT to change

- Component hierarchy and nesting
- Styling classes (Tailwind utilities, CSS custom properties, color tokens)
- State management patterns
- API call structure (just rename the endpoints/types)
- Any third-party library imports (react, radix, tanstack, lucide, recharts, etc.)
- The auth system (login, register, password reset)
- The project/member/notification system (these are already generic)

Write the complete `scripts/sanitize.mjs` script. Make it robust, well-commented, and idempotent.





----


Done. Wrote the self-contained prompt to **`opus-port-design-prompt.md`** in the Cleave repo root (next to `opus-sanitize-prompt.md`). Paste it into a fresh Opus session once you've copied `crud-app/` in next to `frontend/`.

**The strategic core of the prompt** — the thing that makes this tractable rather than a guessing game:

- **Diff crud-app against *itself*, not against Cleave.** The sanitization was complete before Fable started, so the vocabulary is constant across the design commits. `git -C crud-app diff f42f905f..d9af08d1` cancels out 100% of the bio→generic noise and surfaces *pure design changes*. I confirmed the commit graph: `f42f905f` = sanitized-but-undesigned baseline (≈ Cleave today, different words), `d9af08d1` = design-complete, `b3a06eeb` = a dev-only MSW mock layer to exclude. That diff-within-history technique is what lets Opus (and its fan-out agents) mechanically separate DESIGN from CONTENT.

**What I baked in from exploring both trees and Fable's `DESIGN.md`/`PLAN.md`:**

1. **Three-bucket model** — DESIGN (port), CONTENT (Cleave always wins on any disagreement: routes, copyright, labels, bugs, broken paths), EXCLUDE (mock layer, Forge branding, redrawn `ForgeIcon`, invented copy).
2. **Authoritative reverse maps** — the actual crud-app↔Cleave directory and tab names (verified against the filesystem; several diverge from the sanitize table, e.g. `detection-calling`→`peak-calling`, `CategoryCQCTab`→`RnaseqQCTab`, `datasets`→`fastqs`).
3. **High-risk reconciliation files called out individually** — `App.tsx` (keep Cleave's bio routes, port only Breadcrumbs→PageHeader + ErrorBoundary), `constants.ts` (surgical STATUS_COLORS-only merge), `main.tsx` (theme only, drop mock bootstrap), Navbar/NotificationPanel/LandingPage/docs/CleaveIcon (keep Cleave brand+content).
4. **Execution plan honoring your Workflow preference** — lead does the shared foundation + one exemplar sequentially (too risky/coupled to fan out), then a 12-packet Workflow fan-out mapped to Cleave dirs (mirroring how Fable built it), with an explicit spec for what every agent prompt must contain so they stay anchored to `DESIGN.md` + the diff technique + Cleave's architecture.
5. **Your guardrails** — frontend-only, hand-you-commands, own the whole suite, don't block on browser checks (you verify UI yourself), Playwright-not-chrome implied by "no browser blocking."

One thing to double-check when you copy it in: that `crud-app/.git` survives the copy — the whole method depends on Opus reaching that history via `git -C crud-app`. The prompt tells Opus to verify this in Phase 0 and ask you to re-copy if it's missing.