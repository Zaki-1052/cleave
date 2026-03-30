# Phase 9 Summary — FTP/SFTP Import, Pipeline Parallelism, Gold Standard & Polish

> 9 sessions across 2026-03-29 and 2026-03-30. Phase 9 completes the FTP/SFTP server import feature (full stack), parallelizes all three CPU-bound pipeline stages, adds a gold standard reference project system, introduces project-level filters/pagination, adds a public documentation site, fixes SSRF vulnerabilities, resolves Trimmomatic/kseq_test invocation issues, and adds a favicon. **474+ tests passing** (31+ new in Phase 9). No regressions.

---

## What Was Built

### FTP/SFTP Server Import (Full Stack)

Added "Import from Server" feature allowing users to pull FASTQ files directly from FTP/SFTP servers (e.g., IGM sequencing core) to the Cleave backend, eliminating the double-transfer bottleneck of downloading locally then re-uploading through the browser.

**Backend (6 new files, 5 modified):**
- `backend/models/saved_server.py` — SQLAlchemy model for encrypted saved server connections (per-user, unique name constraint). Fernet AES-128-CBC + HMAC encryption with key derived from `SECRET_KEY` via SHA-256.
- `backend/schemas/server_import.py` — Pydantic schemas for browse, import, progress tracking, saved server CRUD.
- `backend/services/server_credential_service.py` — Fernet encrypt/decrypt, saved server CRUD. Passwords never returned in API responses.
- `backend/services/server_import_service.py` — Core logic: browse via aioftp (FTP) and asyncssh (SFTP), background download via `asyncio.create_task()`, in-memory progress tracker, SSRF validation (blocks private IPs, localhost, AWS metadata), mock mode support, auto-triggers FastQC on completion, sends notification.
- `backend/routers/server_import.py` — 7 endpoints: browse remote directory, start background import, get progress, saved servers CRUD.
- `backend/migrations/versions/a3f1c8e92d47_add_saved_servers.py` — Alembic migration for `saved_servers` table (11th table).
- 20 tests covering SSRF validation, credential encryption, browse mock, auth/permissions, import validation, saved server CRUD + user isolation.

**Frontend (4 new files, 3 modified):**
- `frontend/src/api/serverImport.ts` — API client for browse, import, progress, saved servers.
- `frontend/src/hooks/useServerImport.ts` — TanStack Query hooks with 3s polling during active imports.
- `frontend/src/components/fastqs/ServerImportModal.tsx` — 3-step WizardModal: Connect (saved servers dropdown + manual form) → Browse & Select (directory navigation, FASTQ filtering, checkboxes) → Import (per-file progress bars, error display).
- Added "Import from Server" button to `FastqsTab.tsx`.
- Added `server_import_progress` SSE event type to `useSSE.ts` and `sse_service.py`.

**Key decision:** Background task via `asyncio.create_task()`, not the job queue — doesn't block the pipeline worker, doesn't pollute `analysis_jobs` table. Same pattern as FastQC.

### SSRF Bypass Fix

Security review of the server import feature found two SSRF bypass vectors:
- `0.0.0.0/8` was missing from `_BLOCKED_NETWORKS` — could route to localhost on many OS configurations.
- IPv6-mapped IPv4 addresses (`::ffff:127.0.0.1`) evaded the IPv4 blocklist checks entirely.

**Fix:** Added `0.0.0.0/8` to blocklist. Added IPv6-mapped IPv4 unwrapping in `_validate_host()` so addresses like `::ffff:127.0.0.1` are checked against IPv4 blocked ranges. 3 new tests added. Only high-confidence findings (8+/10) were actioned; lower-confidence hardening concerns (DNS rebinding TOCTOU, `known_hosts=None`) were filtered out given the lab-internal deployment context.

### Parallel Trimming Pipeline

