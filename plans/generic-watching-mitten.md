# Plan: Step 3.1 — Worker Process & Job Queue

## Context

Phase 2 is complete with 151 tests passing. The worker infrastructure was built during Phase 2 for trimming jobs and is ~75% done for the general case. Step 3.1 bridges the gap so the worker can handle **any** pipeline type (especially alignment in Step 3.3), not just trimming. The key gaps are: (1) job-specific working directories, (2) generic output persistence, (3) experiment status transitions, (4) Docker Compose worker service, and (5) tests.

---

## Changes

### 1. Add `job_dir` parameter to pipeline interface

The trimming pipeline writes to the experiment's shared file tree (`fastqs/trimmed/`) using `working_dir` (the `projects/` root). Alignment will write to a per-job directory (`jobs/{job_id}/`). Rather than changing `working_dir` semantics (which would break trimming), add a second parameter `job_dir`.

**`backend/pipelines/base.py`** — Update ABC signatures:
- `run(self, job_id, params, working_dir, job_dir)`
- `mock_run(self, job_id, params, working_dir, job_dir)` — default impl adds `job_dir` param (ignored)

**`backend/pipelines/trimming.py`** — Add `job_dir` parameter to `run()` and `mock_run()` (unused, just accept it). Lines ~80 and ~210.

**`backend/pipelines/__init__.py`** — Accept `job_dir` in `run()` and `_mock_run()`, forward to stages.

**`backend/tests/test_trimming_pipeline.py`** — Update `mock_run()` calls at lines ~99 and ~120 to pass `job_dir=working_dir / "jobs" / "1"`.

### 2. Create `services/job_output_service.py` (new file)

Generic post-pipeline output persistence. Creates `JobOutput` records for any pipeline's output list and atomically updates `storage_bytes`.

```python
async def persist_job_outputs(
    job_id: int,
    experiment_id: int,
    project_id: int,
    outputs: list[dict],  # each: {file_category, filename, file_path, file_type, file_size_bytes, reaction_id?}
) -> int:  # returns total_bytes
```

- Uses `async_session_factory()` directly (worker context, not FastAPI request)
- Atomic `storage_bytes` increment via `SET storage_bytes = storage_bytes + :delta`
- Existing `_update_storage_bytes` helper is duplicated in `trimming_service.py`, `fastqc_service.py`, `fastq_service.py`, `tus_upload.py` — extract into this new module and have others import from here

### 3. Enhance `worker.py`

**3a. Fetch `project_id` from experiment** (~line 68):
Currently only fetches `Experiment.name`. Change to also fetch `Experiment.project_id`:
```python
exp_result = await db.execute(
    select(Experiment.name, Experiment.project_id).where(Experiment.id == job.experiment_id)
)
exp_row = exp_result.one_or_none()
experiment_name = exp_row.name if exp_row else "Unknown"
project_id = exp_row.project_id if exp_row else 0
```
Snapshot `project_id` alongside other job attributes.

**3b. Construct `job_dir`** (replace line 92):
```python
working_dir = Path(settings.STORAGE_ROOT) / "projects"
job_dir = working_dir / str(project_id) / str(experiment_id) / "jobs" / str(job_id)
job_dir.mkdir(parents=True, exist_ok=True)
```
Pass both `working_dir` and `job_dir` to `pipeline_run()`.

**3c. Generic output dispatch** (after line 112):
Keep the existing trimming-specific handler. Add a generic path for other pipelines:
```python
if pipeline_result and pipeline_result.get("outputs"):
    if job_type == "trimming":
        await create_trimmed_fastq_records(...)  # existing, unchanged
    else:
        await persist_job_outputs(
            job_id=job_id,
            experiment_id=experiment_id,
            project_id=project_id,
            outputs=pipeline_result["outputs"],
        )
```
This avoids touching working trimming code. Alignment (Step 3.3) will use the generic path.

**3d. Experiment status transitions** (new helper):
```python
async def _update_experiment_status(experiment_id: int, job_status: str) -> None:
```
- `running` → set experiment from `new` to `in_progress`
- `error` → set experiment to `error`
- `complete` → check if ALL experiment jobs are complete/terminated; if so, set experiment to `complete`

Call after setting job to `running` (line 88) and after pipeline completes (success or error).

**3e. Switch to structlog** (replace lines 20-21):
```python
from logging_config import setup_logging
setup_logging()
logger = structlog.get_logger("cleave.worker")
```

**3f. Fix notification status tracking** (line 141):
Replace the indirect `pipeline_result is not None` check with an explicit `final_status` variable set in the try/except branches.

