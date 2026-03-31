# Plan: Import from Server (FTP/SFTP)

## Context

Lab members currently download FASTQs from the IGM sequencing core FTP server to their local machines, then re-upload them through the browser — a double-transfer bottleneck for multi-GB files. This feature adds server-side FTP/SFTP import so the EC2 backend pulls files directly from the remote server, eliminating the intermediate step. Users can also save their server credentials for reuse across sessions.

**Matches**: CUTANA Cloud's "From Server" import card + the lab's `lftp` workflow from `cf-lab-pipeline-spec.md` §2 Stage 0.

---

## Architecture Decision: Background Task, Not Job Queue

FTP import doesn't fit the `analysis_jobs` pipeline worker:
- Produces `FastqFile` records (like tus upload), not `JobOutput` records
- Has no `job_type` in the pipeline registry, no `methods_text`, no experiment status transitions
- Should not block pipeline jobs from running

**Decision**: `asyncio.create_task()` with in-memory progress tracker (same pattern as FastQC background tasks). SSE polls the tracker for real-time updates. Acceptable loss on server restart — user retries, same as interrupted tus uploads.

---

## Database Changes (1 new table, 1 migration)

### New table: `saved_servers`

```
id              SERIAL PRIMARY KEY
user_id         INT FK → users(id) ON DELETE CASCADE
name            TEXT NOT NULL          -- friendly label ("IGM FTP", "Core SFTP")
protocol        TEXT NOT NULL          -- 'ftp' or 'sftp'
host            TEXT NOT NULL
port            INT                    -- NULL = default (21/22)
username        TEXT NOT NULL
encrypted_password  TEXT NOT NULL      -- Fernet-encrypted, never plaintext
default_path    TEXT DEFAULT '/'       -- last-used directory
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
UNIQUE (user_id, name)
```

- **Scoped per-user** (not per-project) — same FTP server is reused across projects
- **Password encryption**: `cryptography.fernet.Fernet` with key derived from `SECRET_KEY` via PBKDF2. Fernet is symmetric AES-128-CBC + HMAC — appropriate for server-side encrypt/decrypt of credentials the app itself needs to use.
- New config var: `SERVER_CREDENTIAL_ENCRYPTION_KEY` (optional, falls back to deriving from `SECRET_KEY`)

---

## Backend (6 new files, 3 modified files)

### New files

**1. `backend/schemas/server_import.py`** — Pydantic schemas

```
ServerConnectRequest        protocol, host, port?, username, password, path
ServerBrowseResponse        currentPath, entries: list[RemoteFileEntry]
RemoteFileEntry             name, path, isDir, size?
ServerImportRequest         protocol, host, port?, username, password, filePaths: list[str]
ServerImportStartedResponse importId (UUID), fileCount, message
ImportFileProgress          remotePath, filename, status, bytesDownloaded, bytesTotal?, error?
ServerImportProgress        importId, status, files, completedCount, totalCount, error?
SavedServerCreate           name, protocol, host, port?, username, password, defaultPath?
SavedServerUpdate           name?, defaultPath?, username?, password?
SavedServerRead             id, name, protocol, host, port, username, defaultPath, createdAt
                            (password NEVER returned)
```

All extend `CamelModel` from `schemas/common.py`.

**2. `backend/services/server_import_service.py`** — Core import logic

Three responsibilities:

A. **`browse_server()`** — Connect, list directory, disconnect. Short-lived synchronous-per-request.
   - Filters entries to FASTQ-compatible files + directories
   - 15s connection timeout, 30s listing timeout

B. **`start_import()`** — Async background task via `asyncio.create_task()`
   - Downloads files sequentially (bandwidth-limited single EC2)
   - Per file: validate filename → check disk space → download to staging → auto-gzip if needed → move to final path → create `FastqFile` record (`upload_source='server'`) → update `storage_bytes` → audit log
   - After all files: trigger FastQC, create notification
   - Partial success OK: completed files are committed, failures reported per-file

C. **In-memory progress tracker** — Module-level dict `_active_imports: dict[str, ServerImportProgress]`
   - `get_import_progress(import_id)` for polling
   - `get_active_imports_for_user(user_id)` for SSE
   - Auto-cleanup 5 minutes after completion

**FTP client**: `aioftp` (async, pure Python, 1MB chunks with progress callback)
**SFTP client**: `asyncssh` (async, pure Python, `known_hosts=None` — lab users connect to trusted servers)

**Mock mode** (`PIPELINE_MODE=mock`): Canned directory listing, `asyncio.sleep(1)` per file to simulate download, creates small stub files.

