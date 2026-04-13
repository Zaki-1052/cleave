# Phase C.2 — DESeq2 Differential Expression Implementation Plan

## Context

The RNA-seq pipeline has Phases A (fastp trimming), B (STAR + Salmon + BigWigs + auto-pipeline), and C.1 (featureCounts) complete. A `RnaseqDEStage` stub exists at `backend/pipelines/rnaseq_de.py` with working `validate()` and `mock_run()`, but `run()` raises `PipelineError`. The auto-pipeline service already routes to `rnaseq_de` with Salmon quant paths when conditions are detected. The frontend has a disabled "DE Analysis" dropdown item and a placeholder tab at `de/:jid`.

This step replaces the stub with a real DESeq2 implementation, adds the R scripts, builds the full QC report endpoints, and creates the complete frontend (wizard + 5-sub-tab results view with interactive gene table). Follows the DiffBind pipeline pattern exactly.

---

## Step 1: R Scripts (2 files)

### 1a. `backend/pipelines/scripts/rnaseq_deseq2.R` — Salmon + tximport path

**Args**: `sample_metadata.csv`, `tx2gene.tsv`, `results_dir`, `plots_dir`, `reference_condition`

**R packages**: DESeq2, tximport, ggplot2, pheatmap, RColorBrewer, EnhancedVolcano

**Logic**:
1. Read `sample_metadata.csv` (columns: `sample_id`, `condition`, `replicate`, `quant_path`)
2. Read `tx2gene.tsv` (columns: `TXNAME`, `GENEID`, `GENENAME`)
3. `tximport(files, type="salmon", tx2gene=tx2gene)` → `txi`
4. Build `colData` data.frame with condition as factor, reference level set to `reference_condition`
5. `DESeqDataSetFromTximport(txi, colData, design = ~condition)`
6. `DESeq(dds)` — run DESeq2
7. `results(dds, alpha=0.05)` — extract results
8. Merge gene names from tx2gene (gene_id → gene_name mapping)
9. Write `de_results.tsv`: gene_name, gene_id, baseMean, log2FoldChange, lfcSE, stat, pvalue, padj — sorted by padj
10. Write `normalized_counts.csv`: gene_id rows × sample columns (DESeq2 normalized counts)
11. Write `de_summary.json`: total_genes, upregulated, downregulated, not_significant, fdr_threshold
12. Generate plots using `safe_plot()` tryCatch pattern (from DiffBind R scripts):
    - `volcano.{png,svg}` — EnhancedVolcano (log2FC vs -log10 padj, labeled top hits)
    - `ma_plot.{png,svg}` — DESeq2 `plotMA()`
    - `pca.{png,svg}` — PCA of `rlog(dds)`, colored by condition
    - `sample_distance.{png,svg}` — pheatmap of sample-to-sample Euclidean distances
    - `top_genes_heatmap.{png,svg}` — pheatmap of top 50 DE genes (by padj), rlog-transformed

**Error handling**: `tryCatch` with `SerialParam()` fallback (matching DiffBind pattern). `safe_plot()` wrapper skips individual plot failures without crashing.

### 1b. `backend/pipelines/scripts/rnaseq_deseq2_fc.R` — featureCounts path

**Args**: `sample_metadata.csv`, `count_matrix.txt`, `results_dir`, `plots_dir`, `reference_condition`

**Logic**: Same as 1a except:
- Step 2-3 replaced with: read featureCounts matrix, extract count columns matching sample names
- Step 5: `DESeqDataSetFromMatrix(countData, colData, design = ~condition)`
- Gene names extracted from featureCounts Geneid column (which maps to gene_id)
- Gene name lookup via a simple GENEID→GENENAME mapping (either from the featureCounts annotation columns or a separate lookup)

---

## Step 2: Update `backend/pipelines/rnaseq_de.py` — Real Implementation

Replace the stub `run()` with a real implementation. Key changes:

### 2a. Enhanced `validate()`

Add to existing validation:
- Check `quantification_source` is `"salmon"` or `"featurecounts"` (default `"salmon"`)
- **Salmon path**: each sample must have `salmon_quant_path`
- **featureCounts path**: `count_matrix_path` must be present
- Check `reference_genome` is in `RNASEQ_GENOME_CONFIG` (mm10 or hg38)
- Real mode: check `Rscript` in PATH; check GTF exists (for tx2gene generation)
- Validate condition names: alphanumeric + underscores (reuse `_CONDITION_RE` from DiffBind)
- Validate `reference_condition` (optional) is one of the listed conditions

