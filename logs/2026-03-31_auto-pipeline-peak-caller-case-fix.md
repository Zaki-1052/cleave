# Auto-Pipeline Peak Caller Case Mismatch Fix

**Date**: 2026-03-31

## What was done

Fixed a bug where the auto-pipeline failed at peak calling with `Unsupported peak caller: macs2`. Two issues:

1. **Case mismatch**: Auto-pipeline sent lowercase `"macs2"` but the peak calling validator expects uppercase `"MACS2"` (matching `PEAK_CALLERS = {"MACS2", "SICER2", "SEACR"}`). The individual peak calling wizard correctly used uppercase.
2. **Wrong default**: Auto-pipeline defaulted to MACS2 narrow, but the lab standard (and individual wizard default) is SEACR stringent with 0.01 threshold.

Additionally fixed two issues with the auto-pipeline banner retry button:

3. **Silent error swallowing**: Banner retry/cancel/dismiss handlers had empty `catch {}` blocks, so API errors were invisible to the user.
4. **Missing cache invalidation**: After a successful retry, only the experiment query was invalidated — not the jobs queries (`['jobs', experimentId]`, `['all-jobs']`), so the retried job wouldn't appear in the analysis queue until SSE pushed an update.
5. **Retry reuses old params**: `retry_auto_pipeline()` clones the failed job's params verbatim. Old jobs with lowercase `"macs2"` baked in would fail again on retry. Fixed by normalizing `peak_caller` to uppercase in the peak calling validator (`validate()`), so any case works.

### Files modified

- `backend/schemas/auto_pipeline.py` — Default `"macs2"/"narrow"` → `"SEACR"/"stringent"`
- `backend/services/auto_pipeline_service.py` — Default `"macs2"/"narrow"` → `"SEACR"/"stringent"`, added explicit `seacr_threshold: 0.01` param
- `backend/pipelines/peak_calling.py` — `validate()` now normalizes `peak_caller` to uppercase (fixes retry of old jobs with lowercase params)
- `frontend/src/components/experiments/AutoPipelineModal.tsx` — Default state `'macs2'/'narrow'` → `'SEACR'/'stringent'`
- `frontend/src/components/experiments/CreateExperimentWizard.tsx` — Default + reset state `'macs2'/'narrow'` → `'SEACR'/'stringent'`
- `frontend/src/components/experiments/AutoPipelineConfigPanel.tsx` — Option values changed from lowercase (`macs2-narrow`) to uppercase (`MACS2-narrow`); reordered SEACR first as lab default
- `frontend/src/components/experiments/AutoPipelineBanner.tsx` — Added toast feedback for retry/cancel/dismiss, added jobs query invalidation on retry, surfaced error messages instead of silently swallowing

## Decisions made

- Blacklist setting was already correct (`"both"` = lab + DAC) — no change needed
- SEACR stringent is now the default everywhere auto-pipeline touches peak calling, matching the individual wizard and lab consensus
- Case normalization done in `validate()` (not at retry creation) so it's a single fix point for any caller

## Open items

- None
