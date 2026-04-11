# Phase B Summary — RNA-seq Core Pipeline (STAR + Salmon + BigWigs + QC + Auto-Pipeline)

> 5 sessions on 2026-04-08 to 2026-04-09. Phase B is **complete**. All 9 done criteria checked off. 32 new tests (600 total).

---

## What Was Built

### STAR + Salmon + BigWig Pipeline Stage (B.1)
- Created `backend/pipelines/rnaseq_alignment.py` — `RnaseqAlignmentStage(PipelineStage)` (~890 lines).
- 7-step per-reaction pipeline: STAR splice-aware alignment, samtools index, optional dedup, Salmon pseudo-alignment quantification, bamCoverage unsmoothed (20bp RPKM), bamCoverage smoothed (100bp RPKM), QC metric parsing.
- `RNASEQ_GENOME_CONFIG` dict for modular genome index/annotation mapping (mm10: gencode.vM10, hg38: gencode.v29).
- `_parse_star_log()` extracts 13 metrics from STAR `Log.final.out` (input reads, unique mapping rate, multi-mapped rate, unmapped rate, average mapped length, 6 splice breakdown categories, mismatch rate).
- `_parse_salmon_meta()` extracts 5 metrics from Salmon `aux_info/meta_info.json` (mapping rate, library type, num processed, fragment length mean/SD).
- `_write_rnaseq_qc_csv()` writes 19-column QC CSV per job.
- ThreadPoolExecutor concurrency with `MAX_CONCURRENT_RNASEQ_REACTIONS = 2` (STAR uses ~30GB RAM per instance).
- All bioinformatics flags verified against lab reference scripts (`references/archival/rnaseq/`).
- Reference script bugs avoided: `salmon_quant.sh` typo, `create_bw.sh` echo syntax, hardcoded sample names.
- Registered `"rnaseq_alignment": RnaseqAlignmentStage()` in `backend/pipelines/__init__.py`.
- Added `MAX_CONCURRENT_RNASEQ_REACTIONS = 2` to `backend/config.py`.
- Added `RNASEQ_ANNOTATION_VERSIONS` dict and `rnaseq_alignment_methods()` to `backend/pipelines/methods_text.py`.

### RNA-seq Alignment QC Report Endpoint (B.2)
- Extended `_parse_star_log()` with 5 splice breakdown metrics: annotated (sjdb), GT/AG, GC/AG, AT/AC, non-canonical.
- Extended `_parse_salmon_meta()` with 2 fragment length stats: `frag_length_mean`, `frag_length_sd`.
- Expanded `_QC_CSV_HEADERS` from 12 to 19 columns with backward compatibility via `row.get()` with defaults.
- Created `RnaseqAlignmentReactionMetrics` (19 fields) and `RnaseqAlignmentQCReport` Pydantic schemas in `backend/schemas/qc_report.py`.
- Created 3 service functions in `backend/services/qc_report_service.py`: `_parse_rnaseq_qc_csv()`, `get_rnaseq_alignment_qc_report()`, `get_rnaseq_qc_csv_path()`.
- Added 2 API endpoints: `GET /jobs/{jid}/rnaseq-qc-report` (JSON), `GET /jobs/{jid}/rnaseq-qc-report/download` (CSV).
- 8 new QC report tests covering success, download, 404, 409, unauthorized, wrong job type, backward compat.

### RNA-seq Alignment Wizard + Tab (B.3)
- Created 7 new frontend components in `frontend/src/components/rnaseq-alignment/`:
  - `NewRnaseqAlignmentWizard.tsx` — 3-step wizard (Details -> Choose Reactions -> Settings). Submits `rnaseq_alignment` job.
  - `RnaseqAlignmentDetailsStep.tsx` — RNA-seq-specific "About" text.
  - `RnaseqAlignmentSettingsStep.tsx` — `RNASEQ_REFERENCE_GENOMES` (mm10/hg38 only), dedup OFF by default.
  - `RnaseqAlignmentTab.tsx` — 5 sub-tabs (Info, Input, QC Report, Files, IGV). Reuses `AlignmentInfoPanel` and `IGVPanel`.
  - `RnaseqAlignmentInputPanel.tsx` — Input sub-tab with 4 columns (no spike-in).
  - `RnaseqAlignmentQCReportPanel.tsx` — STAR metrics DataTable (9 columns), Salmon metrics DataTable (6 columns), Recharts stacked bar chart for mapping rates, CSV download.
  - `button-variants.ts` — Extracted CVA variants from `Button.tsx` to fix React Fast Refresh warning.
