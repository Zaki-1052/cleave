# Phase C.2-2 — DESeq2 Differential Expression Frontend

> 1 session on 2026-04-12. Phase C.2-2 is **complete**. 0 new tests (643 total). `npm run build`: clean.

---

## What Was Built

### Frontend API Layer (Step 1)
- Added `RnaseqDEPlotInfo` and `RnaseqDEReport` interfaces to `frontend/src/api/types.ts`.
- Added 3 API functions to `frontend/src/api/jobs.ts`: `getRnaseqDEReport()`, `downloadRnaseqDEResults()` (TSV), `downloadRnaseqDECounts()` (CSV).
- Added `useRnaseqDEReport()` hook to `frontend/src/hooks/useJobs.ts`.
- Added `RNASEQ_DE_FILE_CATEGORIES` (9 categories) and `RNASEQ_DE_QUANTIFICATION_SOURCES` to `frontend/src/lib/constants.ts`.

### 4-Step Wizard (Step 2)
- Created `NewDeseq2Wizard.tsx` — 4-step wizard orchestrator following `NewDiffBindWizard.tsx` pattern exactly.
  - Step 0: Details (name + notes + "About DESeq2" educational card).
  - Step 1: Choose Alignment (radio table of completed `rnaseq_alignment` jobs).
  - Step 2: Assign Conditions (checkbox table with condition text input, auto-replicate numbering, validation: ≥2 conditions with ≥2 replicates each).
  - Step 3: Settings (quantification source radio: Salmon/featureCounts, reference condition dropdown, FDR threshold, LFC threshold, analysis summary table).
- Salmon quant path resolution from alignment job outputs (`salmon_quant` category, parent dir extraction).
- featureCounts availability check: disables radio if no completed `rnaseq_feature_counts` job for selected alignment.
- Submits `rnaseq_de` job with params matching `rnaseq_de.py` validate() expectations.
- Navigates to `de/${job.id}` on success.

### 5-Sub-Tab Results View (Step 3)
- Created `DEAnalysisTab.tsx` — tab page following `DiffBindTab.tsx` pattern:
  - Job selector dropdown (shadcn Select) filtering by `jobType === 'rnaseq_de'`.
  - 5 sub-tabs: Info, Input, Results, Plots, Files.
  - Results/Plots/Files gated on `job.status === 'complete'`.
- Created `DEInfoPanel.tsx` — 3-column layout: Details (ID, creator, date, status, quant source, reference condition, genome) | Methods text (copy button) | Notes (editable inline). `JobActions` + `JobErrorDetails`.
- Created `DEInputPanel.tsx` — read-only sample sheet table (Short Name, Condition, Replicate) from `job.params.samples`.
- Created `DEResultsPanel.tsx` — interactive gene expression table:
  - 5 summary cards: Total Genes, Significant (padj < 0.05), Significant (padj < 0.01), Upregulated (red), Downregulated (blue).
  - Dynamic columns from `report.columnNames` (matching DiffBind pattern).
  - Cell formatting: padj/pvalue exponential + color badges (green/amber/red), log2FoldChange 3dp + direction coloring (red up, blue down), baseMean comma-formatted 1dp, lfcSE/stat 3dp.
  - Page size 25 with search.
  - Download buttons: "Download Results (TSV)" + "Download Counts (CSV)".
  - Info section explaining significance color coding.
- Created `DEPlotsPanel.tsx` — 2-column plot grid:
  - 5 plot types: volcano, ma, pca, distance_heatmap, gene_heatmap.
  - Each: signed URL fetching, PNG display, PNG + SVG download buttons.
  - `PLOT_LABELS` and `PLOT_DESCRIPTIONS` lookup dicts.
- Created `DEFilesPanel.tsx` — file browser:
  - Category dropdown from `RNASEQ_DE_FILE_CATEGORIES`.
  - Multi-select DataTable with batch download.

