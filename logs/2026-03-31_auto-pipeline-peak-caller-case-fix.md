# Auto-Pipeline Fixes: Peak Caller, Retry, Error Visibility, Queue Navigation

**Date**: 2026-03-31

## What was done

### 1. Peak caller case mismatch + wrong default

Auto-pipeline failed at peak calling with `Unsupported peak caller: macs2`:

- **Case mismatch**: Auto-pipeline sent lowercase `"macs2"` but validator expects uppercase `"MACS2"`. Individual wizard was correct.
- **Wrong default**: Defaulted to MACS2 narrow instead of lab standard SEACR stringent (0.01).
- **Retry fix**: `validate()` now normalizes `peak_caller` to uppercase, so old jobs with baked-in lowercase params work on retry.

### 2. Auto-pipeline banner retry issues

- **Silent error swallowing**: Retry/cancel/dismiss handlers had empty `catch {}` blocks — errors invisible to user. Added toast feedback for all actions.
- **Missing cache invalidation**: After retry, only experiment query was invalidated — not `['jobs', experimentId]` or `['all-jobs']`. Retried job wouldn't appear in queue until SSE update.

### 3. Analysis queue not navigable

- Queue rows weren't clickable — no way to navigate from a job in the queue to its experiment tab to see error details.
- Added `onRowClick` prop to `DataTable` component. Queue rows now navigate to `/experiments/:id/<tab>/:jobId`.
- Job type filter was missing 4 types (normalization, diffbind, heatmap, pearson). Added all 7.

### 4. Missing error details on 3 lab extension tabs

Normalization, Custom Heatmap, and Pearson Correlation Info panels had no `JobErrorDetails` or `JobActions` components — so errored jobs showed "Error" badge but no error message, no log viewer, and no Terminate/Retry buttons. Added both to all three.

### Files modified

- `backend/schemas/auto_pipeline.py` — Default `"macs2"/"narrow"` → `"SEACR"/"stringent"`
- `backend/services/auto_pipeline_service.py` — Default `"macs2"/"narrow"` → `"SEACR"/"stringent"`, added explicit `seacr_threshold: 0.01`
- `backend/pipelines/peak_calling.py` — `validate()` normalizes `peak_caller` to uppercase
- `frontend/src/components/experiments/AutoPipelineModal.tsx` — Default `'SEACR'/'stringent'`
- `frontend/src/components/experiments/CreateExperimentWizard.tsx` — Default + reset `'SEACR'/'stringent'`
- `frontend/src/components/experiments/AutoPipelineConfigPanel.tsx` — Uppercase option values, SEACR first
- `frontend/src/components/experiments/AutoPipelineBanner.tsx` — Toast feedback, jobs query invalidation on retry
- `frontend/src/components/ui/DataTable.tsx` — Added `onRowClick` prop
- `frontend/src/pages/AnalysisQueuePage.tsx` — Clickable rows navigate to job tab, all 7 job types in filter
- `frontend/src/pages/experiment/NormalizationTab.tsx` — Added `JobActions` + `JobErrorDetails`
- `frontend/src/pages/experiment/CustomHeatmapTab.tsx` — Added `JobActions` + `JobErrorDetails`
- `frontend/src/pages/experiment/PearsonCorrelationTab.tsx` — Added `JobActions` + `JobErrorDetails`

## Decisions made

- Blacklist was already correct (`"both"` = lab + DAC)
- Case normalization in `validate()` (single fix point) rather than at retry creation
- `onRowClick` added to shared `DataTable` rather than custom queue-only table
- SEACR stringent is default everywhere, matching individual wizard and lab consensus

## Open items

- Normalization is failing during auto-pipeline — error message now visible but root cause TBD
