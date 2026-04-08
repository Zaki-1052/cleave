# Cleave — RNA-seq Pipeline Implementation Plan

> RNA-seq as a first-class experiment type in Cleave. Three phases: infrastructure + fastp trimming, core pipeline (STAR + Salmon + BigWigs + QC), and downstream analysis (DESeq2 + pathway analysis + full QC + visualization). Follows the same architecture patterns as the existing CUT&RUN/CUT&Tag pipeline.

---

## Context

The Ferguson Lab PI wants RNA-seq analysis added to Cleave. The lab currently runs STAR alignment + Salmon quantification manually on EC2 (reference scripts in `references/archival/rnaseq/`). This plan adds RNA-seq as a new experiment type with a full pipeline: fastp trimming -> STAR alignment -> Salmon quantification -> BigWig generation -> DESeq2 differential expression -> clusterProfiler pathway analysis -- plus comprehensive QC (RSeQC, MultiQC) and visualization (volcano, MA, PCA, heatmaps, interactive gene tables).

### Reference Script Analysis

The lab's RNA-seq reference scripts (`references/archival/rnaseq/{mouse,human}/`) implement:
- **STAR** splice-aware alignment producing coordinate-sorted BAMs + transcriptomic BAMs (`--quantMode TranscriptomeSAM`)
- **Salmon** pseudo-alignment quantification producing TPM + estimated counts (`--gcBias --validateMappings`)
- **bamCoverage** (deepTools) for BigWig generation from STAR BAMs

**What's missing from references** (must be added):
- Trimming (no trimmer used in RNA-seq references)
- featureCounts / gene-level counting
- DESeq2 differential expression analysis
- RSeQC / MultiQC QC metrics
- All downstream visualization
- Pathway / GO enrichment analysis

**Bugs found in reference scripts** (to fix during implementation):
1. `salmon_quant2.sh`: file pattern `*_R1.fast.gz` should be `*_R1.fastq.gz` (will never match)
2. `create_bw.sh` (both organisms): hardcoded sample names, not generalizable
3. `human/create_bw.sh`: echo syntax `{$file}` should be `${file}`
4. `sjdbOverhang` hardcoded at 101 (should be `read_length - 1`, configurable)
5. No `set -e`, no error handling, relative paths throughout

### Reference Genome Requirements

| Organism | Genome | STAR Index FASTA | GTF Annotation | Salmon Transcriptome |
|----------|--------|-----------------|----------------|---------------------|
| Mouse | mm10 | `mm10.fa` | `gencode.vM10.annotation.gtf` | Extracted from genome+GTF |
| Human | GRCh38/hg38 | `GRCh38.primary_assembly.genome.fa` | `gencode.v29.annotation.gtf` | Extracted from genome+GTF |

These match the lab's existing reference versions. Pre-built STAR + Salmon indices on EC2.

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UX integration | New `RNA-seq` experiment type (third assay_type) | Reuses project/experiment/reaction model; sidebar tabs change based on assay type |
| Pipeline scope | Full: alignment + quantification + DE + pathway + QC + viz | PI wants complete platform, not just alignment |
| Trimmer | fastp (not Trimmomatic) | Modern, faster, auto-detects adapters, handles polyG. kseq 42bp would destroy RNA-seq data |
| STAR + Salmon | Always run both together as single job | STAR for BAMs/BigWigs/IGV, Salmon for quantification. Complementary, not alternatives |
| DE quantification input | Both paths available: Salmon->tximport->DESeq2 AND featureCounts->DESeq2 | User chooses. Salmon is default; featureCounts for power users |
| Reaction metadata | Extended: condition, replicate, cell_type, treatment, timepoint, genotype | Nullable columns on existing `reactions` table |
| Index management | Pre-built STAR + Salmon indices on EC2 | STAR indices are ~30GB, take ~1hr to build. Only practical approach |
| QC scope | Full: STAR logs + Salmon logs + RSeQC + MultiQC | Comprehensive RNA-seq quality assessment |
| DE visualization | Full: volcano, MA, PCA, heatmaps, pathway (GO/KEGG), interactive gene tables | Maximum value for publication-ready outputs |
| Phasing | Three phases (incremental) | A: Infrastructure + fastp, B: Core pipeline, C: Downstream analysis |
| Auto-pipeline | Yes, from Phase B | Chain: FastQC -> fastp -> STAR+Salmon -> BigWigs. DE launched separately |
| Annotation versions | Match references: gencode.vM10 (mouse), gencode.v29 (human) | Consistency with existing lab results |
| Job types | Separate `rnaseq_*` prefixed types | Clean dispatch, no conditionals in existing code |

---

## New Job Types

