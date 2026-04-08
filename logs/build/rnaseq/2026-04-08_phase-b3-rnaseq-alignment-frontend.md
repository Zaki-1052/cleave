# Phase B.3 — RNA-seq Alignment Wizard + Tab (Frontend)

**Date**: 2026-04-08

## What Was Done

Implemented the full frontend for RNA-seq alignment: a 3-step wizard to launch STAR+Salmon jobs and a results tab with STAR/Salmon QC metrics, Recharts mapping-rate charts, file browsing, and IGV visualization. Also fixed 3 pre-existing lint issues and 1 backend formatting issue across the codebase.

### Files Created (7)

- **`frontend/src/components/rnaseq-alignment/NewRnaseqAlignmentWizard.tsx`** — 3-step wizard (Details → Choose Reactions → Settings). Submits `rnaseq_alignment` job type. Reuses `ChooseReactionsStep` from CUT&RUN. Duplicate removal defaults to OFF for RNA-seq.
- **`frontend/src/components/rnaseq-alignment/RnaseqAlignmentDetailsStep.tsx`** — Step 1 with RNA-seq-specific "About" text (STAR splice-aware alignment, Salmon quantification, BigWig generation).
- **`frontend/src/components/rnaseq-alignment/RnaseqAlignmentSettingsStep.tsx`** — Step 3 with `RNASEQ_REFERENCE_GENOMES` (mm10/hg38 only), no DAC exclusion checkbox, dedup OFF by default.
- **`frontend/src/components/rnaseq-alignment/RnaseqAlignmentTab.tsx`** — Results tab with 5 sub-tabs (Info, Input, QC Report, Files, IGV). Filters jobs by `rnaseq_alignment` type. Reuses `AlignmentInfoPanel` and `IGVPanel`.
- **`frontend/src/components/rnaseq-alignment/RnaseqAlignmentInputPanel.tsx`** — Input sub-tab with 4 columns (no spike-in columns).
- **`frontend/src/components/rnaseq-alignment/RnaseqAlignmentQCReportPanel.tsx`** — QC sub-tab with STAR metrics DataTable (9 columns), Salmon metrics DataTable (6 columns), Recharts stacked horizontal bar chart for mapping rates, CSV download.
- **`frontend/src/components/ui/button-variants.ts`** — Extracted CVA button variants from `Button.tsx` to fix React Fast Refresh warning.

### Files Modified (12)

- **`frontend/src/api/types.ts`** — Added `RnaseqAlignmentReactionMetrics` (19 fields) and `RnaseqAlignmentQCReport` interfaces.
- **`frontend/src/api/jobs.ts`** — Added `getRnaseqQCReport()` and `downloadRnaseqQCCsv()` API functions.
- **`frontend/src/hooks/useJobs.ts`** — Added `useRnaseqQCReport()` React Query hook.
- **`frontend/src/lib/constants.ts`** — Added `RNASEQ_ALIGNMENT_FILE_CATEGORIES` (9 categories) and `RNASEQ_REFERENCE_GENOMES` (mm10, hg38).
- **`frontend/src/pages/experiment/AlignmentTab.tsx`** — Added assay-type delegation: RNA-seq → `RnaseqAlignmentTab`, CUT&RUN → existing code.
- **`frontend/src/components/experiments/NewAnalysisDropdown.tsx`** — Added `onRnaseqAlignmentClick` prop, enabled "Alignment (STAR)" menu item.
- **`frontend/src/pages/ExperimentView.tsx`** — Added `showRnaseqAlignmentWizard` state, imported and rendered `NewRnaseqAlignmentWizard` for RNA-seq.
- **`frontend/src/pages/AnalysisQueuePage.tsx`** — Added `rnaseq_alignment` to `JOB_TYPE_OPTIONS` and `JOB_TYPE_TO_TAB`.
- **`frontend/src/components/alignment/AlignmentFilesPanel.tsx`** — Added optional `categories` prop for reuse (RNA-seq passes `RNASEQ_ALIGNMENT_FILE_CATEGORIES`).
- **`frontend/src/components/fastqs/FileUploadZone.tsx`** — Removed unused `activeCount` variable (lint error fix).
- **`frontend/src/components/experiments/AutoPipelineStep.tsx`** — Wrapped `reactions` in `useMemo` to stabilize hook dependencies (lint warning fix).
- **`frontend/src/components/ui/Button.tsx`** — Import `buttonVariants` from extracted file, export only component (fast refresh fix).
- **`frontend/src/components/ui/calendar.tsx`** — Updated `buttonVariants` import path.
- **`backend/pipelines/methods_text.py`** — Fixed ruff formatting.

## Decisions Made

- **AlignmentTab delegates by assay type** rather than creating a separate route — matches TrimmingTab pattern, keeps `alignment/:jid` route shared.
- **QC panel is a new component** (not extending CUT&RUN's) — 19 RNA-seq metrics vs 10 CUT&RUN, no spike-in, different charts.
- **AlignmentInfoPanel reused directly** — fully generic, no CUT&RUN-specific content.
- **AlignmentFilesPanel extended with `categories` prop** — avoids duplicating 160 lines, follows TrimmingFilesPanel pattern.
- **`resolveFastqPaths` duplicated locally** in wizard (8 lines, simplified — no `total_reads`/`ecoli_spike_in`/`cutana_spike_in`).
- **Pre-existing lint issues fixed** — `activeCount` dead code removed, `useMemo` deps stabilized, `buttonVariants` extracted for Fast Refresh compliance.

## Verification

- `npx tsc --noEmit`: clean
- `npx eslint src/`: 0 errors, 0 warnings
- `npm run build`: clean (3.66s)
- `ruff check backend/` + `ruff format --check backend/`: clean

## Open Items

- B.4: Auto-pipeline RNA-seq chain (fastp → STAR+Salmon)
- B.5: Tests for rnaseq_alignment pipeline (mock_run, validation, methods text)
- Backend tests not run in this session (frontend-only changes, no backend modifications beyond formatting)

---

# Fix: RNA-seq Trimming Not Working from FASTQs Tab

**Date**: 2026-04-08 (same session, post-B.3)

## Problem

Trimming buttons ("Trim" and "Configure") in the FASTQs tab adapter detection banner always submitted `jobType: 'trimming'` (Trimmomatic + kseq 42bp) regardless of experiment assay type. RNA-seq experiments need `jobType: 'rnaseq_trimming'` (fastp) with different parameters. The `FastqsTab.tsx` had zero RNA-seq awareness.

## What Was Done

### Files Created (1)

- **`frontend/src/components/fastqs/FastpConfigModal.tsx`** — fastp-specific config modal with parameters: quality threshold (Phred), min read length, sliding window size/quality, auto-detect adapters toggle, cut front/tail toggles. No kseq, no ILLUMINACLIP, no adapter file selector.

### Files Modified (1)

- **`frontend/src/pages/experiment/FastqsTab.tsx`** — Added `isRnaseq` detection from `experiment.assayType`. Quick trim button now submits `'rnaseq_trimming'` with fastp params for RNA-seq. "Configure" button opens `FastpConfigModal` for RNA-seq, `TrimConfigModal` for CUT&RUN. Extracted `buildFastqPairs()` helper (DRY). Added `buildFastpJobParams()` and `handleConfiguredFastp()`.

## Verification

- `npx tsc --noEmit`: clean
- `npm run build`: clean (3.84s)
