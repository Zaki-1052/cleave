# Reference Project Output Loading Fix

**Date**: 2026-03-31

## What was done

- Diagnosed why the reference project on EC2 showed 0 bytes storage and "Failed to load QC report" errors
- Added `--rescan` mode to `scripts/seed_reference_project.py`
- Fixed rescan to handle case where both dev ID and actual ID directories exist on disk

## Root causes

1. **No JobOutput records in DB**: The seed script scans `dev-data/` (local repo directory) to create `job_outputs` rows. On EC2, `dev-data/` doesn't exist — files were rsynced directly to `STORAGE_ROOT`. Result: zero `JobOutput` records, so QC report endpoints (which iterate `job.outputs` to find CSV files) return 404.

2. **Job directory ID mismatch**: dev-data contains directories `jobs/11/`, `jobs/12/`, `jobs/13/`, `jobs/14/`, `jobs/15/`, `jobs/18/` (original dev IDs). DB auto-assigns new sequential IDs (1, 2, 3...). Rsynced files sit at paths the DB doesn't reference.

3. **Empty actual-ID dirs blocking rename**: First rescan attempt found both `jobs/11/` (files) and `jobs/1/` (empty) coexisting — skipped rename and scanned the empty dir, producing 0 outputs. Fixed by detecting which directory actually has files, removing empty dirs, then renaming.

## Fix: `--rescan` flag

`python scripts/seed_reference_project.py --rescan` does:

1. Finds existing reference project, experiment, reactions, jobs
2. Maps dev IDs (11, 12, ...) → actual DB IDs via `job_type` matching
3. For each job, determines which directory has files (dev ID vs actual ID)
4. Renames dev ID dirs to actual ID dirs when possible (removes empty actual dirs first)
5. Falls back to scanning dev ID directory if both have files (stores paths matching real disk location)
6. Deletes any existing JobOutput records, creates new ones from disk scan
7. Updates `storage_bytes` on experiment and project

## Files modified

- `scripts/seed_reference_project.py` — added `delete` import, `rescan()` async function (~150 lines), `--rescan` CLI flag; fixed directory resolution logic to handle coexisting empty/full dirs

## Decisions

- `classify_file()` is called with dev IDs (not actual IDs) since it has a hardcoded `jobs/15/results/` check for custom heatmap classification
- `file_path` in JobOutput records uses the actual disk directory name, so path resolution works regardless of whether rename succeeded
