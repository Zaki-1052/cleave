# 2026-03-30 — Auto-Pipeline in Wizard + Cleanup Default + Race Fix

## What was done

### 1. Changed `CLEANUP_ENABLED` default to `False`
- **File**: `backend/config.py`
- Flipped default from `True` to `False` so nothing is auto-deleted out of the box
- Lab can opt in via `CLEANUP_ENABLED=true` in `.env`
- Only affected files were pipeline logs (30-day retention) and stale tus uploads (48h) — actual outputs (BAMs, bigWigs, BEDs, etc.) were never auto-deleted

### 2. Added auto-pipeline option to experiment creation wizard
- **Created**: `frontend/src/components/experiments/AutoPipelineConfigPanel.tsx` — extracted shared config UI (genome selector, peak caller, optional steps, pipeline summary) from AutoPipelineModal
- **Modified**: `frontend/src/components/experiments/AutoPipelineModal.tsx` — refactored to use extracted panel (DRY, ~60% less inline JSX)
- **Created**: `frontend/src/components/experiments/AutoPipelineStep.tsx` — new wizard Step 4 with toggle + config panel, auto-detects genome from reactions
- **Modified**: `frontend/src/components/experiments/CreateExperimentWizard.tsx` — added Step 4 ("Pipeline"), pipeline config state, `handleFinish()` calls `startAutoPipeline()`, footer shows "Create & Run Pipeline" when enabled

### 3. Fixed `on_fastqc_complete` race condition
- **File**: `backend/services/auto_pipeline_service.py`
- Added `all_have_fastqc` guard to `on_fastqc_complete()` matching the existing guard in `start_auto_pipeline()`
- Prevents premature adapter evaluation when some files still processing FastQC

## Decisions made
- Auto-pipeline toggle defaults to OFF in the wizard (backward compatible)
- If `startAutoPipeline()` API call fails on wizard completion, toast error shown but experiment still created — user can retry from ExperimentView
- No new API endpoints, schemas, or migrations needed — reuses existing `POST /experiments/{id}/auto-pipeline`

## Open items
- No FastQC quality threshold gate implemented (only adapter detection for conditional trimming exists) — could be added later if lab wants to block pipeline on low-quality scores

## Key file paths
- `backend/config.py` (cleanup default)
- `backend/services/auto_pipeline_service.py` (race fix)
- `frontend/src/components/experiments/AutoPipelineConfigPanel.tsx` (new)
- `frontend/src/components/experiments/AutoPipelineStep.tsx` (new)
- `frontend/src/components/experiments/AutoPipelineModal.tsx` (refactored)
- `frontend/src/components/experiments/CreateExperimentWizard.tsx` (step 4 added)