- Added `RnaseqAlignmentReactionMetrics`, `RnaseqAlignmentQCReport` interfaces to `frontend/src/api/types.ts`.
- Added `getRnaseqQCReport()`, `downloadRnaseqQCCsv()` to `frontend/src/api/jobs.ts`.
- Added `useRnaseqQCReport()` hook to `frontend/src/hooks/useJobs.ts`.
- Added `RNASEQ_ALIGNMENT_FILE_CATEGORIES` (9 categories) and `RNASEQ_REFERENCE_GENOMES` to `frontend/src/lib/constants.ts`.
- Enabled "Alignment (STAR)" in `NewAnalysisDropdown` for RNA-seq.
- Fixed RNA-seq trimming from FASTQs tab: `FastpConfigModal.tsx` + `FastqsTab.tsx` assay-type awareness.
- Fixed 3 pre-existing lint issues: `activeCount` dead code, `useMemo` deps, `buttonVariants` Fast Refresh.

### Auto-Pipeline for RNA-seq (B.4)
- Extended `backend/services/auto_pipeline_service.py` with full RNA-seq chain:
  ```
  FastQC -> fastp (always) -> STAR+Salmon+BigWigs -> [DE Analysis] -> Complete
  ```
- Added `_is_rnaseq()` helper. Stored `assay_type` in config dict at pipeline start.
- RNA-seq branching in `_evaluate_fastqc_and_queue()`: always queues fastp (no adapter-status gate).
- RNA-seq branching in `on_job_complete()`: 3 new branches (`rnaseq_trimming`, `rnaseq_alignment`, `rnaseq_de`).
- DE analysis auto-queued when `_detect_conditions()` finds >=2 conditions with >=2 replicates — matches DiffBind pattern for CUT&RUN.
- Enhanced `_detect_conditions()` with Tier 2: `treatment` field support (benefits both assay types).
- Added 4 new queue helpers: `_queue_rnaseq_trimming()`, `_queue_rnaseq_alignment()`, `_can_run_rnaseq_de()`, `_queue_rnaseq_de()`.
- Added `remove_duplicates: bool = False` and `include_de: bool = True` to `AutoPipelineConfig` schema.
- Created minimal `RnaseqDEStage` stub (`backend/pipelines/rnaseq_de.py`, ~250 lines) — validate + mock_run work, `run()` raises PipelineError (Phase C implements real DESeq2). Registered in pipeline registry.
- Frontend: "Run Full Pipeline" button and AutoPipelineBanner now enabled for RNA-seq experiments.
- `AutoPipelineConfigPanel` renders RNA-seq variant (mm10/hg38 genome, remove duplicates toggle, DE analysis toggle, RNA-seq pipeline summary).
- `AutoPipelineModal` builds RNA-seq config: `{referenceGenome, removeDuplicates, includeDe}`.
- `AutoPipelineBanner` shows RNA-seq steps: Trimming (fastp), Alignment (STAR+Salmon), DE Analysis.
- Pipeline step in `CreateExperimentWizard` now enabled for RNA-seq.