| Job Type | Stage Class | Tools | Purpose |
|----------|------------|-------|---------|
| `rnaseq_trimming` | `RnaseqTrimmingStage` | fastp | Adapter removal, quality filtering, polyG trimming |
| `rnaseq_alignment` | `RnaseqAlignmentStage` | STAR, Salmon, samtools, bamCoverage | Alignment + quantification + BigWigs (always all three) |
| `rnaseq_feature_counts` | `FeatureCountsStage` | featureCounts (Subread) | Gene-level read counting from STAR BAMs |
| `rnaseq_de` | `RnaseqDEStage` | R (DESeq2, tximport, ggplot2, pheatmap) | Differential expression + all plots |
| `rnaseq_qc` | `RnaseqQCStage` | RSeQC, MultiQC | RNA-seq-specific QC metrics |
| `rnaseq_pathway` | `RnaseqPathwayStage` | R (clusterProfiler, org.*.eg.db) | GO enrichment + KEGG pathway analysis |

---

## New Dependencies

### Backend (Python/System)
| Package | Purpose | Install Method |
|---------|---------|---------------|
| fastp | Adapter/quality trimming | conda / binary |
| STAR | Splice-aware alignment | conda |
| Salmon | Pseudo-alignment quantification | conda |
| featureCounts (Subread) | Gene-level counting | conda |
| RSeQC | RNA-seq QC metrics | pip/conda |
| MultiQC | QC report aggregation | pip/conda |

### Backend (R packages for DESeq2/pathway scripts)
| Package | Purpose |
|---------|---------|
| DESeq2 | Differential expression |
| tximport | Salmon -> gene-level counts |
| ggplot2 | Plotting (volcano, MA, PCA) |
| pheatmap | Expression heatmaps |
| clusterProfiler | GO/KEGG enrichment |
| org.Mm.eg.db | Mouse gene annotations |
| org.Hs.eg.db | Human gene annotations |
| EnhancedVolcano | Publication-quality volcano plots |

### Frontend (npm)
No new npm dependencies expected. Existing stack (Recharts, TanStack Table, DataTable) covers all visualization needs.

---

## Sidebar Tabs by Assay Type

### CUT&RUN / CUT&Tag (existing, unchanged)
Description | FASTQs | Trimming | Reactions | Alignment | Peak Calling | DiffBind | Normalization | Heatmaps | Correlation | History | All Files

### RNA-seq (new)
Description | FASTQs | Trimming | Reactions | Alignment | DE Analysis | QC Dashboard | Pathway | History | All Files

Implementation: `ExperimentView.tsx` uses two constant arrays (`CUTANDRUN_TABS` / `RNASEQ_TABS`) selected by `experiment.assayType`.

---

## Database Changes

### Migration: Add RNA-seq reaction fields

Add 4 nullable columns to `reactions` table:

```python
treatment: Mapped[str | None] = mapped_column(String, nullable=True)
timepoint: Mapped[str | None] = mapped_column(String, nullable=True)
genotype: Mapped[str | None] = mapped_column(String, nullable=True)
replicate_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

These are nullable and backwards-compatible. CUT&RUN reactions ignore them; RNA-seq reactions use them for DESeq2 design matrices. No changes to existing data.

### No new tables needed

All RNA-seq jobs use the existing `analysis_jobs` table with JSONB `params`. All outputs use the existing `job_outputs` table with `file_category` strings.

---

## Phase A: Infrastructure + fastp Trimming

> **Goal**: RNA-seq experiments can be created, FASTQs uploaded, reactions configured with RNA-seq metadata, and reads trimmed with fastp. The sidebar adapts based on assay type.

### Prerequisites
- All existing phases (1-12) complete
- fastp binary available on EC2 (`conda install -c bioconda fastp`)

### A.1 Schema + Config Changes

- Add `'RNA-seq'` to experiment `assay_type` validation (currently `CUT&RUN` | `CUT&Tag`)
- Alembic migration: add `treatment`, `timepoint`, `genotype`, `replicate_number` columns to `reactions`
- Update `ReactionCreate`, `ReactionRead`, `ReactionUpdate` Pydantic schemas with new nullable fields
- Add to `backend/config.py`: `STAR_INDEX_DIR`, `SALMON_INDEX_DIR`, `GENCODE_GTF_DIR` settings
- Update `frontend/src/api/types.ts`: add new reaction fields, RNA-seq QC types
- Update `frontend/src/lib/constants.ts`: add `'RNA-seq'` to `ASSAY_TYPES`

**Verify**: Create an RNA-seq experiment via API. Create a reaction with `treatment` and `timepoint` fields. Fields persist and return in GET.

### A.2 Conditional Sidebar + Analysis Dropdown

- Refactor `ExperimentView.tsx`: split `TABS` into `CUTANDRUN_TABS` and `RNASEQ_TABS`, select based on `experiment.assayType`
- Refactor `NewAnalysisDropdown.tsx`: accept `assayType` prop, show different menu items for RNA-seq (hide Peak Calling/DiffBind/Normalization/Heatmaps/Correlation; show featureCounts/DE Analysis/QC/Pathway)
- Update `CreateExperimentWizard.tsx` step 1: include `RNA-seq` in assay type selector
- Update `ReactionsEditor.tsx`: show RNA-seq-specific optional columns (`treatment`, `timepoint`, `genotype`, `replicate_number`) when `assayType === 'RNA-seq'`; hide CUT&RUN-specific columns (`cutana_spike_in`, etc.)

**Verify**: Create an RNA-seq experiment in the UI. Sidebar shows RNA-seq tabs (no Peak Calling). Analysis dropdown shows RNA-seq options. Reactions form shows treatment/timepoint fields.

### A.3 fastp Trimming Pipeline Stage

New file: `backend/pipelines/rnaseq_trimming.py`

```python
class RnaseqTrimmingStage(PipelineStage):
    """fastp adapter + quality trimming for RNA-seq."""