### 2b. New helper: `_generate_tx2gene(gtf_path, output_path)`

Parse GENCODE GTF to extract transcript→gene→gene_name mapping:
- Read GTF line by line, filter `feature_type == "transcript"`
- Extract `transcript_id`, `gene_id`, `gene_name` attributes
- Write TSV: `TXNAME\tGENEID\tGENENAME`
- Fast (pure Python, no dependencies), handles GENCODE format

GTF path resolved via `RNASEQ_GENOME_CONFIG` + `settings.GENCODE_GTF_DIR` (same as featureCounts stage).

### 2c. `run()` implementation

Following DiffBind's `run()` pattern exactly:

1. Create directories: `results/`, `plots/`, `logs/`
2. Write `sample_metadata.csv` with **absolute paths** (resolve from STORAGE_ROOT + relative path)
3. **Salmon path**: generate `tx2gene.tsv` via `_generate_tx2gene()`
4. Select R script: `rnaseq_deseq2.R` (salmon) or `rnaseq_deseq2_fc.R` (featurecounts)
5. Build command: `Rscript <script> <sample_metadata> <tx2gene_or_count_matrix> <results_dir> <plots_dir> <reference_condition>`
6. `run_cmd(cmd, log_path=logs/rscript_output.log, timeout=14400, cwd=job_dir, master_log, cancelled)`
7. Scan output directories for files, register with appropriate `file_category`:
   - `de_results` → `results/de_results.tsv`
   - `normalized_counts` → `results/normalized_counts.csv`
   - `de_summary` → `results/de_summary.json`
   - `volcano_plot` → `plots/volcano.{png,svg}`
   - `ma_plot` → `plots/ma_plot.{png,svg}`
   - `pca_plot` → `plots/pca.{png,svg}`
   - `distance_heatmap` → `plots/sample_distance.{png,svg}`
   - `gene_heatmap` → `plots/top_genes_heatmap.{png,svg}`
   - `de_sample_sheet` → `sample_metadata.csv`
   - `log` → `logs/rnaseq_de.log`, `logs/rscript_output.log`
8. Return `{"job_id", "status", "message", "outputs", "methods_text"}`

### 2d. Update `mock_run()`

Enhance to match real output structure:
- Add SVG stubs for all 5 plot types (currently only PNGs)
- Add `de_sample_sheet` output (write the sample metadata CSV)
- Use `_STUB_PNG` bytes (from DiffBind) instead of empty bytes for PNG stubs

### 2e. Move `generate_methods_text()` to `methods_text.py`

Create `rnaseq_de_methods(params)` in `backend/pipelines/methods_text.py`. Remove inline implementation from class. Add featureCounts path text variant.

**Critical files**:
- `backend/pipelines/rnaseq_de.py` (update)
- `backend/pipelines/methods_text.py` (add function)
- `backend/pipelines/rnaseq_alignment.py:59-70` (import `RNASEQ_GENOME_CONFIG` — already exists, reuse)

---

## Step 3: Backend Schemas + QC Report Service + API Endpoints

### 3a. Pydantic schemas — `backend/schemas/qc_report.py`

Add after `DiffBindReport`:

```python
class RnaseqDEPlotInfo(CamelModel):
    plot_type: str  # volcano, ma, pca, distance_heatmap, gene_heatmap
    output_id_png: int | None = None
    output_id_svg: int | None = None

class RnaseqDEReport(CamelModel):
    quantification_source: str  # "salmon" or "featurecounts"
    conditions: list[str]
    reference_condition: str | None = None
    column_names: list[str]
    total_genes: int
    significant_genes_005: int
    significant_genes_001: int
    upregulated: int  # log2FC > 0 AND padj < 0.05
    downregulated: int  # log2FC < 0 AND padj < 0.05
    results_preview: list[dict[str, str | float]]  # first 100 rows
    plot_outputs: list[RnaseqDEPlotInfo]
```

### 3b. QC report service — `backend/services/qc_report_service.py`

Add 5 functions following the DiffBind pattern exactly:

