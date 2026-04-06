# 2026-03-26 — Phase 2 Bug Fixes (8 Issues)

## What Was Done

### Phase A — Quick Fixes
- **Issue 7**: Added `alias="perPage"` to projects router list endpoint (`routers/projects.py`)
- **Issue 6**: Extended SECRET_KEY/REFRESH_SECRET_KEY to 32+ chars in `config.py`, `docker-compose.yml`, `.env.example`; added pytest `filterwarnings` in `pyproject.toml`
- **Issue 4**: Extracted `get_experiment_with_permission()` and `check_experiment_membership()` to new `services/permission_helpers.py`, removed 5 duplicate copies from `fastq_service.py`, `reaction_service.py`, `job_service.py`, `routers/files.py`, `routers/fastq_files.py`
- **Issue 5**: Split `require_project_role()` in `dependencies.py` — non-members get 404, wrong-role members get 403

### Phase B — Moderate Refactor
- **Issue 8**: Refactored `_save_file_to_disk()` gzip path to use `queue.Queue` producer/consumer — async reader feeds chunks to threaded gzip writer via `run_in_executor`, avoiding event loop blocking

### Phase C — Major Features
- **Issue 1**: Replaced `BytesIO` buffered zip with `stream-zip` library for true streaming batch downloads — memory stays flat regardless of archive size
- **Issue 2**: Added HMAC-signed download token system (`services/download_token_service.py`), two new endpoints (`POST /files/download-token`, `GET /files/signed-download`), frontend rewritten to use `window.location.href` instead of Axios blob buffering
- **Issue 3**: Hand-rolled tus v1.0.0 resumable upload endpoints (`routers/tus_upload.py`) with staging directory, offset validation, auto-finalize on completion, FastQC trigger. Frontend `FileUploadZone.tsx` rewritten with `tus-js-client` for per-file progress, cancel, resume

## Decisions Made
- Used `stream-zip` over `zipfly` for streaming zip — it supports per-entry compression method selection (ZIP_STORED vs ZIP_DEFLATED)
- Hand-rolled tus instead of using `tuspyserver` library — **this should be revisited** per CLAUDE.md "prefer dependencies" principle. Research doc at `docs/tus-server-research.md` recommends replacing with `tuspyserver`
- Signed download tokens use HMAC-SHA256 with 5-min expiry, payload includes project_id for path resolution

## Open Items
- **Replace hand-rolled tus with `tuspyserver`** — research complete in `docs/tus-server-research.md`, ready for next session
- Existing multipart upload endpoint kept for backward compatibility alongside tus

## Test Results
- 138 original tests pass + 13 new tests = **151 total, 0 failures**
- `ruff check` + `ruff format --check`: clean
- `tsc --noEmit`: clean

## Key File Paths
- `backend/services/permission_helpers.py` (new)
- `backend/services/download_token_service.py` (new)
- `backend/routers/tus_upload.py` (new)
- `backend/tests/test_tus_upload.py` (new, 7 tests)
- `docs/tus-server-research.md` (new, library research)
- `frontend/src/components/fastqs/FileUploadZone.tsx` (rewritten with tus-js-client)
- `frontend/src/api/files.ts` (rewritten with signed download URLs)