```

fastp command per paired-end FASTQ pair:
```bash
fastp \
  --in1 <R1.fastq.gz> --in2 <R2.fastq.gz> \
  --out1 <R1_trimmed.fastq.gz> --out2 <R2_trimmed.fastq.gz> \
  --json <sample.fastp.json> --html <sample.fastp.html> \
  --thread <N> \
  --detect_adapter_for_pe \
  --qualified_quality_phred 20 \
  --length_required 25 \
  --cut_front --cut_tail \
  --cut_window_size 4 --cut_mean_quality 15
```

Key differences from CUT&RUN trimming:
- **No kseq 42bp step** (RNA-seq reads should not be fixed-length trimmed)
- **fastp instead of Trimmomatic** (faster, auto-detects adapters, handles polyG)
- **HTML report per sample** (fastp generates its own QC report)
- Concurrent processing via ThreadPoolExecutor (same pattern as `trimming.py`)

Register in `backend/pipelines/__init__.py`:
```python
"rnaseq_trimming": RnaseqTrimmingStage(),
```

Post-trim: create `FastqFile` records for trimmed FASTQs, trigger FastQC on trimmed files (same as existing trimming stage).

- `validate()`: check FASTQ pairs exist, all organisms are RNA-seq compatible
- `run()`: ThreadPoolExecutor per pair, collect fastp JSON metrics
- `mock_run()`: create stub trimmed FASTQs + fastp JSON/HTML
- `generate_methods_text()`: "Reads were trimmed using fastp v{version} with adapter auto-detection..."

**Verify**: Submit an `rnaseq_trimming` job via API. Worker picks it up, runs fastp (or mock), creates trimmed FASTQs. fastp HTML report accessible. Methods text generated.

### A.4 Frontend: RNA-seq Trimming Tab

- Create `frontend/src/pages/experiment/RnaseqTrimmingTab.tsx` (or reuse `TrimmingTab.tsx` with assay-type conditional for fastp HTML report viewing)
- Sub-tabs: Info (job details + methods text), Files (trimmed FASTQs + fastp reports)
- fastp HTML report viewer: similar to FastQC iframe pattern but for fastp's HTML output

**Verify**: Navigate to RNA-seq experiment trimming tab. View fastp HTML report in iframe. Download trimmed FASTQs from Files sub-tab.

### A.5 Tests

- `test_rnaseq_trimming_pipeline.py`: validation, mock_run, methods text, concurrent pairs
- Schema migration test: new reaction columns exist, nullable, backwards-compatible
- API test: create RNA-seq experiment, create reaction with RNA-seq fields

### Phase A Done Criteria

- [ ] RNA-seq experiment type selectable in UI
- [ ] Reactions form shows RNA-seq-specific fields
- [ ] Sidebar tabs adapt for RNA-seq experiments
- [ ] fastp trimming pipeline runs (mock + real)
- [ ] fastp HTML reports viewable
- [ ] Trimmed FASTQs registered and downloadable
- [ ] Methods text generated for fastp trimming
- [ ] All new tests passing
- [ ] `ruff check` + `ruff format --check` + `npm run build` clean

---

## Phase B: Core Pipeline (STAR + Salmon + BigWigs + QC)

> **Goal**: RNA-seq alignment, quantification, and BigWig generation in a single pipeline step. STAR alignment metrics and Salmon quantification summaries displayed in QC reports. IGV visualization of RNA-seq BAMs/BigWigs. Auto-pipeline chains FastQC -> fastp -> STAR+Salmon.

### Prerequisites
- Phase A complete
- STAR, Salmon, samtools, bamCoverage (deepTools) available on EC2
- Pre-built STAR indices: `/data/cleave/genomes/star/mm10/` and `.../hg38/`
- Pre-built Salmon indices: `/data/cleave/genomes/salmon/mm10/` and `.../hg38/`
- GENCODE GTF files: `/data/cleave/genomes/gtf/gencode.vM10.annotation.gtf` and `.../gencode.v29.annotation.gtf`

### B.1 STAR + Salmon + BigWig Pipeline Stage

New file: `backend/pipelines/rnaseq_alignment.py`

```python
class RnaseqAlignmentStage(PipelineStage):
    """STAR alignment + Salmon quantification + BigWig generation."""