### Tests (B.5)
- 12 tests in `test_rnaseq_alignment_pipeline.py`: 5 validation, 3 mock_run, 2 QC parsing (STAR log + Salmon meta), 2 methods text.
- 12 tests in `test_rnaseq_auto_pipeline.py`: pipeline start, fastp always queued (2 tests), trimming->alignment chain, alignment params, DE queued with conditions, complete without conditions, DE completion, skip trimming, error handling, treatment field detection, CUT&RUN regression.
- 8 tests in `test_qc_report.py` (B.2): success, download, 404, 409, unauthorized, CSV 409, wrong job type, backward compat.
- Added `auto_pipeline_service` to `patch_worker_sessions` fixture in conftest.

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| STAR + Salmon always together | Single `rnaseq_alignment` job type | STAR for BAMs/BigWigs/IGV, Salmon for quantification. Complementary, not alternatives |
| Salmon runs on FASTQs | Not STAR's transcriptomic BAM | Matches `salmon_quant2.sh` reference script |
| `--readFilesCommand zcat` | Added to STAR command | Reference scripts manually gunzip; zcat handles gzipped input directly |
| Output categories `bigwig`/`smoothed_bigwig` | Reuse CUT&RUN names | IGV/Pearson/heatmap compatibility without new code |
| `MAX_CONCURRENT_RNASEQ_REACTIONS = 2` | Separate from CUT&RUN (8) | STAR uses ~30GB RAM per instance |
| Duplicate removal default OFF | RNA-seq convention | Controversial for RNA-seq; optional advanced setting |
| QC CSV 19 columns | Extended from 12 with backward compat | Splice breakdown + fragment length stats. Old CSVs parse with defaults |
| Flat QC schema (no sub-models) | Matches CUT&RUN `AlignmentReactionMetrics` | Consistent pattern across assay types |
| AlignmentTab delegates by assay type | Not separate route | Matches TrimmingTab pattern, keeps `alignment/:jid` shared |
| QC panel is a new component | Not extending CUT&RUN's | 19 RNA-seq metrics vs 10 CUT&RUN, no spike-in, different charts |
| RNA-seq always trims | fastp queued unconditionally | Standard practice; fastp is lightweight and handles adapters + quality |
| Auto-pipeline includes DE analysis | Condition auto-detection from reactions | Parity with CUT&RUN (DiffBind auto-queued when conditions detected) |
| `_detect_conditions()` enhanced | Added `treatment` field (Tier 2) | RNA-seq uses `treatment`; benefits both assay types |
| DE stage as stub | `run()` raises error; `mock_run()` works | Phase C implements real DESeq2; auto-pipeline routing is ready |
| Single `AutoPipelineConfig` schema | Optional fields for both assay types | No separate schema; unused fields harmlessly stored in config JSON |
| `assay_type` in config dict | Stored at pipeline start | All downstream routing checks without extra DB queries |
| Genome restriction (mm10/hg38) | Only in `RNASEQ_GENOME_CONFIG` | Only these have STAR/Salmon indices; frontend restricts selector |

---

## API Status After Phase B

### New Endpoints
- `GET /jobs/{jid}/rnaseq-qc-report` — RNA-seq alignment QC report (JSON, 19 per-reaction metrics)
- `GET /jobs/{jid}/rnaseq-qc-report/download` — RNA-seq alignment QC CSV

### New Job Types
- `rnaseq_alignment` — dispatched to `RnaseqAlignmentStage`, outputs persisted via `persist_job_outputs`
- `rnaseq_de` — dispatched to `RnaseqDEStage` (stub; mock mode only until Phase C)

### Unchanged from Phase A
- `rnaseq_trimming` — dispatched to `RnaseqTrimmingStage`, routed to existing `create_trimmed_fastq_records`
- All CUT&RUN endpoints unchanged

---

## Database Schema Changes

No new migrations in Phase B. All RNA-seq jobs use existing `analysis_jobs` table with JSONB `params`. All outputs use existing `job_outputs` table with `file_category` strings.

Total across all phases: 14 Alembic migrations (unchanged from Phase A).

---

## Test Coverage

| Test File | New in B | Total | Scope |
|-----------|----------|-------|-------|
| `test_rnaseq_alignment_pipeline.py` | **12** | 12 | Validation (5), mock_run (3), QC parsing (2), methods text (2) |
| `test_rnaseq_auto_pipeline.py` | **12** | 12 | Chain start (1), trimming queue (2), alignment queue (2), DE queue (2), DE complete (1), skip trim (1), error (1), treatment detection (1), CUT&RUN regression (1) |
| `test_qc_report.py` | **8** | 22 | RNA-seq QC report success, download, 404, 409, unauthorized, CSV 409, wrong type, backward compat |
| **Phase B Total** | **32** | | |
| **All Phases Cumulative** | | **600** | |

All tests run inside Docker (`docker compose exec api pytest tests/`). `ruff check` + `ruff format --check`: clean. `npm run build`: clean.

---

## New Files Created in Phase B

### Backend Pipeline Modules
- `backend/pipelines/rnaseq_alignment.py` — STAR + Salmon + BigWig pipeline stage (~890 lines)
- `backend/pipelines/rnaseq_de.py` — DESeq2 stub stage (~250 lines)

