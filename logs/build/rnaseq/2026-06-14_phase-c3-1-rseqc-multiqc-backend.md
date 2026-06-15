# Phase C.3-1 — RSeQC + MultiQC QC Pipeline Backend

> 1 session on 2026-06-14. Phase C.3-1 is **complete**. 36 new tests (all passing, 0 regressions). `ruff check` + `ruff format --check` + `npm run build`: clean.

---

## What Was Built

- **Pipeline stage** (`backend/pipelines/rnaseq_qc.py`, ~660 lines): `RnaseqQCStage` with 5 RSeQC modules per reaction (infer_experiment, read_distribution, geneBody_coverage, inner_distance, junction_saturation) + MultiQC aggregation. ThreadPoolExecutor per-reaction concurrency. Frozen dataclass context. Stdout parsers for infer_experiment (strandedness) and read_distribution (feature counts). Aggregate metrics CSV writer. Non-critical modules (coverage, distance, junction) fail gracefully.
- **Config**: `RSEQC_BED_DIR` setting, `RSEQC_BED_CONFIG` dict (mm10/hg38 BED12 filenames).
- **Methods text**: `rnaseq_qc_methods()` — mentions all 5 RSeQC modules, BED12 source, MultiQC.
- **Schemas**: `RSeQCReactionMetrics` (13 fields), `RnaseqQCDashboardReport` (genome, modules, metrics, multiqc_output_id).
- **QC report service**: CSV parser + `get_rnaseq_qc_dashboard_report()` + `get_rnaseq_qc_dashboard_csv_path()`.
- **API endpoints**: `GET /jobs/{id}/rnaseq-qc-dashboard-report` (JSON), `GET .../download` (CSV).
- **Auto-pipeline**: Inserted QC between alignment and DE. New chain: `FastQC → fastp → STAR+Salmon → [RSeQC+MultiQC] → [DE Analysis] → Complete`. Added `include_qc: bool = True` to `AutoPipelineConfig`. Added `_queue_rnaseq_qc()` helper resolving BAM/STAR log/fastp paths from prior jobs.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Job name length | "Auto: QC (RSeQC+MultiQC)" (26 chars) | `analysis_jobs.name` is `String(30)` — original 36-char name truncated |
| Non-critical module failure | `check=False` + log + continue | geneBody_coverage/inner_distance/junction_saturation can fail on edge cases without invalidating the job |
| MultiQC staging | Symlink prior outputs into staging dir | Avoids copying large files; MultiQC auto-detects formats from directory scan |
| include_qc default | `True` | Existing auto-pipeline configs gain QC by default via `config.get("include_qc", True)` |

## Open Items (Frontend — Separate Session)

- Frontend wizard, tab, and panels (Steps 9-13 in C.3 plan)
- Auto-pipeline config panel + modal + banner updates for QC toggle
- `AnalysisQueuePage` job type filter for `rnaseq_qc`
- Replace `PlaceholderTab` with real `RnaseqQCTab` at `rnaseq-qc/:jid` route

## Key File Paths

### New
- `backend/pipelines/rnaseq_qc.py` — Pipeline stage
- `backend/tests/test_rnaseq_qc_pipeline.py` — 16 pipeline tests
- `backend/tests/test_rnaseq_qc_report.py` — 6 endpoint tests

### Modified
- `backend/config.py`, `backend/pipelines/__init__.py`, `backend/pipelines/methods_text.py`
- `backend/schemas/qc_report.py`, `backend/schemas/auto_pipeline.py`
- `backend/services/qc_report_service.py`, `backend/routers/jobs.py`
- `backend/services/auto_pipeline_service.py`, `backend/tests/test_rnaseq_auto_pipeline.py`
