# Auto-Pipeline Peak Caller Case Mismatch Fix

**Date**: 2026-03-31

## What was done

Fixed a bug where the auto-pipeline failed at peak calling with `Unsupported peak caller: macs2`. Two issues:

1. **Case mismatch**: Auto-pipeline sent lowercase `"macs2"` but the peak calling validator expects uppercase `"MACS2"` (matching `PEAK_CALLERS = {"MACS2", "SICER2", "SEACR"}`). The individual peak calling wizard correctly used uppercase.
2. **Wrong default**: Auto-pipeline defaulted to MACS2 narrow, but the lab standard (and individual wizard default) is SEACR stringent with 0.01 threshold.

### Files modified

- `backend/schemas/auto_pipeline.py` — Default `"macs2"/"narrow"` → `"SEACR"/"stringent"`
- `backend/services/auto_pipeline_service.py` — Default `"macs2"/"narrow"` → `"SEACR"/"stringent"`, added explicit `seacr_threshold: 0.01` param
- `frontend/src/components/experiments/AutoPipelineModal.tsx` — Default state `'macs2'/'narrow'` → `'SEACR'/'stringent'`
- `frontend/src/components/experiments/CreateExperimentWizard.tsx` — Default + reset state `'macs2'/'narrow'` → `'SEACR'/'stringent'`
- `frontend/src/components/experiments/AutoPipelineConfigPanel.tsx` — Option values changed from lowercase (`macs2-narrow`) to uppercase (`MACS2-narrow`); reordered SEACR first as lab default

## Decisions made

- Blacklist setting was already correct (`"both"` = lab + DAC) — no change needed
- SEACR stringent is now the default everywhere auto-pipeline touches peak calling, matching the individual wizard and lab consensus

## Open items

- None — straightforward case/default fix
