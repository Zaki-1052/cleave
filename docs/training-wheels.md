Everything passes. Here's a summary of all changes made:

## Implementation Complete

### Backend (5 files)

1. **`backend/models/project.py`** — Added `is_training` boolean column (default `False`)
2. **`backend/migrations/versions/d7a3f1b82e49_add_is_training_to_projects.py`** — New Alembic migration (12th)
3. **`backend/schemas/project.py`** — Added `is_training` to `ProjectRead` response schema
4. **`backend/services/project_service.py`** — `create_project()` now counts existing projects by creator; first project gets `is_training=True`
5. **`backend/routers/experiments.py`** — Auto-pipeline endpoint returns 403 for training projects

### Frontend (11 files, 1 new)

6. **`frontend/src/api/types.ts`** — Added `isTraining` to `Project` interface
7. **`frontend/src/components/ui/TrainingHint.tsx`** — **NEW** — Teal callout with lightbulb icon, conditionally rendered
8. **`frontend/src/pages/ExperimentView.tsx`** — Training banner, hidden auto-pipeline button, passes flag to all wizards + outlet context
9. **`frontend/src/pages/ProjectDetailPage.tsx`** — Passes `isTrainingProject` to `CreateExperimentWizard`
10. **`frontend/src/components/experiments/CreateExperimentWizard.tsx`** — Pipeline step excluded for training projects
11. **`frontend/src/components/alignment/NewAlignmentWizard.tsx`** — Clears `removeDuplicates`/`removeDacExclusion` to null, skips genome auto-detection, validates before submit
12. **`frontend/src/components/alignment/AlignmentSettingsStep.tsx`** — Indeterminate checkboxes with "(choose)" labels, 3 `TrainingHint` callouts, Advanced Settings forced open
13. **`frontend/src/components/peak-calling/NewPeakCallingWizard.tsx`** — Clears `peakCaller`/`peakSize`/`fragmentFilter`/`blacklist`, validates before submit
14. **`frontend/src/components/peak-calling/PeakCallingSettingsStep.tsx`** — Placeholder options on selects, 4 `TrainingHint` callouts, indeterminate fragment filter checkbox, Advanced Settings forced open
15. **`frontend/src/components/diffbind/NewDiffBindWizard.tsx`** — Clears `analysisMethod` default, validates before submit
16. **`frontend/src/components/diffbind/DiffBindSettingsStep.tsx`** — `TrainingHint` callout above method radio group, "(choose)" prompt when empty

### What users experience

**First-time user creating their first project:**
- Teal "Training Project" banner on every experiment view
- No "Run Full Pipeline" button, no Pipeline step in experiment creation wizard
- Alignment: must manually select reference genome (no auto-detection), must explicitly check/uncheck duplicate removal and DAC exclusion
- Peak calling: must choose peak caller, peak size, fragment filter, and blacklist — nothing pre-selected
- DiffBind: must choose analysis method — no default
- Educational hints explain the biology behind each parameter
- All advanced settings start expanded

**Subsequent projects:** Full defaults, auto-pipeline available, no hints — exactly as before.