1. **`_parse_rnaseq_de_results_tsv(tsv_path, max_rows=100)`**
   - Returns: `(columns, preview_rows, total, sig_005, sig_001, up, down)`
   - Reads header as column names
   - Parses `padj` for significance counts, `log2FoldChange` for direction
   - Returns first 100 rows as preview

2. **`_find_de_plot_output_ids(job)`**
   - Maps categories: `{"volcano": "volcano_plot", "ma": "ma_plot", "pca": "pca_plot", "distance_heatmap": "distance_heatmap", "gene_heatmap": "gene_heatmap"}`
   - Matches PNG + SVG output IDs per plot type (same pattern as `_find_plot_output_ids`)

3. **`get_rnaseq_de_report(db, job_id, user_id)`**
   - Checks `job_type == "rnaseq_de"` and `status == "complete"`
   - Uses `_resolve_output_path(job, "de_results", "tsv")`
   - Calls `_parse_rnaseq_de_results_tsv()`
   - Extracts conditions from `job.params["samples"]`
   - Returns `RnaseqDEReport`

4. **`get_rnaseq_de_results_path(db, job_id, user_id)`** → Path for TSV download

5. **`get_rnaseq_de_counts_path(db, job_id, user_id)`** → Path for CSV download

### 3c. API endpoints — `backend/routers/jobs.py`

Add 3 endpoints (following DiffBind endpoint pattern exactly):

```
GET /jobs/{job_id}/rnaseq-de-report        → RnaseqDEReport (JSON)
GET /jobs/{job_id}/rnaseq-de-report/download-results  → FileResponse (TSV)
GET /jobs/{job_id}/rnaseq-de-report/download-counts   → FileResponse (CSV)
```

Same error handling: `ValueError → 409`, `FileNotFoundError → 404`, `None → 404`.

Import the new schemas and service functions. Add to existing import blocks.

---

## Step 4: Frontend API + Hooks + Constants

### 4a. Types — `frontend/src/api/types.ts`

Add interfaces:
```typescript
export interface RnaseqDEPlotInfo {
  plotType: string;
  outputIdPng: number | null;
  outputIdSvg: number | null;
}

export interface RnaseqDEReport {
  quantificationSource: string;
  conditions: string[];
  referenceCondition: string | null;
  columnNames: string[];
  totalGenes: number;
  significantGenes005: number;
  significantGenes001: number;
  upregulated: number;
  downregulated: number;
  resultsPreview: Record<string, string | number>[];
  plotOutputs: RnaseqDEPlotInfo[];
}
```

### 4b. API functions — `frontend/src/api/jobs.ts`

Add 3 functions:
- `getRnaseqDEReport(jobId)` → `GET /jobs/{jobId}/rnaseq-de-report`
- `downloadRnaseqDEResults(jobId)` → blob download → `de_results.tsv`
- `downloadRnaseqDECounts(jobId)` → blob download → `normalized_counts.csv`

### 4c. Hook — `frontend/src/hooks/useJobs.ts`

Add `useRnaseqDEReport(jobId)` — same pattern as `useDiffBindReport()`.

### 4d. Constants — `frontend/src/lib/constants.ts`

Add:
- `RNASEQ_DE_FILE_CATEGORIES` — array of file category objects for FilesPanel
- `RNASEQ_DE_QUANTIFICATION_SOURCES` — `[{value: 'salmon', label: 'Salmon'}, {value: 'featurecounts', label: 'featureCounts'}]`

---

## Step 5: Frontend Wizard — `frontend/src/components/rnaseq-de/`

### 5a. `NewDeseq2Wizard.tsx` — 4-step wizard orchestrator (~400 lines)

Following `NewDiffBindWizard.tsx` pattern:

**State**:
- Step 0: name, notes
- Step 1: selectedAlignmentJobId, selectedFeatureCountsJobId (optional)
- Step 2: selectedReactionIds (Set), assignments (Map<reactionId, {condition, replicate}>)
- Step 3: quantificationSource ('salmon'|'featurecounts'), referenceCondition, fdrThreshold (0.05), lfcThreshold (0)

**Submission**: Build params dict matching `rnaseq_de.py` validate() expectations:
- Salmon: `{experiment_id, project_id, reference_genome, alignment_job_id, quantification_source: "salmon", reference_condition, fdr_threshold, lfc_threshold, samples: [{reaction_id, short_name, condition, replicate, salmon_quant_path}]}`
- featureCounts: `{..., quantification_source: "featurecounts", featurecounts_job_id, count_matrix_path, samples: [{reaction_id, short_name, condition, replicate}]}`
- `parentJobId` set to alignment job ID
- Submit via `createJob({experimentId, payload: {jobType: 'rnaseq_de', ...}})`
- Navigate to `de/${job.id}` on success

