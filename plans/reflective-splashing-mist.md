# Plan: Replace Hand-Rolled tus with tuspyserver

## Context

Cleave's CLAUDE.md mandates: "Prefer dependencies over hand-rolled code." The current `backend/routers/tus_upload.py` (335 lines) is a hand-rolled tus v1.0.0 implementation that works but lacks upload locking, expiration cleanup, crash recovery, and proper Content-Type validation (`-` vs `+` in `application/offset+octet-stream`). The research doc at `docs/tus-server-research.md` recommends `tuspyserver` v4.2.3 — a native FastAPI router with DI-based hooks, upload locking, and expiration. This plan replaces the hand-rolled code while preserving all finalization behavior (auto-gzip, DB records, storage accounting, FastQC).

---

## Critical Findings from Reading tuspyserver Source

After reading every file in the installed `tuspyserver==4.2.3` package, these are the verified integration points:

| Finding | Impact | Mitigation |
|---------|--------|------------|
| HEAD requires `filetype` in Upload-Metadata (core.py:115-122) | Resume breaks without it | Add `filetype: 'application/octet-stream'` to frontend metadata |
| Content-Type must be `application/offset+octet-stream` (with `+`, per tus spec) | Current hand-rolled code uses `-` (bug!) | tuspyserver is correct; update tests |
| `Content-Length` header required on PATCH (core.py:186) | Tests must include it | Add header to test PATCH requests |
| `Tus-Resumable: 1.0.0` required on POST/HEAD/PATCH/DELETE | Tests must include it | Add header to all test tus requests |
| Location header is absolute URL (`http://host/api/v1/tus/{uuid}`) | httpx + tus-js-client both handle this | No issue |
| `file_dep` can dynamically override `files_dir` per-request | Solves test STORAGE_ROOT override problem | Use `file_dep` for dynamic staging dir |
| Upload locking via `.locks` directory (request.py:55) | Better than current (no locking) | Free improvement |
| Auth applied to OPTIONS (core.py:291) | tus-js-client sends auth on all requests | No issue |

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `backend/pyproject.toml` | Edit — add `tuspyserver>=4.2.3` | ~1 line |
| `backend/routers/tus_upload.py` | **Rewrite** — 335 lines → ~130 lines | Full rewrite |
| `backend/main.py` | Edit — change router mount prefix, add CORS expose_headers | ~10 lines |
| `frontend/src/components/fastqs/FileUploadZone.tsx` | Edit — add `filetype` to metadata | ~1 line |
| `backend/tests/test_tus_upload.py` | Edit — adapt all 7 tests for tuspyserver protocol | ~40 lines changed |

---

## Step-by-Step Implementation

### Step 1: Add dependency

**File**: `backend/pyproject.toml`

Add `"tuspyserver>=4.2.3"` to `dependencies` list (after `"python-multipart"`).

### Step 2: Rewrite `backend/routers/tus_upload.py`

Replace the entire file. The new module has three sections:

**A) `_dynamic_files_dir` — file_dep for test compatibility**

```python
def _dynamic_files_dir():
    """Return staging dir dynamically so tests with overridden STORAGE_ROOT work."""
    async def handler(metadata: dict) -> dict:
        staging = str(Path(settings.STORAGE_ROOT) / "uploads")
        os.makedirs(staging, exist_ok=True)
        return {"files_dir": staging}
    return handler
```

This solves the problem that `create_tus_router(files_dir=...)` captures the value at import time, but tests override `settings.STORAGE_ROOT` at runtime. The `file_dep` is called per-request and can return a dynamic `files_dir`.

**B) `validate_fastq_upload` — pre_create_dep for validation**

DI function that receives `db: AsyncSession` and `current_user: User`. Returns an async handler that:
1. Requires `experiment_id` and `filename` in metadata (raise 400 if missing)
2. Validates FASTQ filename via `validate_fastq_filename()` (raise 400 on invalid)
3. Checks experiment permissions via `get_experiment_with_permission()` (raise 404 if unauthorized)
4. Checks `upload_info["size"]` against `settings.UPLOAD_MAX_SIZE_MB` (raise 413 if too large)

Reuses existing functions from `services/fastq_service.py` and `services/permission_helpers.py`.

**C) `on_fastq_upload_complete` — upload_complete_dep for finalization**

DI function that receives `db: AsyncSession` and `current_user: User`. Returns an async handler that receives `file_path: str` (absolute path to completed file in staging dir) and `metadata: dict`. Handler does:

1. Extract `filename`, `experiment_id` from metadata
2. Look up experiment via `get_experiment_with_permission()` to get `project_id`
3. Call `validate_fastq_filename()` for `(prefix, direction)`
4. Determine if auto-gzip needed (`.fastq` or `.fq` without `.gz`)
5. Build destination: `projects/{project_id}/{experiment_id}/fastqs/raw/{filename}[.gz]`
6. If gzip needed: queue-based producer/consumer gzip (same logic as current `_finalize_upload`)
7. If not: `shutil.move(file_path, dest_path)`
8. Create `FastqFile` DB record with `upload_source="tus"`
9. `await _update_storage_bytes_atomic(db, experiment_id, project_id, file_size)`
10. Clean up tuspyserver staging files: remove `{uuid}.info` sidecar if it still exists
11. Trigger FastQC: `await run_fastqc_for_files(...)` (wrapped in try/except — FastQC failure must not fail upload)