**3g. Add `link_target` to notifications**:
Pass `experiment_id` to `_create_job_notification()`, set `link_target=f"/experiments/{experiment_id}"` on the notification record.

### 4. Add worker to Docker Compose

**`docker-compose.yml`** — Add 4th service:
```yaml
worker:
  build: ./backend
  command: python worker.py
  volumes:
    - ./backend:/app
    - ./dev-data:/data/cleave
    - ./cutana:/cutana:ro
    - ~/Documents/BIO_LAB/genomes:/data/cleave/genomes:ro
  environment:
    DATABASE_URL: postgresql+asyncpg://cleave:dev@db:5432/cleave
    PIPELINE_MODE: mock
    STORAGE_ROOT: /data/cleave
    GENOME_INDEX_DIR: /data/cleave/genomes
    WORKER_POLL_INTERVAL_SECONDS: 2
  depends_on:
    - db
  restart: unless-stopped
```
Same image as `api`, different command. No port mapping. Depends only on `db`.

### 5. Tests

**`backend/tests/conftest.py`** — Add fixture to override `async_session_factory` for worker/service code that bypasses FastAPI DI:
```python
@pytest.fixture(autouse=True)
def override_async_session_factory(monkeypatch):
    import database
    monkeypatch.setattr(database, "async_session_factory", test_session_factory)
```

**`backend/tests/test_job_output_service.py`** (new) — Unit tests:
- `test_persist_outputs_creates_records` — verify JobOutput rows
- `test_persist_outputs_updates_storage_bytes` — verify atomic increment
- `test_persist_outputs_empty_list` — no-op case
- `test_persist_outputs_with_reaction_id` — nullable FK

**`backend/tests/test_worker.py`** (new) — Integration tests:
- `test_worker_picks_up_queued_job` — insert queued job → `poll_and_run()` → status=complete
- `test_worker_creates_notification` — verify notification record
- `test_worker_sets_error_on_failure` — invalid params → status=error, error_message set
- `test_worker_updates_experiment_in_progress` — experiment.status transitions
- `test_worker_noop_when_no_jobs` — returns cleanly
- `test_worker_creates_job_dir` — verify directory exists after run

---

## Implementation Order

1. `pipelines/base.py` — add `job_dir` param
2. `pipelines/trimming.py` — accept `job_dir` (unused)
3. `pipelines/__init__.py` — forward `job_dir`
4. `tests/test_trimming_pipeline.py` — pass `job_dir` to mock_run calls
5. `services/job_output_service.py` — new generic output persistence
6. `worker.py` — all changes (3a-3g above)
7. `docker-compose.yml` — add worker service
8. `tests/conftest.py` — add `async_session_factory` override
9. `tests/test_job_output_service.py` — new tests
10. `tests/test_worker.py` — new tests

---

## Files Modified

| File | Change |
|------|--------|
| `backend/pipelines/base.py` | Add `job_dir` param to `run()`, `mock_run()` |
| `backend/pipelines/trimming.py` | Accept `job_dir` param (unused) |
| `backend/pipelines/__init__.py` | Accept and forward `job_dir` |
| `backend/worker.py` | Project ID lookup, job_dir creation, generic dispatch, experiment status, structlog, notification fixes |
| `backend/services/job_output_service.py` | **New file** — `persist_job_outputs()` |
| `docker-compose.yml` | Add worker service |
| `backend/tests/conftest.py` | Add `async_session_factory` override fixture |
| `backend/tests/test_trimming_pipeline.py` | Pass `job_dir` to updated signatures |
| `backend/tests/test_job_output_service.py` | **New file** — unit tests |
| `backend/tests/test_worker.py` | **New file** — integration tests |

## What Is NOT Changing

- `trimming_service.py` — stays as-is (its `JobOutput` + `FastqFile` creation continues to work)
- `job_service.py` — no changes needed
- `notification_service.py` — no changes needed
- Database models — no schema changes, no new migrations
- Frontend — no changes in this step
- The alignment pipeline module itself — that's Step 3.3

## Verification

After implementation:
1. `docker compose up` starts 4 services (db, api, frontend, worker)
2. Worker logs show `Worker started (poll interval: 2s)` via structlog
3. Create a job via API: `POST /api/v1/experiments/{id}/jobs` with `jobType: "trimming"`
4. Worker picks it up → runs mock pipeline → status transitions: queued → running → complete
5. Experiment status transitions: new → in_progress → complete
6. Notification created for the launching user
7. `job_dir` directory created at `dev-data/projects/{pid}/{eid}/jobs/{jid}/`
8. All existing 151 tests still pass
9. New tests pass: `docker compose exec api pytest tests/test_worker.py tests/test_job_output_service.py`
10. `ruff check backend/` passes