**Data resolution**:
- Use `useJobs()` to find completed `rnaseq_alignment` jobs
- Use `useRnaseqQCReport()` on selected alignment to get reaction genome info
- Use `useJobOutputs(alignmentJobId, 'salmon_quant')` to resolve Salmon quant paths per reaction
- Use `useJobs()` to find completed `rnaseq_feature_counts` jobs with matching parent

### 5b. `Deseq2DetailsStep.tsx` (~80 lines)

Name + notes inputs. RNA-seq-specific "About" text explaining DESeq2 differential expression.

### 5c. `ChooseAlignmentStep.tsx` (~120 lines)

Radio table of completed `rnaseq_alignment` jobs. Shows: name, status, date, reaction count. Only complete jobs selectable. Similar to DiffBind's `ChoosePeakCallingStep.tsx`.

### 5d. `AssignConditionsStep.tsx` (~250 lines)

Adapt DiffBind's `AssignConditionsStep.tsx`:
- Table of reactions from selected alignment
- Checkbox column for include/exclude
- Condition text input with autocomplete (from previous entries)
- Replicate number (auto-incremented per condition on condition change)
- Pre-fill from reaction `treatment` or `experimental_condition` fields if set
- Validation: ≥2 conditions with ≥2 replicates each (shown as inline errors)
- Summary: "N samples in K conditions"

### 5e. `Deseq2SettingsStep.tsx` (~150 lines)

- **Quantification Source**: Radio group (Salmon / featureCounts). featureCounts option disabled if no completed `rnaseq_feature_counts` job exists for the selected alignment.
- **Reference Condition**: Dropdown populated from unique conditions in step 2. The reference level for DESeq2 contrast (typically "ctrl").
- **FDR Threshold**: Number input, default 0.05
- **LFC Threshold**: Number input, default 0 (0 = no filter)
- Training mode: defaults cleared (referenceCondition blank, source unselected)

---

## Step 6: Frontend Tab — `frontend/src/pages/experiment/DEAnalysisTab.tsx`

### 6a. `DEAnalysisTab.tsx` (~160 lines)

Replace placeholder. Following `DiffBindTab.tsx` pattern exactly:
- Filter jobs by `jobType === 'rnaseq_de'`
- Job selector dropdown (shadcn Select)
- 5 sub-tabs: Info, Input, Results, Plots, Files
- Status-gated: Results/Plots only shown for complete jobs
- Uses `useJob()`, `useJobs()`, `useRnaseqDEReport()`

### 6b. `DEInfoPanel.tsx` (~130 lines)

Reuse `AlignmentInfoPanel` pattern (or build dedicated):
- Run metadata: ID, creator, date, status, duration
- Methods text with copy button
- Editable notes
- `JobActions` (terminate/retry)
- `JobErrorDetails` for error display
- Display params: quantification source, reference condition, genome, sample count

### 6c. `DEInputPanel.tsx` (~90 lines)

Sample sheet table from `job.params.samples`:
- Columns: Short Name, Condition, Replicate
- Read-only DataTable
- Similar to `DiffBindInputPanel.tsx`

### 6d. `DEResultsPanel.tsx` (~280 lines) — Interactive Gene Table

The richest component. Following `DiffBindResultsPanel.tsx` pattern but enhanced:

**Summary cards** (grid of 4):
- Total Genes
- Significant (padj < 0.05)
- Upregulated (log2FC > 0, padj < 0.05)
- Downregulated (log2FC < 0, padj < 0.05)

**Interactive DataTable**:
- Dynamic columns from `report.columnNames` (matching DiffBind pattern)
- Cell formatting:
  - `padj`/`pvalue`: exponential notation + color badges (green < 0.05, amber < 0.1, red ≥ 0.1)
  - `log2FoldChange`: 3 decimals, color-coded (red positive, blue negative when significant)
  - `baseMean`: comma-formatted, 1 decimal
  - `lfcSE`/`stat`: 3 decimals
  - `gene_name`/`gene_id`: left-aligned text
