# Fix: Auto-Pipeline Authorization Bypass on Reference Projects

## Context

The security review of commit `403397f` (gold standard reference project) found that the three auto-pipeline endpoints allow **any authenticated user** to start, cancel, or retry an auto-pipeline on a reference project experiment. This is because these endpoints use `get_experiment()` (read-level check) instead of `get_experiment_with_permission()` (write-level check). Since `get_experiment()` was modified to return experiments from `is_reference=True` projects to all users, any authenticated user can mutate reference experiment state.

Other write endpoints (job submission, FASTQ upload, reactions, BED upload) correctly use `get_experiment_with_permission()`, which requires an actual `ProjectMember` row and blocks reference projects by design.

## Fix

**File**: `backend/routers/experiments.py` — lines 110-170

Replace `get_experiment()` with `get_experiment_with_permission()` in all three auto-pipeline endpoints:

1. **`start_auto_pipeline_endpoint`** (line 120): Change `get_experiment(db, experiment_id, current_user.id)` → `get_experiment_with_permission(db, experiment_id, current_user.id, ["admin", "contributor"])`

2. **`cancel_auto_pipeline_endpoint`** (line 139): Same change.

3. **`retry_auto_pipeline_endpoint`** (line 160): Same change.

Update the import at the top of the file to include `get_experiment_with_permission` from `services.permission_helpers` (if not already imported).

Update the 404 error message to match the pattern used by other write endpoints (return 404 so as not to leak experiment existence to non-members).

## Files to Modify

- `backend/routers/experiments.py` — 3 endpoint changes + 1 import addition

## Verification

1. Run the existing auto-pipeline tests:
   ```bash
   docker compose exec api pytest tests/ -k "auto_pipeline" -v
   ```
2. Run the full experiments router tests:
   ```bash
   docker compose exec api pytest tests/test_experiments.py -v
   ```
3. Confirm `ruff check backend/routers/experiments.py` passes.
