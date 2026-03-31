# Plan: Roman Normalization Refactor + Auto-Pipeline Mode

## Context

Two related TODO items need implementation together:

1. **Bug fix**: Pearson correlation produces near-zero values (~0.01-0.35 instead of 0.75-0.95) because it receives 20bp alignment bigWigs while `pearson_matrix.R` assumes `dx=50`. The lab workflow runs Roman normalization first, producing 50bp `_rnorm.bw` files that Pearson and heatmaps should consume.

2. **Feature**: Auto-pipeline mode that chains ALL analysis steps automatically with sensible defaults: FastQC → Trimming → Alignment → Peak Calling → Roman Normalization → DiffBind → Custom Heatmaps → Pearson Correlation.

The normalization refactor establishes the correct pipeline flow, and the auto-pipeline builds on that flow.

---

## Part A: Roman Normalization as Core Pipeline Step

### A1. Shared BigWig Source Selection Component

**New file**: `frontend/src/components/ui/ChooseBigWigSourceStep.tsx`

A reusable step component for both Pearson and Heatmap wizards that replaces the current "Choose Alignment" step. It:
- Fetches all completed jobs for the experiment
- Groups them: normalization jobs (preferred) and alignment jobs (fallback)
- Shows normalization jobs first with a "Recommended" badge
- Shows alignment jobs with an info note: "These bigWig files are at 20bp resolution. Pearson will use deepTools multiBigwigSummary to re-bin at 50bp. For best results on mouse, run Roman Normalization first."
- When a normalization job is selected, resolves `_rnorm.bw` paths via `useJobOutputs(jobId, 'normalization_bigwig')`
- When an alignment job is selected, resolves raw bigWig paths via `useJobOutputs(jobId, 'bigwig')`
- Exports the selected job ID, the bigWig source type (`'normalization' | 'alignment'`), and resolved outputs

### A2. Shared BigWig Resolution Utility

**New file**: `frontend/src/lib/bigwig-utils.ts`

Extract `resolveReactionBigwig` (currently duplicated in 4 wizard files) into a shared utility:
```typescript
export function resolveReactionBigwig(
  reactionId: number,
  outputs: JobOutput[],
  fileCategory: 'bigwig' | 'normalization_bigwig' = 'bigwig',
): string
```

### A3. Refactor Pearson Correlation Wizard

**File**: `frontend/src/components/pearson-correlation/NewPearsonCorrelationWizard.tsx`

Changes:
- Replace the inline "Choose Alignment" step with `ChooseBigWigSourceStep`
- Add state: `bigwigSource: 'normalization' | 'alignment'`, `selectedNormalizationJobId`
- When normalization is selected:
  - `parent_job_id` → normalization job ID
  - `alignment_job_id` → extracted from normalization job's `params.alignment_job_id`
  - `normalization_job_id` → normalization job ID
  - Sample bigwig paths → `_rnorm.bw` from normalization outputs
- When alignment fallback is used:
  - Current behavior preserved
  - Show resolution warning banner in the step
- Update `PearsonSelectSamplesStep.tsx` to accept `fileCategory` prop for `resolveReactionBigwig`

### A4. Refactor Custom Heatmap Wizard

**File**: `frontend/src/components/custom-heatmap/NewCustomHeatmapWizard.tsx`

Same pattern as A3:
- Replace "Choose Alignment" step with `ChooseBigWigSourceStep`
- For heatmaps, the warning is softer (deepTools works with any resolution, but rnorm is preferred)
- Update `SelectSamplesStep.tsx` similarly

### A5. Backend — Pearson Fallback for Non-Mouse (multiBigwigSummary)

**File**: `backend/pipelines/pearson_correlation.py`

The current `pearson_matrix.R` hardcodes `dx=50` for bin mapping. Instead of modifying the R script, add a fallback path for non-mouse genomes (where Roman normalization is unavailable):

