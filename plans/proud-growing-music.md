# Phase 2.10: File Download + Phase 2 Completion

## Context

Phase 2.9 (File Browser) is complete — 128 tests passing, all linting clean. The file browser works with a dual-panel layout, recursive tree scanning, and single-file download via `downloadFile()`.

Phase 2.10 adds two remaining capabilities:
1. **X-Accel-Redirect** for production NGINX file serving (implement header logic now, NGINX config is Phase 7)
2. **Batch download** — zip selected files server-side and stream

There's also a **bug to fix**: `frontend/src/api/files.ts` imports `{ apiClient }` but `client.ts` only exports `export default client`. Every other API file uses `import client from './client'`. This needs to be corrected.

After 2.10, all Phase 2 Done Criteria should be checked off.

---

## Phase 2 Done Criteria Status

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Upload paired-end FASTQs via drag-and-drop | **Done** | `FileUploadZone.tsx`, `fastq_files.py` |
| FastQC runs automatically, reports viewable in modal | **Done** | `fastqc.py`, `FastqcReportModal.tsx` |
| Reactions defined manually or via CSV upload | **Done** | `ReactionsEditor.tsx`, `reactions.py` |
| Full experiment creation wizard (3 steps) | **Done** | `CreateExperimentWizard.tsx` |
| Adapter detection flags contaminated FASTQs | **Done** | `FastqsTab.tsx` amber banner |
| Trimming runs in mock mode, produces "trimmed" files | **Done** | `trimming.py` mock_run() |
| All Files tab shows experiment directory tree | **Done** | `AllFilesTab.tsx`, Phase 2.9 |
| Individual and batch file download works | **Partial** | Individual works, batch zip needed |

---

## Implementation Plan

### Step 1: Config — Add file serving settings

**File**: `backend/config.py`

Add to `Settings` class:
```python
# File serving (Phase 7 NGINX)
NGINX_FILE_SERVING: bool = False
NGINX_INTERNAL_PREFIX: str = "/internal-files/"

# Batch download limits
BATCH_DOWNLOAD_MAX_FILES: int = 100
BATCH_DOWNLOAD_MAX_BYTES: int = 10 * 1024 * 1024 * 1024  # 10 GB
```

Also add to `.env.example`:
```
# File serving (production only)
NGINX_FILE_SERVING=false
NGINX_INTERNAL_PREFIX=/internal-files/
```

**Rationale**: `NGINX_FILE_SERVING` is independent of `PIPELINE_MODE` — you might want mock pipelines on a staging server with NGINX, or real pipelines without NGINX during development.

### Step 2: Schema — Add `BatchDownloadRequest`

**File**: `backend/schemas/file.py`

Add:
```python
class BatchDownloadRequest(CamelModel):
    """Request body for batch file download."""
    paths: list[str]
```

### Step 3: Service — Add helper functions

**File**: `backend/services/file_service.py`

Add two functions:

1. `get_xaccel_path(abs_path, storage_root, internal_prefix)` — Converts an absolute file path to an NGINX `X-Accel-Redirect` internal URI. The NGINX config maps `internal_prefix` → `{storage_root}/projects/`, so the function computes `relative_to(projects_dir)` and prepends the prefix.

2. `is_compressed_file(filename)` — Checks if a file is already compressed (`.gz`, `.bam`, `.bw`, `.zip`, `.bz2`, `.xz`). Used to pick `ZIP_STORED` vs `ZIP_DEFLATED` in batch download to avoid double-compression.

### Step 4: Router — Refactor downloads + add batch endpoint

**File**: `backend/routers/files.py`

**4a. Extract `_file_download_response()` helper:**

Both `download_experiment_file` and `download_job_file` currently duplicate media type guessing and `FileResponse` construction. Extract this into a shared helper that:
- Guesses media type
- If `settings.NGINX_FILE_SERVING` is True: returns a `Response` with empty body, `X-Accel-Redirect` header, and `Content-Disposition` header
- Otherwise: returns `FileResponse` (current dev behavior)

Refactor both existing endpoints to use this helper.

**4b. Add `POST /experiments/{experiment_id}/files/batch-download`:**

