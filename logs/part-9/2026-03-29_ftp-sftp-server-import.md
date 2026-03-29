# 2026-03-29 — FTP/SFTP Server Import

## What was done

Added "Import from Server" feature allowing users to pull FASTQ files directly from FTP/SFTP servers (e.g., IGM sequencing core) to the Cleave backend, eliminating the double-transfer bottleneck of downloading locally then re-uploading through the browser. Users can also save server credentials (Fernet-encrypted) for reuse across sessions.

### Backend (6 new files, 5 modified files)

**New files:**
- `backend/models/saved_server.py` — SQLAlchemy model for encrypted saved server connections (per-user, unique name constraint)
- `backend/schemas/server_import.py` — Pydantic schemas: browse, import, progress tracking, saved server CRUD
- `backend/services/server_credential_service.py` — Fernet encrypt/decrypt (derived from SECRET_KEY via SHA-256), saved server CRUD
- `backend/services/server_import_service.py` — Core logic: browse (aioftp/asyncssh), background download via `asyncio.create_task()`, in-memory progress tracker, SSRF validation, mock mode, FastQC trigger, notification on completion
- `backend/routers/server_import.py` — 7 endpoints: browse, start import, get progress, saved servers CRUD
- `backend/migrations/versions/a3f1c8e92d47_add_saved_servers.py` — Alembic migration for `saved_servers` table
- `backend/tests/test_server_import.py` — 20 tests: SSRF validation, credential encryption, browse mock, auth/permissions, import validation, saved server CRUD + user isolation

**Modified files:**
- `backend/main.py` — Registered server_import router
- `backend/pyproject.toml` — Added `aioftp>=0.22`, `asyncssh>=2.14`
- `backend/services/sse_service.py` — Added `server_import_progress` SSE events with watermark tracking
- `backend/models/__init__.py` — Registered SavedServer model
- `backend/tests/conftest.py` — Patched `async_session_factory` in server_import_service for test DB

### Frontend (4 new files, 3 modified files)

**New files:**
- `frontend/src/api/serverImport.ts` — API client: browse, import, progress, saved servers
- `frontend/src/hooks/useServerImport.ts` — TanStack Query hooks with 3s polling during active imports
- `frontend/src/components/fastqs/ServerImportModal.tsx` — 3-step WizardModal: Connect (saved servers + form) → Browse & Select (directory nav, FASTQ filtering, checkboxes) → Import (per-file progress bars, error display)

**Modified files:**
- `frontend/src/pages/experiment/FastqsTab.tsx` — Added "Import from Server" button + modal
- `frontend/src/hooks/useSSE.ts` — Added `server_import_progress` event handler
- `frontend/src/pages/LandingPage.tsx` — Added FTP/SFTP row to comparison table, updated pipeline step description, updated test count (463) and capability count (17)

## Decisions made

- **Background task, not job queue** — FTP import uses `asyncio.create_task()` with in-memory progress tracker (same pattern as FastQC). Doesn't block pipeline worker, doesn't pollute analysis_jobs table.
- **Fernet encryption** for saved passwords — AES-128-CBC + HMAC, key derived from SECRET_KEY via SHA-256. Passwords never returned in API responses.
- **SSRF prevention** — Blocks private IP ranges, localhost, AWS metadata. DNS resolution before IP check in real mode; IP-literal-only check in mock mode (tests use unresolvable fake hostnames).
- **Both FTP + SFTP** via aioftp and asyncssh (pure Python, async, no system deps)
- **Saved servers scoped per-user** (not per-project) since the same FTP server is used across projects
- **Sequential downloads** per import (bandwidth-limited single EC2)
- **Partial success** — completed files are committed even if others fail

## Open items

- Docker image needs rebuild (`docker compose up -d --build api`) to pick up aioftp/asyncssh
- Alembic migration needs to be applied: `docker compose exec api alembic upgrade head`
- Real FTP/SFTP testing against an actual server (mock mode validated via tests)
- Consider adding server import to the experiment creation wizard Step 2 (FASTQs) alongside existing upload

## Key file paths

- `backend/services/server_import_service.py` — Core import logic
- `backend/services/server_credential_service.py` — Encrypted credential storage
- `backend/routers/server_import.py` — All 7 API endpoints
- `frontend/src/components/fastqs/ServerImportModal.tsx` — 3-step wizard UI
- `backend/tests/test_server_import.py` — 20 tests (all passing)
- Full suite: **463 tests passing** (up from 443)
