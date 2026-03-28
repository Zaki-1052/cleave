# 2026-03-28 — Phase 6.1: DiffBind Differential Peak Analysis

## What Was Done

### Fixed R Scripts (3 new files)
Ported all three DiffBind R scripts from `references/DPA/` to `backend/pipelines/scripts/` with the 3 bugs documented in `cleave-spec-decisions.md` §4 fixed:
- **Bug 1**: Added missing `)` on `write.csv()` (diffbind.R line 88, diffbind_peaklist.R line 89)
- **Bug 2**: Fixed malformed `cat()`/`print()` completion message — added comma before `results_dir`, balanced parens
- **Bug 3**: Added `dev.off()` after each `png()` plot call before each `svg()` call (5 plot blocks in consensus/peaklist, 3 in edgeR — heatmaps remain commented out in edgeR variant per lab reference)

Scripts: `diffbind_consensus.R`, `diffbind_peaklist.R`, `diffbind_peaklist_edger.R`

### Pipeline Module — `backend/pipelines/diffbind.py`
`DiffBindStage(PipelineStage)` supporting 3 analysis modes:
- `deseq2_consensus` — consensus peakset, DESeq2 (default, from `diffbind.R`)
- `deseq2_peaklist` — custom peakset, DESeq2 (from `diffbind_peaklist.R`)
- `edger_peaklist` — custom peakset, edgeR + TMM normalization (from `diffbind_peaklist_edgeR.R`)

Validation enforces: >= 4 samples, >= 2 conditions, >= 2 replicates per condition, alphanumeric condition names, Rscript in PATH (real mode). `run()` writes DiffBind sample sheet CSV, executes Rscript subprocess, parses dynamic TSV column names. `mock_run()` creates stub files with dynamic `Conc_<condition>` columns matching actual condition values from params.

### Backend API Layer
- **Schemas** (`schemas/qc_report.py`): `DiffBindReport` and `DiffBindPlotInfo` Pydantic models. `results_preview` uses `list[dict[str, str | float]]` with dynamic keys — column names come from `dba.report()` based on sample sheet Condition values, never hardcoded.
- **Service** (`services/qc_report_service.py`): `get_diffbind_report()` parses TSV header for dynamic columns, reads first 100 rows, counts significant peaks at FDR < 0.05 and < 0.01, resolves plot output IDs by matching `diffbind_plot_*` categories. `get_diffbind_results_path()` and `get_diffbind_counts_path()` for file downloads.
- **Router** (`routers/jobs.py`): 3 new endpoints — `GET /jobs/{id}/diffbind-report` (JSON), `GET /jobs/{id}/diffbind-report/download-results` (TSV), `GET /jobs/{id}/diffbind-report/download-counts` (CSV).
- **Registry** (`pipelines/__init__.py`): `"diffbind": DiffBindStage()` added to `_STAGES` dict.
- **Methods text** (`pipelines/methods_text.py`): `diffbind_methods()` generates manuscript-ready text with engine (DESeq2/edgeR), peakset type, sample count, condition names.

### Frontend — Wizard (5 new components)
4-step wizard following `NewPeakCallingWizard` pattern:
- **Step 1 (Details)**: Name (30-char limit), notes, About panel explaining DiffBind
- **Step 2 (Choose Peak Calling)**: Radio table of completed peak calling jobs
- **Step 3 (Assign Conditions)**: Sample sheet builder — checkbox table with condition text input (autocomplete from entered values), auto-incrementing replicate numbers, indeterminate select-all, inline validation (>= 4 selected, >= 2 conditions, >= 2 reps each). Auto-excludes IgG reactions from initial selection.
- **Step 4 (Settings)**: Analysis method radio cards (DESeq2 Consensus / DESeq2 Custom / edgeR Custom), conditional BED file dropdown for custom peakset modes, condition summary table

Wizard resolves BAM paths from alignment job outputs (`unique_bam` category) and peak paths from peak calling job outputs (`bed` category) via `useJobOutputs`.

### Frontend — Results Tab (6 new components)
`DiffBindTab` with 5 sub-tabs following `PeakCallingTab` pattern:
- **Info**: Details/Methods Text (copy button)/Notes (editable) three-card layout
- **Input**: Sample sheet table (Short Name, Condition, Replicate, Peak Caller)
- **Results**: Summary cards (Total/Significant peaks), dynamic column DataTable built from `report.columnNames`, FDR color coding (green < 0.05, amber < 0.1, red >= 0.1), download buttons for TSV + CSV
- **Plots**: 2-column grid of plot cards (PCA, MA, Volcano, Heatmap Group, Heatmap Condition) rendered via signed URL images. Gracefully skips null plots (edgeR mode). PNG + SVG download links.
- **Files**: Category dropdown from `DIFFBIND_FILE_CATEGORIES`, checkbox-selectable file table with download

### Frontend Integration
- `NewAnalysisDropdown`: Added `onDiffBindClick` prop + "DiffBind" button
- `ExperimentView`: Added DiffBind tab to sidebar, wizard state, dropdown callback
- `App.tsx`: Added `diffbind/:jid` route
- `api/types.ts`: `DiffBindReport`, `DiffBindPlotInfo` interfaces
- `api/jobs.ts`: `getDiffBindReport()`, `downloadDiffBindResults()`, `downloadDiffBindCounts()`
- `hooks/useJobs.ts`: `useDiffBindReport()` hook
- `lib/constants.ts`: `DIFFBIND_ANALYSIS_METHODS`, `DIFFBIND_FILE_CATEGORIES`

