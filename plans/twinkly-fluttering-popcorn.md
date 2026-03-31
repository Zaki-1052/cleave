# Phase 2 Bug Fix Plan — 8 Issues

## Context

Phase 2 (Data Management) is complete with 138 passing tests, but the previous coding agent made several compromises and deviations from the architecture plan. This session fixes 8 issues ranging from memory-safety bugs (batch download buffers entire zip in RAM) to spec deviations (tus upload was specified but plain multipart was implemented) to code quality issues (duplicated permission helpers). All fixes must preserve the existing 138 tests.

---

## Implementation Order

**Phase A — Quick Fixes (4 issues, ~30 min):**
1. Issue 7: Projects router `perPage` alias
2. Issue 6: JWT key length warning
3. Issue 4: Deduplicate permission helpers
4. Issue 5: 404 for non-members in `require_project_role`

**Phase B — Moderate Refactor (1 issue):**
5. Issue 8: Async gzip writes

**Phase C — Major Features (3 issues):**
6. Issue 1: Streaming zip for batch download
7. Issue 2: Signed download URLs
8. Issue 3: tus resumable uploads

---

## Issue 7: Projects Router `perPage` Alias

**Files:**
- `backend/routers/projects.py` (line 39)

**Change:** Add `alias="perPage"` to the `per_page` query parameter to match experiments/fastqs/reactions routers.

```python
# Before
per_page: int = Query(25, ge=1, le=100),
# After
per_page: int = Query(25, ge=1, le=100, alias="perPage"),
```

**Test:** Add test in `test_projects.py` that sends `?perPage=1` and verifies pagination respects it.

---

## Issue 6: JWT InsecureKeyLengthWarning

**Files:**
- `docker-compose.yml` — update `SECRET_KEY` and `REFRESH_SECRET_KEY` to 32+ chars
- `backend/config.py` — update default values to 32+ chars
- `.env.example` — update example values
- `backend/pyproject.toml` — add `filterwarnings` to suppress in tests

**Change:** All secret keys become 32+ characters. Add pytest filterwarnings for the `InsecureKeyLengthWarning` (belt and suspenders — the longer keys should eliminate it, but the filter ensures clean test output even if env vars override).

---

## Issue 4: Deduplicate Permission Helpers

**Files:**
- `backend/services/permission_helpers.py` (NEW)
- `backend/services/fastq_service.py` — remove local `_get_experiment_with_permission`, import shared
- `backend/services/reaction_service.py` — remove local copy, import shared
- `backend/services/job_service.py` — remove local copy, import shared
- `backend/routers/fastq_files.py` — remove local `_check_experiment_membership`, import shared
- `backend/routers/files.py` — remove local copy, import shared

**New module `permission_helpers.py`** contains two functions:
1. `get_experiment_with_permission(db, experiment_id, user_id, roles)` — joins Experiment + ProjectMember, filters by role
2. `check_experiment_membership(db, experiment_id, user_id)` — same join without role filter (any member)

All 5 files that had local copies now import from the shared module. Function names drop the leading underscore since they're now public.

---

## Issue 5: `require_project_role` 404 for Non-Members

**Files:**
- `backend/dependencies.py` (lines 25-29)
- `backend/tests/test_projects.py` — add test for non-member getting 404

**Change:** Split the combined `if member is None or member.role not in roles` into two checks:
- `member is None` → 404 "Project not found"
- `member.role not in roles` → 403 "Insufficient project permissions"

Existing tests that assert 403 for wrong-role members still pass (contributor trying admin-only action = 403). New test: non-member user tries to access project → gets 404.

---

## Issue 8: Auto-Gzip Async Fix

**Files:**
- `backend/services/fastq_service.py` — refactor `_save_file_to_disk`

**Problem:** `gzip.open()` + `f.write()` are synchronous CPU-bound operations blocking the async event loop. The function interleaves `await upload_file.read()` (async) with `gzip.write()` (sync).

**Solution:** Use a `queue.Queue`-based producer/consumer pattern:
1. **Async reader** (producer): reads chunks via `await upload_file.read(CHUNK_SIZE)`, puts them on the queue
2. **Thread-based gzip writer** (consumer): runs in `run_in_executor`, reads from queue, writes via `gzip.open()`
3. Sentinel `None` signals end of stream
4. `Queue(maxsize=8)` provides backpressure (8MB buffer at 1MB chunks)

The non-gzip path stays as-is — raw disk writes are kernel-buffered and don't block meaningfully at 1MB chunks.

---

## Issue 1: Streaming Zip for Batch Download

**Files:**
- `backend/pyproject.toml` — add `stream-zip` dependency
- `backend/routers/files.py` — replace `_stream_zip` function, remove `BytesIO` import

**Problem:** `_stream_zip()` builds entire zip in `BytesIO` (up to 10GB) before yielding any bytes.

**Solution:** Use `stream-zip` library, which supports per-entry compression method (ZIP_STORED vs ZIP_DEFLATED) and true streaming — it never holds the full archive in memory.

