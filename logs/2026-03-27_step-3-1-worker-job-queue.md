# 2026-03-27 — Step 3.1: Worker Process & Job Queue

## What was done

- Added `job_dir: Path` parameter to `PipelineStage` interface (`run()`, `mock_run()`) for per-job working directories
- Updated `pipelines/__init__.py` dispatcher and `trimming.py` to accept the new parameter
- Created `services/job_output_service.py` — generic `persist_job_outputs()` that creates `JobOutput` records and atomically updates `storage_bytes` for any pipeline type
- Enhanced `worker.py`:
  - Fetches `project_id` from experiment (was only fetching name)
  - Creates per-job directory at `{STORAGE_ROOT}/projects/{pid}/{eid}/jobs/{jid}/`
  - Generic output dispatch: trimming uses its specialized handler, all other pipelines use `persist_job_outputs()`
  - Experiment status transitions: `new` → `in_progress` → `complete`/`error`
  - Switched from `logging` to `structlog`
  - Explicit `final_status` tracking (was relying on `pipeline_result is not None`)
  - Added `link_target` to notifications (`/experiments/{id}`)
- Added worker as 4th Docker Compose service (same image, `python worker.py`)
- Wrote 12 new tests: 4 for job_output_service, 8 for worker integration

## Decisions made

- `job_dir` added as a **second** parameter alongside `working_dir` (not replacing it) — trimming writes to the shared experiment tree via `working_dir`, alignment will use `job_dir`
- `patch_worker_sessions` fixture is **not autouse** — only tests that exercise worker/service code request it explicitly. This avoids breaking existing tests. The fixture patches every module that imports `async_session_factory` at the top level (`worker`, `trimming_service`, `job_output_service`, `fastqc_service`)
- Test verification queries use `test_session_factory` directly (not `async_session_factory`) to avoid the import-time binding issue
- Trimming's specialized handler (`trimming_service.py`) left untouched — coexists with the generic handler

## Open items

- ~~`_update_storage_bytes` duplication~~ — DONE: consolidated all copies to import `update_storage_bytes` from `job_output_service.py`
- Full test suite not yet run (user to verify) — individual file runs all pass
- Step 3.2 (SSE) and 3.3 (alignment pipeline module) are next

## Key file paths

- `backend/worker.py` — enhanced worker with job_dir, experiment status, generic dispatch
- `backend/services/job_output_service.py` — new generic output persistence
- `backend/pipelines/base.py` — updated ABC with `job_dir` parameter
- `backend/tests/test_worker.py` — 8 integration tests
- `backend/tests/test_job_output_service.py` — 4 unit tests
- `docker-compose.yml` — worker service added
