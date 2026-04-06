# Phase 2 Summary — Data Management

> 12 sessions across 2026-03-25 and 2026-03-26. Phase 2 is **complete** including post-phase bug fixes. All 8 done criteria checked off. **151 tests passing** (105 new in Phase 2).

---

## What Was Built

### FASTQ Upload Backend (2.1)
- tus v1.0.0 resumable upload via `tuspyserver` library (`backend/routers/tus_upload.py`). Three DI hooks: `_dynamic_files_dir` (staging dir), `validate_fastq_upload` (permissions + filename validation + size limits), `on_fastq_upload_complete` (auto-gzip, file move, DB record, storage accounting, FastQC trigger).
- Filename validation: alphanumeric start, `.fastq.gz`/`.fastq`/`.fq.gz`/`.fq` extensions, `_R1`/`_R2` direction parsing. Auto-gzip of uncompressed FASTQs via async Queue producer/consumer (no event loop blocking).
- Atomic `storage_bytes` updates on experiment and project (`SET storage_bytes = storage_bytes + :delta`). Rollback of written files on mid-batch failure.
- `file_path` stored as relative to STORAGE_ROOT for portability. Duplicate filename detection per experiment (422).
- Legacy multipart `POST /experiments/:id/fastqs/upload` kept for backward compatibility alongside tus.

### FASTQ Upload Frontend (2.2)
- `FileUploadZone` component: `tus-js-client` integration with per-file progress bars, cancel, and resume support. Sends `filetype` in tus metadata.
- FASTQs tab DataTable: Name, Size, Uploaded, FASTQC icon, Total Reads, Actions (delete with confirmation modal).
- Client-side extension filtering on drop/pick. Upload zone collapses after success.

### FastQC Integration (2.3)
- `pipelines/fastqc.py` — FastQC pipeline module: parse TXT summary, mock run (copies sample from `cutana/fastqc/`), real run via subprocess.
- `fastqc_service.py` — background orchestration via FastAPI `BackgroundTasks`. Uses `async_session_factory()` for own DB sessions (request session is closed by the time background runs). Per-file error isolation.
- `fastqc_report_path` column added to `fastq_files` table. FastQC triggered automatically post-upload. Frontend polls (5s `refetchInterval`) until `totalReads` populated.
- Path traversal guard on report serving endpoint. Report cleanup on FASTQ delete.

### FastQC Report Viewer (2.4)
- `FastqcReportModal` component: left sidebar with module pass/warn/fail icons (parsed from TXT at request time, not stored in DB), iframe rendering full HTML report, Download Report + Full Screen toolbar.
- `GET /experiments/{eid}/fastqs/{fid}/fastqc-summary` endpoint returning structured JSON. Helper resolves TXT data files from both real mode subdirectories and mock mode flat layouts.

### Reactions Backend (2.5)
- 8 endpoints: list, create, bulk create, CSV import, template download, FASTQ prefix detection, update, delete.
- CSV parsing with CUTANA-format column mapping (from exported `cutana/H3K4me3/H3K4me3-reactions.csv`). `Yes/No` boolean conversion. All-or-nothing import (single bad row rejects entire CSV).
- Unique constraint enforcement: `(experiment_id, organism, short_name)`. Enum validators for organism and assay_type.

### Reactions Frontend (2.6)
- `ReactionsEditor` — reusable editor combining `CsvUploadZone` + OR divider + DataTable with R1/R2 checkmarks + Customize Columns (12 optional columns) + CRUD actions. Designed for reuse in wizard step 3.
- `ReactionFormModal` — add/edit form with all 16 fields, spike-in target dependency (KMetStat enables target dropdown), collapsible "More Fields" section.
- Read-only `ReactionsTab` with Edit button opening editor modal. `CUTANA_SPIKE_IN_TARGETS` (16 PTMs) added to constants.

