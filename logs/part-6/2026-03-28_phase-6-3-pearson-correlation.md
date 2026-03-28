# 2026-03-28 — Phase 6.3: Pearson Correlation Matrices

## What Was Done

### Pipeline Scripts (2 new files)
Ported both lab reference scripts from `references/media_pearson_corr/` to `backend/pipelines/scripts/` with parameterization:
- **`pearson_matrix.R`**: rtracklayer-based bigWig → coverage matrix at 50bp resolution. Parameterized: genome selects chromosome set (mm10/hg38/hg19/dm6/sacCer3), optional mask BED, optional restrict BED. Core algorithm preserved verbatim from `peak_extractor.r`.
- **`pearson_heatmap.py`**: seaborn/matplotlib heatmap generator. Exact lab params: `figsize=(15,15)`, `cmap="Blues"`, `annot=True`, `annot_kws={"size":25}`, `fmt='.2f'`. Added SVG output and correlation CSV export beyond lab script.

### Pipeline Module — `backend/pipelines/pearson_correlation.py`
`PearsonCorrelationStage(PipelineStage)` orchestrating R→Python subprocess chain:
- Validation: ≥2 samples, valid genome, required fields, Rscript+python3 in PATH
- `run()`: writes sample sheet CSV → runs R script (4h timeout) → runs Python script (1h timeout) → collects outputs
- `mock_run()`: stub PNG/SVG, coverage CSV (20 rows × N cols), correlation CSV (N×N), sample sheet, log
- Output categories: `pearson_heatmap`, `pearson_matrix`, `pearson_correlation`, `pearson_sample_sheet`, `log`

### Backend API Layer
- **Schemas** (`schemas/qc_report.py`): `PearsonCorrelationPlotInfo` and `PearsonCorrelationReport` models
- **Service** (`services/qc_report_service.py`): `get_pearson_correlation_report()`, `get_pearson_correlation_matrix_path()`, `get_pearson_coverage_matrix_path()`
- **Router** (`routers/jobs.py`): 3 endpoints — `GET /jobs/{id}/pearson-report`, `GET /jobs/{id}/pearson-report/download-correlation`, `GET /jobs/{id}/pearson-report/download-coverage`
- **Registry** (`pipelines/__init__.py`): `"pearson_correlation": PearsonCorrelationStage()`
- **Methods text** (`pipelines/methods_text.py`): `pearson_correlation_methods()` with genome, masking, BED restriction info

### Frontend — Wizard (3 new components)
4-step wizard following `NewCustomHeatmapWizard` pattern:
- **Step 1 (Details)**: Name (30-char), notes, About panel explaining Pearson correlation
- **Step 2 (Choose Alignment)**: Radio list of completed alignment jobs
- **Step 3 (Select Samples)**: Checkbox table with editable labels, reordering arrows, auto-excludes IgG. Min 2 samples required.
- **Step 4 (Settings)**: Reference genome (read-only), optional BED restriction (from peak calling or upload), summary card

### Frontend — Results Tab (3 new components)
`PearsonCorrelationTab` with 3 sub-tabs following `CustomHeatmapTab` pattern:
- **Info**: Details/Methods Text/Notes cards
- **Plot**: Heatmap via signed URL, download buttons (PNG, SVG, Correlation CSV, Coverage CSV)
- **Files**: Category dropdown, checkbox-selectable file table

### Frontend Integration
- `NewAnalysisDropdown`: Added `onPearsonCorrelationClick` prop + "Correlation" button
- `ExperimentView`: Added Correlation tab, wizard state, dropdown callback
- `App.tsx`: Added `correlations/:jid` route
- `api/types.ts`: `PearsonCorrelationReport`, `PearsonCorrelationPlotInfo` interfaces
- `api/jobs.ts`: 3 API functions
- `hooks/useJobs.ts`: `usePearsonCorrelationReport()` hook
- `lib/constants.ts`: `PEARSON_CORRELATION_FILE_CATEGORIES`

### Tests — 19 passing
10 validation tests, 6 mock_run tests, 3 methods text tests.

## Decisions Made
- **Two-script approach preserved**: R (rtracklayer) + Python (seaborn) per mandatory reference compliance
- **Masking**: mm10 only (using existing `manual.mask.ultimate.bed`), skipped for other genomes
- **BED restriction optional**: Lab's `covgfk` was created but never written; default output is `covgf` (masked, unrestricted)
- **Minimum 2 samples** (correlation needs ≥2 columns)
- **SVG and correlation CSV added** beyond lab's PNG-only output
- **3 sub-tabs** (Info/Plot/Files) matching CustomHeatmapTab pattern

## Open Items
- **EC2 real-mode validation**: Requires R with rtracklayer + Python with seaborn/matplotlib/pandas installed

## Key File Paths

### Backend
- `backend/pipelines/scripts/pearson_matrix.R` — Parameterized R script
- `backend/pipelines/scripts/pearson_heatmap.py` — Parameterized Python script
- `backend/pipelines/pearson_correlation.py` — Pipeline module
- `backend/tests/test_pearson_correlation_pipeline.py` — 19 tests

### Frontend
- `frontend/src/components/pearson-correlation/NewPearsonCorrelationWizard.tsx`
- `frontend/src/components/pearson-correlation/PearsonSelectSamplesStep.tsx`
- `frontend/src/components/pearson-correlation/PearsonSettingsStep.tsx`
- `frontend/src/components/pearson-correlation/PearsonCorrelationPlotsPanel.tsx`
- `frontend/src/components/pearson-correlation/PearsonCorrelationFilesPanel.tsx`
- `frontend/src/pages/experiment/PearsonCorrelationTab.tsx`
