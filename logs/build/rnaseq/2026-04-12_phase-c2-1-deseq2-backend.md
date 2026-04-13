# Phase C.2-1 — DESeq2 Differential Expression Backend

> 1 session on 2026-04-12. Phase C.2-1 is **complete**. 30 new tests (643 total).

---

## What Was Built

### R Scripts (Step 1)
- Created `backend/pipelines/scripts/rnaseq_deseq2.R` — Salmon + tximport path (~220 lines).
  - Args: sample_metadata.csv, tx2gene.tsv, results_dir, plots_dir, reference_condition.
  - Libraries: DESeq2, tximport, ggplot2, pheatmap, RColorBrewer, EnhancedVolcano, BiocParallel, jsonlite.
  - `safe_plot()` pattern from DiffBind: tryCatch PNG+SVG with dev.off() cleanup on failure.
  - `SerialParam()` fallback for DESeq() and rlog() parallel failures.
  - `ignoreTxVersion=TRUE` in tximport for version mismatch tolerance.
  - rlog transform computed once, reused for PCA, distance heatmap, and top genes heatmap.
  - 5 plots: volcano (EnhancedVolcano), MA (plotMA), PCA (ggplot2), sample distance (pheatmap), top 50 genes heatmap (pheatmap).
  - 3 data outputs: de_results.tsv (sorted by padj), normalized_counts.csv, de_summary.json.
- Created `backend/pipelines/scripts/rnaseq_deseq2_fc.R` — featureCounts path (~210 lines).
  - Same as Salmon script except: reads featureCounts count matrix (skip `#` comment lines), `DESeqDataSetFromMatrix` instead of tximport, sample_id matching by grep against BAM column names.

### Methods Text (Step 2)
- Added `rnaseq_de_methods(params)` to `backend/pipelines/methods_text.py`.
  - Salmon path mentions tximport (Soneson et al., 2015).
  - featureCounts path mentions featureCounts (Subread).
  - Both mention DESeq2 (Love et al., 2014), design formula, reference condition, FDR 0.05, genome annotation version.

### Pipeline Stage Update (Step 3)
- Rewrote `backend/pipelines/rnaseq_de.py` — replaced stub with real implementation (~560 lines total).
  - **Enhanced `validate()`**: quantification_source (salmon/featurecounts), salmon_quant_path per sample, count_matrix_path for featureCounts, reference_genome in RNASEQ_GENOME_CONFIG, condition name regex validation (`^[A-Za-z0-9][A-Za-z0-9_]*$`), reference_condition membership check, real-mode Rscript and GTF existence checks.
  - **New `_generate_tx2gene(gtf_path, output_path)`**: Parses GENCODE GTF line-by-line for transcript→gene→gene_name mapping. Writes TSV with versioned IDs.
  - **New `_resolve_gtf(genome)`**: Resolves GTF path from RNASEQ_GENOME_CONFIG + settings.GENCODE_GTF_DIR.
  - **Real `run()`**: Following DiffBind pattern exactly — create dirs, write sample_metadata.csv with absolute paths, generate tx2gene (Salmon) or resolve count matrix (featureCounts), select R script, run_cmd with timeout=14400, scan/register all outputs (de_results, normalized_counts, de_summary, 5 plot PNG+SVG pairs, de_sample_sheet, logs).
  - **Improved `mock_run()`**: PNG stubs use `_STUB_PNG` (not empty bytes), SVG stubs for all 5 plot types, de_sample_sheet output added.
  - **Delegated `generate_methods_text()`** to `rnaseq_de_methods()` in methods_text.py.

### Schemas (Step 4)
- Added `RnaseqDEPlotInfo` and `RnaseqDEReport` to `backend/schemas/qc_report.py`.
  - Report includes: quantification_source, conditions, reference_condition, column_names, total_genes, significant_genes_005/001, upregulated, downregulated, results_preview (first 100 rows), plot_outputs.

### QC Report Service (Step 5)
- Added 5 functions + 1 constant to `backend/services/qc_report_service.py`:
  - `_RNASEQ_DE_PLOT_CATEGORIES` — maps plot types to file_category values.
  - `_parse_rnaseq_de_results_tsv()` — returns 7-tuple (columns, rows, total, sig_005, sig_001, up, down). Uses padj for significance and log2FoldChange for direction.
  - `_find_de_plot_output_ids()` — matches PNG+SVG output pairs per plot type.
  - `get_rnaseq_de_report()` — builds full RnaseqDEReport from job params + parsed TSV + plot IDs.
  - `get_rnaseq_de_results_path()` — resolves de_results TSV for download.
  - `get_rnaseq_de_counts_path()` — resolves normalized_counts CSV for download.

