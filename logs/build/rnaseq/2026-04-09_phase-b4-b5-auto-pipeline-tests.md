# Phase B.4 + B.5 — RNA-seq Auto-Pipeline + Tests

**Date**: 2026-04-09

## What Was Done

Implemented the RNA-seq auto-pipeline chain and all Phase B tests:

```
FastQC -> fastp Trimming (always) -> STAR+Salmon Alignment ->
  [DE Analysis if conditions detected] -> Complete
```

### Files Created (4)

- **`backend/pipelines/rnaseq_de.py`** (~250 lines) — Minimal DESeq2 stub stage. `validate()` checks samples with conditions/replicates, `mock_run()` creates realistic stub outputs (results.tsv, normalized_counts.csv, volcano/MA/PCA plots, summary.json), `run()` raises PipelineError (Phase C implements real DESeq2). `generate_methods_text()` produces manuscript-ready text.
- **`backend/tests/test_rnaseq_auto_pipeline.py`** (~400 lines) — 12 tests: start sets status, fastp always queued (no/with adapters), trimming->alignment chain, alignment params correct, DE queued when conditions detected, marks complete without conditions, DE completion, skip trimming if trimmed, error handling, treatment field detection, CUT&RUN regression.
- **`backend/tests/test_rnaseq_alignment_pipeline.py`** (~230 lines) — 12 tests: 5 validation, 3 mock_run (outputs, multiple reactions, categories), 2 QC parsing (STAR log, Salmon meta), 2 methods text.

### Files Modified (11)

- **`backend/schemas/auto_pipeline.py`** — Added `remove_duplicates: bool = False` and `include_de: bool = True` to `AutoPipelineConfig`
- **`backend/services/auto_pipeline_service.py`** — Added `_is_rnaseq()` helper, `assay_type` storage in `start_auto_pipeline()`, RNA-seq branching in `_evaluate_fastqc_and_queue()` (always trims) and `on_job_complete()` (3 new branches: `rnaseq_trimming`, `rnaseq_alignment`, `rnaseq_de`). Added `_queue_rnaseq_trimming()`, `_queue_rnaseq_alignment()`, `_can_run_rnaseq_de()`, `_queue_rnaseq_de()`. Enhanced `_detect_conditions()` with Tier 2 `treatment` field support.
- **`backend/pipelines/__init__.py`** — Registered `rnaseq_de: RnaseqDEStage()`
- **`backend/tests/conftest.py`** — Added `auto_pipeline_service` to `patch_worker_sessions` fixture
- **`frontend/src/api/autoPipeline.ts`** — Added `removeDuplicates` and `includeDe` fields
- **`frontend/src/components/experiments/AutoPipelineConfigPanel.tsx`** — Added `assayType` prop with RNA-seq variant (mm10/hg38 genome, remove duplicates toggle, DE analysis toggle, RNA-seq pipeline summary)
- **`frontend/src/components/experiments/AutoPipelineModal.tsx`** — Assay-type branching: RNA-seq sends `{referenceGenome, removeDuplicates, includeDe}`, CUT&RUN sends existing config
- **`frontend/src/components/experiments/AutoPipelineBanner.tsx`** — Added RNA-seq step definitions (`rnaseq_trimming`, `rnaseq_alignment`, `rnaseq_de`) and assay-type-aware step list
- **`frontend/src/components/experiments/AutoPipelineStep.tsx`** — Added `assayType` prop, RNA-seq description, passes RNA-seq state to config panel
- **`frontend/src/components/experiments/CreateExperimentWizard.tsx`** — Enabled Pipeline step for RNA-seq, builds RNA-seq config in `handleFinish()`
- **`frontend/src/pages/ExperimentView.tsx`** — Removed `!isRnaseq` guards from "Run Full Pipeline" button and AutoPipelineBanner, moved AutoPipelineModal outside CUT&RUN-only block

## Decisions Made

- **RNA-seq always trims with fastp** regardless of adapter status (standard practice)
- **DE analysis auto-queued** when `_detect_conditions()` finds >=2 conditions with >=2 replicates each — matches DiffBind pattern for CUT&RUN
- **`_detect_conditions()` enhanced** with Tier 2: `treatment` field (benefits both assay types)
- **Single `AutoPipelineConfig` schema** with optional fields for both assay types — no separate schema
- **`assay_type` stored in config dict** so all downstream routing functions can check it without extra DB queries
- **Minimal DE stage stub** — `run()` raises PipelineError; `mock_run()` works; Phase C completes it
- **Worker unchanged** — already handles both RNA-seq job types + auto-pipeline hooks

## Verification

- `ruff check` + `ruff format --check`: clean
- `npx tsc --noEmit` + `npm run build`: clean
- 12/12 `test_rnaseq_auto_pipeline.py` pass
- 12/12 `test_rnaseq_alignment_pipeline.py` pass
- 14/14 `test_rnaseq_trimming_pipeline.py` pass (regression)
- 22/22 `test_qc_report.py` pass (regression)
- 4/4 auto-pipeline tests in `test_jobs_api.py` pass (regression)

## Open Items

- Phase C: Implement real `RnaseqDEStage.run()` with DESeq2 R scripts
- Phase C: featureCounts, RSeQC+MultiQC, clusterProfiler pathway analysis
- Phase C: DE Analysis frontend tab (DEAnalysisTab.tsx) + wizard
- Add `rnaseq_de` to `AnalysisQueuePage` job type options (when DE tab exists)