```

Per-reaction pipeline (13+ steps):
1. **STAR alignment**: `STAR --runThreadN <N> --genomeDir <index> --readFilesIn <R1> <R2> --readFilesCommand zcat --outSAMtype BAM SortedByCoordinate --quantMode TranscriptomeSAM --outFileNamePrefix <prefix> --sjdbOverhang <read_length - 1>`
2. **samtools index**: `samtools index <sorted.bam>`
3. **Salmon quant**: `salmon quant -i <salmon_index> --libType A -1 <R1.fq.gz> -2 <R2.fq.gz> -p <threads> --gcBias --validateMappings -o <quant_dir>`
4. **bamCoverage unsmoothed**: `bamCoverage -b <sorted.bam> -o <unsmoothed.bw> --binSize 20 --normalizeUsing RPKM --effectiveGenomeSize <size>` (reuse existing effective genome size constants from `alignment.py`)
5. **bamCoverage smoothed**: `bamCoverage -b <sorted.bam> -o <smoothed.bw> --binSize 100 --normalizeUsing RPKM`
6. **Parse STAR QC**: Read `*Log.final.out` for alignment metrics (uniquely mapped %, multi-mapped %, unmapped %, splice junctions)
7. **Parse Salmon QC**: Read `aux_info/meta_info.json` for mapping rate, library type detection, fragment length distribution

Key differences from CUT&RUN alignment:
- **STAR instead of Bowtie2** (splice-aware, RNA-seq specific)
- **No proper-pair filtering** (STAR handles this internally)
- **No duplicate removal** (controversial for RNA-seq; make optional, default OFF)
- **No blacklist subtraction** (CUT&RUN/ChIP-specific)
- **No fragment size filter** (CUT&RUN-specific)
- **No heatmaps at TSS/gene body** (different biology — could add later)
- **Salmon runs alongside** (not a separate step)
- **`--readFilesCommand zcat`** flag handles gzipped FASTQs directly (no gunzip/gzip dance like the reference scripts)

Concurrency: ThreadPoolExecutor per-reaction. STAR is memory-heavy (~32GB for human), so `MAX_CONCURRENT_REACTIONS` may need to be lower for RNA-seq (default 2-4 instead of 8 for CUT&RUN). Add `MAX_CONCURRENT_RNASEQ_REACTIONS` config setting.

Output file categories for `job_outputs`:
- `sorted_bam` — coordinate-sorted BAM
- `bam_index` — BAI index
- `transcriptome_bam` — STAR TranscriptomeSAM output
- `unsmoothed_bigwig` — 20bp RPKM bigWig
- `smoothed_bigwig` — 100bp RPKM bigWig
- `salmon_quant` — Salmon quant.sf
- `salmon_dir` — full Salmon output directory
- `star_log` — STAR Log.final.out
- `master_log` — consolidated pipeline log

Register in `backend/pipelines/__init__.py`:
```python
"rnaseq_alignment": RnaseqAlignmentStage(),
```

**Verify**: Submit `rnaseq_alignment` job. Worker runs STAR + Salmon + bamCoverage (or mock). BAMs, BigWigs, quant.sf all registered as outputs. STAR/Salmon QC metrics parseable.

### B.2 RNA-seq Alignment QC Report

New QC report endpoint and schema for RNA-seq alignment metrics.

STAR metrics (from `Log.final.out`):
- Total reads
- Uniquely mapped reads (count + %)
- Multi-mapped reads (%)
- Unmapped reads (%)
- Average mapped length
- Number of splices (total, annotated, GT/AG, GC/AG, AT/AC, non-canonical)
- Mismatch rate per base

Salmon metrics (from `meta_info.json`):
- Mapping rate
- Library type (auto-detected strandedness)
- Number of processed reads
- Fragment length mean + SD

Backend: `GET /jobs/:jid/rnaseq-qc-report` returns JSON with STAR + Salmon metrics per reaction. `GET /jobs/:jid/rnaseq-qc-report/download` returns CSV.

**Verify**: Fetch QC report for completed RNA-seq alignment. Metrics match STAR/Salmon log files.

### B.3 Frontend: RNA-seq Alignment Wizard + Tab

New files:
- `frontend/src/components/rnaseq-alignment/NewRnaseqAlignmentWizard.tsx` — 3-step wizard:
  1. Details (name, notes)
  2. Choose Reactions (checkbox table, only RNA-seq reactions)
  3. Settings (reference genome auto-detected from organism; advanced: duplicate removal ON/OFF, sjdbOverhang override, strandedness hint)
- `frontend/src/pages/experiment/RnaseqAlignmentTab.tsx` — sub-tabs:
  - Info (job details + methods text + notes)
  - Input (selected reactions table)
  - QC Report (STAR metrics table + Salmon metrics table, Recharts bar charts for mapping rates)
  - Files (BAMs, BigWigs, Salmon quant files, logs)
  - IGV (reuse existing `IGVPanel` — load STAR BAMs + BigWigs)

**Verify**: Launch RNA-seq alignment from wizard. QC report shows STAR/Salmon metrics. IGV loads BigWig tracks. Files downloadable.

### B.4 Auto-Pipeline for RNA-seq

Extend `backend/services/auto_pipeline_service.py` with RNA-seq chain:

```
FastQC -> rnaseq_trimming (fastp) -> rnaseq_alignment (STAR+Salmon+BigWigs)
```

Chain stops after alignment — DE analysis requires manual condition assignment (like DiffBind for CUT&RUN).

Add assay-type branching to `on_job_complete()`:
```python
if experiment.assay_type == "RNA-seq":
    if job_type == "rnaseq_trimming":
        await _queue_rnaseq_alignment(...)
    elif job_type == "rnaseq_alignment":
        await _mark_auto_pipeline_complete(...)
