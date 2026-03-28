# 2026-03-28 — Phase 6.2: Custom Reference-Point Heatmaps

## What Was Done

### Pipeline Module — `backend/pipelines/custom_heatmap.py`
`CustomHeatmapStage(PipelineStage)` porting the lab's `references/genomewide_plots/heatmaps.sh`. Real mode runs two deepTools commands matching the lab script exactly:
- `computeMatrix reference-point --referencePoint center -R <bed> -S <bigwigs> -a 1500 -b 1500`
- `plotHeatmap -m <matrix> --samplesLabel <labels> -out <output.png>`

User-configurable options layered on top: flanking distance (100–10000bp, default 1500), reference point (center/TSS/TES), sort order (descend/ascend/no/keep), color map (deepTools default or named matplotlib colormaps). SVG output added via second `plotHeatmap` call with `--plotFileFormat svg`. Mock mode creates stub PNG, SVG, gzipped matrix, BED copy, and log. 2-hour subprocess timeout.

### Backend API Layer
- **Schemas** (`schemas/qc_report.py`): `CustomHeatmapReport` and `CustomHeatmapPlotInfo` Pydantic models
- **Service** (`services/qc_report_service.py`): `get_custom_heatmap_report()` resolves plot PNG/SVG output IDs and matrix output ID from job outputs. `get_custom_heatmap_matrix_path()` for download.
- **Router** (`routers/jobs.py`): 2 endpoints — `GET /jobs/{id}/heatmap-report` (JSON), `GET /jobs/{id}/heatmap-report/download-matrix` (gzip)
- **BED Upload** (`routers/files.py`): `POST /experiments/{id}/upload-bed` — simple multipart upload (not tus), validates .bed extension, tab-delimited >= 3 columns, < 50MB
- **Registration** (`pipelines/__init__.py`): `"custom_heatmap": CustomHeatmapStage()` added to `_STAGES`
- **Methods text** (`pipelines/methods_text.py`): `custom_heatmap_methods()` generates manuscript-ready text

### Frontend — Wizard (4 new components)
4-step wizard following `NewDiffBindWizard` pattern:
- **Step 1 (Details)**: Name (30-char limit), notes, About panel
- **Step 2 (Choose Alignment)**: Radio list of completed alignment jobs
- **Step 3 (Samples & BED)**: BED source selector (from peak calling outputs or file upload), sample checkbox table with editable labels and up/down reordering arrows. Resolves bigWig paths from alignment job outputs via `useJobOutputs`.
- **Step 4 (Settings)**: Flanking distance inputs, reference point/sort order/color map dropdowns, summary preview

### Frontend — Results Tab (3 new components + tab page)
`CustomHeatmapTab` with 3 sub-tabs following `DiffBindTab` pattern:
- **Info**: Details/Methods Text/Notes three-card layout with copy and inline edit
- **Plot**: Single large heatmap image (PNG via signed URL), PNG/SVG/Matrix(.gz) download buttons
- **Files**: Category dropdown from `CUSTOM_HEATMAP_FILE_CATEGORIES`, checkbox-selectable file table

### Frontend Integration
- `NewAnalysisDropdown`: Added `onCustomHeatmapClick` prop + "Custom Heatmap" button
- `ExperimentView`: Added Heatmaps tab to sidebar, wizard state, dropdown callback
- `App.tsx`: Added `heatmaps/:jid` route
- `api/types.ts`: `CustomHeatmapReport`, `CustomHeatmapPlotInfo` interfaces
- `api/jobs.ts`: `getCustomHeatmapReport()`, `downloadHeatmapMatrix()`, `uploadBedFile()`
- `hooks/useJobs.ts`: `useCustomHeatmapReport()` hook
- `lib/constants.ts`: `CUSTOM_HEATMAP_FILE_CATEGORIES`, `HEATMAP_SORT_ORDERS`, `HEATMAP_COLOR_MAPS`, `HEATMAP_REFERENCE_POINTS`

### Tests — 18 passing

10 validation tests (valid params, missing fields, empty samples, flanking range, invalid sort/reference point, optional color map), 6 mock_run tests (output files, categories, heatmap PNG+SVG, profile PNG+SVG, gzip validity, file sizes), 2 methods text tests (default vs custom params).

### Pre-existing Issues Fixed
- `frontend/src/components/reactions/ReactionsEditor.tsx`: Wrapped `prefixList` fallback in `useMemo` to stabilize dependency
- `frontend/src/pages/experiment/FastqsTab.tsx`: Wrapped `fastqs` fallback in `useMemo` to stabilize dependency
- `frontend/src/pages/experiment/ReactionsTab.tsx`: Same `prefixList` fix as ReactionsEditor

## Decisions Made
- **BED upload as simple multipart** (not tus) — BED files are KB-sized, no need for chunked resumable uploads
- **Reference point default `center`** — matches lab's `heatmaps.sh`, distinct from alignment's built-in TSS heatmaps
- **SVG via second plotHeatmap call** — lab script only outputs PNG; we add SVG by running `plotHeatmap` twice with same matrix (cheap since matrix computation is the expensive step)
- **Matrix file preserved** as downloadable output — enables users to re-run `plotHeatmap` locally with different visualization params
- **Sample ordering controlled by user** — rather than auto-interleaving ctrl/mut like the lab script, the wizard gives full drag-to-reorder flexibility
- **Optional deepTools overrides** (sort order, color map, z-scale) only added to command when explicitly set by user — baseline matches lab script exactly with no extra flags
- **5 output file categories**: `custom_heatmap_plot` (PNG+SVG), `custom_heatmap_profile` (PNG+SVG), `custom_heatmap_matrix` (gz), `custom_heatmap_bed` (archival copy), `log`
- **Profile plots included**: `plotProfile --perGroup` runs on the same matrix as `plotHeatmap` to generate mean signal line plots — no extra computation cost, both rendered side-by-side in the Plots sub-tab

## Open Items

- **EC2 real-mode validation**: Real heatmap pipeline implemented but not yet tested with actual data. Requires deepTools (`computeMatrix`, `plotHeatmap`, `plotProfile`) in PATH (conda `deeptools_env` or `cleave-pipeline`).

## Key File Paths

### Backend
- `backend/pipelines/custom_heatmap.py` — CustomHeatmapStage pipeline module
- `backend/pipelines/methods_text.py` — `custom_heatmap_methods()` function
- `backend/schemas/qc_report.py` — `CustomHeatmapReport`, `CustomHeatmapPlotInfo` schemas
- `backend/services/qc_report_service.py` — Heatmap report parsing + matrix path resolution
- `backend/routers/jobs.py` — 2 heatmap endpoints
- `backend/routers/files.py` — BED upload endpoint
- `backend/tests/test_custom_heatmap_pipeline.py` — 17 tests

### Frontend
- `frontend/src/components/custom-heatmap/NewCustomHeatmapWizard.tsx` — 4-step wizard orchestrator
- `frontend/src/components/custom-heatmap/SelectSamplesStep.tsx` — BED source + sample picker
- `frontend/src/components/custom-heatmap/CustomHeatmapPlotsPanel.tsx` — Heatmap image viewer
- `frontend/src/components/custom-heatmap/CustomHeatmapFilesPanel.tsx` — File category browser
- `frontend/src/pages/experiment/CustomHeatmapTab.tsx` — Tab with Info/Plot/Files sub-tabs