### API Endpoints (Step 6)
- Added 3 endpoints to `backend/routers/jobs.py`:
  - `GET /jobs/{job_id}/rnaseq-de-report` → RnaseqDEReport JSON.
  - `GET /jobs/{job_id}/rnaseq-de-report/download-results` → FileResponse TSV.
  - `GET /jobs/{job_id}/rnaseq-de-report/download-counts` → FileResponse CSV.
  - Same error handling as DiffBind: ValueError → 409, FileNotFoundError → 404, None → 404.

### Tests (Steps 7-8)
- `test_rnaseq_de_pipeline.py` — 22 tests: validation (12), mock_run (6), methods text (3), tx2gene generation (1).
- `test_rnaseq_de_report.py` — 8 tests: report success, TSV download, CSV download, 404, 409 (not complete), 409 (wrong type), unauthorized, significance counting.

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Two R scripts | Separate Salmon and featureCounts paths | Different input loading (tximport vs matrix read), shared DESeq2+plot logic |
| safe_plot() pattern | Exact copy from DiffBind R scripts | Proven pattern: tryCatch PNG+SVG, dev.off() cleanup, graceful skip |
| ignoreTxVersion=TRUE | tximport parameter | Handles version suffix mismatches between GTF transcript IDs and Salmon quant.sf |
| rlog fallback to vst | tryCatch in R script | rlog can fail on small datasets; varianceStabilizingTransformation is more robust |
| Versioned transcript IDs | Kept in tx2gene output | Matches Salmon's quant.sf format; ignoreTxVersion handles any mismatch |
| Condition name validation | Regex ^[A-Za-z0-9][A-Za-z0-9_]*$ | Prevents shell injection and R parsing issues (matches DiffBind pattern) |
| quantification_source default | "salmon" if missing | Backward compatible with auto-pipeline from Phase B (doesn't send this field) |
| _generate_tx2gene | Pure Python GTF parser | Fast line-by-line, no R/Python dependencies, handles GENCODE attribute format |
| Plot filenames | Simple: volcano.png, ma_plot.png, etc. | Python code matches by name in _PLOT_TYPES; no experiment name prefix needed |
| Report schema pattern | Follows DiffBind exactly | Dynamic column_names, results_preview (first 100 rows), plot PNG+SVG output IDs |

---

## Files Summary

### New Files (4)
| File | Lines | Description |
|------|-------|-------------|
| `backend/pipelines/scripts/rnaseq_deseq2.R` | ~220 | DESeq2 via Salmon + tximport |
| `backend/pipelines/scripts/rnaseq_deseq2_fc.R` | ~210 | DESeq2 from featureCounts matrix |
| `backend/tests/test_rnaseq_de_pipeline.py` | ~340 | 22 pipeline tests |
| `backend/tests/test_rnaseq_de_report.py` | ~300 | 8 report endpoint tests |

### Modified Files (5)
| File | Change |
|------|--------|
| `backend/pipelines/rnaseq_de.py` | Replace run() stub, enhance validate(), update mock_run(), add helpers, delegate methods |
| `backend/pipelines/methods_text.py` | Add rnaseq_de_methods() |
| `backend/schemas/qc_report.py` | Add RnaseqDEPlotInfo, RnaseqDEReport |
| `backend/services/qc_report_service.py` | Add 5 DE report functions + constant |
| `backend/routers/jobs.py` | Add 3 DE report endpoints + imports |

### Unchanged (no modifications needed)
- `backend/pipelines/__init__.py` — rnaseq_de already registered
- `backend/worker.py` — generic handler covers rnaseq_de
- `backend/services/auto_pipeline_service.py` — already queues DE correctly
- No new database migrations

---

## Test Coverage

| Test File | New | Total | Scope |
|-----------|-----|-------|-------|
| `test_rnaseq_de_pipeline.py` | **22** | 22 | Validation (12), mock_run (6), methods (3), tx2gene (1) |
| `test_rnaseq_de_report.py` | **8** | 8 | Report success, downloads, 404, 409, auth, significance |
| **Phase C.2-1 Total** | **30** | | |
| **All Phases Cumulative** | | **643** | |

All tests run inside Docker. `ruff check` + `ruff format --check`: clean. `npm run build`: clean.

---

## What's Next: Phase C.2-2 (Frontend)

Frontend wizard + tab + sub-panels for DESeq2 DE analysis. Separate AI session. Key components:
- `NewDeseq2Wizard.tsx` — 4-step wizard (Details → Choose Alignment → Assign Conditions → Settings)
- `DEAnalysisTab.tsx` — 5 sub-tabs (Info, Input, Results, Plots, Files)
- `DEResultsPanel.tsx` — Interactive gene table with search/filter/sort, significance coloring
- `DEPlotsPanel.tsx` — Plot grid with signed URLs (volcano, MA, PCA, distance, gene heatmap)
- Frontend API types, functions, hooks, constants
- ExperimentView + NewAnalysisDropdown + App.tsx + AnalysisQueuePage wiring
