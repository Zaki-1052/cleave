# 2026-04-01 — Training Wheels Mode for First-Time Users

## What was done

Added a "training wheels" mode that activates on the first project a user creates, forcing them to learn each bioinformatics parameter rather than relying on defaults.

### Backend
- Added `is_training` boolean column to `projects` table (Alembic migration `d7a3f1b82e49`)
- `create_project()` counts existing projects by creator; if 0, sets `is_training=True`
- Auto-pipeline endpoint (`POST /experiments/:id/auto-pipeline`) returns 403 for training projects
- `ProjectRead` schema includes `is_training` field

### Frontend
- New `TrainingHint` component (teal callout with Lightbulb icon) for educational hints
- `ExperimentView`: training banner, hidden auto-pipeline button, flag passed to all wizards + outlet context
- `CreateExperimentWizard`: Pipeline step excluded for training projects
- Alignment wizard: clears `removeDuplicates`/`removeDacExclusion` to null (indeterminate checkboxes), skips genome auto-detection, 3 educational hints
- Peak calling wizard: clears `peakCaller`/`peakSize`/`fragmentFilter`/`blacklist`, placeholder options on selects, 4 educational hints, Advanced Settings forced open
- DiffBind wizard: clears `analysisMethod` default, educational hint above radio group

### Landing Page
- Added IgG Control Background Subtraction and E. coli Spike-in Normalization to comparison table (both shared with CUTANA)
- Added Training Mode (First-Time Users) to comparison table (Cleave-only)
- Reordered table: shared features first, Cleave-only features second
- Updated stats counters: 20 pipeline capabilities, 10 new vs CUTANA, 12 phases

### In-App Documentation
- New docs page at `/docs/training-mode` in "Getting Started" section
- Covers: what changes, cleared defaults table, educational hints list, step-by-step walkthrough, training banner description
- Added `Lightbulb` icon to navigation entry

### Docs Updates
- Updated `CLAUDE.md`, `README.md`, `docs/SPEC.md`, `logs/MASTER-SUMMARY.md` with Phase 12 and `is_training` column

## Decisions made
- Flag lives on `Project` model (not `User`) — the specific project has training wheels
- Detection at creation time via count query (`Project.created_by == creator_id`)
- Cleared scientifically meaningful defaults (genome, peak caller, filters) but kept technical ones (bin sizes, thresholds)
- Backend guard on auto-pipeline endpoint as defense-in-depth
- Advanced Settings sections forced open in training mode so users see all parameters

## Open items
- No backend tests added for the training project flag (existing test infrastructure would need Docker)
- No training hints on custom heatmap, Pearson correlation, or Roman normalization wizards (these are advanced features less critical for learning)

## Key file paths
- `backend/models/project.py`, `backend/schemas/project.py`
- `backend/services/project_service.py`, `backend/routers/experiments.py`
- `backend/migrations/versions/d7a3f1b82e49_add_is_training_to_projects.py`
- `frontend/src/components/ui/TrainingHint.tsx` (new)
- `frontend/src/pages/ExperimentView.tsx`
- `frontend/src/components/experiments/CreateExperimentWizard.tsx`
- `frontend/src/components/alignment/NewAlignmentWizard.tsx`, `AlignmentSettingsStep.tsx`
- `frontend/src/components/peak-calling/NewPeakCallingWizard.tsx`, `PeakCallingSettingsStep.tsx`
- `frontend/src/components/diffbind/NewDiffBindWizard.tsx`, `DiffBindSettingsStep.tsx`
- `frontend/src/pages/LandingPage.tsx`
- `frontend/src/lib/docs-navigation.ts`, `docs-content.ts`
