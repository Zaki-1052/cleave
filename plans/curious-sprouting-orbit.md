# Plan: Consolidate `_update_storage_bytes` into `job_output_service.py`

## Context

`_update_storage_bytes` is duplicated across 4 files with identical logic — atomic SQL `UPDATE` to increment `storage_bytes` on both `Experiment` and `Project`. The canonical version already exists as the public `update_storage_bytes` in `job_output_service.py`. The cleanup task (from `logs/2026-03-27_step-3-1-worker-job-queue.md` line 27) is to consolidate all callers to import from there.

## Files to modify

| File | Change |
|------|--------|
| `backend/services/fastq_service.py` | Remove `_update_storage_bytes_atomic` definition (lines 125-138). Import `update_storage_bytes` from `job_output_service`. Update 2 call sites (lines 238, 313). |
| `backend/services/trimming_service.py` | Remove `_update_storage_bytes` definition (lines 18-31). Import `update_storage_bytes` from `job_output_service`. Update 1 call site (line 97). Remove now-unused `update` and model imports. |
| `backend/services/fastqc_service.py` | Remove `_update_storage_bytes` definition (lines 27-40). Import `update_storage_bytes` from `job_output_service`. Update 1 call site (line 88). Remove now-unused `update` and model imports. |
| `backend/routers/tus_upload.py` | Change import from `fastq_service._update_storage_bytes_atomic` to `job_output_service.update_storage_bytes`. Update 1 call site (line 172). |

**No changes needed** to `backend/services/job_output_service.py` — it already has the canonical public function.

## Steps

1. **Update `fastq_service.py`**: Remove the `_update_storage_bytes_atomic` function. Add `from services.job_output_service import update_storage_bytes`. Replace both calls to `_update_storage_bytes_atomic(...)` with `update_storage_bytes(...)`.

2. **Update `trimming_service.py`**: Remove the `_update_storage_bytes` function. Add `from services.job_output_service import update_storage_bytes`. Replace call to `_update_storage_bytes(...)` with `update_storage_bytes(...)`. Remove unused imports (`update` from sqlalchemy, `Experiment`, `Project` models) if they're only used by the deleted function.

3. **Update `fastqc_service.py`**: Same pattern as trimming_service — remove function, import from job_output_service, update call, clean unused imports.

4. **Update `tus_upload.py`**: Change `from services.fastq_service import _update_storage_bytes_atomic` to `from services.job_output_service import update_storage_bytes`. Update the call site.

5. **Run tests**: `docker compose exec api pytest tests/` to verify nothing breaks.

6. **Run linter**: `docker compose exec api ruff check .` to catch unused imports.

## Verification

- `docker compose exec api pytest tests/` — all tests pass
- `docker compose exec api ruff check .` — no lint errors
- `grep -r "_update_storage_bytes" backend/` — returns zero matches (only `update_storage_bytes` in job_output_service.py should remain)