Converted sequential per-pair trimming loop to `ThreadPoolExecutor`, matching alignment's existing concurrency pattern:
- Added `_TrimmingContext` frozen dataclass for thread-safe shared state.
- Extracted `_process_pair()` as standalone module-level function.
- `run()` divides threads: `threads_per_pair = max(2, total // concurrent_count)`. Reuses `settings.MAX_CONCURRENT_REACTIONS` (default 8).
- Trimmomatic's `-threads` flag gets per-pair count, not total (diminishing returns past ~4-8 threads).
- Partial failure support (only fails if ALL pairs fail). Termination shuts down executor immediately.
- `mock_run()` also parallelized. 4 new concurrency tests.

### Trimmomatic & kseq_test Fixes

- **Compiled kseq_test binary** from `backend/pipelines/tools/kseq_test.c` using `gcc -O2 ... -lz`.
- **Fixed Trimmomatic invocation** — conda installs a Python wrapper, not a JAR. Added `_resolve_trimmomatic_cmd()` with 3 portable fallbacks: `TRIMMOMATIC_JAR` env var → conda share dir JAR → `trimmomatic` on PATH. Previous implementation assumed `java -jar` which doesn't work with conda-installed Trimmomatic.

### Parallel Peak Calling Pipeline

Converted sequential per-reaction peak calling loop to `ThreadPoolExecutor`:
- Added `_PeakCallingContext` frozen dataclass for thread-safe shared state.
- Extracted `_process_reaction()` as standalone module-level function.
- **Pre-filters all unique IgG BAMs before thread dispatch** — eliminates shared mutable cache that would cause race conditions. Uses `{igg_stem}_filtered.bam` naming to support multiple distinct IgG controls.
- Per-reaction log files merged into master log post-execution (avoids concurrent writes).
- Partial failure and termination support. `mock_run()` also parallelized. 4 new concurrency tests.

**All 3 CPU-bound pipelines** (trimming, alignment, peak calling) now use an identical `ThreadPoolExecutor` pattern with frozen dataclass contexts, module-level worker functions, partial failure support, and termination propagation.

### Gold Standard Reference Project

Added `is_reference` boolean flag to projects, allowing a curated "gold standard" project with pre-computed results to be visible to all authenticated users without requiring explicit membership.

**Backend:**
- `is_reference` column on `projects` table via migration (`b4c7e2f19a53`).
- Modified all read-access queries across 8 backend files to use `outerjoin + OR is_reference` pattern — reference project data visible to all authenticated users without `ProjectMember` rows.
- Added `GET /api/v1/projects/reference` endpoint for fetching reference projects separately.
- Write-protection guards on BED upload and `delete_project` for defense in depth.
- `scripts/seed_reference_project.py` — idempotent async script creating all DB records (project, experiment, 4 reactions, 6 jobs, ~130 job outputs) from dev-data inventory. Supports `--mock` flag for local dev with stub files.
- 8 new access control tests.

**Frontend:**
- `useReferenceProjects` hook and `getReferenceProjects` API call.
- HomePage sidebar: gold-accented reference card (Crown icon, amber border, explore link) + first-time user guidance banner.
- ProjectDetailPage: read-only mode (hidden mutation buttons, crown icon, "Shared with all users").
- ExperimentView: propagates `isReadOnly` via Outlet context, hiding "Run Full Pipeline" and "New Analysis" buttons.
- FastqsTab and ReactionsTab: hidden upload/edit buttons when `isReadOnly`.

### Project Filters & Pagination

Full-stack project filtering and pagination system:

**Backend:**
- `status` column (`String, NOT NULL, server_default='new'`) on `projects` table via migration (`c5d8f3a10b64`).
- Extended `GET /api/v1/projects` with 5 filter query params: `statuses` (list), `memberIds` (list), `createdAfter`, `createdBefore`, `search`.
- Added `GET /api/v1/projects/filter-members` endpoint returning fellow members for the filter sidebar.
- `recompute_project_status()` service function deriving project status from experiments (priority: error > in_progress > complete > terminated > new).
- Wired `_update_project_status()` into `worker.py` at all 3 job status transition points.
- 10 new backend tests (34 total in test_projects.py).