- Add `normalization_job_id` as an accepted optional param in `validate()`
- When `normalization_job_id` is absent (raw alignment bigWigs at 20bp), add a **pre-processing step** before the R script:
  - Run `deepTools multiBigwigSummary bins --binSize 50 -b <bigwigs> -o results.npz --outRawCounts coverage_matrix.tab`
  - This produces a properly-binned 50bp coverage matrix directly from any-resolution bigWigs
  - Pass this matrix to `pearson_heatmap.py` (Python-side correlation), bypassing `pearson_matrix.R` entirely
  - OR: rewrite the matrix CSV from the tab output to match the format `pearson_matrix.R` expects
- When `normalization_job_id` IS present (rnorm bigWigs at 50bp), use the existing R script path unchanged

This ensures Pearson works correctly for **all genomes** — mouse with rnorm, and human/fly/yeast with multiBigwigSummary fallback.

**File**: `backend/pipelines/custom_heatmap.py`
- Add `normalization_job_id` as accepted optional param in `validate()` (no run() changes needed — deepTools handles any resolution)

### A6. Fix Pearson Description Text

**File**: `frontend/src/components/pearson-correlation/NewPearsonCorrelationWizard.tsx` (line 237-239)

Change: `"producing a value from -1 to +1 for each sample pair"` → `"producing a correlation coefficient for each sample pair"` (non-negative genomic signal data won't produce negative correlations)

---

## Part B: Auto-Pipeline Mode

### B0. Full Pipeline Chain

Since the worker processes one job at a time, the auto-pipeline chains jobs sequentially. The complete chain with all analysis types:

```
FastQC (already auto)
  ↓
Trimming (if adapters detected)
  ↓
Alignment (all reactions, sensible defaults)
  ↓
Peak Calling (MACS2 narrow, q=0.01, IgG auto-assigned)
  ↓
Roman Normalization (mouse only — skip for non-mouse)
  ↓
DiffBind (if ≥2 conditions with ≥2 replicates each — skip if not enough conditions)
  ↓
Custom Heatmaps (using peak summits/BEDs from peak calling + rnorm bigWigs)
  ↓
Pearson Correlation (using rnorm bigWigs for mouse, alignment bigWigs otherwise)
  ↓
COMPLETE
```

### B1. Database Schema Changes

**New migration**: `backend/migrations/versions/xxxx_add_auto_pipeline.py`

Add to `experiments` table:
- `auto_pipeline` (Boolean, default False) — whether auto mode was ever enabled
- `auto_pipeline_status` (String, nullable) — `null | 'pending_fastqc' | 'running' | 'complete' | 'cancelled' | 'error'`
- `auto_pipeline_config` (JSON, nullable) — stores user choices at launch

Add to `analysis_jobs` table:
- `auto_pipeline` (Boolean, default False) — flags jobs created by auto-pipeline vs manual

### B2. Update Models

**File**: `backend/models/experiment.py` — add 3 new columns
**File**: `backend/models/analysis_job.py` — add 1 new column
**File**: `backend/schemas/experiment.py` — add fields to read schema
**File**: `backend/schemas/job.py` — add `auto_pipeline` to read schema

### B3. Auto-Pipeline Orchestrator Service

**New file**: `backend/services/auto_pipeline_service.py`

Core functions:

```
start_auto_pipeline(db, experiment_id, user_id, config)
  → Sets experiment.auto_pipeline_status = 'pending_fastqc'
  → If FastQC already complete, immediately evaluates and queues first step

on_fastqc_complete(experiment_id, fastqc_results)
  → Called by fastqc_service after all files processed
  → Checks adapter_status on all raw FASTQs
  → If adapters detected → queue trimming job (auto_pipeline=True)
  → If no adapters → queue alignment job directly
  → Sets auto_pipeline_status = 'running'

on_job_complete(experiment_id, job_id, job_type)
  → Called by worker after any auto_pipeline job succeeds
  → Chaining logic (sequential, one at a time):

    trimming → queue alignment

    alignment → queue peak_calling

    peak_calling →
      if mouse: queue roman_normalization
      else: queue diffbind (if conditions exist), then heatmap, then pearson

    roman_normalization →
      queue diffbind (if conditions exist)
      OR queue custom_heatmap (if no diffbind possible)

    diffbind → queue custom_heatmap

    custom_heatmap → queue pearson_correlation

    pearson_correlation → set auto_pipeline_status = 'complete'

on_job_error(experiment_id, job_id, job_type)
  → Sets auto_pipeline_status = 'error'
  → Creates notification: "Auto-pipeline paused: {job_type} failed"

cancel_auto_pipeline(db, experiment_id, user_id)
  → Sets auto_pipeline_status = 'cancelled'
  → Terminates all queued auto_pipeline jobs for this experiment
  → Running jobs continue to completion
```

### B3a. Auto-Pipeline Default Parameters per Step

Each `_queue_*` helper creates a real `AnalysisJob` with `auto_pipeline=True` and these defaults:

**Trimming**: Standard defaults (Trimmomatic ILLUMINACLIP 2:15:4:4:true, LEADING 20, TRAILING 20, SLIDINGWINDOW 4:15, MINLEN 25, kseq 42bp)

**Alignment**: remove dups ON, remove DAC ON, bin sizes 20/100, all reactions (including IgG)

**Peak Calling**: MACS2 narrow, q=0.01, fragment filter ON (<120bp), IgG auto-assigned as control for all non-IgG reactions. IgG reaction identified by `short_name` containing "igg" (case-insensitive).

**Roman Normalization** (mouse only): all non-IgG reactions, bigwig paths resolved from alignment job outputs

**DiffBind** (conditional):
- Auto-detect conditions using a two-tier approach:
  1. **First**: check `reaction.experimental_condition` field (explicit metadata)
  2. **Fallback**: parse `reaction.short_name` for common lab naming patterns:
     - Contains "ctrl" (case-insensitive) → condition = "ctrl"
     - Contains "mut" (case-insensitive) → condition = "mut"
     - Contains "wt" or "wildtype" → condition = "ctrl"
     - Contains "ko" or "knockout" → condition = "mut"
     - IgG reactions excluded from DiffBind regardless
- If ≥2 distinct conditions with ≥2 non-IgG reactions each → can run DiffBind
- Auto-assign replicate numbers: within each condition, number reactions sequentially (1, 2, 3...)
- Use `deseq2_consensus` method (no custom peakset needed)
- Resolve BAM paths from alignment outputs (`unique_bam`), BED paths from peak calling outputs (`bed`)
- **Skip with a note** if conditions can't be determined (e.g., all reactions have same condition or unrecognizable names)

**Custom Heatmaps**:
- BED source: first BED/narrowPeak/broadPeak output from peak calling (auto-select)
- Use rnorm bigWigs if available (mouse), else alignment bigWigs
- Default settings: 1500bp flanking upstream/downstream, `center` reference point, `descend` sort order
- All non-IgG reactions included

**Pearson Correlation**:
- Use rnorm bigWigs if available (mouse), else alignment bigWigs with `multiBigwigSummary` fallback (re-bins at 50bp)
- All non-IgG reactions
- No restrict BED (genome-wide)

### B4. Worker Hooks

**File**: `backend/worker.py`

After the `final_status = "complete"` block (~line 278, after output persistence):
```python
if final_status == "complete" and is_auto_pipeline_job:
    await auto_pipeline_service.on_job_complete(experiment_id, job_id, job_type)
```

After the error handler (~line 318):
```python
if is_auto_pipeline_job:
    await auto_pipeline_service.on_job_error(experiment_id, job_id, job_type)
```

The `is_auto_pipeline_job` flag comes from the job's `auto_pipeline` column, fetched when the worker picks up the job.

### B5. FastQC Service Hook

**File**: `backend/services/fastqc_service.py`

After all FastQC files processed, check if experiment has `auto_pipeline_status == 'pending_fastqc'`:
```python
await auto_pipeline_service.on_fastqc_complete(experiment_id, fastqc_inputs)
```

### B6. API Endpoints

**File**: `backend/routers/experiments.py`

```
POST /experiments/{id}/auto-pipeline        → start auto-pipeline
POST /experiments/{id}/auto-pipeline/cancel  → cancel auto-pipeline
GET  /experiments/{id}/auto-pipeline/status  → get current auto-pipeline state + step progress
```

**New file**: `backend/schemas/auto_pipeline.py`
```python
class AutoPipelineConfig(CamelModel):
    reference_genome: str
    peak_caller: str = "macs2"
    peak_size: str = "narrow"
    macs2_qvalue: float = 0.01
    fragment_filter: bool = True
    include_normalization: bool = True   # only applies to mouse, auto-detected
    include_diffbind: bool = True        # auto-skips if conditions not assignable
    include_heatmap: bool = True
    include_pearson: bool = True
```

### B7. Frontend — Auto-Pipeline Button & Modal

**New file**: `frontend/src/components/experiments/AutoPipelineModal.tsx`

A configuration modal with:
- Reference genome selector (auto-detected from reactions)
- Peak caller selector (MACS2 narrow default, with SEACR/SICER2/broad options)
- Checkboxes for optional steps:
  - "Run Roman Normalization" (auto-checked for mouse, disabled+unchecked for non-mouse)
  - "Run DiffBind" (auto-checked if conditions detectable, shows note about auto-detection)
  - "Run Custom Heatmaps" (auto-checked, uses peak calling BEDs)
  - "Run Pearson Correlation" (auto-checked)
- Summary showing the full pipeline chain that will execute
- "Start Full Pipeline" button

### B8. Frontend — Auto-Pipeline Status Banner

**New file**: `frontend/src/components/experiments/AutoPipelineBanner.tsx`

Shown at top of ExperimentView when `experiment.autoPipelineStatus` is non-null:
- Step progress indicator with all 8 possible steps (FastQC, Trimming, Alignment, Peak Calling, Normalization, DiffBind, Heatmaps, Pearson)
- Each step shows: completed (check), active/running (spinner), pending (dot), skipped (dash), error (x)
- Derives state from `useJobs()` filtering by `autoPipeline === true`
- "Cancel" button when status is `running`
- Shows error state with the failed step name when `status === 'error'`

### B9. Frontend — Integration

**File**: `frontend/src/pages/ExperimentView.tsx`
- Add "Run Full Pipeline" button next to "New Analysis" dropdown
- Render `AutoPipelineModal` and `AutoPipelineBanner`
- Button visible when: experiment has reactions + FASTQs, no active auto-pipeline

**File**: `frontend/src/api/types.ts`
- Add `autoPipeline`, `autoPipelineStatus`, `autoPipelineConfig` to `Experiment`
- Add `autoPipeline` to `AnalysisJob`

**New file**: `frontend/src/api/autoPipeline.ts`
- `startAutoPipeline(experimentId, config)`
- `cancelAutoPipeline(experimentId)`

---

## Implementation Order

### Phase 1: Normalization Refactor (bug fix, priority 1)
1. **A2** — `bigwig-utils.ts` (shared utility)
2. **A1** — `ChooseBigWigSourceStep.tsx` (shared component)
3. **A3** — Refactor Pearson wizard
4. **A4** — Refactor Heatmap wizard
5. **A5** — Backend validation updates
6. **A6** — Fix Pearson description text

### Phase 2: Auto-Pipeline (additive feature)
7. **B1** — Migration (auto-pipeline schema)
8. **B2** — Model + schema updates
9. **B3** — Auto-pipeline service (the core logic, biggest piece)
10. **B4** — Worker hooks
11. **B5** — FastQC service hook
12. **B6** — API endpoints
13. **B7** — Auto-pipeline modal
14. **B8** — Auto-pipeline banner
15. **B9** — ExperimentView integration

## Key Files to Modify

| File | Change |
|------|--------|
| `frontend/src/lib/bigwig-utils.ts` | NEW — shared bigwig resolution |
| `frontend/src/components/ui/ChooseBigWigSourceStep.tsx` | NEW — shared bigwig source selector |
| `frontend/src/components/pearson-correlation/NewPearsonCorrelationWizard.tsx` | Replace alignment step with bigwig source step |
| `frontend/src/components/pearson-correlation/PearsonSelectSamplesStep.tsx` | Accept fileCategory prop |
| `frontend/src/components/custom-heatmap/NewCustomHeatmapWizard.tsx` | Replace alignment step with bigwig source step |
| `frontend/src/components/custom-heatmap/SelectSamplesStep.tsx` | Accept fileCategory prop |
| `backend/pipelines/pearson_correlation.py` | Accept normalization_job_id + add multiBigwigSummary fallback for non-rnorm bigWigs |
| `backend/pipelines/custom_heatmap.py` | Accept optional normalization_job_id |
| `backend/models/experiment.py` | Add auto_pipeline columns |
| `backend/models/analysis_job.py` | Add auto_pipeline flag |
| `backend/schemas/experiment.py` | Add auto_pipeline fields to read schema |
| `backend/schemas/job.py` | Add auto_pipeline to read schema |
| `backend/worker.py` | Add auto-pipeline hooks after job completion/error |
| `backend/services/fastqc_service.py` | Add auto-pipeline hook after FastQC |
| `backend/services/auto_pipeline_service.py` | NEW — full orchestration logic for all 8 steps |
| `backend/schemas/auto_pipeline.py` | NEW — config schema |
| `backend/routers/experiments.py` | Add auto-pipeline endpoints |
| `frontend/src/pages/ExperimentView.tsx` | Add auto-pipeline button + banner |
| `frontend/src/components/experiments/AutoPipelineModal.tsx` | NEW — config modal with all step toggles |
| `frontend/src/components/experiments/AutoPipelineBanner.tsx` | NEW — 8-step progress banner |
| `frontend/src/api/autoPipeline.ts` | NEW — API calls |
| `frontend/src/api/types.ts` | Add new fields |

## Verification

**Part A (normalization refactor):**
1. Create a normalization job (mock mode)
2. Open Pearson wizard → normalization job appears as preferred bigwig source
3. Select it → samples resolve with `_rnorm.bw` paths
4. Submit → job params include `normalization_job_id` and rnorm bigwig paths
5. Open Pearson wizard with no normalization → alignment jobs shown with resolution warning
6. Same flow for custom heatmap wizard

**Part B (auto-pipeline — all steps):**
1. Create experiment with reactions that have `experimental_condition` set (e.g., "ctrl", "mut") + FASTQs
2. Click "Run Full Pipeline" → config modal shows all toggles, auto-detects mouse genome
3. Start → `auto_pipeline_status` set, FastQC hook fires
4. Mock mode: verify complete chain:
   - FastQC completes → adapters detected? → trimming (or skip)
   - Trimming → alignment
   - Alignment → peak calling
   - Peak calling → normalization (mouse)
   - Normalization → DiffBind (conditions detected from reactions)
   - DiffBind → custom heatmap (using peak BEDs + rnorm bigWigs)
   - Custom heatmap → Pearson (using rnorm bigWigs)
   - Pearson → auto_pipeline_status = 'complete'
5. Test skip paths:
   - Non-mouse genome: normalization skipped, Pearson uses `multiBigwigSummary` fallback at 50bp
   - No conditions on reactions: DiffBind skipped, chain continues to heatmap
   - Reactions named "K4me3_ctrl1", "K4me3_mut1" etc: DiffBind auto-detects ctrl/mut from short_name
   - User unchecks optional steps in modal: those steps skipped in chain
6. Cancel mid-pipeline → queued jobs terminated, completed preserved
7. Error handling: fail a step → status shows 'error', notification sent