### Experiment Creation Wizard (2.7)
- Extended experiment creation from 1-step modal to 3-step wizard (Details -> FASTQs -> Reactions).
- Experiment created via API on Step 1 "Next" (both `FileUploadZone` and `ReactionsEditor` require a real `experimentId`). Going Back to Step 1 and re-advancing calls `updateExperiment` instead of creating a duplicate.
- `WizardModal` enhanced with `renderFooter` and `maxWidth` props (backward-compatible). Reused `FileUploadZone` and `ReactionsEditor` with zero modifications.

### Trimming Pipeline (2.8)
- `pipelines/trimming.py` — `TrimmingStage(PipelineStage)` with two-stage pipeline: Trimmomatic PE (adapter + quality) -> kseq_test (fixed-length 42bp). All parameters from lab's `integrated.sh`.
- `job_service.py` — job CRUD service with 3 endpoints: create, get, list (paginated). First use of the job queue.
- `trimming_service.py` — post-trim DB persistence: creates `FastqFile` records with `is_trimmed=True`, creates `JobOutput` records, atomically updates `storage_bytes`, triggers post-trim FastQC.
- Enhanced `worker.py`: sets `started_at`, calls pipeline dispatcher, runs post-pipeline hooks (trim record creation, notifications), stores `methods_text` and `completed_at`.
- Pipeline dispatcher refactored to stage registry pattern — sets pattern for alignment/peak calling.
- Frontend: adapter detection banner (amber, from FastQC's adapter_status), in-progress banner (blue with spinner + polling), error banner (red), trimmed file badge. `TrimConfigModal` with all parameters pre-filled.

### File Browser (2.9)
- `GET /experiments/:id/files` returns nested JSON file tree built from disk scan (not DB records). Recursive `FileNode` schema.
- Path traversal security: validates paths are within experiment directory, rejects `..` and absolute paths.
- Frontend `AllFilesTab`: dual-panel layout — left recursive `TreeNode` with expand/collapse, right `DataTable` showing selected folder contents with checkbox selection. Download button for selected files.

### File Download (2.10)
- `POST /experiments/:id/files/batch-download` — true streaming zip via `stream-zip` library (memory stays flat regardless of archive size). `ZIP_STORED` for compressed files (.gz, .bam, .bw) to avoid double-compression; `ZIP_DEFLATED` for text files. Limits: 100 files, 10 GB (config vars). Skip missing files with `X-Batch-Skipped` header.
- HMAC-signed download token system (`services/download_token_service.py`): `POST /files/download-token` generates a signed URL, `GET /files/signed-download` validates and serves. HMAC-SHA256 with 5-min expiry, payload includes `project_id` for path resolution.
- `X-Accel-Redirect` support for NGINX via `NGINX_FILE_SERVING` config var (infrastructure-level toggle, separate from `PIPELINE_MODE`). Helper extracts common download logic for DRY.
- Smart frontend download: uses `window.location.href` with signed URLs (no Axios blob buffering). 1 file -> direct signed GET, 2+ files -> batch zip POST.

---

## Post-Phase Bug Fixes (8 Issues)

After the core Phase 2 work, 8 issues were addressed before moving to Phase 3:

### Quick Fixes
- **perPage alias**: Added `alias="perPage"` to projects router list endpoint for frontend camelCase compatibility.
- **SECRET_KEY length**: Extended SECRET_KEY/REFRESH_SECRET_KEY to 32+ chars in `config.py`, `docker-compose.yml`, `.env.example`; added pytest `filterwarnings` in `pyproject.toml`.
- **Permission helpers DRY**: Extracted `get_experiment_with_permission()` and `check_experiment_membership()` to new `services/permission_helpers.py`, removed 5 duplicate copies from `fastq_service.py`, `reaction_service.py`, `job_service.py`, `routers/files.py`, `routers/fastq_files.py`.
- **404/403 split**: Refactored `require_project_role()` in `dependencies.py` — non-members get 404, wrong-role members get 403.

### Moderate Refactor
- **Async gzip**: Refactored `_save_file_to_disk()` gzip path to use `queue.Queue` producer/consumer — async reader feeds chunks to threaded gzip writer via `run_in_executor`, avoiding event loop blocking.

### Major Features
- **Streaming zip**: Replaced `BytesIO` buffered zip with `stream-zip` library for true streaming batch downloads — memory stays flat regardless of archive size.
- **Signed download tokens**: Added HMAC-signed download token system, two new endpoints, frontend rewritten to use `window.location.href` instead of Axios blob buffering.
- **tus resumable uploads**: Initially hand-rolled tus v1.0.0 endpoints, then replaced with `tuspyserver` v4.2.3 library (335 lines of hand-rolled code → 185 lines of business logic hooks). Frontend `FileUploadZone.tsx` rewritten with `tus-js-client` for per-file progress, cancel, resume.

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Upload method | tus protocol via `tuspyserver` | Chunked/resumable for multi-GB FASTQs. Library handles protocol compliance; we supply 3 DI hooks for business logic. |
| R1/R2 pairing | Not enforced at upload | Users may upload across sessions. Enforce at alignment launch (Phase 3.4). |
| FastQC execution | BackgroundTasks (non-blocking) | Upload returns immediately. Frontend polls until `totalReads` populated. |
| FastQC summary storage | Parse on-the-fly from TXT | Avoids migration + backfill for a field only read when modal opens. |
| CSV import | All-or-nothing | Single bad row rejects entire import. Prevents partial data. |
| Experiment wizard creation | API call at Step 1 | FileUploadZone and ReactionsEditor both require a real `experimentId`. |
| Pipeline dispatcher | Stage registry pattern | `run(job_type, params)` dispatches to registered stage. Extensible for alignment/peak calling. |
| Worker DB sessions | Per-poll-cycle sessions | Not long-lived (stale reads). Uses `async_session_factory()` directly. |
| Mock mode files | Creates real files on disk | File browser, download, and IGV (Phase 5) depend on files at real paths. |
| File tree source | Disk scan, not DB records | Ensures all files visible (logs, FastQC artifacts, etc.), not just DB-tracked outputs. |
| File download auth | HMAC-signed download tokens | 5-min expiry, project_id in payload. Frontend uses `window.location.href` — no blob buffering. |
| NGINX file serving | Config var toggle | `NGINX_FILE_SERVING` separate from `PIPELINE_MODE`. Infrastructure concern, not pipeline logic. |
| Batch zip strategy | `stream-zip` true streaming | Memory stays flat regardless of archive size. Per-entry compression (ZIP_STORED vs ZIP_DEFLATED). |
| Permission helpers | Shared module | `services/permission_helpers.py` — single source for experiment permission checks across all services. |
| tus library | `tuspyserver` (not hand-rolled) | Per CLAUDE.md "prefer dependencies" principle. Battle-tested protocol handling; we only write hooks. |

---

## API Status After Phase 2

### Newly Implemented (Phase 2)
- `POST /experiments/:id/fastqs/upload` — multipart FASTQ upload (legacy, kept for backward compatibility)
- tus endpoints at `/api/v1/experiments/:id/tus/` — resumable chunked upload (primary)
- `GET /experiments/:id/fastqs` — list FASTQ files (paginated)
- `DELETE /experiments/:id/fastqs/:fid` — delete FASTQ with disk cleanup
- `GET /experiments/:id/fastqs/:fid/fastqc` — serve FastQC HTML report
- `GET /experiments/:id/fastqs/:fid/fastqc-summary` — FastQC module summary JSON
- `GET /experiments/:id/reactions` — list reactions (paginated)
- `POST /experiments/:id/reactions` — create single reaction
- `POST /experiments/:id/reactions/bulk` — bulk create reactions
- `PATCH /experiments/:id/reactions/:rid` — update reaction
- `DELETE /experiments/:id/reactions/:rid` — delete reaction
- `POST /experiments/:id/reactions/import-csv` — CSV import
- `GET /experiments/:id/reactions/template` — download CSV template
- `GET /experiments/:id/reactions/prefixes` — auto-detect FASTQ prefixes
- `POST /experiments/:id/jobs` — create analysis job
- `GET /jobs/:jid` — get job by ID
- `GET /experiments/:id/jobs` — list jobs for experiment (paginated)
- `GET /experiments/:id/files` — experiment file tree (nested JSON)
- `GET /experiments/:id/files/download?path=` — download file by path
- `GET /jobs/:jid/files/:fid/download` — download job output by DB record
- `POST /experiments/:id/files/batch-download` — streaming zip download of selected files
- `POST /experiments/:id/files/download-token` — generate HMAC-signed download URL
- `GET /files/signed-download` — serve file via signed token

### Still Stub (501 -- Phase 3+)
- `GET /jobs` — cross-project job list (Analysis Queue)
- `GET /jobs/:jid/qc-report` — QC report data
- SSE streaming endpoints

---

## Database Schema Changes (2 migrations in Phase 2)

4 total migrations (2 from Phase 1 + 2 from Phase 2):

| Migration | Description |
|-----------|-------------|
| `bce0e9c5d2ee` | Initial schema (9 tables) |
| `fafd5c9dc468` | fastapi-users auth columns |
| `35ad430891c0` | Add `fastqc_report_path` to `fastq_files` |
| `87e85de24803` | Add `adapter_status` to `fastq_files` |

---

## Test Coverage

| Test File | Count | Scope |
|-----------|-------|-------|
| `test_auth.py` | 13 | Auth endpoints (register, login, refresh, logout, protected) |
| `test_projects.py` | 14 | Project CRUD, membership, permissions |
| `test_experiments.py` | 10 | Experiment CRUD, name validation, project membership |
| `test_notifications.py` | 5 | Notification list, mark-read |
| `test_users.py` | 4 | User profile get/update |
| `test_fastq_upload.py` | 15 | Upload, validation, permissions, storage, list, delete |
| `test_fastqc.py` | 8 | FastQC unit + integration, summary endpoint, resolver |
| `test_reactions.py` | 23 | CRUD, validation, permissions, unique constraints, CSV import, prefixes |
| `test_jobs_api.py` | 7 | Job create, get, list, permissions, adapter_status |
| `test_trimming_pipeline.py` | 9 | Validate (5), mock_run creates files, return shape, methods text (2) |
| `test_files.py` | 24 | Tree listing, downloads, path traversal, batch download, X-Accel |
| `test_tus_upload.py` | 7 | tus protocol: create, upload, finalize, permissions, validation |
| `test_streaming_zip.py` | 6 | stream-zip integration, compression strategies, limits |
| **Total** | **151** | |

All tests run inside Docker (`docker compose exec api pytest tests/`). `ruff check` + `ruff format --check`: clean. `tsc --noEmit`: clean.

---

## New Files Created in Phase 2

### Backend Services
- `backend/services/fastq_service.py` — FASTQ upload/list/delete logic
- `backend/services/fastqc_service.py` — Background FastQC orchestration
- `backend/services/reaction_service.py` — Reaction CRUD + CSV import
- `backend/services/job_service.py` — Job CRUD with permission checks
- `backend/services/trimming_service.py` — Post-trim DB persistence
- `backend/services/file_service.py` — File tree building, path validation, X-Accel
- `backend/services/permission_helpers.py` — Shared experiment permission checks (extracted from 5 services)
- `backend/services/download_token_service.py` — HMAC-signed download token generation/validation

### Backend Routers
- `backend/routers/tus_upload.py` — tus resumable upload via `tuspyserver` (3 DI hooks)

### Backend Pipeline Modules
- `backend/pipelines/fastqc.py` — FastQC stage (parse, mock, real)
- `backend/pipelines/trimming.py` — Trimming stage (Trimmomatic + kseq_test)

### Backend Schemas
- `backend/schemas/file.py` — FileNode, FileTreeResponse, BatchDownloadRequest

### Frontend API + Hooks
- `frontend/src/api/fastqs.ts` — FASTQ API module
- `frontend/src/api/reactions.ts` — Reactions API module
- `frontend/src/api/jobs.ts` — Jobs API module
- `frontend/src/api/files.ts` — Files API module (signed download URLs)
- `frontend/src/hooks/useFastqs.ts` — FASTQ query/mutation hooks
- `frontend/src/hooks/useReactions.ts` — Reaction query/mutation hooks
- `frontend/src/hooks/useJobs.ts` — Job query/mutation hooks
- `frontend/src/hooks/useFiles.ts` — File tree query hook

### Frontend Components
- `frontend/src/components/fastqs/FileUploadZone.tsx` — tus-js-client upload with per-file progress
- `frontend/src/components/fastqs/FastqcReportModal.tsx` — FastQC report viewer
- `frontend/src/components/fastqs/TrimConfigModal.tsx` — Trimming configuration
- `frontend/src/components/reactions/CsvUploadZone.tsx` — CSV upload zone
- `frontend/src/components/reactions/ReactionFormModal.tsx` — Reaction add/edit form
- `frontend/src/components/reactions/ReactionsEditor.tsx` — Reusable reactions editor
- `frontend/src/components/experiments/CreateExperimentWizard.tsx` — 3-step wizard
- `frontend/src/components/experiments/ExperimentDetailsStep.tsx` — Wizard step 1

### Documentation
- `docs/tus-server-research.md` — tus library comparison (resolved: chose `tuspyserver`)

---

## Known Issues / Tech Debt (Post-Bug-Fixes)

### Resolved in Bug Fixes
- ~~Duplicated `_get_experiment_with_permission()`~~ → extracted to `services/permission_helpers.py`
- ~~Batch download uses BytesIO buffering~~ → replaced with `stream-zip` true streaming
- ~~File download auth via Axios blob~~ → replaced with HMAC-signed download tokens
- ~~Plain multipart upload for multi-GB files~~ → replaced with tus resumable uploads
- ~~Non-members get 403 instead of 404~~ → `require_project_role()` now returns 404 for non-members, 403 for wrong role

### Still Open
- Real mode trimming requires Trimmomatic + kseq_test binary on EC2 (mock mode works locally)
- `kseq_test` binary needs compilation on target platform (`gcc -O2 kseq_test.c -lz -o kseq_test`) — pre-compiled arm64 binary exists for Mac
- Post-trim FastQC runs but depends on background task infrastructure timing
- Large directory lazy-loading not implemented (tree is small at Phase 2 scale)
- `X-Accel-Redirect` header logic is implemented but NGINX config is Phase 7
- R1/R2 FASTQ pairing not enforced until alignment launch (Phase 3.4)
- Zero-reaction alignment block not enforced (Phase 3 validation)
- IgG-only warning not enforced (Phase 3 validation)
- FastAPI `HTTP_422_UNPROCESSABLE_ENTITY` deprecation warning — cosmetic
- Legacy multipart upload endpoint kept alongside tus for backward compatibility — consider removing in Phase 7

---

## Dependencies Added in Phase 2

| Package | Version | Purpose |
|---------|---------|---------|
| `tuspyserver` | ≥4.2.3 | tus v1.0.0 resumable upload server |
| `stream-zip` | — | True streaming zip generation |
| `tus-js-client` | — | Frontend tus upload client |

---

## What's Next: Phase 3 (Core Pipeline)

Worker process infrastructure, SSE for real-time job status, Bowtie2 alignment pipeline (mock + real mode), alignment wizard UI (3 steps), alignment QC report (stats table + spike-in heatmap), alignment sub-tabs (Info/Input/Files), Analysis Queue page, auto-generated methods text. See `docs/PLAN.md` Phase 3 for full spec.

Key prerequisites already completed:
- Local Mac has conda `cleave-pipeline` env with Bowtie2, SAMtools, MACS2, BEDTools, deepTools, FastQC, Picard, Trimmomatic
- mm10 Bowtie2 indices at `~/Documents/BIO_LAB/genomes/mm10/`
- mm10 gene annotation BED at `backend/pipelines/reference/annotations/mm10_refGene.bed`
- EC2 instance has Bowtie2 indices, HOMER genome data, and gene annotation BEDs
- Job queue infrastructure already working (built in Phase 2.8)
- Worker with pipeline dispatcher already running (built in Phase 2.8)