**Frontend:**
- Installed shadcn `checkbox`, `popover`, `calendar` components.
- `ProjectFilters.tsx` sidebar: 3 collapsible filter sections (Status multi-select, Members searchable checkboxes, Created date picker with Today/This Week/Custom modes).
- Pagination controls (first/prev/next/last buttons, range display).
- URL state persistence via `useSearchParams` — filter, page, and search state synced to URL.
- Debounced search bar. `StatusBadge` on project cards. Contextual empty state messaging.

**Key decision:** Staged filters (Apply/Clear buttons) per CUTANA Cloud spec, unlike the Jobs page which uses live/reactive filters. Stored `status` column (not computed on-the-fly) for query simplicity.

### Documentation Site

Added public `/docs` route with 17 documentation pages:
- `DocsLayout` with simplified navbar (no auth) + collapsible sidebar mirroring ExperimentView pattern.
- Content stored as structured TypeScript data (2,506 lines) with shared renderer components (tables, callouts, step lists, code blocks).
- Single generic `DocsPage` component with slug-based content lookup — avoids 17 separate page files.
- `BookOpen` icon link in authenticated Navbar. "Docs" link in LandingPage nav.
- Mobile responsive: hamburger menu opens sidebar as full-height overlay.
- 14 new frontend files, 3 modified.

### Favicon

Created `frontend/public/favicon.svg` using the CleaveIcon design (DNA double helix with gold enzymatic cleave slash). SVG format with baked-in gradient background (sky-blue → teal → gold) so white strokes are visible in browser tabs. Updated `index.html` to reference it.

### Auto-Pipeline in Experiment Creation Wizard

Added auto-pipeline opt-in to the experiment creation wizard (Step 4: "Pipeline") so users can trigger the full chain at experiment creation time rather than navigating back to the experiment page.

- Extracted `AutoPipelineConfigPanel.tsx` from `AutoPipelineModal.tsx` — shared config UI (genome selector, peak caller, optional steps, pipeline summary) reused by both the standalone modal and the new wizard step (DRY).
- Created `AutoPipelineStep.tsx` — wizard Step 4 with "Run Full Pipeline when done" toggle. Auto-detects genome from reactions. When OFF, shows info text about starting later.
- Modified `CreateExperimentWizard.tsx` — added Step 4 ("Pipeline"), pipeline config state, `handleFinish()` calls `startAutoPipeline()` on wizard completion. Error-resilient: toast on API failure but experiment still created.
- Refactored `AutoPipelineModal.tsx` to use extracted panel (~60% less inline JSX).

### Auto-Pipeline Race Condition Fix

Fixed `on_fastqc_complete()` in `auto_pipeline_service.py` — added `all_have_fastqc` guard matching the existing check in `start_auto_pipeline()`. Prevents premature adapter evaluation when some FASTQ files are still processing FastQC. Safe because the callback fires again when each subsequent file completes.

### Cleanup Default Changed

Changed `CLEANUP_ENABLED` default from `True` to `False` in `config.py`. Nothing auto-deleted out of the box — lab opts in via `.env`. Only affected log files (30-day) and stale tus uploads (48h); actual pipeline outputs were never auto-deleted.

### Auto-Pipeline Fixes

- Fixed Roman Normalization default: `includeNormalization` now initializes to `true` (was `isMouse` which could be stale from a previous render).
- Fixed `isMouse` derivation: now reads from user-selected `referenceGenome` state, not auto-detected value.
- Fixed Pearson correlation description: "0 to 1" instead of "-1 to +1".

### Sidebar & Menu Reordering

