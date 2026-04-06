# 2026-04-06 — Local Path Import Feature

## What was done
- Added "Import from Instance" — a third FASTQ import method that copies or symlinks files from the EC2 instance's local filesystem directly into Cleave's managed storage
- New `is_symlink` column on `fastq_files` table (Alembic migration `cf4728be3c58`)
- Parameterized `_finalize_file()`, `_trigger_fastqc()`, `_create_completion_notification()` in `server_import_service.py` to support both server and instance import sources
- Symlink-aware deletion in `delete_fastq()` (storage delta = 0 for symlinks)
- 2-step frontend wizard: Browse & Select (with path input, breadcrumbs, file table) → Import Progress
- Symlink toggle with amber warning in UI
- 23 new backend tests, all passing. 38 related existing tests verified — no regressions.

## Decisions made
- **Separate service** (`local_import_service.py`) rather than extending `server_import_service.py` — fundamentally different concerns (local fs vs network), but shares progress tracking dicts and finalization helpers
- **Copy default, symlink optional** — symlinks use storage delta 0; uncompressed FASTQs fall back to copy+gzip since symlinks can't be gzipped
- **`upload_source="instance"`** — distinguishes from `"local"` (browser) and `"server"` (FTP/SFTP)
- **No allowlist restriction** — users can browse any non-system, non-STORAGE_ROOT path. Blocked: `/proc`, `/sys`, `/dev`, `/etc`, `/var/run`, `/boot`, `/root`
- **Shared progress tracking** — reuses `_active_imports` dict from server_import_service, so "one active import per user" constraint spans both import types

## Open items
- `LOCAL_IMPORT_DEFAULT_PATH` config defaults to `/data` — may want to adjust per EC2 instance
- No disk space pre-check before large copy imports (nice-to-have)
- Update CLAUDE.md/SPEC.md/README.md API docs to reflect new endpoints

## Key file paths
- `backend/services/local_import_service.py` — core service (validate, browse, import)
- `backend/routers/local_import.py` — 3 endpoints (browse, start, progress)
- `backend/schemas/local_import.py` — request/response models
- `backend/models/fastq_file.py` — added `is_symlink`
- `frontend/src/components/fastqs/LocalImportModal.tsx` — 2-step wizard modal
- `frontend/src/pages/experiment/FastqsTab.tsx` — "Import from Instance" button
- `backend/tests/test_local_import.py` — 23 tests
