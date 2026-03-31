# Phase 7.4 — Error Handling & Job Management

## Context

Phases 1-6 + 7.1 + 7.3 are complete (384 tests passing). The worker runs jobs end-to-end but has no way to cancel running/queued jobs, retry failed ones, or show detailed error context. The `terminated` status exists in the enum but has zero backend/frontend support. React has no global error boundary. This phase closes those gaps.

---

## Scope (from PLAN.md §7.4)

1. **Graceful job termination** — "Terminate" button on running/queued jobs
2. **Retry logic** — failed/terminated jobs can be re-queued with same parameters
3. **Error details** — full error message + last 50 lines of pipeline log in UI
4. **Global error boundary** — React ErrorBoundary for unhandled frontend errors

---

## Step 1: Database Migration

**New migration**: Add two nullable columns to `analysis_jobs`:
- `termination_requested_at` (TIMESTAMPTZ, nullable) — signals the worker to stop a running job
- `retry_of_job_id` (INT, nullable, FK to `analysis_jobs.id`) — links retried job to original

**Files to modify:**
- `backend/models/analysis_job.py` — add both columns
- New migration via `alembic revision --autogenerate`

**Why two columns instead of overloading `parent_job_id`**: `parent_job_id` encodes dependency chains (peak calling → alignment). Retry is a different semantic (re-attempt of same work). Dedicated column avoids ambiguity.

---

## Step 2: Terminate — Backend

### 2a. Service: `terminate_job()` in `backend/services/job_service.py`

```python
async def terminate_job(db, job_id, user_id) -> AnalysisJob:
```
- Fetch job, verify admin/contributor role via `get_experiment_with_permission()`
- **Queued**: set `status='terminated'`, `completed_at=now()` — worker's `WHERE status='queued'` filter already skips it
- **Running**: set `termination_requested_at=now()` — worker detects this and stops between substeps. Also set `status='terminated'` immediately so UI reflects the change via SSE
- **Complete/error/terminated**: return 409 Conflict
- Log `job_terminated` event via `log_event()`

### 2b. Router: `POST /jobs/{id}/terminate` in `backend/routers/jobs.py`

- Returns 200 with `JobRead`, 404 if no access, 409 if not terminable
- Uses `_get_authorized_job()` helper (already exists)

### 2c. Pipeline termination check in `backend/pipelines/base.py`

Add `TerminatedError(Exception)` class.

Add optional `cancelled: Callable[[], bool] | None = None` parameter to `run_cmd()` and `run_piped_cmd()`. If provided and returns True before subprocess execution, raise `TerminatedError`. This is a lightweight pre-check — it doesn't kill a running subprocess, but stops the pipeline between steps.

### 2d. Pipeline dispatcher in `backend/pipelines/__init__.py`

Add `cancelled` parameter to `run()`. Pass it through to `stage.run()`. Each pipeline stage already wraps `run_cmd()` in local helpers (e.g., alignment.py line 374: `def _run(cmd, **kwargs): return run_cmd(cmd, master_log=master_log, **kwargs)`). We add `cancelled=cancelled` to those wrappers.

### 2e. Worker changes in `backend/worker.py`

1. Add a **synchronous** termination checker using a cached sync SQLAlchemy engine (the pipeline code is synchronous — it calls `subprocess.run()`):

```python
_sync_engine = None

def _get_sync_engine():
    global _sync_engine
    if _sync_engine is None:
        sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
        _sync_engine = create_engine(sync_url, pool_size=1)
    return _sync_engine

def _sync_check_terminated(job_id: int) -> bool:
    with _get_sync_engine().connect() as conn:
        row = conn.execute(
            text("SELECT termination_requested_at FROM analysis_jobs WHERE id = :id"),
            {"id": job_id}
        ).fetchone()
        return row is not None and row[0] is not None
```

2. Build a `cancelled` callback: `lambda: _sync_check_terminated(job_id)` and pass it to `pipeline_run()`.

