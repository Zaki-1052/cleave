# Phase A.3 — fastp Trimming Pipeline Stage

**Date**: 2026-04-07

## What was done

- Created `backend/pipelines/rnaseq_trimming.py` — `RnaseqTrimmingStage(PipelineStage)` with fastp adapter + quality trimming for RNA-seq paired-end FASTQs
- Frozen dataclass `_RnaseqTrimmingContext` + module-level `_process_pair()` worker function (same ThreadPoolExecutor concurrency pattern as CUT&RUN `trimming.py`)
- fastp command: `--detect_adapter_for_pe`, `--qualified_quality_phred 20`, `--length_required 25`, `--cut_front`, `--cut_tail`, `--cut_window_size 4`, `--cut_mean_quality 15`
- fastp HTML/JSON reports collected via `_collect_fastp_reports()` helper, returned as `fastp_reports` key in result dict
- Temp keys (`_fastp_json`, `_fastp_html`) stripped from output dicts via `_strip_temp_keys()` before returning to worker
- Registered `"rnaseq_trimming": RnaseqTrimmingStage()` in `backend/pipelines/__init__.py`
- Updated `backend/worker.py` routing: `job_type in ("trimming", "rnaseq_trimming")` routes to `create_trimmed_fastq_records` (reused as-is); fastp reports persisted via `persist_job_outputs`
- Created `backend/tests/test_rnaseq_trimming_pipeline.py` — 14 tests (5 validation, 3 mock run, 2 methods text, 4 concurrency)

## Decisions made

- **Reuse `create_trimmed_fastq_records` without modification** — RNA-seq trimming output dicts have the exact same shape as CUT&RUN trimming outputs (`prefix`, `r1_path`, `r2_path`, `r1_filename`, `r2_filename`, `r1_size`, `r2_size`, `r1_id`, `r2_id`)
- **fastp reports persisted separately** — `fastp_reports` key in result dict uses `persist_job_outputs` format (`file_category`, `filename`, `file_path`, `file_type`, `file_size_bytes`); new categories: `fastp_json`, `fastp_html`
- **Output filenames match CUT&RUN convention** — `{prefix}_R1_001_trimmed.fastq.gz` for consistency across the platform
- **No new config settings** — fastp resolved via `shutil.which("fastp")`; thread count uses existing `MAX_CONCURRENT_REACTIONS`
- **No adapter file validation** — fastp auto-detects adapters (`--detect_adapter_for_pe`), unlike Trimmomatic which requires explicit adapter FASTA
- **No intermediate files** — fastp writes directly to final output paths (no `trimmed_intermediate` cleanup needed, unlike CUT&RUN's Trimmomatic→kseq two-stage)
- **No kseq 42bp fixed-length trim** — RNA-seq reads should not be fixed-length trimmed

## Open items

- Phase A.4: Frontend RNA-seq trimming tab (`RnaseqTrimmingTab.tsx`) with fastp HTML report viewer
- Phase A.5: Tests for RNA-seq trimming + schema (integration-level API tests)
- Phase B: STAR+Salmon alignment, RNA-seq QC report, auto-pipeline, enable dropdown items

## Key file paths

- `backend/pipelines/rnaseq_trimming.py` — new fastp trimming pipeline module (~390 lines)
- `backend/pipelines/__init__.py` — stage registration (+2 lines)
- `backend/worker.py` — routing for `rnaseq_trimming` job type (+7 lines)
- `backend/tests/test_rnaseq_trimming_pipeline.py` — 14 tests (~240 lines)