else:
    # existing CUT&RUN chain
```

Extend `AutoPipelineConfig` schema (or create `RnaseqAutoPipelineConfig`) with RNA-seq settings:
- `sjdb_overhang` (default: auto from read length)
- `remove_duplicates` (default: false for RNA-seq)
- `strandedness` (default: auto-detect via Salmon)

Frontend: `AutoPipelineModal` adapts panel for RNA-seq experiments (show fastp settings instead of Trimmomatic; show STAR/Salmon settings instead of Bowtie2/peak caller).

**Verify**: Click "Run Full Pipeline" on RNA-seq experiment. FastQC -> fastp -> STAR+Salmon runs automatically. Status tracked via SSE.

### B.5 Tests

- `test_rnaseq_alignment_pipeline.py`: validation, mock_run, STAR/Salmon QC parsing, methods text, concurrency
- `test_rnaseq_qc_report.py`: QC report endpoints, CSV download
- `test_rnaseq_auto_pipeline.py`: chain execution, fastp -> alignment transition

### Phase B Done Criteria

- [ ] STAR alignment produces sorted BAMs + transcriptomic BAMs
- [ ] Salmon quantification produces quant.sf with TPM + counts
- [ ] BigWigs generated from STAR BAMs
- [ ] STAR + Salmon QC metrics parsed and displayed
- [ ] IGV loads RNA-seq BAMs and BigWigs
- [ ] Auto-pipeline chains FastQC -> fastp -> STAR+Salmon
- [ ] Methods text generated for STAR + Salmon
- [ ] All new tests passing
- [ ] `ruff check` + `ruff format --check` + `npm run build` clean

---

## Phase C: Downstream Analysis + Full QC + Visualization

> **Goal**: Complete RNA-seq analysis platform with differential expression, pathway analysis, comprehensive QC, and publication-ready visualizations.

### Prerequisites
- Phase B complete
- R with DESeq2, tximport, clusterProfiler, org.Mm.eg.db, org.Hs.eg.db, ggplot2, pheatmap, EnhancedVolcano
- featureCounts (Subread package) available on EC2
- RSeQC available on EC2 (pip install)
- MultiQC available on EC2 (pip install)

### C.1 featureCounts Pipeline Stage

New file: `backend/pipelines/rnaseq_feature_counts.py`

```python
class FeatureCountsStage(PipelineStage):
    """Gene-level read counting from STAR BAMs using featureCounts."""
```

Command:
```bash
featureCounts \
  -a <gencode.annotation.gtf> \
  -o <counts.txt> \
  -p --countReadPairs \
  -T <threads> \
  -s <strandedness: 0=unstranded, 1=forward, 2=reverse> \
  --primary \
  <bam1> <bam2> ... <bamN>
```

- Input: sorted BAMs from `rnaseq_alignment` job
- Output: count matrix (genes x samples), summary statistics
- Strandedness inferred from Salmon's auto-detection (stored in alignment job params/outputs)
- All reactions counted in a single featureCounts invocation (produces combined matrix)

Register as `"rnaseq_feature_counts"` in stage registry.

Frontend: Separate `NewFeatureCountsWizard.tsx` (2-step: choose alignment run -> settings). Results visible in DE Analysis tab when featureCounts is the selected input.

**Verify**: Submit featureCounts job. Produces gene count matrix. Counts match expected gene set from GTF.

### C.2 DESeq2 Differential Expression Pipeline Stage

New file: `backend/pipelines/rnaseq_de.py`

```python
class RnaseqDEStage(PipelineStage):
    """DESeq2 differential expression with visualization."""
