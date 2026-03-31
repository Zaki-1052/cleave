# Phase 7.1: Storage Lifecycle Management — Implementation Plan

## Context

Phases 1-6 are complete (373 tests passing). The platform tracks `storage_bytes` on both `Experiment` and `Project` models, and the frontend already displays storage usage as formatted text ("53.2 GB") in three places. However, there is no automated cleanup of expired files, no visual storage gauges, and experiment/project deletion leaks disk space (DB records cascade-delete but physical files remain orphaned). Phase 7.1 addresses all of these.

### Key Finding: Intermediate BAMs Already Cleaned

The alignment pipeline (`backend/pipelines/alignment.py`) already deletes ALL intermediate BAMs during execution (SAM, raw BAM, filtered BAM, sorted BAM, heatmap matrices). Only `_final.bam` + `.bam.bai` persist as `file_category: "unique_bam"`. Similarly, trimming already cleans its `trimmed_intermediate/` directory. So the "auto-delete intermediate BAMs 7 days after job completion" requirement from the architecture plan is **already satisfied by the pipeline itself**.

### What Actually Needs Cleanup

1. **Pipeline logs** (`file_category: "log"`) — registered in `job_outputs`, auto-delete 30 days after job completion
2. **Stale tus staging files** — incomplete uploads lingering in `STORAGE_ROOT/uploads/`
3. **Orphaned disk files from experiment/project deletion** — existing bug where DB cascade-deletes don't touch disk

---

## Implementation Steps

### Step 1: Add Configuration Settings

**File**: `backend/config.py`

Add to the `Settings` class:

```python
# Storage Lifecycle (Phase 7.1)
CLEANUP_ENABLED: bool = True
CLEANUP_INTERVAL_HOURS: float = 24.0
LOG_RETENTION_DAYS: int = 30
STORAGE_QUOTA_BYTES: int = 0          # 0 = no quota (gauge shows raw usage only)
TUS_STAGING_RETENTION_HOURS: int = 48
```

Also add to `.env.example` and `docker-compose.yml` as appropriate.

---

### Step 2: Create Cleanup Service

**File**: `backend/services/cleanup_service.py` (NEW — ~100 lines)

Three functions:

1. **`cleanup_expired_logs()`** — Queries `job_outputs` joined to `analysis_jobs` for rows where `file_category="log"`, `status="complete"`, and `completed_at` is older than `LOG_RETENTION_DAYS`. For each match: delete file from disk (`Path.unlink(missing_ok=True)`), delete DB record, accumulate freed bytes per (experiment_id, project_id). After all deletions, call `update_storage_bytes(db, exp_id, proj_id, -delta)` for each pair. Single commit at end.

