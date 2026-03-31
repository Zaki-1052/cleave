# Fix: Path Traversal via FASTQ Filename (Arbitrary File Write)

## Context

The security review identified a **critical path traversal vulnerability**. `validate_fastq_filename()` does not reject `/`, `\`, or `..` in filenames. A crafted filename like `A/../../../../tmp/evil_R1_001.fastq.gz` passes all validation and enables arbitrary file write via both the multipart upload and tus upload code paths. This can lead to RCE (overwriting cron jobs, application code, SSH keys, etc.).

## Fix Strategy: Defense-in-Depth (2 layers)

**Layer 1 — Input validation:** Reject path traversal characters in `validate_fastq_filename()`.
**Layer 2 — Output validation:** After constructing destination paths, verify they resolve within `STORAGE_ROOT` using the existing `resolve() + startswith()` pattern from `file_service.py:18-25` and `files.py:265`.

Also fix an inconsistent `startswith()` check (missing trailing `/`) in `fastq_files.py`.

---

## Changes

### 1. `backend/services/fastq_service.py` — Input validation (Layer 1)

**In `validate_fastq_filename()` (line 32), add after the alphanumeric-start check:**

```python
if "/" in filename or "\\" in filename or ".." in filename:
    raise ValueError(f"Filename must not contain path separators or '..': {filename}")
```

Update the docstring (lines 23-26) to document the new rule.

### 2. `backend/services/fastq_service.py` — Output validation (Layer 2)

**In `upload_fastqs()`, after line 197 (`dest_path = _build_storage_path(...)`) and before line 198 (`_save_file_to_disk`):**

```python
storage_root_resolved = Path(settings.STORAGE_ROOT).resolve()
if not str(dest_path.resolve()).startswith(str(storage_root_resolved) + "/"):
    raise ValueError(f"Path traversal detected in filename: {filename}")
```

### 3. `backend/routers/tus_upload.py` — Output validation (Layer 2)

**In `on_fastq_upload_complete()` handler, after line 100 (`dest_path` constructed) and before line 101 (`mkdir`):**

```python
storage_root_resolved = Path(settings.STORAGE_ROOT).resolve()
if not str(dest_path.resolve()).startswith(str(storage_root_resolved) + "/"):
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Path traversal detected in filename")
```

**Same check needed for the gzip branch after line 113 (`gz_dest` constructed), before line 114 (`mkdir`):**

```python
if not str(gz_dest.resolve()).startswith(str(storage_root_resolved) + "/"):
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Path traversal detected in filename")
```

### 4. `backend/routers/fastq_files.py` — Fix inconsistent `startswith` pattern

**Line 140:** Change `startswith(str(storage_root))` → `startswith(str(storage_root) + "/")`
**Line 184:** Same change.

This matches the correct pattern already used in `files.py:265` and `file_service.py:25`.

---

## Files Modified

| File | Change |
|------|--------|
| `backend/services/fastq_service.py` | Add path char rejection in `validate_fastq_filename()` (L32) + containment check in `upload_fastqs()` (L197) |
| `backend/routers/tus_upload.py` | Add containment check after path construction (L100, L113) |
| `backend/routers/fastq_files.py` | Fix `startswith` pattern (L140, L184) |

## Verification

1. **Run existing tests:** `docker compose exec api pytest tests/ -v` — all must pass (no legitimate filenames broken)
2. **Manual test — path traversal blocked:**
   ```bash
   # Should get 422/400
   curl -X POST /api/v1/experiments/1/fastqs/upload \
     -F "files=@test.fastq.gz;filename=A/../../../tmp/evil_R1_001.fastq.gz"
   ```
3. **Manual test — legitimate upload still works:**
   ```bash
   curl -X POST /api/v1/experiments/1/fastqs/upload \
     -F "files=@test_data/test_R1.fastq.gz"
   ```
4. **Ruff:** `docker compose exec api ruff check .` — no lint errors