- Reordered ExperimentView sidebar: Normalization moved above Heatmaps/Correlation to reflect expected pipeline execution order.
- Reordered `NewAnalysisDropdown`: Normalization appears right after DiffBind (matching sidebar).

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| FTP import execution model | `asyncio.create_task()` (not job queue) | Doesn't block pipeline worker, doesn't pollute `analysis_jobs` table. Same pattern as FastQC. |
| Credential encryption | Fernet (AES-128-CBC + HMAC) via `SECRET_KEY` | Passwords encrypted at rest, never returned in API responses. |
| SSRF prevention | Blocked private IPs + localhost + AWS metadata + IPv6-mapped IPv4 unwrapping | Defense in depth for lab-internal deployment. |
| FTP/SFTP libraries | `aioftp` + `asyncssh` | Pure Python, async, no system dependencies. |
| Saved servers scope | Per-user (not per-project) | Same FTP server used across projects. |
| Pipeline parallelism | Identical `ThreadPoolExecutor` pattern across all 3 stages | Frozen dataclass contexts, module-level workers, partial failure, termination. |
| IgG pre-filtering | Before thread dispatch (not lazy) | Eliminates race conditions from shared mutable cache. |
| Trimmomatic resolution | 3-fallback chain: env var → conda JAR → PATH | Portable across local dev, Docker, and EC2 environments. |
| Reference project model | `is_reference` flag on Project (not auto-adding members) | Cleanest approach with natural write-protection. Separate API endpoint. |
| Project status | Stored column (not computed) | Query simplicity for filtering. Recomputed on job status transitions. |
| Project filters | Staged (Apply/Clear) | Matches CUTANA Cloud spec. URL state persistence for shareable links. |
| Docs content format | Hardcoded TypeScript data (no markdown parser) | Lean bundle, easily editable, no extra dependency. |
| Docs routing | Public (no auth) | Accessible without login, like the landing page. |
| Auto-pipeline in wizard | Optional Step 4, calls existing API on completion | No new endpoints needed; reuses `POST /auto-pipeline`. Error-resilient (toast on failure, experiment still created). |
| Cleanup default | `CLEANUP_ENABLED=False` | Keep everything forever out of the box; lab opts in via `.env`. |

---

## Database Changes

Two new Alembic migrations:

1. **`a3f1c8e92d47` — `saved_servers` table** (11th table): `id`, `user_id` (FK users, CASCADE), `name`, `protocol` (ftp/sftp), `host`, `port`, `username`, `encrypted_password` (Fernet), `default_path`, `created_at`, `updated_at`. Unique constraint on `(user_id, name)`.

2. **`b4c7e2f19a53` — `is_reference` on projects**: Boolean column, `NOT NULL`, `server_default=false`.

3. **`c5d8f3a10b64` — `status` on projects**: String column, `NOT NULL`, `server_default='new'`. Values mirror experiment status enums: `new`, `in_progress`, `complete`, `error`, `terminated`.

---

## Files Created

### Backend (9 new files)
- `backend/models/saved_server.py` — SavedServer ORM model
- `backend/schemas/server_import.py` — Server import Pydantic schemas
- `backend/services/server_credential_service.py` — Fernet credential storage
- `backend/services/server_import_service.py` — FTP/SFTP browse, import, SSRF validation
- `backend/routers/server_import.py` — 7 server import API endpoints
- `backend/migrations/versions/a3f1c8e92d47_add_saved_servers.py` — Saved servers migration
- `backend/migrations/versions/b4c7e2f19a53_add_is_reference_to_projects.py` — Reference project migration
- `backend/migrations/versions/c5d8f3a10b64_add_project_status.py` — Project status migration
- `backend/tests/test_server_import.py` — 23 tests (20 initial + 3 SSRF)