This is a direct port of the current `_finalize_upload()` function. The only difference is that `file_path` comes from tuspyserver (absolute path) instead of being constructed manually.

**D) Router creation**

```python
router = create_tus_router(
    prefix="tus",
    files_dir=str(Path(settings.STORAGE_ROOT) / "uploads"),  # default; overridden by file_dep
    max_size=settings.UPLOAD_MAX_SIZE_MB * 1024 * 1024,
    auth=Depends(current_active_user),
    days_to_keep=5,
    pre_create_dep=validate_fastq_upload,
    upload_complete_dep=on_fastq_upload_complete,
    file_dep=_dynamic_files_dir,
)
```

### Step 3: Update `backend/main.py`

**Router mounting** — change from:
```python
app.include_router(tus_upload.router, prefix="/api/v1/tus", tags=["uploads"])
```
to:
```python
app.include_router(tus_upload.router, prefix="/api/v1", tags=["uploads"])
```

Because `create_tus_router(prefix="tus")` creates an `APIRouter(prefix="/tus")` internally. Mounting at `/api/v1` gives final paths `/api/v1/tus`, `/api/v1/tus/{uuid}` — identical to current URLs.

**CORS expose_headers** — add to CORSMiddleware:
```python
expose_headers=[
    "Location", "Upload-Offset", "Upload-Length", "Upload-Expires",
    "Tus-Resumable", "Tus-Version", "Tus-Extension", "Tus-Max-Size",
],
```

This fixes a latent bug: tus response headers are currently invisible to JavaScript through CORS. Works in dev only because Vite proxy makes requests same-origin.

### Step 4: Update frontend metadata

**File**: `frontend/src/components/fastqs/FileUploadZone.tsx` line 124-127

Add `filetype` to the tus-js-client metadata:
```typescript
metadata: {
    experiment_id: String(experimentId),
    filename: fileState.file.name,
    filetype: 'application/octet-stream',
},
```

Required because tuspyserver's HEAD handler (used for resume) validates that `filetype` exists in metadata and returns 400 if missing (core.py:115-122).

### Step 5: Adapt test suite

**File**: `backend/tests/test_tus_upload.py`

Changes to all 7 tests:

1. **Add `Tus-Resumable: 1.0.0`** header to all POST, HEAD, PATCH, DELETE requests
2. **Add `filetype` to `_encode_metadata()`** calls: `filetype="application/octet-stream"`
3. **Change Content-Type** from `application/offset-octet-stream` to `application/offset+octet-stream` (tus spec correct value)
4. **Add `Content-Length` header** to PATCH requests: `"Content-Length": str(len(data))`
5. **Handle absolute Location URL**: Extract path from absolute URL for subsequent requests, or rely on httpx resolving it correctly against `base_url`
6. **OPTIONS test**: Request `/api/v1/tus/` (trailing slash) since tuspyserver registers OPTIONS at `"/"`

Test scenarios remain the same (OPTIONS, create, full flow, resume, invalid filename, non-member, terminate). The behavioral assertions (status codes, DB records, file existence) are unchanged.

---

## What Gets Better

| Aspect | Before (hand-rolled) | After (tuspyserver) |
|--------|---------------------|---------------------|
| Upload locking | None — concurrent PATCHes can corrupt files | Per-upload file locks via `.locks` directory |
| Crash recovery | None — partial writes leave inconsistent state | Lock release + offset validation on resume |
| Expiration | None — abandoned uploads stay forever | `days_to_keep=5` + `Upload-Expires` header |
| Protocol compliance | Missing `+` in Content-Type, no expiration extension | Full tus 1.0.0 with creation, termination, expiration, creation-with-upload, creation-defer-length, concatenation |
| Code to maintain | 335 lines of protocol logic | ~130 lines of business logic hooks only |
| Client disconnect handling | None | Saves current offset, releases lock |
| CORS headers | Missing `expose_headers` (latent bug) | Fixed with proper `expose_headers` list |

## What Stays the Same

- URL structure: `/api/v1/tus` (POST, OPTIONS), `/api/v1/tus/{uuid}` (HEAD, PATCH, DELETE)
- Frontend `FileUploadZone.tsx` component (1-line metadata addition only)
- All finalization behavior: auto-gzip, DB record, storage accounting, FastQC trigger
- Auth via `current_active_user` on all endpoints
- Pre-create validation: experiment permissions, filename rules, size limits
- `upload_source="tus"` on FastqFile records
- Old multipart upload endpoint in `fastq_service.upload_fastqs()` preserved as fallback
- 7 test scenarios (adapted for tuspyserver protocol, not reduced)

---

## Verification

1. **Lint/type check**: `docker compose exec api ruff check . && docker compose exec api ruff format --check .`
2. **Tests**: `docker compose exec api pytest tests/test_tus_upload.py -v` — all 7 tests pass
3. **Full test suite**: `docker compose exec api pytest tests/ -v` — no regressions
4. **Manual smoke test**: Open frontend, navigate to an experiment's FASTQs tab, drag-drop a `.fastq.gz` file, verify:
   - Upload progress bar works
   - File appears in FASTQs table with `uploadSource: "tus"`
   - FastQC report link appears after processing
   - Cancel button aborts upload
   - Resume works after page refresh mid-upload
