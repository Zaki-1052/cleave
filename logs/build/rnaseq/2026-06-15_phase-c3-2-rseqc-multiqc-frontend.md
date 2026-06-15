# Phase C.3-2 — RSeQC + MultiQC QC Dashboard Frontend

> 1 session on 2026-06-15. Phase C.3-2 is **complete**. 0 new tests (frontend only). `npm run build`: clean.

---

## What Was Built

### Auto-Pipeline Frontend Updates (Step 9)
- Added `includeQc?: boolean` to `AutoPipelineConfig` interface in `autoPipeline.ts`.
- Extended `RnaseqConfigPanel` in `AutoPipelineConfigPanel.tsx` with QC Dashboard toggle checkbox and pipeline summary step.
- Added `includeQc` state (default `true`) to `AutoPipelineModal.tsx`, packaged into RNA-seq config.
- Added `includeQc` state to `AutoPipelineStep.tsx` (experiment creation wizard consumer).
- Added `includeQc: true` to hardcoded RNA-seq config in `CreateExperimentWizard.tsx`.
- Updated `AutoPipelineBanner.tsx`: `rnaseq_qc` at step order 3 (DE shifted to 4), label "QC Dashboard", conditional visibility via `config.include_qc`.

### Frontend API Layer (Step 10)
- Added `RSeQCReactionMetrics` (13 fields) and `RnaseqQCDashboardReport` interfaces to `types.ts`.
- Added `getRnaseqQCDashboardReport()` and `downloadRnaseqQCDashboardCsv()` to `jobs.ts`.
- Added `useRnaseqQCDashboardReport()` hook to `useJobs.ts` (separate from alignment's `useRnaseqQCReport`).
- Added `RNASEQ_QC_FILE_CATEGORIES` constant (8 categories) to `constants.ts`.

### Frontend Wizard (Step 11)
- Created `NewRnaseqQCWizard.tsx` — 2-step wizard following `NewFeatureCountsWizard` pattern:
  - Step 0: Name, notes, "About RSeQC + MultiQC" educational card, alignment job radio selector.
  - Step 1: Review — reference genome, reactions table with BAM filenames, summary.
  - Submits `rnaseq_qc` job with `parentJobId` set to selected alignment.

### Frontend Tab + Panels (Step 12)
- Created `RnaseqQCTab.tsx` — job selector + 3 sub-tabs (Overview, Per-Sample, Files). Reuses `AlignmentInfoPanel` for job info/methods text/notes section. Status-gated panels.
- Created `QCOverviewPanel.tsx` — MultiQC HTML iframe viewer with signed URL fetching, `sandbox="allow-same-origin allow-scripts"`, fullscreen toggle, download button.
- Created `QCPerSamplePanel.tsx` — DataTable with 11 columns (strandedness badge, sense/antisense %, read distribution counts, coverage skewness, inner distance mean). CSV download.
- Created `QCFilesPanel.tsx` — category dropdown (8 categories), checkbox DataTable, single/batch download. Follows `DEFilesPanel` pattern exactly.

### Integration Wiring (Step 13)
- `App.tsx`: Replaced `PlaceholderTab` with `RnaseqQCTab` at `rnaseq-qc/:jid` route.
- `ExperimentView.tsx`: Added wizard state, dropdown wiring, wizard render in RNA-seq block.
- `NewAnalysisDropdown.tsx`: Added `onRnaseqQCClick` prop, enabled QC Dashboard menu item.
- `AnalysisQueuePage.tsx`: Added `rnaseq_qc` to job type filter + tab mapping.

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tab structure | 3 sub-tabs + info section above | C.3 plan specifies Overview/Per-Sample/Files; info at top matches simpler FeatureCountsTab pattern |
| MultiQC iframe | `allow-same-origin allow-scripts` sandbox | MultiQC HTML contains interactive JavaScript charts (same as fastp reports) |
| Info panel | Reuse `AlignmentInfoPanel` | Generic enough (methods text, notes, JobActions, JobErrorDetails) — no new panel needed |
| Files panel | Own component, not shared | Uses `RNASEQ_QC_FILE_CATEGORIES` (8 categories specific to RSeQC outputs) |
| Auto-pipeline default | `includeQc: true` | Matches backend `config.get("include_qc", True)` default |
| QC step order | 3 (between alignment=2 and DE=4) | Matches backend auto-pipeline chain: alignment → QC → DE |

---

## Files Summary

### New Files (5)
| File | Lines | Description |
|------|-------|-------------|
| `frontend/src/components/rnaseq-qc/NewRnaseqQCWizard.tsx` | ~260 | 2-step wizard (Details + Alignment → Review) |
| `frontend/src/pages/experiment/RnaseqQCTab.tsx` | ~130 | Tab page with 3 sub-tabs |
| `frontend/src/components/rnaseq-qc/QCOverviewPanel.tsx` | ~115 | MultiQC HTML iframe viewer |
| `frontend/src/components/rnaseq-qc/QCPerSamplePanel.tsx` | ~165 | RSeQC metrics DataTable |
| `frontend/src/components/rnaseq-qc/QCFilesPanel.tsx` | ~145 | File download panel |

### Modified Files (13)
| File | Change |
|------|--------|
| `frontend/src/api/autoPipeline.ts` | Add `includeQc` field to config interface |
| `frontend/src/api/types.ts` | Add `RSeQCReactionMetrics`, `RnaseqQCDashboardReport` interfaces |
| `frontend/src/api/jobs.ts` | Add 2 API functions (report JSON + CSV download) |
| `frontend/src/hooks/useJobs.ts` | Add `useRnaseqQCDashboardReport` hook |
| `frontend/src/lib/constants.ts` | Add `RNASEQ_QC_FILE_CATEGORIES` (8 categories) |
| `frontend/src/App.tsx` | Replace PlaceholderTab with RnaseqQCTab at rnaseq-qc route |
| `frontend/src/pages/ExperimentView.tsx` | Wizard state + dropdown wiring + render |
| `frontend/src/components/experiments/NewAnalysisDropdown.tsx` | Add `onRnaseqQCClick` prop, enable item |
| `frontend/src/pages/AnalysisQueuePage.tsx` | Add `rnaseq_qc` to type filter + tab mapping |
| `frontend/src/components/experiments/AutoPipelineConfigPanel.tsx` | QC toggle + step summary |
| `frontend/src/components/experiments/AutoPipelineModal.tsx` | `includeQc` state + config |
| `frontend/src/components/experiments/AutoPipelineStep.tsx` | `includeQc` state + prop passthrough |
| `frontend/src/components/experiments/CreateExperimentWizard.tsx` | `includeQc: true` in RNA-seq config |

---

## Verification

- `npm run build`: clean (no TS errors, only pre-existing Tailwind ambiguity note)
- QC Dashboard dropdown item enabled for RNA-seq experiments
- `rnaseq-qc/:jid` route renders real RnaseqQCTab (no longer PlaceholderTab)
- Auto-pipeline modal shows QC Dashboard toggle for RNA-seq
- Auto-pipeline banner includes QC step between alignment and DE
- AnalysisQueuePage includes `rnaseq_qc` in job type filter
- All CUT&RUN patterns unchanged (no regressions)

---

## Phase C.3 Complete

Phase C.3 (RSeQC + MultiQC QC Pipeline) is now fully implemented across both sessions:
- **C.3-1 (Backend)**: Pipeline stage, schemas, QC report service, API endpoints, auto-pipeline integration, 36 tests.
- **C.3-2 (Frontend)**: Auto-pipeline UI updates, API layer, 2-step wizard, 3-sub-tab results view, integration wiring.

## What's Next: Phase C.4 (clusterProfiler Pathway Analysis)

Last remaining RNA-seq phase. Backend: `rnaseq_pathway.py` pipeline stage + R script (`rnaseq_pathway.R`) for GO/KEGG enrichment. Frontend: wizard + tab with GO/KEGG sub-tabs + dot plots. See `docs/RNASEQ-PLAN.md` Phase C.4 for full spec.