**3. `backend/services/server_credential_service.py`** — Saved server CRUD

```python
encrypt_password(plaintext: str) -> str      # Fernet encrypt
decrypt_password(ciphertext: str) -> str      # Fernet decrypt
create_saved_server(db, user_id, data)        # validates + encrypts + saves
list_saved_servers(db, user_id)               # returns all (without passwords)
get_saved_server_with_password(db, user_id, server_id)  # decrypts for use
update_saved_server(db, user_id, server_id, data)
delete_saved_server(db, user_id, server_id)
```

**4. `backend/models/saved_server.py`** — SQLAlchemy model for `saved_servers` table

**5. `backend/routers/server_import.py`** — 7 endpoints

```
POST /experiments/{eid}/server-import/browse       → ServerBrowseResponse
POST /experiments/{eid}/server-import/start         → ServerImportStartedResponse
GET  /experiments/{eid}/server-import/{id}/progress → ServerImportProgress

GET    /users/me/saved-servers                      → list[SavedServerRead]
POST   /users/me/saved-servers                      → SavedServerRead
PATCH  /users/me/saved-servers/{id}                 → SavedServerRead
DELETE /users/me/saved-servers/{id}                 → 204
```

Import endpoints require `admin`/`contributor` role on the experiment's project.
Saved server endpoints scoped to `current_active_user` (no project role needed).

**6. `backend/migrations/versions/XXXX_add_saved_servers.py`** — Alembic migration

### Modified files

**7. `backend/main.py`** — Register `server_import.router`

**8. `backend/pyproject.toml`** — Add `aioftp>=0.22`, `asyncssh>=2.14`

**9. `backend/services/sse_service.py`** — Add import progress polling to SSE loop:
- After job status + auto-pipeline checks, call `get_active_imports_for_user(user_id)`
- Emit `server_import_progress` events with watermark tracking (same pattern as jobs)
- Track `import_id → status` to detect changes

---

## Security

**SSRF prevention** — `_validate_host()` in server_import_service:
- Block private IP ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`
- Block `localhost`, `169.254.169.254` (AWS metadata)
- Resolve hostname → IP before checking (prevent DNS rebinding)

**Credential security**:
- Fernet encryption at rest (AES-128-CBC + HMAC)
- Passwords never returned in API responses
- Credentials for one-off imports (not saved) exist only in request memory
- structlog already avoids logging request bodies

**Connection limits**:
- Max 1 concurrent import per user
- 15s connection timeout, 4h per-file download timeout

**Filename sanitization**: `PurePosixPath(remote_path).name` strips directory prefix, then `validate_fastq_filename()` applied.

---

## Frontend (4 new files, 2 modified files)

### New files

**1. `frontend/src/api/serverImport.ts`** — API client functions

```typescript
browseServer(experimentId, req: ServerConnectRequest)
startImport(experimentId, req: ServerImportRequest)
getImportProgress(experimentId, importId)
listSavedServers()
createSavedServer(data)
updateSavedServer(id, data)
deleteSavedServer(id)
```

**2. `frontend/src/hooks/useServerImport.ts`** — TanStack Query hooks

```typescript
useServerBrowse()              // useMutation
useServerImport()              // useMutation
useImportProgress(eid, id)     // useQuery, polls 3s while active
useSavedServers()              // useQuery
useSaveSavedServer()           // useMutation
useDeleteSavedServer()         // useMutation
```

**3. `frontend/src/components/fastqs/ServerImportModal.tsx`** — 3-step WizardModal

**Step 1: Connect**
- Saved servers shown as selectable cards (icon + name + host). Click to auto-fill.
- "New Server" card opens the connection form:
  - Protocol toggle: FTP / SFTP
  - Host, Port (pre-filled 21 or 22), Username, Password fields
  - "Save this server" checkbox + name field (shown when checked)
- "Connect" button tests connection + navigates to Step 2
- Error display for connection/auth failures

**Step 2: Browse & Select**
- Breadcrumb path bar (clickable segments for navigation)
- Scrollable file/directory table: checkbox, icon (folder/file), name, size
- Directories clickable to navigate. Only FASTQ files are selectable (others grayed).
- "Select All FASTQs" button for convenience
- Footer: selected count + total size

**Step 3: Confirm & Import**
- Summary: file count, total size, destination experiment
- "Import" button starts the background import
- Transitions to progress view:
  - Overall progress bar (completedCount / totalCount)
  - Per-file list: filename, status badge (pending/downloading/complete/error), progress bar
  - Errors shown inline per-file with red text
  - "Done" button when complete (closes modal, refreshes FASTQ list)

**4. `frontend/src/components/fastqs/SavedServersManager.tsx`** — Optional small component

- Used inside Step 1 of the wizard for the saved server cards
- Delete button (with confirmation) on each card
- Could also be accessible from Settings page later

### Modified files

**5. `frontend/src/pages/experiment/FastqsTab.tsx`**

Add "Import from Server" button next to existing "+ Add FASTQs":
```tsx
<div className="flex gap-2">
  <Button variant="primary" onClick={() => setShowUpload(prev => !prev)}>
    {showUpload ? 'Close' : '+ Add FASTQs'}
  </Button>
  <Button variant="outlined" onClick={() => setShowServerImport(true)}>
    <Server className="mr-1 h-4 w-4" /> Import from Server
  </Button>
