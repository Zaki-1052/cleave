# 2026-03-29 — Roman Normalization Refactor + Auto-Pipeline Mode

## What was done

### Part A: Roman Normalization as Core Pipeline Step (Bug Fix)

- **Created** `frontend/src/lib/bigwig-utils.ts` — shared `resolveReactionBigwig()` utility supporting both `bigwig` and `normalization_bigwig` file categories
- **Created** `frontend/src/components/ui/ChooseBigWigSourceStep.tsx` — reusable wizard step for selecting bigWig source (normalization preferred, alignment fallback). Includes `useBigWigOutputs()` hook.
- **Refactored** `NewPearsonCorrelationWizard.tsx` — replaced "Choose Alignment" step with `ChooseBigWigSourceStep`. Now supports selecting normalization job outputs (rnorm bigWigs at 50bp) as preferred source, with alignment fallback + resolution warning.
- **Refactored** `NewCustomHeatmapWizard.tsx` — same pattern as Pearson wizard
- **Updated** `PearsonSelectSamplesStep.tsx` — accepts `fileCategory` prop, uses shared utility
- **Updated** `SelectSamplesStep.tsx` (custom heatmap) — same `fileCategory` prop pattern
- **Fixed** Pearson description text — removed misleading "-1 to +1" framing for non-negative genomic data
- Both wizards now pass `normalization_job_id` in job params when normalization source is selected

### Part B: Auto-Pipeline Mode (Full Pipeline Chain)

- **Migration** `1b988efe774f_add_auto_pipeline_columns.py` — adds `auto_pipeline`, `auto_pipeline_status`, `auto_pipeline_config` to experiments; `auto_pipeline` flag to analysis_jobs
- **Updated** `models/experiment.py` — 3 new columns
- **Updated** `models/analysis_job.py` — `auto_pipeline` boolean column
- **Updated** `schemas/experiment.py` — new fields in read schema
- **Updated** `schemas/job.py` — `auto_pipeline` in read schema
- **Created** `schemas/auto_pipeline.py` — `AutoPipelineConfig` schema with all step toggles
- **Created** `services/auto_pipeline_service.py` — full orchestration service with:
  - Sequential chaining: FastQC → Trimming → Alignment → Peak Calling → Normalization → DiffBind → Heatmaps → Pearson
  - DiffBind condition auto-detection (experimental_condition field + short_name patterns: ctrl/mut/wt/ko)
  - Auto-replicate numbering within conditions
  - Normalization skip for non-mouse, DiffBind skip if conditions undetectable
  - Cancellation (terminates queued jobs, preserves completed)
  - Error handling (pauses pipeline, sets status to error)
- **Updated** `worker.py` — added `on_job_complete` and `on_job_error` hooks for auto-pipeline jobs
- **Updated** `services/fastqc_service.py` — added `on_fastqc_complete` hook after FastQC finishes
- **Updated** `routers/experiments.py` — `POST /auto-pipeline` and `POST /auto-pipeline/cancel` endpoints
- **Created** `frontend/src/api/autoPipeline.ts` — `startAutoPipeline()` and `cancelAutoPipeline()` API functions
- **Updated** `frontend/src/api/types.ts` — added auto-pipeline fields to Experiment and AnalysisJob
- **Created** `AutoPipelineModal.tsx` — config modal with genome selector, peak caller options, and step toggles
- **Created** `AutoPipelineBanner.tsx` — step progress banner with color-coded step states
- **Updated** `ExperimentView.tsx` — integrated "Run Full Pipeline" button, modal, and banner

## Decisions made

- Auto-pipeline chains jobs sequentially (single-worker architecture) rather than attempting parallel execution
- DiffBind condition detection uses two tiers: explicit `experimental_condition` field first, then short_name pattern matching (ctrl/mut/wt/ko)
- Auto-pipeline uses `deseq2_consensus` method for DiffBind (no custom peakset needed)
- Custom heatmaps in auto-mode use the first BED output from peak calling
- BigWig source for downstream steps (heatmaps, Pearson) prefers rnorm bigWigs when available

## Open items

- `multiBigwigSummary` fallback for non-mouse Pearson correlation (planned in A5 but deferred — the wizard already shows alignment bigWigs as fallback)
- Frontend SSE integration for auto-pipeline status live updates (existing SSE works for individual job status)
- Auto-pipeline retry mechanism after error (user can manually retry the failed job)

## Key file paths

### New files
- `frontend/src/lib/bigwig-utils.ts`
- `frontend/src/components/ui/ChooseBigWigSourceStep.tsx`
- `frontend/src/components/experiments/AutoPipelineModal.tsx`
- `frontend/src/components/experiments/AutoPipelineBanner.tsx`
- `frontend/src/api/autoPipeline.ts`
- `backend/services/auto_pipeline_service.py`
- `backend/schemas/auto_pipeline.py`
- `backend/migrations/versions/1b988efe774f_add_auto_pipeline_columns.py`

### Modified files
- `frontend/src/pages/ExperimentView.tsx`
- `frontend/src/api/types.ts`
- `frontend/src/components/pearson-correlation/NewPearsonCorrelationWizard.tsx`
- `frontend/src/components/pearson-correlation/PearsonSelectSamplesStep.tsx`
- `frontend/src/components/custom-heatmap/NewCustomHeatmapWizard.tsx`
- `frontend/src/components/custom-heatmap/SelectSamplesStep.tsx`
- `backend/models/experiment.py`
- `backend/models/analysis_job.py`
- `backend/schemas/experiment.py`
- `backend/schemas/job.py`
- `backend/worker.py`
- `backend/services/fastqc_service.py`
- `backend/routers/experiments.py`