```

New R script: `backend/pipelines/scripts/rnaseq_deseq2.R`
- Accepts: quantification source (salmon dir paths OR featureCounts matrix), sample sheet CSV, contrast definition, output directory
- Two input paths:
  1. **Salmon path**: `tximport(files, type="salmon", tx2gene=tx2gene)` -> `DESeqDataSetFromTximport(txi, colData, design)`
  2. **featureCounts path**: `DESeqDataSetFromMatrix(countData, colData, design)`
- Design formula from reaction metadata: `~ condition` (simple) or `~ condition + batch` (with covariates)
- Outputs:
  - `results.tsv` — full DESeq2 results (gene, baseMean, log2FC, lfcSE, stat, pvalue, padj)
  - `normalized_counts.csv` — DESeq2-normalized count matrix
  - `volcano.png` / `volcano.svg` — EnhancedVolcano plot
  - `ma_plot.png` — MA plot (plotMA)
  - `pca.png` — PCA of regularized log-transformed counts
  - `sample_distance.png` — sample-to-sample distance heatmap
  - `top_genes_heatmap.png` — heatmap of top 50 DE genes (pheatmap)
  - `summary.json` — counts of up/down/ns genes at FDR < 0.05

Frontend: `NewDEAnalysisWizard.tsx` — 4-step wizard:
1. Details (name, notes)
2. Choose Alignment (radio table of completed `rnaseq_alignment` jobs)
3. Sample Sheet (assign conditions, replicates from reaction metadata — similar to DiffBind's condition assignment UI)
   - Quantification source selector: **Salmon** (default) or **featureCounts** (requires completed `rnaseq_feature_counts` job)
4. Settings (contrast definition: reference condition, FDR threshold, LFC threshold, design formula)

**QC report endpoint**: `GET /jobs/:jid/rnaseq-de-report` returns JSON with DE summary, column names (dynamic like DiffBind), gene list with pagination.

Frontend: `DEAnalysisTab.tsx` — 5 sub-tabs:
- Info (job details + methods text)
- Input (sample sheet table + design formula)
- Results (interactive gene table with DataTable — sortable by log2FC, padj, baseMean; searchable by gene name; color-coded significance)
- Plots (volcano, MA, PCA, heatmaps — following DiffBind's `PlotsPanel` pattern with signed URLs)
- Files (all outputs downloadable)

**Verify**: Submit DE analysis. Volcano plot shows expected pattern. Gene table sortable/searchable. Results TSV downloadable. Methods text includes DESeq2 version and design formula.

### C.3 RSeQC + MultiQC Pipeline Stage

New file: `backend/pipelines/rnaseq_qc.py`

```python
class RnaseqQCStage(PipelineStage):
    """RNA-seq-specific QC metrics via RSeQC + MultiQC aggregation."""
```

RSeQC modules to run per reaction:
- `infer_experiment.py` — strandedness inference
- `read_distribution.py` — read distribution across genomic features (CDS, UTR, intron, intergenic)
- `geneBody_coverage.py` — gene body coverage uniformity (3'/5' bias detection)
- `inner_distance.py` — fragment size distribution
- `junction_saturation.py` — splice junction saturation curve

MultiQC aggregation:
```bash
multiqc <job_dir> --outdir <qc_output_dir> --force
```
Aggregates: fastp reports, STAR logs, Salmon logs, RSeQC outputs, featureCounts summary (if available).

Frontend: `RnaseqQCTab.tsx` — sub-tabs:
- Overview (MultiQC HTML report in iframe, like FastQC viewer)
- Per-Sample (RSeQC metrics table with read distribution, strandedness, coverage uniformity)
- Files (all QC outputs downloadable)

**Verify**: Submit RSeQC+MultiQC job. MultiQC HTML aggregates all prior QC. Read distribution and gene body coverage plots generated.

### C.4 clusterProfiler Pathway Analysis Stage

New file: `backend/pipelines/rnaseq_pathway.py`

```python
class RnaseqPathwayStage(PipelineStage):
    """GO enrichment + KEGG pathway analysis via clusterProfiler."""
