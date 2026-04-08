# Phase A.2 — Conditional Sidebar + Analysis Dropdown

**Date**: 2026-04-07

## What was done

- Split `ExperimentView.tsx` sidebar `TABS` into `CUTANDRUN_TABS` (12 tabs) and `RNASEQ_TABS` (10 tabs), selected by `experiment.assayType`
- RNA-seq sidebar: Description, FASTQs, Reactions, Trimming, Alignment, DE Analysis, QC Dashboard, Pathway, History, All Files
- Hidden for RNA-seq: Peak Calling, DiffBind, Normalization, Heatmaps, Correlation tabs
- Added `assayType` prop to `NewAnalysisDropdown` — RNA-seq shows 5 disabled items (Alignment STAR, featureCounts, DE Analysis, QC Dashboard, Pathway); CUT&RUN shows existing 6
- Hidden auto-pipeline button, banner, and all CUT&RUN wizard modals for RNA-seq experiments
- Split `ReactionsEditor` optional columns into `CUTANDRUN_OPTIONAL_COLUMNS` (12) and `RNASEQ_OPTIONAL_COLUMNS` (8: treatment, timepoint, genotype, replicateNumber + shared cell/sample fields)
- Updated `ReactionFormModal`: hides CUTANA spike-in and E.coli spike-in sections for RNA-seq; shows treatment/timepoint/genotype/replicateNumber in "More Fields"; `buildPayload()` sends defaults for hidden CUT&RUN fields
- Added placeholder routes in `App.tsx` for `de/:jid`, `rnaseq-qc/:jid`, `pathway/:jid`
- Created `PlaceholderTab.tsx` component for future RNA-seq tab pages
- Hidden Pipeline step (step 4) in `CreateExperimentWizard` for RNA-seq experiments
- Added RNA-seq job type labels to `JOB_TYPE_LABELS` in ExperimentView

## Decisions made

- RNA-seq analysis dropdown items are all `disabled` since their wizard components don't exist yet (Phase B/C) — will be wired up as each phase lands
- Auto-pipeline button and banner hidden for RNA-seq (RNA-seq auto-pipeline is Phase B)
- CUT&RUN wizard modals wrapped in `{!isRnaseq && (...)}` to avoid unnecessary renders
- Placeholder routes use a shared `PlaceholderTab` component rather than per-tab placeholder files
- RNA-seq optional columns include shared fields (cellType, cellNumber, samplePrep, experimentalCondition) alongside RNA-seq-specific fields
- `replicateNumber` rendered as `type="number"` input with `min="1"`, parsed to int in payload

## Open items

- Phase A.3: fastp trimming pipeline stage (`backend/pipelines/rnaseq_trimming.py`)
- Phase A.4: Frontend RNA-seq trimming tab
- Phase A.5: Tests for RNA-seq trimming + schema
- Phase B: STAR+Salmon alignment, RNA-seq QC report, auto-pipeline, enable dropdown items
- Phase C: DESeq2, featureCounts, RSeQC+MultiQC, clusterProfiler pathway

## Key file paths

- `frontend/src/pages/ExperimentView.tsx` — split TABS, conditional sidebar + wizards
- `frontend/src/components/experiments/NewAnalysisDropdown.tsx` — assayType-aware menu
- `frontend/src/components/reactions/ReactionsEditor.tsx` — split optional columns
- `frontend/src/components/reactions/ReactionFormModal.tsx` — RNA-seq form fields
- `frontend/src/App.tsx` — 3 new placeholder routes
- `frontend/src/pages/experiment/PlaceholderTab.tsx` — new shared placeholder component
- `frontend/src/components/experiments/CreateExperimentWizard.tsx` — Pipeline step hidden for RNA-seq
