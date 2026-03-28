# 2026-03-27 — Local Testing Bugfixes

## What was done

- **Fixed 422 on FASTQs endpoint**: Backend `per_page` was capped at `le=100`, but `NewAlignmentWizard` requests `perPage=500`. Raised limit to 500 in `routers/fastq_files.py`.
- **Fixed Uvicorn reload hang**: SSE `while True` loop held connections open forever during hot-reload. Added `--timeout-graceful-shutdown 3` to uvicorn command in `scripts/run-local.sh`.
- **Fixed FastQC blocking event loop**: `run_fastqc_for_files` (async background task) called `subprocess.run()` synchronously, freezing the server for ~35s per file. Wrapped with `await asyncio.to_thread()` in `services/fastqc_service.py`.
- **Fixed tus upload FastQC blocking**: Tus completion handler awaited FastQC inline. Changed to `asyncio.create_task()` (fire-and-forget) in `routers/tus_upload.py`.
- **Fixed storage_bytes not updating**: `update_storage_bytes()` in tus handler was called after `db.commit()` with no second commit. Added missing `await db.commit()`.
- **Fixed modal overflow**: `ReactionFormModal` expanded beyond viewport with no scroll. Added `max-h-[90vh]` and `overflow-y-auto` to `Modal` component.
- **Fixed FastQC report 401 Unauthorized**: Iframe loaded report URL without auth headers. Implemented HMAC-signed URL flow: new `GET /fastqc-token` endpoint generates short-lived signed URL, iframe uses `&display=inline` to render HTML. Added `display` query param to `signed-download` endpoint.
- **Removed redundant FastQC sidebar**: FastQC HTML already has its own summary — removed custom sidebar from `FastqcReportModal`.
- **Added FastQC completion notification**: `run_fastqc_for_files` now accepts `user_id` and `experiment_name`, creates a notification when all files are processed.
- **Fixed Bowtie2 missing read groups**: Picard MarkDuplicates failed with null read group. Added `--rg-id`, `--rg SM:`, `--rg LB:`, `--rg PL:ILLUMINA` flags to Bowtie2 command.

## Key file paths

- `backend/routers/fastq_files.py` — per_page limit, FastQC signed URL endpoint
- `backend/routers/tus_upload.py` — async FastQC, storage commit fix
- `backend/routers/files.py` — `display=inline` support on signed-download
- `backend/services/fastqc_service.py` — asyncio.to_thread, notifications
- `backend/pipelines/alignment.py` — Bowtie2 read group flags
- `frontend/src/components/ui/Modal.tsx` — scroll overflow fix
- `frontend/src/components/fastqs/FastqcReportModal.tsx` — signed URL, removed sidebar
- `scripts/run-local.sh` — graceful shutdown timeout