### Frontend Components
- `frontend/src/components/rnaseq-alignment/NewRnaseqAlignmentWizard.tsx` — 3-step alignment wizard
- `frontend/src/components/rnaseq-alignment/RnaseqAlignmentDetailsStep.tsx` — Wizard step 1
- `frontend/src/components/rnaseq-alignment/RnaseqAlignmentSettingsStep.tsx` — Wizard step 3
- `frontend/src/components/rnaseq-alignment/RnaseqAlignmentTab.tsx` — 5 sub-tab results tab
- `frontend/src/components/rnaseq-alignment/RnaseqAlignmentInputPanel.tsx` — Input sub-tab
- `frontend/src/components/rnaseq-alignment/RnaseqAlignmentQCReportPanel.tsx` — QC metrics + charts
- `frontend/src/components/ui/button-variants.ts` — Extracted CVA variants (Fast Refresh fix)
- `frontend/src/components/fastqs/FastpConfigModal.tsx` — fastp config modal for RNA-seq trimming

### Backend Tests
- `backend/tests/test_rnaseq_alignment_pipeline.py` — 12 tests (~230 lines)
- `backend/tests/test_rnaseq_auto_pipeline.py` — 12 tests (~400 lines)

### Files Significantly Modified
- `backend/config.py` — `MAX_CONCURRENT_RNASEQ_REACTIONS = 2`
- `backend/pipelines/__init__.py` — `rnaseq_alignment` + `rnaseq_de` stage registration
- `backend/pipelines/methods_text.py` — `RNASEQ_ANNOTATION_VERSIONS`, `rnaseq_alignment_methods()`
- `backend/schemas/auto_pipeline.py` — `remove_duplicates`, `include_de` fields
- `backend/schemas/qc_report.py` — `RnaseqAlignmentReactionMetrics`, `RnaseqAlignmentQCReport`
- `backend/services/qc_report_service.py` — 3 RNA-seq QC functions
- `backend/services/auto_pipeline_service.py` — RNA-seq chain routing, `_detect_conditions()` enhancement, 4 queue helpers
- `backend/routers/jobs.py` — 2 new endpoints
- `backend/tests/conftest.py` — `auto_pipeline_service` session patch
- `backend/tests/test_qc_report.py` — 8 new tests
- `frontend/src/api/types.ts` — `RnaseqAlignmentReactionMetrics`, `RnaseqAlignmentQCReport` interfaces
- `frontend/src/api/jobs.ts` — `getRnaseqQCReport()`, `downloadRnaseqQCCsv()`
- `frontend/src/api/autoPipeline.ts` — `removeDuplicates`, `includeDe` fields
- `frontend/src/hooks/useJobs.ts` — `useRnaseqQCReport()` hook
- `frontend/src/lib/constants.ts` — `RNASEQ_ALIGNMENT_FILE_CATEGORIES`, `RNASEQ_REFERENCE_GENOMES`
- `frontend/src/pages/ExperimentView.tsx` — Auto-pipeline button/banner enabled for RNA-seq, modal moved
- `frontend/src/pages/experiment/AlignmentTab.tsx` — Assay-type delegation to `RnaseqAlignmentTab`
- `frontend/src/pages/experiment/FastqsTab.tsx` — RNA-seq trimming awareness
- `frontend/src/pages/AnalysisQueuePage.tsx` — `rnaseq_alignment` in type filter
- `frontend/src/components/experiments/NewAnalysisDropdown.tsx` — "Alignment (STAR)" enabled
- `frontend/src/components/experiments/AutoPipelineConfigPanel.tsx` — RNA-seq variant
- `frontend/src/components/experiments/AutoPipelineModal.tsx` — Assay-type branching
- `frontend/src/components/experiments/AutoPipelineBanner.tsx` — RNA-seq step definitions
- `frontend/src/components/experiments/AutoPipelineStep.tsx` — `assayType` prop
- `frontend/src/components/experiments/CreateExperimentWizard.tsx` — Pipeline step enabled for RNA-seq
- `frontend/src/components/alignment/AlignmentFilesPanel.tsx` — Optional `categories` prop

---

## Known Issues / Tech Debt