- Search by gene name (DataTable's built-in search)
- Page size 25 (matching DiffBind)

**Download buttons**:
- "Download Results (TSV)" → `downloadRnaseqDEResults(jobId)`
- "Download Counts (CSV)" → `downloadRnaseqDECounts(jobId)`

### 6e. `DEPlotsPanel.tsx` (~180 lines)

Following `DiffBindPlotsPanel.tsx` pattern:
- Grid layout (2 columns on md+)
- 5 plot types: volcano, ma, pca, distance_heatmap, gene_heatmap
- Each: PNG display via signed URL + PNG download + SVG download
- Plot labels and descriptions dict
- Error handling for missing plots

### 6f. `DEFilesPanel.tsx` (~80 lines)

Reuse `AlignmentFilesPanel` with `categories={RNASEQ_DE_FILE_CATEGORIES}`. Lists all DE outputs by category with download.

---

## Step 7: Frontend Integration Wiring

### 7a. `ExperimentView.tsx`

- Add `showDeseq2Wizard` state + setter
- Pass `onDeseq2Click={() => setShowDeseq2Wizard(true)}` to `NewAnalysisDropdown`
- Render `<NewDeseq2Wizard>` in the RNA-seq conditional block
- No tab array changes needed — `de` tab already in `RNASEQ_TABS`

### 7b. `NewAnalysisDropdown.tsx`

- Add `onDeseq2Click?: () => void` prop
- Enable "DE Analysis" menu item (remove `disabled`, add `onSelect={onDeseq2Click}`)

### 7c. `App.tsx`

- Replace `PlaceholderTab` import at `de/:jid` route with `DEAnalysisTab`

### 7d. `AnalysisQueuePage.tsx`

- Add `rnaseq_de` to `JOB_TYPE_OPTIONS` (if not already present)
- Add to `JOB_TYPE_TO_TAB` mapping: `rnaseq_de → "de"`

---

## Step 8: Tests

### 8a. `backend/tests/test_rnaseq_de_pipeline.py` — enhance existing or replace (~350 lines)

**Validation tests** (10):
- Valid params (salmon source)
- Valid params (featurecounts source)
- Missing experiment_id
- Missing reference_genome
- Unsupported genome
- Empty samples
- Insufficient conditions (only 1)
- Insufficient replicates (condition with 1 rep)
- Salmon: missing salmon_quant_path
- featureCounts: missing count_matrix_path
- Invalid condition name (special chars)
- Real mode: Rscript not found

**Mock run tests** (5):
- Salmon: all expected outputs produced (de_results, normalized_counts, de_summary, 5 plot PNGs, 5 plot SVGs, sample_sheet, master_log)
- featureCounts: all expected outputs
- Results TSV has correct column names
- Summary JSON has correct keys (total_genes, upregulated, downregulated, not_significant)
- Normalized counts CSV has sample columns matching input

**Methods text tests** (3):
- Salmon path mentions tximport and DESeq2
- featureCounts path mentions featureCounts and DESeq2
- Both mention reference genome

**tx2gene generation test** (1):
- `_generate_tx2gene()` produces valid TSV from sample GTF data

### 8b. `backend/tests/test_rnaseq_de_report.py` (~200 lines)

**Report endpoint tests** (8):
- GET report success (JSON with correct structure)
- GET report download-results (TSV)
- GET report download-counts (CSV)
- 404 for non-existent job
- 409 for non-complete job
- 409 for wrong job type (not rnaseq_de)
- Unauthorized (non-member)
- Correct significance counting (padj < 0.05, < 0.01, up/down)

Estimated: ~25-30 new tests total.

---

## Step 9: Verification

After implementation:

1. **Backend lint**: `ruff check backend/ && ruff format --check backend/`
2. **Frontend build**: `npm run build` (must be clean)
3. **Run targeted tests**: `docker compose exec api pytest tests/test_rnaseq_de_pipeline.py tests/test_rnaseq_de_report.py -v`
4. **Run related tests** (regression): `docker compose exec api pytest tests/test_rnaseq_auto_pipeline.py tests/test_qc_report.py -v`
5. **Manual UI test**: Start dev server, create RNA-seq experiment, navigate to DE tab, open wizard, verify all 4 steps render, submit mock job, verify all 5 sub-tabs display correctly (Info, Input, Results with gene table, Plots with images, Files)
6. **Auto-pipeline test**: Verify auto-pipeline still queues DE correctly and the real stage (mock mode) completes the chain

---

## File Summary

### New Files (10)
| File | Lines (est.) | Description |
|------|-------------|-------------|
| `backend/pipelines/scripts/rnaseq_deseq2.R` | ~250 | DESeq2 via tximport (Salmon) |
| `backend/pipelines/scripts/rnaseq_deseq2_fc.R` | ~220 | DESeq2 from featureCounts matrix |
| `backend/tests/test_rnaseq_de_report.py` | ~200 | QC report endpoint tests |
| `frontend/src/components/rnaseq-de/NewDeseq2Wizard.tsx` | ~400 | 4-step wizard orchestrator |
| `frontend/src/components/rnaseq-de/Deseq2DetailsStep.tsx` | ~80 | Wizard step 1 |
| `frontend/src/components/rnaseq-de/ChooseAlignmentStep.tsx` | ~120 | Wizard step 2 |
| `frontend/src/components/rnaseq-de/AssignConditionsStep.tsx` | ~250 | Wizard step 3 (condition assignment) |
| `frontend/src/components/rnaseq-de/Deseq2SettingsStep.tsx` | ~150 | Wizard step 4 |
| `frontend/src/components/rnaseq-de/DEResultsPanel.tsx` | ~280 | Interactive gene table |
| `frontend/src/components/rnaseq-de/DEPlotsPanel.tsx` | ~180 | Plot grid with signed URLs |

### Modified Files (15)
| File | Change |
|------|--------|
| `backend/pipelines/rnaseq_de.py` | Replace run() stub, enhance validate(), update mock_run() |
| `backend/pipelines/methods_text.py` | Add `rnaseq_de_methods()` |
| `backend/schemas/qc_report.py` | Add `RnaseqDEPlotInfo`, `RnaseqDEReport` |
| `backend/services/qc_report_service.py` | Add 5 DE report functions |
| `backend/routers/jobs.py` | Add 3 DE report endpoints |
| `backend/tests/test_rnaseq_de_pipeline.py` | Expand from mock-only to full validation + both sources |
| `frontend/src/api/types.ts` | Add `RnaseqDEPlotInfo`, `RnaseqDEReport` interfaces |
| `frontend/src/api/jobs.ts` | Add 3 DE API functions |
| `frontend/src/hooks/useJobs.ts` | Add `useRnaseqDEReport()` hook |
| `frontend/src/lib/constants.ts` | Add DE file categories + quant source constants |
| `frontend/src/App.tsx` | Replace PlaceholderTab with DEAnalysisTab at `de/:jid` |
| `frontend/src/pages/ExperimentView.tsx` | Add wizard state + dropdown wiring |
| `frontend/src/components/experiments/NewAnalysisDropdown.tsx` | Enable DE Analysis item + add prop |
| `frontend/src/pages/AnalysisQueuePage.tsx` | Add `rnaseq_de` to type filter + tab mapping |
| `frontend/src/pages/experiment/DEAnalysisTab.tsx` | New file replacing placeholder (or create alongside) |

### Reused Patterns (no changes needed)
- `backend/pipelines/base.py` — `run_cmd()`, `append_to_master_log()`, `PipelineStage`
- `backend/pipelines/__init__.py` — `rnaseq_de` already registered
- `backend/worker.py` — already routes `rnaseq_de` jobs
- `backend/services/auto_pipeline_service.py` — already queues DE with Salmon paths
- DiffBind R script `safe_plot()` pattern — replicated in new R scripts
- DiffBind frontend panel patterns — replicated for DE panels

### No New Database Migrations
All data stored in existing `analysis_jobs.params` (JSONB) and `job_outputs` table.

---

## Implementation Order

1. R scripts (backend/pipelines/scripts/) — foundation for real mode
2. Update rnaseq_de.py (run, validate, mock_run, tx2gene helper)
3. Move methods text to methods_text.py
4. Schemas (qc_report.py)
5. QC report service functions
6. API endpoints (jobs.py)
7. Backend tests (pipeline + report)
8. Frontend API types + functions + hooks + constants
9. Wizard components (5 files)
10. Tab + sub-panel components (DEAnalysisTab + 5 panels)
11. Integration wiring (ExperimentView, dropdown, App.tsx, queue page)
12. Lint + build + test verification
