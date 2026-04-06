# 2026-03-28 — Phase 6.4: Roman Normalization

## What Was Done

### Pipeline Script (1 new file)
Ported `references/media_normalization/normalization.r` to `backend/pipelines/scripts/roman_normalization.R` with parameterization. Core algorithm preserved verbatim: 50bp resolution bigWig import via rtracklayer, chromosome-wise reorganization (chr1-19 + chrX), coverage matrix construction, zero-coverage removal, masking via `manual.mask.ultimate.bed` (158 regions), 99th-percentile calculation, normalization factor computation (`nf = z/z[1]`), re-import and divide export to `*_rnorm.bw`. Added `normalization_factors.csv` output (SampleName, Percentile99, NormalizationFactor) beyond reference for transparency.

### Visualization Script (1 new file)
`backend/pipelines/scripts/roman_normalization_plot.py` — matplotlib/seaborn horizontal bar chart of per-sample normalization factors. Reference sample (first, NF=1.0) visually distinct. PNG (dpi=150) + SVG output. Follows `pearson_heatmap.py` pattern.

### Pipeline Module — `backend/pipelines/roman_normalization.py`
`RomanNormalizationStage(PipelineStage)` with mouse-only enforcement:
- `validate()`: Rejects all non-mm10 genomes with explicit error. Requires ≥2 samples, checks Rscript/python3 in PATH.
- `run()`: Writes sample sheet CSV (uses `short_name` for filename safety), runs R script (4h timeout), runs Python plot script (1h timeout), registers per-reaction `normalization_bigwig` outputs with `reaction_id` set.
- `mock_run()`: Creates stub `_rnorm.bw` files per sample, realistic factors CSV, stub PNG/SVG, log.

### Backend API Layer
- **Schemas** (`schemas/qc_report.py`): `NormalizationFactorEntry` and `RomanNormalizationReport` Pydantic models
- **Service** (`services/qc_report_service.py`): `get_roman_normalization_report()` parses factors CSV from disk, resolves plot output IDs. `get_roman_normalization_factors_path()` for download.
- **Router** (`routers/jobs.py`): 2 endpoints — `GET /jobs/{id}/normalization-report` (JSON), `GET /jobs/{id}/normalization-report/download-factors` (CSV)
- **Registry** (`pipelines/__init__.py`): `"roman_normalization": RomanNormalizationStage()` added to `_STAGES`
- **Methods text** (`pipelines/methods_text.py`): `roman_normalization_methods()` generates manuscript-ready text with genome, masking, sample count, reference sample

### Frontend — Wizard (3 new components)
4-step wizard following `NewPearsonCorrelationWizard` pattern:
- **Step 1 (Details)**: Name (30-char), notes, About panel explaining Roman normalization
- **Step 2 (Choose Alignment)**: Radio list filtered to **mm10 alignments only**. Shows "No completed mouse (mm10) alignment runs available" message if none exist.
- **Step 3 (Select Samples)**: Checkbox table + label edit + up/down reorder. Auto-excludes IgG. Blue info banner: "The first sample becomes the normalization reference (NF = 1.0)."
- **Step 4 (Settings)**: Read-only — Genome (mm10), Masking (Applied, 158 regions), Reference sample (first in list), sample labels summary

### Frontend — Results Tab (3 new components)
`NormalizationTab` with 3 sub-tabs following `PearsonCorrelationTab` pattern:
- **Info**: Details (includes Reference Sample row) / Methods Text (copy button) / Notes (editable)
- **Results**: Normalization factors DataTable (Sample Name, 99th Percentile, NF — reference row highlighted blue) + bar chart via signed URL + download buttons (PNG, SVG, Factors CSV)
- **Files**: Category dropdown from `NORMALIZATION_FILE_CATEGORIES`, checkbox-selectable file table

### Frontend Integration
- `NewAnalysisDropdown`: Added `onNormalizationClick` prop + "Normalization" button
- `ExperimentView`: Added Normalization tab to sidebar, wizard state, dropdown callback
- `App.tsx`: Added `normalization/:jid` route
- `api/types.ts`: `NormalizationFactorEntry`, `RomanNormalizationReport` interfaces
- `api/jobs.ts`: `getRomanNormalizationReport()`, `downloadNormalizationFactors()`
- `hooks/useJobs.ts`: `useRomanNormalizationReport()` hook
- `lib/constants.ts`: `NORMALIZATION_FILE_CATEGORIES`

### Tests — 19 passing
11 validation tests (valid params, missing fields, non-mouse genomes hg38/hg19/dm6, too few samples, missing sample fields, minimum 2 samples), 6 mock_run tests (output files created, categories present, per-reaction bigWigs with reaction_id, factors CSV columns/rows, file sizes positive, PNG+SVG), 2 methods text tests.

## Decisions Made
- **Mouse-only enforcement at two layers**: Frontend wizard filters alignment jobs to mm10 only; backend `validate()` rejects non-mm10 as hard error
- **`short_name` for R script SampleName**: Output bigWig filenames use `short_name` (safe for filesystem), `label` used for display in factors table
- **First sample = normalization reference**: Matches lab script behavior (`nf = z/z[1]`). Wizard makes this explicit with reorder arrows and info banner.
- **Per-reaction output tracking**: First Phase 6.x pipeline to set `reaction_id` on outputs (`normalization_bigwig` category)
- **"Results" sub-tab instead of "Plot"**: Shows factors table + visualization together, more informative than plot-only
- **Normalization factors CSV added beyond reference**: Not in lab script; added for transparency, manuscript methods, and Results table display
- **5 output categories**: `normalization_bigwig`, `normalization_factors`, `normalization_plot`, `normalization_sample_sheet`, `log`
- **4-hour R timeout**: bigWig I/O for many samples over full mouse genome is memory/time intensive

## Open Items
- **EC2 real-mode validation**: Real normalization pipeline implemented but not yet tested with actual data. Requires R with rtracklayer installed (conda `bwnorm` env on lab instance).

## Key File Paths

### Backend
- `backend/pipelines/scripts/roman_normalization.R` — Parameterized R script
- `backend/pipelines/scripts/roman_normalization_plot.py` — Bar chart visualization
- `backend/pipelines/roman_normalization.py` — Pipeline module
- `backend/tests/test_roman_normalization_pipeline.py` — 19 tests

### Frontend
- `frontend/src/components/normalization/NewNormalizationWizard.tsx` — 4-step wizard
- `frontend/src/components/normalization/NormalizationSelectSamplesStep.tsx` — Sample picker with reorder
- `frontend/src/components/normalization/NormalizationSettingsStep.tsx` — Read-only settings summary
- `frontend/src/components/normalization/NormalizationResultsPanel.tsx` — Factors table + bar chart
- `frontend/src/components/normalization/NormalizationFilesPanel.tsx` — File category browser
- `frontend/src/pages/experiment/NormalizationTab.tsx` — Tab with Info/Results/Files sub-tabs