</div>
```

Plus `{showServerImport && <ServerImportModal ... />}` with state management.

**6. `frontend/src/hooks/useSSE.ts`**

Add handler for `server_import_progress` SSE events:
- Invalidate `['server-import', importId]` for progress updates
- Invalidate `['fastqs', experimentId]` on completion

---

## Reused Patterns

| Pattern | Source file | Reuse |
|---------|-----------|-------|
| Filename validation | `fastq_service.py:validate_fastq_filename()` | Called before download |
| Storage path building | `fastq_service.py:_build_storage_path()` | Same directory structure |
| Auto-gzip | `fastq_service.py:_save_file_to_disk()` | Same gzip-on-write pattern |
| Storage accounting | `job_output_service.py:update_storage_bytes()` | Atomic SQL increment |
| Audit logging | `event_service.py:log_event_standalone()` | New action: `fastq_imported` |
| FastQC trigger | `fastqc_service.py:run_fastqc_for_files()` | Called after all downloads |
| Notification | `notification_service.py:create_notification()` | On import complete/error |
| Permission check | `permission_helpers.py:get_experiment_with_permission()` | admin/contributor |
| SSE watermark | `sse_service.py` | Same tracked-IDs pattern |
| WizardModal | `components/ui/WizardModal.tsx` | 3-step modal shell |
| CamelModel | `schemas/common.py` | All new schemas |
| Background task | FastQC in `tus_upload.py:on_fastq_upload_complete()` | `asyncio.create_task()` |

---

## Implementation Order

### Phase A: Backend foundation (new files only)
1. `backend/models/saved_server.py`
2. `backend/schemas/server_import.py`
3. Alembic migration for `saved_servers` table
4. `backend/services/server_credential_service.py` (Fernet encrypt/decrypt + CRUD)
5. `backend/services/server_import_service.py` (browse, download, progress tracker, SSRF validation, mock mode)
6. `backend/routers/server_import.py` (all 7 endpoints)

### Phase B: Backend integration (modifications)
7. `backend/pyproject.toml` — add `aioftp`, `asyncssh`
8. `backend/main.py` — register router
9. `backend/services/sse_service.py` — add import progress events
10. `backend/config.py` — add `SERVER_CREDENTIAL_ENCRYPTION_KEY` (optional)

### Phase C: Frontend
11. `frontend/src/api/serverImport.ts`
12. `frontend/src/hooks/useServerImport.ts`
13. `frontend/src/components/fastqs/ServerImportModal.tsx` (3-step wizard + saved servers)
14. `frontend/src/pages/experiment/FastqsTab.tsx` — add button + modal
15. `frontend/src/hooks/useSSE.ts` — add event handler

### Phase D: Tests
16. `backend/tests/test_server_import.py` — SSRF validation, browse (mock), import (mock), saved servers CRUD, permission checks, duplicate detection
17. `backend/tests/test_server_credentials.py` — encrypt/decrypt round-trip, CRUD, password never in response

---

## Verification

1. **Unit tests**: `docker compose exec api pytest tests/test_server_import.py tests/test_server_credentials.py -v`
2. **Lint**: `docker compose exec api ruff check . && docker compose exec api ruff format --check .`
3. **TypeScript**: `cd frontend && npm run build`
4. **Manual E2E** (mock mode):
   - Open experiment → FASTQs tab → "Import from Server" button visible
   - Click → wizard opens with "New Server" option
   - Fill in mock FTP credentials → Connect → mock directory listing appears
   - Select files → Confirm → progress shows files downloading → completion notification
   - FASTQ list refreshes with imported files (upload_source = "server")
   - FastQC runs automatically on imported files
   - Save a server → re-open wizard → saved server card appears → click to auto-fill
5. **Existing tests**: `docker compose exec api pytest tests/ -x` — full suite still passes
