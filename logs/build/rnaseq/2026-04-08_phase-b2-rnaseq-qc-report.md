# Phase B.2 — RNA-seq Alignment QC Report Endpoint

**Date**: 2026-04-08

## What Was Done

Added API endpoints to expose RNA-seq alignment QC data (STAR + Salmon metrics) as structured JSON and downloadable CSV. Extended B.1's pipeline parsers to capture 7 additional metrics required by the spec.

### Pipeline Parser Extensions (`backend/pipelines/rnaseq_alignment.py`)

- Extended `_parse_star_log()` with 5 splice breakdown metrics: annotated (sjdb), GT/AG, GC/AG, AT/AC, non-canonical
- Extended `_parse_salmon_meta()` with 2 fragment length stats: `frag_length_mean`, `frag_length_sd`
- Expanded `_QC_CSV_HEADERS` from 12 to 19 columns
- Updated `_write_rnaseq_qc_csv()` to write all 19 columns
- Updated mock STAR `Log.final.out` with 5 splice breakdown lines
- Updated mock Salmon `meta_info.json` with fragment length fields

### New Pydantic Schemas (`backend/schemas/qc_report.py`)

- `RnaseqAlignmentReactionMetrics` — 19 fields (8 STAR base + 5 splice breakdown + 1 mismatch + 3 Salmon base + 2 Salmon fragment length). The 7 new fields have defaults (0/0.0) for backward compatibility with old 12-column CSVs.
- `RnaseqAlignmentQCReport` — wraps `reference_genome` + `metrics: list[RnaseqAlignmentReactionMetrics]`

### New Service Functions (`backend/services/qc_report_service.py`)

- `_parse_rnaseq_qc_csv()` — CSV parser using DictReader, `row.get()` with defaults for backward compat
- `get_rnaseq_alignment_qc_report()` — validates job type `rnaseq_alignment` + status `complete`, returns structured report
- `get_rnaseq_qc_csv_path()` — returns absolute path for CSV download

### New API Endpoints (`backend/routers/jobs.py`)

- `GET /jobs/{jid}/rnaseq-qc-report` — returns `RnaseqAlignmentQCReport` JSON
- `GET /jobs/{jid}/rnaseq-qc-report/download` — returns CSV FileResponse

### Tests (`backend/tests/test_qc_report.py`)

8 new tests (22 total in file):
1. `test_get_rnaseq_qc_report_success` — all 19 camelCase fields verified
2. `test_get_rnaseq_qc_report_download` — CSV content-type and sample names
3. `test_get_rnaseq_qc_report_not_found` — 404 for non-existent job
4. `test_get_rnaseq_qc_report_not_complete` — 409 for queued job
5. `test_get_rnaseq_qc_report_unauthorized` — 404 for non-member
6. `test_download_rnaseq_qc_csv_not_complete` — 409 for CSV on queued job
7. `test_get_rnaseq_qc_report_wrong_job_type` — 409 on CUT&RUN alignment job
8. `test_get_rnaseq_qc_report_backward_compat` — old 12-column CSV parses with defaults

## Decisions Made

- **Extend B.1 parsers** rather than only exposing existing 12 columns — spec explicitly requires splice breakdown and fragment length stats
- **Backward compatibility via `row.get()` with defaults** — old CSVs from already-completed jobs will parse correctly with new fields defaulting to 0
- **Flat schema (no STAR/Salmon sub-models)** — matches existing CUT&RUN `AlignmentReactionMetrics` pattern
- **Reuse `_resolve_qc_csv_path()`** — the existing helper works for any job type since it just finds `file_category="qc_report"` + `file_type="csv"`

## Files Modified

- `backend/pipelines/rnaseq_alignment.py` — parser extensions, CSV headers, mock data
- `backend/schemas/qc_report.py` — 2 new Pydantic classes
- `backend/services/qc_report_service.py` — 3 new functions + 2 new imports
- `backend/routers/jobs.py` — 2 new endpoints + 3 new imports
- `backend/tests/test_qc_report.py` — 8 new tests + helpers + test data constants

## Verification

- `ruff check` + `ruff format --check`: clean
- 22/22 QC report tests pass (14 existing + 8 new)
- 14/14 RNA-seq trimming pipeline tests pass
- `npm run build`: clean

## Open Items

- B.3: Frontend alignment wizard + tab + QC report panel
- B.4: Auto-pipeline RNA-seq chain (fastp -> STAR+Salmon)
- B.5: Tests for rnaseq_alignment pipeline (mock_run, validation, methods text)