### Tests — 21 passing
13 validation tests (valid params, missing fields, too few conditions/replicates, invalid method, peaklist requires peakset, unsafe condition names, edgeR mode), 6 mock_run tests (output files created, dynamic column names, edgeR skips heatmaps, columns JSON, sample sheet CSV format, output categories), 2 methods text tests (DESeq2 vs edgeR content).

### Pre-existing Issues Fixed
- `backend/pipelines/alignment.py`: 4 line-length violations (long `append_to_master_log` calls) — extracted `stderr_text` variable
- `backend/pipelines/base.py`: 1 line-length violation in `run_piped_cmd` — extracted `header` variable
- `backend/routers/fastq_files.py`: Import sort issue
- `backend/pipelines/alignment.py`: Extraneous `f` prefix on `f"PL:ILLUMINA"` string
- `frontend/src/components/alignment/AlignmentFilesPanel.tsx`: Removed unused `experimentId` from interface + caller
- `frontend/src/components/peak-calling/PeakCallingFilesPanel.tsx`: Same fix
- `frontend/src/pages/experiment/PeakCallingTab.tsx`: Removed unused `experimentId` prop from caller
- `frontend/src/pages/experiment/AlignmentTab.tsx`: Same fix

### Bugs Found and Fixed During Review
1. **BED file type mismatch**: `resolveReactionPeak` in wizard checked `o.fileType === 'bed'`, which would miss MACS2 `narrowPeak`/`broadPeak` outputs. Fixed to match only on `fileCategory === 'bed'`.
2. **Step 2 timing race**: Next button on peak calling selection step could be clicked before `useJob` resolved the job data, leading to empty conditions table. Fixed by adding `peakJobLoading` guard to `isNextDisabled`.

## Decisions Made
- **Ship fixed R scripts as static files** under `pipelines/scripts/` (same pattern as `SEACR_1.1.sh` under `pipelines/tools/`), not generated dynamically — complex R scripts are fragile to generate
- **Dependency chain**: DiffBind `parent_job_id` → peak calling → alignment. No schema changes. Wizard traverses `peakCallingJob.parentJobId` to reach alignment BAMs.
- **Dynamic column names**: Backend parses TSV header from `dba.report()`, sends `columnNames` array + `resultsPreview` as list of dicts with dynamic keys. Frontend builds DataTable columns from `columnNames` — never hardcodes `Conc_ctrl`/`Conc_mut`.
- **File categories**: 9 categories — `diffbind_results`, `normalized_counts`, `diffbind_plot_pca`, `diffbind_plot_ma`, `diffbind_plot_volcano`, `diffbind_plot_heatmap_group`, `diffbind_plot_heatmap_condition`, `diffbind_sample_sheet`, `log`
- **edgeR mode**: Heatmap plots remain commented out (matching lab reference). Frontend gracefully skips null plot outputs.
- **4-hour subprocess timeout** for real mode — DiffBind with many peaks can be slow

## Open Items
- **EC2 real-mode validation**: Real DiffBind pipeline implemented but not yet tested with actual data on EC2 instance. Requires R with DiffBind, tidyverse, rtracklayer, GenomicRanges installed (conda env spec at `references/conda_envs/conda_diffbind.yml`).
- **Custom peakset upload**: Currently only supports selecting a BED file from existing peak calling job outputs. User-uploaded BED files would require a separate upload flow — deferred.
- **Consensus peakset BED export**: The consensus peakset derived by `dba.count()` is not currently exported as a downloadable file. Could add `write.table(dba.peakset(dbObj), ...)` to the R script.

## Key File Paths

### Backend
- `backend/pipelines/scripts/diffbind_consensus.R` — Fixed consensus peakset R script
- `backend/pipelines/scripts/diffbind_peaklist.R` — Fixed custom peakset R script
- `backend/pipelines/scripts/diffbind_peaklist_edger.R` — Fixed edgeR variant R script
- `backend/pipelines/diffbind.py` — DiffBindStage pipeline module
- `backend/pipelines/methods_text.py` — `diffbind_methods()` function
- `backend/schemas/qc_report.py` — `DiffBindReport`, `DiffBindPlotInfo` schemas
- `backend/services/qc_report_service.py` — DiffBind report parsing + download path resolution
- `backend/routers/jobs.py` — 3 DiffBind endpoints
- `backend/tests/test_diffbind_pipeline.py` — 21 tests

### Frontend
- `frontend/src/components/diffbind/NewDiffBindWizard.tsx` — 4-step wizard orchestrator
- `frontend/src/components/diffbind/AssignConditionsStep.tsx` — Sample sheet builder (most complex new component)
- `frontend/src/components/diffbind/DiffBindResultsPanel.tsx` — Dynamic column results table
- `frontend/src/components/diffbind/DiffBindPlotsPanel.tsx` — Signed URL plot viewer
- `frontend/src/pages/experiment/DiffBindTab.tsx` — Tab with 5 sub-tabs