```python
from stream_zip import stream_zip, ZIP_64, NO_COMPRESSION_64, ZIP_AUTO

async def _stream_zip(files: list[tuple[str, Path]]) -> AsyncIterator[bytes]:
    def _generate():
        member_files = []
        for archive_name, abs_path in files:
            method = NO_COMPRESSION_64 if is_compressed_file(abs_path.name) else ZIP_AUTO(...)
            stat = abs_path.stat()
            modified_at = datetime.fromtimestamp(stat.st_mtime)
            member_files.append((archive_name, modified_at, 0o644, method, _file_chunks(abs_path)))
        yield from stream_zip(member_files)

    loop = asyncio.get_running_loop()
    # Run synchronous generator in thread, yield chunks back to async context
```

Key: `stream-zip` reads source files in chunks via the iterable `_file_chunks()`, so memory stays flat (~chunk_size). The synchronous generator runs in a thread executor to not block the event loop.

---

## Issue 2: Signed Download URLs

**Files:**
- `backend/config.py` — add `DOWNLOAD_TOKEN_EXPIRY_SECONDS: int = 300`
- `backend/services/download_token_service.py` (NEW) — HMAC-signed token create/verify
- `backend/routers/files.py` — add `POST /files/download-token` and `GET /files/signed-download` endpoints
- `frontend/src/api/files.ts` — rewrite `downloadFile()` and `batchDownloadFiles()` to use signed URLs
- `backend/tests/test_files.py` — add signed download tests

**Token format:** `base64url(json_payload).base64url(hmac_sha256_signature)`
- Payload: `{"exp_id": int, "path": str_or_null, "paths": list_or_null, "type": "single"|"batch", "exp_ts": unix_timestamp}`
- Signed with `SECRET_KEY` via HMAC-SHA256

**New endpoints:**
1. `POST /api/v1/files/download-token` — authenticated, validates permissions, returns `{url: "/api/v1/files/signed-download?token=..."}`
2. `GET /api/v1/files/signed-download` — **no auth header required** (token IS the auth), validates HMAC + expiry, returns FileResponse/StreamingResponse/X-Accel-Redirect

**Frontend:** All downloads go through signed URLs via `window.location.href = url`. No more Axios blob buffering. Browser's native download manager handles the file.

Existing download endpoints are **kept** for backward compatibility (tests still use them). The signed URL flow is an addition, not a replacement.

---

## Issue 3: tus Resumable Uploads

**Files:**
- `backend/routers/tus_upload.py` (NEW) — tus protocol endpoints
- `backend/main.py` — register tus router
- `backend/services/fastq_service.py` — extract `finalize_fastq_upload()` for reuse
- `frontend/package.json` — add `tus-js-client`
- `frontend/src/components/fastqs/FileUploadZone.tsx` — rewrite with tus-js-client
- `backend/tests/test_tus_upload.py` (NEW)

**Backend tus endpoints** (hand-rolled, no library needed — protocol is simple):
- `OPTIONS /api/v1/tus` — server capabilities
- `POST /api/v1/tus` — create upload (reads `Upload-Metadata` for experiment_id + filename)
- `HEAD /api/v1/tus/{upload_id}` — query current offset (for resume)
- `PATCH /api/v1/tus/{upload_id}` — append bytes
- `DELETE /api/v1/tus/{upload_id}` — cancel upload

**Staging:** Files stage at `{STORAGE_ROOT}/uploads/{upload_id}` with a `.json` sidecar for metadata. On completion (offset == upload_length), file is validated, moved to experiment directory, DB record created, FastQC triggered.

**Frontend:** `tus-js-client` replaces Axios multipart. Per-file progress tracking, automatic resume on reconnect, cancel support. Auth token passed via `headers` option (refreshed dynamically via `onBeforeRequest` callback).

**Existing multipart endpoint kept** — it still works, is still tested, and is useful for simple API clients.

---

## Verification Plan

After all 8 fixes:

1. `docker compose exec api pytest tests/ -v` — all 138 existing tests pass + new tests
2. `docker compose exec api ruff check .` — no lint errors
3. `docker compose exec api ruff format --check .` — formatting clean
4. `cd frontend && npx tsc --noEmit` — no TypeScript errors

**New tests to add:**
- `test_projects.py`: perPage alias test, non-member 404 test
- `test_files.py`: signed download token create/verify, signed download endpoint, streaming zip (verify StreamingResponse, not buffered)
- `test_tus_upload.py`: create upload, resume (HEAD), append (PATCH), complete (triggers DB record + FastQC), permission denied, invalid filename
- `test_fastq_upload.py`: existing auto-gzip test still passes with async refactor

**Manual verification:**
- Upload a test FASTQ in browser → tus progress bar works, resume works (kill and restart)
- Download a file → browser download dialog appears immediately (not buffered in tab)
- Batch download → zip streams to disk without memory spike