### Integration Wiring (Step 4)
- `ExperimentView.tsx`: Added `showDeseq2Wizard` state, wired `onDeseq2Click` to `NewAnalysisDropdown`, rendered `<NewDeseq2Wizard>` in RNA-seq conditional block.
- `NewAnalysisDropdown.tsx`: Added `onDeseq2Click` prop, enabled "DE Analysis" menu item (was disabled placeholder).
- `App.tsx`: Replaced `<PlaceholderTab label="DE Analysis" />` with `<DEAnalysisTab />` at `de/:jid` route.
- `AnalysisQueuePage.tsx`: Added `rnaseq_de` to `JOB_TYPE_OPTIONS` and `JOB_TYPE_TO_TAB`.

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Pattern reference | DiffBind frontend (exact pattern) | Same wizard flow, same results/plots/files pattern; proven UX |
| Wizard parent job | Alignment (not peak calling) | DESeq2 uses Salmon quant from alignment; no peak calling needed |
| Salmon quant path | Extract parent dir from `salmon_quant` output filePath | Salmon quant.sf is inside a directory; parent dir is the quant path |
| featureCounts toggle | Disabled if no completed FC job for selected alignment | Prevents invalid submissions; clear UX feedback |
| Condition assignment | Same component pattern as DiffBind AssignConditionsStep | Proven UX with auto-replicate numbering; identical validation logic |
| Results table columns | Dynamic from `report.columnNames` | Same pattern as DiffBind; backend controls column set |
| Summary cards | 5 cards (Total, Sig 0.05, Sig 0.01, Up, Down) | More granular than DiffBind (3 cards); matches DE analysis conventions |
| Plot types | 5 (volcano, MA, PCA, distance heatmap, gene heatmap) | Matches backend R script output categories exactly |
| Dark mode | Used dark: variants on significance colors | Consistent with existing codebase dark mode patterns |

---

## Files Summary

### New Files (11)
| File | Lines | Description |
|------|-------|-------------|
| `frontend/src/components/rnaseq-de/NewDeseq2Wizard.tsx` | ~330 | 4-step wizard orchestrator |
| `frontend/src/components/rnaseq-de/Deseq2DetailsStep.tsx` | ~100 | Step 1: name + notes |
| `frontend/src/components/rnaseq-de/ChooseAlignmentStep.tsx` | ~110 | Step 2: select alignment job |
| `frontend/src/components/rnaseq-de/AssignConditionsStep.tsx` | ~210 | Step 3: condition/replicate assignment |
| `frontend/src/components/rnaseq-de/Deseq2SettingsStep.tsx` | ~200 | Step 4: quant source, reference, thresholds |
| `frontend/src/pages/experiment/DEAnalysisTab.tsx` | ~130 | Tab page with 5 sub-tabs |
| `frontend/src/components/rnaseq-de/DEInfoPanel.tsx` | ~155 | Info sub-tab |
| `frontend/src/components/rnaseq-de/DEInputPanel.tsx` | ~75 | Input sub-tab |
| `frontend/src/components/rnaseq-de/DEResultsPanel.tsx` | ~225 | Results sub-tab (interactive gene table) |
| `frontend/src/components/rnaseq-de/DEPlotsPanel.tsx` | ~165 | Plots sub-tab (5 plot types) |
| `frontend/src/components/rnaseq-de/DEFilesPanel.tsx` | ~145 | Files sub-tab |

### Modified Files (8)
| File | Change |
|------|--------|
| `frontend/src/api/types.ts` | Add `RnaseqDEPlotInfo`, `RnaseqDEReport` interfaces |
| `frontend/src/api/jobs.ts` | Add 3 DE API functions + import |
| `frontend/src/hooks/useJobs.ts` | Add `useRnaseqDEReport()` hook |
| `frontend/src/lib/constants.ts` | Add `RNASEQ_DE_FILE_CATEGORIES`, `RNASEQ_DE_QUANTIFICATION_SOURCES` |
| `frontend/src/App.tsx` | Replace PlaceholderTab with DEAnalysisTab at `de/:jid` + import |
| `frontend/src/pages/ExperimentView.tsx` | Add wizard state + dropdown wiring + render wizard + import |
| `frontend/src/components/experiments/NewAnalysisDropdown.tsx` | Add `onDeseq2Click` prop, enable DE Analysis item |
| `frontend/src/pages/AnalysisQueuePage.tsx` | Add `rnaseq_de` to type filter + tab mapping |

---

## Verification

- `npm run build`: clean (no TS errors, no lint warnings beyond pre-existing Tailwind ambiguity note).
- All existing CUT&RUN frontend patterns preserved (no regressions).
- DE Analysis dropdown item now enabled for RNA-seq experiments.
- `de/:jid` route renders full DEAnalysisTab (no longer placeholder).
- AnalysisQueuePage includes `rnaseq_de` in job type filter and navigates to `de` tab.

---

## What's Next: Phase C.2 Complete

Phase C.2 (DESeq2 Differential Expression) is now fully implemented across both backend (C.2-1) and frontend (C.2-2):
- **C.2-1 (Backend)**: R scripts, pipeline stage, schemas, QC report service, API endpoints, 30 tests.
- **C.2-2 (Frontend)**: 4-step wizard, 5-sub-tab results view, API layer, integration wiring.

Remaining RNA-seq phases:
- Phase C.3: RSeQC + MultiQC QC pipeline
- Phase C.4: clusterProfiler pathway analysis (GO/KEGG)