2. **`cleanup_stale_tus_uploads()`** — Scans `STORAGE_ROOT/uploads/` for files with `mtime` older than `TUS_STAGING_RETENTION_HOURS`. Deletes them. No DB interaction (tus staging files aren't tracked in the DB).

3. **`run_full_cleanup()`** — Calls both functions, returns combined summary dict.

**Key patterns to follow**:
- Uses `async_session_factory()` directly (same as `job_output_service.py`, `worker.py`)
- Uses `update_storage_bytes()` from `job_output_service.py` for atomic decrements
- Uses `Path.unlink(missing_ok=True)` (same as `fastq_service.py:287`)
- Uses `structlog.get_logger()` for logging

---

### Step 3: Integrate Cleanup into Worker

**File**: `backend/worker.py`

Add a module-level `_last_cleanup_at: float = 0.0` timestamp. Add a `_maybe_run_cleanup()` async function that checks `settings.CLEANUP_ENABLED` and whether `CLEANUP_INTERVAL_HOURS` has elapsed. If so, calls `run_full_cleanup()` and updates the timestamp.

Modify `main()`:

```python
async def main() -> None:
    logger.info(...)
    while True:
        await poll_and_run()
        await _maybe_run_cleanup()   # <-- NEW
        await asyncio.sleep(settings.WORKER_POLL_INTERVAL_SECONDS)
```

Initializing `_last_cleanup_at = 0.0` means the first cleanup runs on the first poll cycle after worker startup, catching up on any missed cleanup while the worker was down. Cleanup errors are caught and logged but never crash the worker.

---

### Step 4: Fix Experiment/Project Deletion to Clean Disk

**File**: `backend/services/experiment_service.py`

Modify `delete_experiment()` to:
1. Capture `project_id` and `storage_bytes` before deletion
2. After `db.delete(experiment)` + `db.commit()`, decrement project's `storage_bytes` by the experiment's `storage_bytes`
3. After successful commit, `shutil.rmtree()` the experiment directory

**File**: `backend/services/project_service.py`

Modify `delete_project()` to:
1. After `db.delete(project)` + `db.commit()`, `shutil.rmtree()` the project directory

Disk deletion happens AFTER commit so if commit fails, files are not accidentally deleted. The reverse risk (commit succeeds but rmtree fails) is less severe — orphaned files can be caught by a future disk scanner.

---

### Step 5: Admin API Endpoints

**File**: `backend/routers/admin.py` (NEW — ~40 lines)

Two endpoints:

1. **`POST /api/v1/admin/cleanup`** — Manually trigger cleanup. Restricted to superusers (`is_superuser` check). Calls `run_full_cleanup()`, returns summary dict.

2. **`GET /api/v1/admin/storage-info`** — Returns global storage info: `quotaBytes` from config + disk usage via `shutil.disk_usage()`. Available to all authenticated users (needed for frontend gauges).

**File**: `backend/main.py`

Register the admin router:
```python
from routers import admin
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
```

---

### Step 6: Frontend — StorageGauge Component

**File**: `frontend/src/components/ui/StorageGauge.tsx` (NEW — ~35 lines)

Props: `usedBytes: number`, `quotaBytes?: number`, `label?: string`

Behavior:
- If `quotaBytes > 0`: renders a progress bar (Tailwind `h-2 rounded-full bg-gray-200` track + colored fill) with `used / quota (%)` text below. Color thresholds: green < 70%, amber 70-90%, red > 90%.
- If `quotaBytes` is 0 or undefined: renders plain text `formatBytes(usedBytes)` — same as current behavior.

Uses existing `formatBytes()` from `frontend/src/lib/utils.ts`.

---

### Step 7: Frontend — API + Hook for Storage Info

**File**: `frontend/src/api/projects.ts` — Add `getStorageInfo()` function and `StorageInfo` interface.

**File**: `frontend/src/hooks/useProjects.ts` — Add `useStorageInfo()` hook with 5-minute `staleTime` (no need to re-fetch constantly).

---

### Step 8: Frontend — Integrate StorageGauge into Existing Pages

**File**: `frontend/src/pages/ProjectDetailPage.tsx`

Replace the current "Project Size" text display (lines ~84-85) with `<StorageGauge>` component, passing `project.storageBytes` and `storageInfo?.quotaBytes`.

**File**: `frontend/src/pages/experiment/DescriptionTab.tsx`

Replace the "Size" `<DetailRow>` (line ~33) with `<StorageGauge>` component inside a `<DetailRow>`.

Both pages call `useStorageInfo()` to get the quota value. When no quota is configured (default), the gauge falls back to the same text-only display as today — no visual regression.

---

### Step 9: Backend Tests

**File**: `backend/tests/test_cleanup_service.py` (NEW — ~9 tests)

| Test | What it verifies |
|------|-----------------|
| `test_cleanup_deletes_expired_logs` | Log outputs from jobs completed 31+ days ago are deleted (disk + DB), `storage_bytes` decremented |
| `test_cleanup_preserves_recent_logs` | Log outputs from jobs completed 5 days ago are NOT deleted |
| `test_cleanup_preserves_non_log_outputs` | bigwig/bam outputs from old completed jobs are NOT deleted |
| `test_cleanup_handles_missing_files` | Expired log with no file on disk — cleanup succeeds without error |
| `test_cleanup_stale_tus_uploads` | Old files in `uploads/` staging dir are deleted |
| `test_cleanup_preserves_recent_tus_uploads` | Recent files in `uploads/` are NOT deleted |
| `test_cleanup_storage_bytes_accuracy` | Multiple expired logs across experiments — each experiment/project decremented correctly |
| `test_run_full_cleanup_integration` | `run_full_cleanup()` returns correct combined summary dict |
| `test_cleanup_ignores_incomplete_jobs` | Log from a `status="running"` job is NOT deleted |

Additional tests in existing files:
- `test_experiments.py`: `test_experiment_delete_cleans_disk` — create experiment + files, delete via API, verify disk dir is gone
- `test_projects.py`: `test_project_delete_cleans_disk` — same pattern for projects

**File**: `backend/tests/conftest.py`

Add `services.cleanup_service` to `patch_worker_sessions` fixture's monkeypatch list.

---

## File Change Summary

| File | Action | ~Lines |
|------|--------|--------|
| `backend/config.py` | Modify | +5 |
| `backend/services/cleanup_service.py` | **Create** | ~100 |
| `backend/worker.py` | Modify | +25 |
| `backend/services/experiment_service.py` | Modify | +15 |
| `backend/services/project_service.py` | Modify | +8 |
| `backend/routers/admin.py` | **Create** | ~40 |
| `backend/main.py` | Modify | +3 |
| `backend/tests/test_cleanup_service.py` | **Create** | ~200 |
| `backend/tests/conftest.py` | Modify | +2 |
| `frontend/src/components/ui/StorageGauge.tsx` | **Create** | ~35 |
| `frontend/src/api/projects.ts` | Modify | +10 |
| `frontend/src/hooks/useProjects.ts` | Modify | +10 |
| `frontend/src/pages/ProjectDetailPage.tsx` | Modify | +5 |
| `frontend/src/pages/experiment/DescriptionTab.tsx` | Modify | +5 |
| `.env.example` | Modify | +5 |

---

## Implementation Order

1. Config settings (Step 1)
2. Cleanup service (Step 2)
3. Worker integration (Step 3)
4. Experiment/project disk cleanup fix (Step 4)
5. Admin endpoints + main.py registration (Step 5)
6. Backend tests + conftest patch (Step 9)
7. Run tests: `docker compose exec api pytest tests/test_cleanup_service.py`
8. Frontend StorageGauge component (Step 6)
9. Frontend API + hook (Step 7)
10. Frontend page integration (Step 8)
11. Verify: `npm run build` and `npx tsc --noEmit`

---

## Verification

**Backend**:
- `docker compose exec api pytest tests/test_cleanup_service.py` — all 9+ tests pass
- `docker compose exec api pytest tests/test_experiments.py -k "delete_cleans_disk"` — disk cleanup on delete
- `docker compose exec api pytest tests/test_projects.py -k "delete_cleans_disk"` — disk cleanup on delete
- `docker compose exec api ruff check .` — clean
- `docker compose exec api ruff format --check .` — clean

**Frontend**:
- `cd frontend && npx tsc --noEmit` — type-check passes
- `cd frontend && npm run build` — production build succeeds
- Manual: verify StorageGauge renders correctly in project sidebar and experiment description tab (both with `STORAGE_QUOTA_BYTES=0` for text-only mode and with a nonzero quota for bar mode)

**Integration**:
- With worker running, verify cleanup runs after configured interval (set `CLEANUP_INTERVAL_HOURS=0.001` for testing)
- Verify `POST /api/v1/admin/cleanup` returns summary dict (superuser only)
- Verify `GET /api/v1/admin/storage-info` returns quota + disk info

---

## What's Explicitly NOT in Scope

- **Disk scanning for orphaned files** — complex, deferred to later
- **Per-project storage quotas** (DB column + admin UI) — global config is sufficient for 7.1
- **Alembic migration** — no schema changes needed; all retention logic uses existing columns
- **Frontend test infrastructure** (vitest) — manual verification + TypeScript checks suffice
