# Phase C.1 — featureCounts Pipeline Stage

> 1 session on 2026-04-09 to 2026-04-10. Phase C.1 is **complete**. 13 new tests (613 total).

---

## What Was Built

### featureCounts Pipeline Stage (C.1)
- Created `backend/pipelines/rnaseq_feature_counts.py` — `FeatureCountsStage(PipelineStage)` (~340 lines).
- Single featureCounts invocation across ALL reactions' BAMs (no ThreadPoolExecutor — architecturally unique among pipeline stages).
- Command: `featureCounts -a <GTF> -o <counts.txt> -p --countReadPairs -T <threads> -s <strandedness> --primary <bam1> <bam2> ... <bamN>`
- `SALMON_LIB_TYPE_TO_STRANDEDNESS` mapping dict: ISR/SR → 2, ISF/SF → 1, IU/U → 0.
- `_SUMMARY_CATEGORIES` list (14 featureCounts assignment categories for mock data).
- `_resolve_gtf()` helper resolves GENCODE GTF path from `RNASEQ_GENOME_CONFIG` + `GENCODE_GTF_DIR`.
- `validate()`: checks experiment_id, project_id, reference_genome (must be in RNASEQ_GENOME_CONFIG), alignment_job_id, strandedness (must be 0/1/2), reactions (non-empty, each with reaction_id, short_name, bam_path). Real mode checks featureCounts binary and GTF existence.
- `run()`: resolves featureCounts binary, GTF, BAM paths; single subprocess via `run_cmd()`; parses summary for logging; registers count_matrix, count_summary, master_log outputs.
- `mock_run()`: creates stub count matrix with correct header format (Geneid, Chr, Start, End, Strand, Length, <sample_columns>), ~10 mock gene rows with ENSMUSG/ENSG IDs based on genome, stub summary file with assignment statistics.
- `generate_methods_text()`: delegates to `rnaseq_feature_counts_methods()`.
- Registered `"rnaseq_feature_counts": FeatureCountsStage()` in `backend/pipelines/__init__.py`.
- Added `rnaseq_feature_counts_methods()` to `backend/pipelines/methods_text.py`.

### Frontend: featureCounts Wizard + Tab (C.1)
- Created 3 new frontend components in `frontend/src/components/rnaseq-feature-counts/`:
  - `NewFeatureCountsWizard.tsx` — 2-step wizard (Details & Choose Alignment → Settings). Auto-infers strandedness from Salmon library type via `useRnaseqQCReport`. Resolves BAM paths from alignment job outputs via `useJobOutputs`. Submits `rnaseq_feature_counts` job with `parentJobId` set to selected alignment.
  - `FeatureCountsSettingsStep.tsx` — Strandedness selector (auto-populated from Salmon, overridable), reference genome display (read-only from alignment), reactions summary table with BAM filenames.
  - `FeatureCountsTab.tsx` — Job selector dropdown + 2 sub-tabs (Info, Files). Reuses `AlignmentInfoPanel` and `AlignmentFilesPanel` with `RNASEQ_FEATURE_COUNTS_FILE_CATEGORIES`.
- Added `RNASEQ_FEATURE_COUNTS_FILE_CATEGORIES` (count_matrix, count_summary, master_log), `SALMON_LIB_TYPE_TO_STRANDEDNESS`, `STRANDEDNESS_OPTIONS` to `frontend/src/lib/constants.ts`.
- Enabled "featureCounts" in `NewAnalysisDropdown` for RNA-seq (was disabled placeholder).
- Added `onFeatureCountsClick` prop to `NewAnalysisDropdown`.
- Added `feature-counts/:jid` route in `App.tsx`.
- Added `featureCounts` tab to `RNASEQ_TABS` in `ExperimentView.tsx` (between Alignment and DE Analysis).
- Added wizard state + rendering in `ExperimentView.tsx` `isRnaseq` block.
- Added `rnaseq_feature_counts` to `AnalysisQueuePage` job type filter + tab mapping.