### Frontend (24 new files)
- `frontend/src/components/experiments/AutoPipelineConfigPanel.tsx` — Extracted shared pipeline config UI
- `frontend/src/components/experiments/AutoPipelineStep.tsx` — Wizard Step 4 (pipeline toggle + config)
- `frontend/src/api/serverImport.ts` — Server import API client
- `frontend/src/hooks/useServerImport.ts` — Server import TanStack Query hooks
- `frontend/src/components/fastqs/ServerImportModal.tsx` — 3-step import wizard
- `frontend/src/components/projects/ProjectFilters.tsx` — Project filter sidebar
- `frontend/src/components/ui/checkbox.tsx` — shadcn checkbox primitive
- `frontend/src/components/ui/popover.tsx` — shadcn popover primitive
- `frontend/src/components/ui/calendar.tsx` — shadcn calendar primitive
- `frontend/src/lib/docs-navigation.ts` — Docs nav structure (5 groups, 17 items)
- `frontend/src/lib/docs-content.ts` — All docs content as structured TS (2,506 lines)
- `frontend/src/components/docs/DocsLayout.tsx` — Docs layout with sidebar
- `frontend/src/components/docs/DocsNavbar.tsx` — Simplified public docs navbar
- `frontend/src/components/docs/DocsSidebar.tsx` — Collapsible docs sidebar
- `frontend/src/components/docs/DocsPageRenderer.tsx` — Content block dispatcher
- `frontend/src/components/docs/DocTable.tsx` — Docs table renderer
- `frontend/src/components/docs/DocCallout.tsx` — Docs callout renderer
- `frontend/src/components/docs/DocStepList.tsx` — Docs step list renderer
- `frontend/src/components/docs/DocCodeBlock.tsx` — Docs code block renderer
- `frontend/src/components/docs/DocPrevNext.tsx` — Docs prev/next navigation
- `frontend/src/pages/docs/DocsLandingPage.tsx` — Docs card grid landing
- `frontend/src/pages/docs/DocsPage.tsx` — Generic slug-based docs page
- `frontend/public/favicon.svg` — Cleave favicon (DNA helix + gold slash)
- `docs/reference-project-deployment.md` — Reference project deployment guide

### Scripts (1 new file)
- `scripts/seed_reference_project.py` — Idempotent seed script for gold standard project

---

## Files Significantly Modified

### Backend
- `backend/main.py` — Registered server_import router
- `backend/pyproject.toml` — Added `aioftp>=0.22`, `asyncssh>=2.14`
- `backend/models/__init__.py` — Registered SavedServer model
- `backend/models/project.py` — Added `is_reference` and `status` columns
- `backend/services/sse_service.py` — Added `server_import_progress` SSE event with watermark tracking
- `backend/services/project_service.py` — Filter logic, fellow members query, `recompute_project_status()`, reference project query
- `backend/services/permission_helpers.py` — `outerjoin + OR is_reference` pattern for read access
- `backend/routers/projects.py` — 5 filter params, filter-members endpoint, reference endpoint
- `backend/worker.py` — `_update_project_status()` wiring at all 3 job transition points
- `backend/pipelines/trimming.py` — ThreadPoolExecutor parallelism, `_resolve_trimmomatic_cmd()`, `_TrimmingContext`
- `backend/pipelines/peak_calling.py` — ThreadPoolExecutor parallelism, IgG pre-filtering, `_PeakCallingContext`
- `backend/tests/conftest.py` — Patched `async_session_factory` for server_import_service
- `backend/tests/test_projects.py` — 10 new filter tests + 8 reference project tests
- `backend/tests/test_trimming_pipeline.py` — 4 new concurrency tests
- `backend/tests/test_peak_calling_pipeline.py` — 4 new concurrency tests
- `backend/config.py` — `CLEANUP_ENABLED` default changed to `False`
- `backend/services/auto_pipeline_service.py` — Fixed `on_fastqc_complete` race condition (all-files-done guard)