New endpoint that:
1. Checks experiment membership (same `_check_experiment_membership` pattern)
2. Validates request: non-empty paths, <= `BATCH_DOWNLOAD_MAX_FILES`
3. For each path: calls `validate_experiment_path()`, checks `is_file()`, accumulates size
4. If path traversal detected → 403. If file missing → skip it (collect in `skipped` list)
5. If all files missing → 404
6. If total size > `BATCH_DOWNLOAD_MAX_BYTES` → 400
7. Build zip in `BytesIO` buffer — use `ZIP_STORED` for already-compressed files, `ZIP_DEFLATED` for text/small files
8. Stream the buffer back as `StreamingResponse` with `application/zip` media type
9. Set `Content-Disposition: attachment; filename="{experiment_name}_files.zip"` (sanitize name)
10. If any files were skipped, add `X-Batch-Skipped` response header

**Zip strategy**: Build in-memory via `BytesIO`, then stream in 64KB chunks. This is simple and correct for the 10GB cap with ~8-10 users. A true streaming zip approach would be premature complexity.

**Imports needed**: `zipfile`, `io.BytesIO`, `re` (for filename sanitization), `StreamingResponse` from fastapi.responses, `Response` from fastapi.

### Step 5: Frontend API — Fix import bug + add batch function

**File**: `frontend/src/api/files.ts`

1. **Fix import**: Change `import { apiClient } from './client'` to `import client from './client'` (matches all other API files). Update all `apiClient.` references to `client.`.

2. **Add `batchDownloadFiles()`**: POST to `/experiments/{experimentId}/files/batch-download` with `{ paths }` body and `responseType: 'blob'`. Create blob URL → anchor → click → cleanup (same pattern as `downloadFile`).

### Step 6: Frontend UI — Smart download

**File**: `frontend/src/pages/experiment/AllFilesTab.tsx`

Update `handleDownload` callback:
- **1 file selected** → use existing `downloadFile()` (direct GET, benefits from X-Accel-Redirect in prod)
- **2+ files selected** → use new `batchDownloadFiles()` (single zip download)

This replaces the current loop that downloads files one at a time.

### Step 7: Tests

**File**: `backend/tests/test_files.py`

Add tests following the existing pattern (register → create project → create experiment → upload FASTQs → test):

1. `test_batch_download_success` — POST with 2 valid paths → 200, verify response is a valid zip containing both files
2. `test_batch_download_empty_paths` — POST with `[]` → 400
3. `test_batch_download_path_traversal` — POST with `../../etc/passwd` → 403
4. `test_batch_download_nonexistent_skipped` — POST with 1 valid + 1 nonexistent → 200, zip has 1 file, `X-Batch-Skipped` header present
5. `test_batch_download_all_missing` — POST with only nonexistent paths → 404
6. `test_batch_download_nonmember` — POST as non-member → 404

Service unit tests:
7. `test_get_xaccel_path` — verify correct path construction
8. `test_is_compressed_file` — verify detection of .gz, .bam, .bw, .txt

X-Accel-Redirect tests:
9. `test_download_xaccel_redirect` — temporarily set `NGINX_FILE_SERVING=True`, verify response has `X-Accel-Redirect` header with correct path format

### Step 8: Mark Phase 2 Done Criteria in PLAN.md

Update `docs/PLAN.md` Phase 2 Done Criteria to check all boxes.

### Step 9: Session log

Write `logs/2026-03-26_phase-2.10-file-download.md` per project convention.

---

## Files Modified

| File | Change |
|------|--------|
| `backend/config.py` | Add 4 config vars |
| `.env.example` | Add 2 env vars |
| `backend/schemas/file.py` | Add `BatchDownloadRequest` |
| `backend/services/file_service.py` | Add `get_xaccel_path()`, `is_compressed_file()` |
| `backend/routers/files.py` | Add `_file_download_response()` helper, refactor 2 endpoints, add batch endpoint |
| `frontend/src/api/files.ts` | Fix import bug, add `batchDownloadFiles()` |
| `frontend/src/pages/experiment/AllFilesTab.tsx` | Smart single vs batch download |
| `backend/tests/test_files.py` | Add ~9 tests |
| `docs/PLAN.md` | Check off Phase 2 criteria |
| `logs/2026-03-26_phase-2.10-file-download.md` | Session log |

## Verification

1. `docker compose exec api ruff check .` — clean
2. `docker compose exec api ruff format --check .` — clean
3. `cd frontend && npx tsc --noEmit` — clean
4. `docker compose exec api pytest tests/` — all pass (expect ~137+ total)
5. Manual: upload FASTQs → go to All Files → select 1 file → click Download → file downloads
6. Manual: select 2+ files → click Download → zip downloads with both files
7. Manual: verify zip contains correct files with correct names