### Tests (C.1)
- 13 tests in `test_rnaseq_feature_counts_pipeline.py`: 7 validation (valid params, missing experiment_id, missing genome, unsupported genome, invalid strandedness, empty reactions, missing bam_path), 3 mock_run (outputs produced, correct column count, multiple reactions), 2 methods text (mentions featureCounts, mentions genome), 1 Salmon library type mapping.

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| No ThreadPoolExecutor | Single featureCounts invocation | featureCounts counts ALL BAMs in one call, producing a combined matrix. Per-reaction concurrency is unnecessary and would produce separate matrices |
| Not in auto-pipeline | Manual step only | Auto-pipeline uses Salmon for quantification (faster, transcript-level). featureCounts is for power users wanting gene-level counts from aligned reads |
| Strandedness from Salmon | Auto-inferred in wizard | Salmon auto-detects library type (ISR/ISF/IU); wizard maps to featureCounts -s flag (2/1/0) with manual override |
| BAM paths from job outputs | Resolved via useJobOutputs | Alignment job's `sorted_bam` outputs provide exact BAM paths; matched by reactionId |
| Reuse AlignmentInfoPanel/FilesPanel | No new info/files panels | Generic enough for featureCounts (shows params, methods text, notes, categorized files) |
| Output categories | count_matrix, count_summary, master_log | Minimal — featureCounts produces one count file + one summary file |
| No new API endpoints | Uses existing job/output endpoints | Count matrix and summary are standard job outputs, accessible via `useJobOutputs` |
| No new DB migrations | Uses existing analysis_jobs + job_outputs | JSONB params store all featureCounts-specific config |
| No Python pip dependencies | featureCounts is a conda binary | Resolved via `shutil.which("featureCounts")` like STAR/Salmon/samtools |

---

## Files Summary

### New Files (5)
| File | Lines | Description |
|------|-------|-------------|
| `backend/pipelines/rnaseq_feature_counts.py` | ~340 | Pipeline stage: validate, run, mock_run, methods text |
| `backend/tests/test_rnaseq_feature_counts_pipeline.py` | ~270 | 13 tests: validation, mock_run, methods text, mapping |
| `frontend/src/components/rnaseq-feature-counts/NewFeatureCountsWizard.tsx` | ~240 | 2-step wizard modal |
| `frontend/src/components/rnaseq-feature-counts/FeatureCountsSettingsStep.tsx` | ~105 | Strandedness + reactions settings |
| `frontend/src/components/rnaseq-feature-counts/FeatureCountsTab.tsx` | ~115 | Results tab (Info + Files sub-tabs) |

### Modified Files (7)
| File | Change |
|------|--------|
| `backend/pipelines/__init__.py` | Import + register `FeatureCountsStage` |
| `backend/pipelines/methods_text.py` | Add `rnaseq_feature_counts_methods()` |
| `frontend/src/App.tsx` | Add `feature-counts/:jid` route + import |
| `frontend/src/pages/ExperimentView.tsx` | Wizard state + RNASEQ_TABS entry + dropdown wiring + render wizard |
| `frontend/src/components/experiments/NewAnalysisDropdown.tsx` | Add `onFeatureCountsClick` prop, enable menu item |
| `frontend/src/pages/AnalysisQueuePage.tsx` | Add to job type filter + tab mapping |
| `frontend/src/lib/constants.ts` | Add file categories + strandedness constants |

---

## Test Coverage

| Test File | New in C.1 | Total | Scope |
|-----------|-----------|-------|-------|
| `test_rnaseq_feature_counts_pipeline.py` | **13** | 13 | Validation (7), mock_run (3), methods text (2), mapping (1) |
| **Phase C.1 Total** | **13** | | |
| **All Phases Cumulative** | | **613** | |

All tests run inside Docker (`docker compose exec api pytest tests/`). `ruff check` + `ruff format --check`: clean. `npm run build`: clean.

---

## Pipeline Stage Registry After Phase C.1

```python
_STAGES = {
    "trimming": TrimmingStage(),                    # CUT&RUN: Trimmomatic + kseq
    "rnaseq_trimming": RnaseqTrimmingStage(),       # RNA-seq: fastp
    "rnaseq_alignment": RnaseqAlignmentStage(),     # RNA-seq: STAR + Salmon + BigWigs
    "rnaseq_de": RnaseqDEStage(),                   # RNA-seq: DESeq2 (stub, Phase C.2)
    "rnaseq_feature_counts": FeatureCountsStage(),  # RNA-seq: featureCounts (NEW)
    "alignment": AlignmentStage(),                  # CUT&RUN: Bowtie2 13-step
    "peak_calling": PeakCallingStage(),             # CUT&RUN: MACS2/SICER2/SEACR
    "diffbind": DiffBindStage(),                    # CUT&RUN: DiffBind R
    "custom_heatmap": CustomHeatmapStage(),         # deepTools heatmaps
    "pearson_correlation": PearsonCorrelationStage(),# R + Python correlation
    "roman_normalization": RomanNormalizationStage(),# Mouse-only normalization
}
```

---

## What's Next: Phase C.2 (DESeq2 Differential Expression)

Real DESeq2 implementation replacing the Phase B stub. Two quantification input paths: Salmon (tximport, default) and featureCounts (DESeqDataSetFromMatrix). Design formula from reaction metadata. Volcano, MA, PCA plots, top genes heatmap, interactive gene table. See `docs/RNASEQ-PLAN.md` Phase C.2 for full spec.