### Frontend
- `frontend/index.html` — Favicon reference updated
- `frontend/src/App.tsx` — Added `/docs` route group (public)
- `frontend/src/components/layout/Navbar.tsx` — Added BookOpen docs icon link
- `frontend/src/components/ui/Button.tsx` — Exported `buttonVariants`, `children` optional (for shadcn calendar)
- `frontend/src/pages/LandingPage.tsx` — FTP/SFTP comparison row, docs link, updated stats/counts, parallel processing row
- `frontend/src/pages/HomePage.tsx` — Filter sidebar, debounced search, pagination, StatusBadge on cards, reference project card
- `frontend/src/pages/ProjectDetailPage.tsx` — Read-only mode for reference projects (Crown icon, hidden mutation buttons)
- `frontend/src/pages/ExperimentView.tsx` — Sidebar reorder, `isReadOnly` propagation via Outlet context
- `frontend/src/pages/experiment/FastqsTab.tsx` — "Import from Server" button, read-only guard
- `frontend/src/pages/experiment/ReactionsTab.tsx` — Read-only guard
- `frontend/src/hooks/useSSE.ts` — `server_import_progress` event handler
- `frontend/src/hooks/useProjects.ts` — Filter params, `useFilterMembers`, `useReferenceProjects`
- `frontend/src/api/projects.ts` — `getFilterMembers()`, `getReferenceProjects()`, filter interface
- `frontend/src/api/types.ts` — `ProjectFilters` interface, `isReference` on Project type
- `frontend/src/components/experiments/NewAnalysisDropdown.tsx` — Normalization reordered after DiffBind
- `frontend/src/components/experiments/AutoPipelineModal.tsx` — Refactored to use AutoPipelineConfigPanel + fixed normalization default + `isMouse` derivation
- `frontend/src/components/experiments/CreateExperimentWizard.tsx` — Added Step 4 (Pipeline), auto-pipeline state, `handleFinish()` with `startAutoPipeline()` call
- `frontend/src/components/pearson-correlation/PearsonCorrelationPlotsPanel.tsx` — Fixed correlation range description

---

## Dependencies Added

| Package | Purpose |
|---------|---------|
| `aioftp>=0.22` | Async FTP client (pure Python) |
| `asyncssh>=2.14` | Async SSH/SFTP client (pure Python) |
| `react-day-picker` | Calendar date picker (shadcn calendar dependency) |
| `date-fns` | Date utility library (calendar dependency) |

shadcn/ui primitives added: `checkbox`, `popover`, `calendar`.

---

## Test Impact

| Test File | Before | After | New Tests |
|-----------|--------|-------|-----------|
| `test_server_import.py` | 0 | 23 | 23 (20 initial + 3 SSRF) |
| `test_projects.py` | 16 | 34 | 18 (10 filters + 8 reference) |
| `test_trimming_pipeline.py` | 9 | 13 | 4 (concurrency) |
| `test_peak_calling_pipeline.py` | 52 | 56 | 4 (concurrency) |
| **Total suite** | ~443 | **474+** | **49 new** |

All tests passing. `ruff check` + `ruff format --check` + `npm run build` all clean.

---

## Verification

- Backend: 474+ tests passing via `docker compose exec api pytest tests/`
- Linting: `ruff check` + `ruff format --check` clean
- Frontend: `npm run build` succeeds, `npm run typecheck` clean
- SSRF: 3 dedicated bypass tests (0.0.0.0, ::ffff:127.0.0.1, ::ffff:169.254.169.254)
- Pipeline parallelism: 12 new concurrency tests (4 per stage) verifying correctness, ordering, speedup, and sequential equivalence
- Reference project: 8 access control tests verifying visibility, write-protection, and endpoint isolation

---

## Known Issues / Open Items

- Docker image needs rebuild (`docker compose up -d --build api`) to pick up aioftp/asyncssh
- Alembic migrations need to be applied (3 new migrations)
- kseq_test binary must be compiled per-platform (arm64 local, x86_64 EC2) — not committed to git
- Real FTP/SFTP testing against an actual server not yet done (mock mode validated)
- Gold standard project needs actual rsync of dev-data to EC2 + seed script execution in production
- Raw FASTQs (~16GB) excluded from reference project rsync — not needed for browsing results
- Monitor m5.8xlarge (32 vCPU) under real parallel pipeline load