### Resolved in Phase B
- ~~RNA-seq trimming from FASTQs tab always submitted CUT&RUN job type~~ -> assay-type-aware job submission
- ~~`activeCount` dead code in FileUploadZone~~ -> removed
- ~~`useMemo` deps warning in AutoPipelineStep~~ -> stabilized
- ~~`buttonVariants` Fast Refresh warning~~ -> extracted to separate file

### Still Open
- RNA-seq DE analysis (`rnaseq_de`) is a stub — Phase C implements real DESeq2 R scripts
- featureCounts pipeline stage — Phase C
- RSeQC + MultiQC QC pipeline — Phase C
- clusterProfiler pathway analysis — Phase C
- DE Analysis frontend tab + wizard — Phase C
- `rnaseq_de` not yet in `AnalysisQueuePage` job type filter (Phase C)
- fastp/STAR/Salmon binaries must be available on EC2
- STAR/Salmon indices must be pre-built on EC2 (~30GB each, ~1hr to build)
- `sjdbOverhang` hardcoded at 101 in reference scripts (should be `read_length - 1`)
- Genome annotation versions: awaiting PI input on whether to stay on gencode.vM10/v29 or update

---

## Dependencies Added in Phase B

| Package | Version | Purpose |
|---------|---------|---------|
| STAR | (system/conda) | Splice-aware alignment (called via subprocess) |
| Salmon | (system/conda) | Pseudo-alignment quantification (called via subprocess) |

No new Python pip or npm packages. STAR and Salmon are external binaries resolved via `shutil.which()`. bamCoverage (deepTools) and samtools are already available from CUT&RUN phases.

---

## Pipeline Stage Registry After Phase B

```python
_STAGES = {
    "trimming": TrimmingStage(),                    # CUT&RUN: Trimmomatic + kseq
    "rnaseq_trimming": RnaseqTrimmingStage(),       # RNA-seq: fastp
    "rnaseq_alignment": RnaseqAlignmentStage(),     # RNA-seq: STAR + Salmon + BigWigs
    "rnaseq_de": RnaseqDEStage(),                   # RNA-seq: DESeq2 (stub, Phase C)
    "alignment": AlignmentStage(),                  # CUT&RUN: Bowtie2 13-step
    "peak_calling": PeakCallingStage(),             # CUT&RUN: MACS2/SICER2/SEACR
    "diffbind": DiffBindStage(),                    # CUT&RUN: DiffBind R
    "custom_heatmap": CustomHeatmapStage(),         # deepTools heatmaps
    "pearson_correlation": PearsonCorrelationStage(),# R + Python correlation
    "roman_normalization": RomanNormalizationStage(),# Mouse-only normalization
}
```

---

## Auto-Pipeline Chains After Phase B

### CUT&RUN / CUT&Tag (unchanged)
```
FastQC -> Trimming (if adapters) -> Alignment (Bowtie2) ->
  Peak Calling -> [Roman Normalization (mouse)] ->
  [DiffBind (if conditions)] -> [Custom Heatmaps] ->
  [Pearson Correlation] -> Complete
```

### RNA-seq (new)
```
FastQC -> fastp Trimming (always) -> STAR+Salmon+BigWigs ->
  [DE Analysis (if conditions detected)] -> Complete
```

Condition detection for both chains uses 3-tier logic:
1. `experimental_condition` field (explicit)
2. `treatment` field (RNA-seq, new in Phase B)
3. Short name patterns (`ctrl`/`control`/`wt`, `mut`/`mutant`/`ko`)

---

## What's Next: Phase C (Downstream Analysis)

DESeq2 differential expression (real implementation), featureCounts gene counting, RSeQC + MultiQC comprehensive QC, clusterProfiler GO/KEGG pathway analysis. Interactive gene tables, volcano/MA/PCA plots, pathway dot plots. DE Analysis wizard and tab frontend. See `docs/RNASEQ-PLAN.md` Phase C for full spec.

Key prerequisites:
- Phase B complete (done)
- R with DESeq2, tximport, clusterProfiler, org.Mm.eg.db, org.Hs.eg.db, ggplot2, pheatmap, EnhancedVolcano
- featureCounts (Subread package) available on EC2
- RSeQC + MultiQC available on EC2