3. Catch `TerminatedError` separately from generic exceptions in the try/except block. On `TerminatedError`:
   - Set `status='terminated'`, `duration_seconds`, `completed_at`
   - Update experiment status (treat like error — don't flip experiment to complete)
   - Create "Job Terminated" notification
   - Log `job_terminated` event

4. Add `terminated` handling to `_create_job_notification()`:
   ```python
   elif status == "terminated":
       title = "Job Terminated"
       message = f'"{job_name}" in experiment "{experiment_name}" was terminated.'
       notif_type = "job_terminated"
   ```

5. Also: before calling `pipeline_run()`, check if termination was already requested (race condition where terminate fires between job pickup and pipeline start).

### 2f. Experiment status for terminated jobs

Update `_update_experiment_status()`: treat `"terminated"` the same as checking for completion — if all jobs are complete/terminated, set experiment to complete. If some are still pending, leave as-is.

**Files modified:**
- `backend/pipelines/base.py` — add `TerminatedError`, `cancelled` param on `run_cmd`/`run_piped_cmd`
- `backend/pipelines/__init__.py` — pass `cancelled` through dispatcher
- `backend/pipelines/alignment.py` — pass `cancelled` to local `_run`/`_piped` helpers
- `backend/pipelines/peak_calling.py` — same pattern
- `backend/pipelines/trimming.py` — same pattern
- `backend/pipelines/diffbind.py` — same (R subprocess calls)
- `backend/pipelines/custom_heatmap.py` — same
- `backend/pipelines/pearson_correlation.py` — same
- `backend/pipelines/roman_normalization.py` — same
- `backend/worker.py` — sync engine, cancelled callback, TerminatedError handling, notification
- `backend/services/job_service.py` — `terminate_job()`
- `backend/routers/jobs.py` — POST terminate endpoint

---

## Step 3: Retry — Backend

### 3a. Service: `retry_job()` in `backend/services/job_service.py`

```python
async def retry_job(db, job_id, user_id) -> AnalysisJob:
```
- Fetch original job, verify admin/contributor role
- Only allow if `status in ('error', 'terminated')` — return 409 otherwise
- Create **new** `AnalysisJob` with:
  - Same `experiment_id`, `job_type`, `name`, `params`, `parent_job_id` (preserve original dependency chain)
  - `retry_of_job_id = original.id`
  - `status='queued'`, `launched_by=user_id`
- Log `job_retried` event
- Return the new job

### 3b. Router: `POST /jobs/{id}/retry` in `backend/routers/jobs.py`

- Returns 201 with `JobRead` of the new job
- 404 if no access, 409 if not retryable

### 3c. Schema update in `backend/schemas/job.py`

Add `retry_of_job_id: int | None = None` to `JobRead`.

---

## Step 4: Error Details — Backend

### 4a. Log tail service in `backend/services/job_service.py`

```python
async def get_job_log_tail(db, job_id, user_id, lines=50) -> dict | None:
```
- Verify access via `get_job()`
- Resolve master log path. The log file names vary by pipeline type — look for any `.log` file in `{job_dir}/logs/`. The path is: `{STORAGE_ROOT}/projects/{project_id}/{experiment_id}/jobs/{job_id}/logs/`. Search for files matching `*.log` in that directory.
- Read the file, return last N lines + total line count
- Return `None` if no log file exists (return empty `logTail` with `totalLines: 0`)

### 4b. Router: `GET /jobs/{id}/log-tail` in `backend/routers/jobs.py`

- Query param `lines` (default 50, max 500)
- Returns `{ "logTail": "...", "totalLines": N }`
- 404 if job not found/no access

### 4c. Schema in `backend/schemas/job.py`

```python
class JobLogTailRead(CamelModel):
    log_tail: str
    total_lines: int
```

---

## Step 5: Frontend — API & Hooks

**File: `frontend/src/api/jobs.ts`** — add:
- `terminateJob(jobId)` — POST `/jobs/{id}/terminate`
- `retryJob(jobId)` — POST `/jobs/{id}/retry`
- `getJobLogTail(jobId, lines?)` — GET `/jobs/{id}/log-tail`

**File: `frontend/src/hooks/useJobs.ts`** — add:
- `useTerminateJob()` — mutation, invalidates `['job', id]`, `['jobs', eid]`, `['all-jobs']`
- `useRetryJob()` — mutation, invalidates `['jobs', eid]`, `['all-jobs']`
- `useJobLogTail(jobId, lines?)` — query, key `['job-log-tail', jobId]`, enabled only when jobId truthy

**File: `frontend/src/api/types.ts`** — add `retryOfJobId: number | null` to `AnalysisJob` type.

**File: `frontend/src/hooks/useSSE.ts`** — update the terminal status check to include `'terminated'`:
```typescript
if (data.status === 'complete' || data.status === 'error' || data.status === 'terminated') {
```

---

## Step 6: Frontend — JobErrorDetails Component

**New file: `frontend/src/components/ui/JobErrorDetails.tsx`**

Reusable component accepting `job: AnalysisJob` prop. Renders when `job.status === 'error'`:
- Red `bg-red-50` container with error icon and "Error Details" header
- Full `errorMessage` in a scrollable `<pre>` block (monospace, max-height with overflow)
- Copy-to-clipboard button for error message
- Collapsible "Pipeline Log (last 50 lines)" section:
  - Lazy-loads via `useJobLogTail(job.id)` only when expanded (use `enabled` flag)
  - Monospace `<pre>` block with scroll
  - Copy button for log content
  - "No pipeline log available" message when log is empty

**Replace** the simple red error boxes in all InfoPanel components:
- `frontend/src/components/alignment/AlignmentInfoPanel.tsx`
- `frontend/src/components/peak-calling/PeakCallingInfoPanel.tsx`
- `frontend/src/components/diffbind/DiffBindInfoPanel.tsx`
- `frontend/src/components/heatmap/CustomHeatmapInfoPanel.tsx` (or similar)
- `frontend/src/components/pearson/PearsonCorrelationInfoPanel.tsx` (or similar)
- `frontend/src/components/normalization/NormalizationInfoPanel.tsx` (or similar)

Replace:
```tsx
{job.errorMessage && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{job.errorMessage}</div>}
```
With:
```tsx
<JobErrorDetails job={job} />
```

---

## Step 7: Frontend — Terminate & Retry Buttons

Add **Terminate** and **Retry** buttons to all InfoPanel components (same 6 files as Step 6).

**Terminate button**: Visible when `job.status === 'queued' || job.status === 'running'`. Red-outlined pill button. Confirmation via `window.confirm()` before calling `useTerminateJob()`.

**Retry button**: Visible when `job.status === 'error' || job.status === 'terminated'`. Blue-outlined pill button. Calls `useRetryJob()`. On success, navigate to the new job's tab or invalidate queries so the job selector dropdown updates.

Also add an **Actions column** to `AnalysisQueuePage.tsx`:
- "Terminate" for queued/running jobs
- "Retry" for error/terminated jobs
- Both use the same mutations

---

## Step 8: Frontend — Global Error Boundary

**New file: `frontend/src/components/ErrorBoundary.tsx`**

Class component (React requires this for error boundaries):
- `getDerivedStateFromError()` captures the error
- `componentDidCatch()` logs to console
- Fallback UI: centered white card on gradient, "Something went wrong" heading, error message (dev only: stack trace), "Return to Home" button, "Try Again" button (resets boundary)
- Match existing visual language (Card, Button components)

**File: `frontend/src/App.tsx`** — wrap `<AuthenticatedLayout>` route group with `<ErrorBoundary>`. Login/register routes stay outside (those have their own error handling). This way, errors in one page don't break navigation — the boundary catches and shows the fallback while the router remains functional.

---

## Step 9: Tests

**File: `backend/tests/test_jobs_api.py`** — add ~13 tests:
1. `test_terminate_queued_job` — 200, status becomes terminated
2. `test_terminate_running_job` — 200, termination_requested_at set
3. `test_terminate_completed_job_409` — cannot terminate finished job
4. `test_terminate_unauthorized_404` — non-member blocked
5. `test_retry_error_job` — 201, new job with same params, retry_of_job_id set
6. `test_retry_terminated_job` — 201, works for terminated status too
7. `test_retry_queued_job_409` — cannot retry active job
8. `test_retry_unauthorized_404` — non-member blocked
9. `test_log_tail_with_log` — 200, returns last N lines
10. `test_log_tail_no_log` — 200, empty response when no log file
11. `test_log_tail_unauthorized_404` — non-member blocked
12. `test_terminate_creates_event` — verify experiment_events row
13. `test_retry_creates_event` — verify experiment_events row

**File: `backend/tests/test_worker.py`** — add ~2 tests:
14. `test_worker_skips_terminated_job` — terminate before pickup, worker ignores it
15. `test_terminated_error_handling` — cancelled callback raises TerminatedError, worker handles correctly

---

## Verification

1. `docker compose exec api alembic upgrade head` — migration applies
2. `docker compose exec api pytest tests/test_jobs_api.py tests/test_worker.py -v` — new tests pass
3. `docker compose exec api pytest tests/` — full suite green (384 + ~15 new)
4. `docker compose exec api ruff check .` — clean
5. `docker compose exec api ruff format --check .` — clean
6. `cd frontend && npm run build` — no errors
7. Manual: create a job in mock mode, terminate it from UI, verify status updates via SSE
8. Manual: let a job fail (or terminate it), retry from UI, verify new job queued

---

## Implementation Order

1. Migration + model (Step 1)
2. `TerminatedError` + `cancelled` param in `base.py` (Step 2c)
3. Dispatcher update (Step 2d)
4. Pipeline stage updates — pass `cancelled` through (Step 2d, all 7 stages)
5. Worker sync engine + termination check + TerminatedError handler (Step 2e)
6. Terminate service + router (Step 2a-b)
7. Retry service + router + schema (Step 3)
8. Log tail service + router + schema (Step 4)
9. Backend tests (Step 9)
10. Frontend API + hooks + types (Step 5)
11. SSE update (Step 5)
12. JobErrorDetails component (Step 6)
13. Terminate/Retry buttons in InfoPanels + AnalysisQueue (Step 7)
14. ErrorBoundary + App.tsx integration (Step 8)
15. Lint/typecheck/build validation
