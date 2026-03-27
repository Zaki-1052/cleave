# 2026-03-26 — Replace Hand-Rolled tus with tuspyserver

## What Was Done

- **Replaced 335-line hand-rolled tus v1.0.0 implementation** with `tuspyserver` v4.2.3 library (185 lines of business logic hooks only)
- Added `tuspyserver>=4.2.3` to `backend/pyproject.toml`
- Rewrote `backend/routers/tus_upload.py` using `create_tus_router()` with three DI hooks:
  - `_dynamic_files_dir` (file_dep) — dynamic staging dir for test compatibility
  - `validate_fastq_upload` (pre_create_dep) — experiment permissions, filename validation, size limits
  - `on_fastq_upload_complete` (upload_complete_dep) — auto-gzip, file move, DB record, storage accounting, FastQC trigger
- Updated `backend/main.py`: changed router mount prefix, added CORS `expose_headers` for tus headers
- Updated `frontend/src/components/fastqs/FileUploadZone.tsx`: added `filetype` to tus metadata (required by tuspyserver HEAD)
- Adapted all 7 tests in `backend/tests/test_tus_upload.py` for tuspyserver protocol requirements
- **151 tests pass, 0 failures. ruff + tsc clean.**

## Decisions Made

- Used `file_dep` for dynamic `files_dir` resolution so tests with overridden `STORAGE_ROOT` work correctly
- Passed `auth=current_active_user` directly (not `Depends(...)`) — tuspyserver wraps it internally
- Fixed latent CORS bug: added `expose_headers` for tus-specific response headers
- Fixed latent Content-Type bug: hand-rolled code used `-` instead of spec-correct `+` in `application/offset+octet-stream`

## Open Items

- The `docs/tus-server-research.md` open item is now resolved — tuspyserver is integrated
- Update `logs/part-2/2026-03-26_phase2-bugfixes.md` line 25 to mark tus replacement as done (if desired)

## Key File Paths

- `backend/routers/tus_upload.py` (rewritten)
- `backend/main.py` (edited — mount prefix + CORS)
- `backend/tests/test_tus_upload.py` (adapted)
- `frontend/src/components/fastqs/FileUploadZone.tsx` (1-line metadata addition)
- `backend/pyproject.toml` (dependency added)
