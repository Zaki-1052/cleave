# Phase A.4-A.5 — RNA-seq Trimming Tab + Tests

**Date**: 2026-04-07

## What was done

- Made `TrimmingTab.tsx` assay-type aware: RNA-seq experiments filter by `rnaseq_trimming` job type, CUT&RUN by `trimming`
- Added "Reports" sub-tab for RNA-seq trimming (between Info and Files) with fastp HTML report viewer
- Created `FastpReportModal.tsx` — iframe-based HTML report viewer using job output signed URLs (mirrors `FastqcReportModal` pattern, adds `allow-scripts` sandbox for fastp's interactive charts)
- Created `FastpReportsPanel.tsx` — DataTable listing fastp HTML reports with "View Report" button
- Extended `TrimmingFilesPanel.tsx` with optional `categories` prop (non-breaking, falls back to existing `TRIMMING_FILE_CATEGORIES`)
- Added `RNASEQ_TRIMMING_FILE_CATEGORIES` constant (trimmed_fastq, fastp_html, fastp_json)
- Adapted `TrimmingInfoPanel` for RNA-seq: hides "Adapter File" (fastp auto-detects), shows Quality Phred and Min Length params
- Updated `AnalysisQueuePage.tsx`: added `rnaseq_trimming` to `JOB_TYPE_OPTIONS` and `JOB_TYPE_TO_TAB`
- Added 1 experiment test: `test_create_rnaseq_experiment_success`
- Added 5 reaction tests: create with RNA-seq fields, update RNA-seq fields, CSV import with integer `replicate_number`, bulk create, CUT&RUN backward compatibility (null fields)
- Added test helpers: `_create_rnaseq_experiment()`, `_rnaseq_reaction_body()`

## Decisions made

- Reused `TrimmingTab.tsx` with assay-type conditional rather than creating separate `RnaseqTrimmingTab.tsx` — same route `trimming/:jid` serves both
- fastp HTML reports use `sandbox="allow-same-origin allow-scripts"` (unlike FastQC's `allow-same-origin` only) because fastp generates interactive JavaScript charts
- File categories passed as optional prop to `TrimmingFilesPanel` rather than duplicating the component
- RNA-seq Info panel shows `qualified_quality_phred` and `length_required` from job params when present

## Open items

- Phase B: STAR+Salmon alignment, RNA-seq QC report, auto-pipeline, enable dropdown items
- Phase C: DESeq2, featureCounts, RSeQC+MultiQC, clusterProfiler pathway

## Key file paths

- `frontend/src/components/trimming/FastpReportModal.tsx` — new (~95 lines)
- `frontend/src/components/trimming/FastpReportsPanel.tsx` — new (~100 lines)
- `frontend/src/components/trimming/TrimmingFilesPanel.tsx` — added optional `categories` prop
- `frontend/src/pages/experiment/TrimmingTab.tsx` — assay-type awareness (job filter, sub-tabs, info panel)
- `frontend/src/lib/constants.ts` — added `RNASEQ_TRIMMING_FILE_CATEGORIES`
- `frontend/src/pages/AnalysisQueuePage.tsx` — rnaseq_trimming in type filter + navigation map
- `backend/tests/test_experiments.py` — 1 new test
- `backend/tests/test_reactions.py` — 5 new tests + 2 helpers