```

New R script: `backend/pipelines/scripts/rnaseq_pathway.R`
- Input: DE results TSV (from `rnaseq_de` job), organism, significance thresholds
- Analyses:
  1. **GO enrichment** (Biological Process, Molecular Function, Cellular Component): `enrichGO(gene_list, OrgDb, ont="BP"/"MF"/"CC")`
  2. **KEGG pathway**: `enrichKEGG(gene_list, organism="mmu"/"hsa")`
  3. **GSEA** (optional): `gseGO()` using ranked gene list by log2FC
- Outputs:
  - `go_bp.png`, `go_mf.png`, `go_cc.png` — dot plots of top enriched GO terms
  - `kegg.png` — dot plot of enriched KEGG pathways
  - `go_results.csv` — full GO enrichment table
  - `kegg_results.csv` — full KEGG enrichment table
  - `gsea_plot.png` — GSEA enrichment plot (if enabled)

Frontend: `PathwayTab.tsx` — sub-tabs:
- Info (job details + methods text)
- GO (dot plots + enrichment table with DataTable)
- KEGG (dot plot + pathway table)
- Files (all outputs)

`NewPathwayWizard.tsx` — 3-step wizard:
1. Details (name, notes)
2. Choose DE Analysis (radio table of completed `rnaseq_de` jobs)
3. Settings (gene list: upregulated / downregulated / both; FDR threshold for gene selection; organism auto-detected)

**Verify**: Submit pathway analysis. GO dot plots show enriched terms. KEGG pathways listed. Tables sortable by p-value.

### C.5 Interactive Gene Expression Tables

Enhance the DE Analysis Results sub-tab with a rich interactive table:
- Columns: Gene Name, Gene ID, baseMean, log2FC, lfcSE, p-value, padj
- Features: sort by any column, search by gene name, filter by significance (padj < 0.05), filter by direction (up/down/all)
- Color coding: red for upregulated (log2FC > 0, padj < 0.05), blue for downregulated
- CSV download of filtered results
- Click gene name to link to external database (Ensembl/NCBI)

Uses existing `DataTable` component with additional column definitions and filter controls.

**Verify**: DE results table loads with all genes. Search for a known gene. Filter to significant only. Download filtered CSV.

### C.6 Tests

- `test_rnaseq_feature_counts_pipeline.py`: validation, mock_run, count matrix format
- `test_rnaseq_de_pipeline.py`: both input paths (Salmon/featureCounts), dynamic columns, validation, mock plots
- `test_rnaseq_qc_pipeline.py`: RSeQC modules, MultiQC aggregation, validation
- `test_rnaseq_pathway_pipeline.py`: GO/KEGG enrichment, validation, mock_run
- `test_rnaseq_de_report.py`: DE report endpoint, gene table pagination, CSV download

### Phase C Done Criteria

- [ ] featureCounts produces gene count matrix from STAR BAMs
- [ ] DESeq2 runs with Salmon (tximport) input
- [ ] DESeq2 runs with featureCounts input
- [ ] Volcano, MA, PCA plots generated
- [ ] Top genes heatmap generated
- [ ] Interactive gene table with search/filter/sort
- [ ] RSeQC metrics (read distribution, gene body coverage, strandedness)
- [ ] MultiQC aggregates all QC reports
- [ ] clusterProfiler GO enrichment + KEGG pathway analysis
- [ ] All visualization downloadable as PNG/SVG/CSV
- [ ] Methods text generated for all stages
- [ ] All new tests passing
- [ ] `ruff check` + `ruff format --check` + `npm run build` clean

---

## Cross-Cutting Concerns

### EC2 Setup (Pre-Implementation)

Before any code, the EC2 instance needs:

```bash
# Install tools
conda install -c bioconda star salmon subread fastp rseqc
pip install multiqc

# R packages (in R console)
BiocManager::install(c("DESeq2", "tximport", "clusterProfiler",
                       "org.Mm.eg.db", "org.Hs.eg.db", "EnhancedVolcano"))
install.packages(c("ggplot2", "pheatmap"))

# Build STAR indices (~1hr each, ~30GB each)
STAR --runMode genomeGenerate --runThreadN 16 \
  --genomeDir /data/cleave/genomes/star/mm10/ \
  --genomeFastaFiles <mm10.fa> \
  --sjdbGTFfile <gencode.vM10.annotation.gtf> \
  --sjdbOverhang 100

STAR --runMode genomeGenerate --runThreadN 16 \
  --genomeDir /data/cleave/genomes/star/hg38/ \
  --genomeFastaFiles <GRCh38.primary_assembly.genome.fa> \
  --sjdbGTFfile <gencode.v29.annotation.gtf> \
  --sjdbOverhang 100

# Build Salmon indices
salmon index -t <mm10_transcripts.fa> -i /data/cleave/genomes/salmon/mm10/ --gencode
salmon index -t <hg38_transcripts.fa> -i /data/cleave/genomes/salmon/hg38/ --gencode

# tx2gene mapping files (for tximport)
# Extract from GTF: transcript_id -> gene_id -> gene_name
```

### STAR Memory Requirements

STAR requires ~32GB RAM for human genome loading. The current EC2 instance (`m5.8xlarge`, 32 vCPU, 128GB RAM) can handle this, but concurrent STAR jobs should be limited. Add `MAX_CONCURRENT_RNASEQ_REACTIONS` config (default: 2) separate from the CUT&RUN `MAX_CONCURRENT_REACTIONS` (default: 8).

### Testing Strategy

| Phase | Test Files | Estimated Count |
|-------|-----------|-----------------|
| A | `test_rnaseq_trimming_pipeline.py`, schema tests in existing files | ~15-20 |
| B | `test_rnaseq_alignment_pipeline.py`, `test_rnaseq_qc_report.py`, `test_rnaseq_auto_pipeline.py` | ~30-40 |
| C | `test_rnaseq_feature_counts_pipeline.py`, `test_rnaseq_de_pipeline.py`, `test_rnaseq_qc_pipeline.py`, `test_rnaseq_pathway_pipeline.py`, `test_rnaseq_de_report.py` | ~40-50 |

All tests run inside Docker. Mock mode for all pipeline stages (no bioinformatics tools needed for tests).

### Frontend Patterns

All new wizards follow the established pattern:
- `New*Wizard.tsx` with `WizardModal` base
- Step components as separate files
- `useCreateJob()` mutation for submission
- Job type filtering in tab components
- Sub-tab pattern (Info, Input, Results/QC, Files)
- Signed URLs for plot images
- DataTable for tabular results
- Recharts for charts

### Backend Patterns

All new pipeline stages follow `PipelineStage` interface:
- `validate()` returns error list
- `run()` with ThreadPoolExecutor for concurrent reactions
- `mock_run()` creates realistic stub files
- `generate_methods_text()` for manuscripts
- `run_cmd()` / `run_piped_cmd()` for subprocess calls
- `append_to_master_log()` for consolidated logging
- `cancelled` callback checked between subprocess steps

### New Backend Files (Complete List)

```
backend/pipelines/
├── rnaseq_trimming.py          # fastp (Phase A)
├── rnaseq_alignment.py         # STAR + Salmon + bamCoverage (Phase B)
├── rnaseq_feature_counts.py    # featureCounts (Phase C)
├── rnaseq_de.py                # DESeq2 dispatcher (Phase C)
├── rnaseq_qc.py                # RSeQC + MultiQC (Phase C)
├── rnaseq_pathway.py           # clusterProfiler (Phase C)
└── scripts/
    ├── rnaseq_deseq2.R         # DESeq2 + tximport + plots (Phase C)
    ├── rnaseq_deseq2_fc.R      # DESeq2 from featureCounts (Phase C)
    └── rnaseq_pathway.R        # clusterProfiler GO/KEGG (Phase C)
```

### New Frontend Files (Complete List)

```
frontend/src/
├── components/
│   ├── rnaseq-alignment/
│   │   ├── NewRnaseqAlignmentWizard.tsx     # 3-step wizard (Phase B)
│   │   ├── RnaseqAlignmentSettingsStep.tsx  # STAR/Salmon settings (Phase B)
│   │   ├── RnaseqAlignmentQCPanel.tsx       # STAR+Salmon metrics (Phase B)
│   │   ├── RnaseqAlignmentInfoPanel.tsx     # Job info + methods (Phase B)
│   │   └── RnaseqAlignmentFilesPanel.tsx    # BAMs, BigWigs, quant files (Phase B)
│   ├── rnaseq-de/
│   │   ├── NewDEAnalysisWizard.tsx          # 4-step wizard (Phase C)
│   │   ├── DEConditionStep.tsx              # Condition assignment (Phase C)
│   │   ├── DESettingsStep.tsx               # Design formula, thresholds (Phase C)
│   │   ├── DEResultsPanel.tsx               # Interactive gene table (Phase C)
│   │   ├── DEPlotsPanel.tsx                 # Volcano, MA, PCA, heatmap (Phase C)
│   │   └── DEFilesPanel.tsx                 # All outputs (Phase C)
│   ├── rnaseq-qc/
│   │   └── RnaseqQCPanel.tsx               # RSeQC + MultiQC viewer (Phase C)
│   ├── rnaseq-pathway/
│   │   ├── NewPathwayWizard.tsx             # 3-step wizard (Phase C)
│   │   ├── PathwayGOPanel.tsx               # GO dot plots + table (Phase C)
│   │   ├── PathwayKEGGPanel.tsx             # KEGG dot plot + table (Phase C)
│   │   └── PathwayFilesPanel.tsx            # All outputs (Phase C)
│   └── rnaseq-feature-counts/
│       └── NewFeatureCountsWizard.tsx       # 2-step wizard (Phase C)
├── pages/experiment/
│   ├── RnaseqTrimmingTab.tsx               # fastp results (Phase A)
│   ├── RnaseqAlignmentTab.tsx              # STAR+Salmon results (Phase B)
│   ├── DEAnalysisTab.tsx                   # DESeq2 results (Phase C)
│   ├── RnaseqQCTab.tsx                     # RSeQC+MultiQC (Phase C)
│   └── PathwayTab.tsx                      # clusterProfiler (Phase C)
└── api/
    └── rnaseqJobs.ts                       # RNA-seq-specific API helpers (Phase B)
```

### Key Reference Documents

| Document | Relevance |
|----------|-----------|
| `references/archival/rnaseq/mouse/` | STAR alignment + Salmon quant reference (mouse) |
| `references/archival/rnaseq/human/` | STAR alignment + Salmon quant reference (human) |
| `backend/pipelines/alignment.py` | Pattern reference for multi-step pipeline with ThreadPoolExecutor |
| `backend/pipelines/diffbind.py` | Pattern reference for R script integration + sample sheet building |
| `backend/services/auto_pipeline_service.py` | Auto-pipeline chain to extend with RNA-seq stages |
| `frontend/src/components/alignment/` | Pattern reference for alignment wizard + tab + sub-tabs |
| `frontend/src/components/diffbind/` | Pattern reference for condition assignment UI + results visualization |

### Session Logging

After completing each phase, write a summary log to `logs/build/rnaseq/` following the existing convention: `YYYY-MM-DD_<short-description>.md`.
