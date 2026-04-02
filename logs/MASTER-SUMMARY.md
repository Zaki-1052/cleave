# Cleave — Master Build Summary (Phases 1-9 + Training Wheels)

> **Project**: Self-hosted CUT&RUN/CUT&Tag bioinformatics platform for the Ferguson Lab at UCSD (CUTANA Cloud clone + lab extensions).
> **Timeline**: 2026-03-23 to 2026-04-01 (10 days, ~70+ sessions across 9 phases + training wheels).
> **Final state**: 525+ backend tests passing. 11 database tables across 12 Alembic migrations. 68+ API endpoints. ~150+ frontend component files. Full dark mode. Training wheels mode. `ruff check` + `ruff format --check` + `npm run build` all clean.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Phase-by-Phase Build Log](#2-phase-by-phase-build-log)
3. [Cumulative Architecture Decisions](#3-cumulative-architecture-decisions)
4. [Final API Surface](#4-final-api-surface)
5. [Database Schema (Final State)](#5-database-schema-final-state)
6. [Test Coverage (Final State)](#6-test-coverage-final-state)
7. [Complete File Inventory](#7-complete-file-inventory)
8. [All Dependencies](#8-all-dependencies)
9. [Known Issues / Tech Debt (Current)](#9-known-issues--tech-debt-current)
10. [Key Corrections to Lab Reference Scripts](#10-key-corrections-to-lab-reference-scripts)

---

## 1. Executive Summary

Cleave is a full-stack bioinformatics web platform that replicates EpiCypher's CUTANA Cloud and extends it with lab-specific features. Built for ~8-10 users on a single AWS EC2 instance.

**Full pipeline**: FASTQ upload (tus resumable + FTP/SFTP import) -> FastQC -> Trimming (Trimmomatic + kseq 42bp) -> Alignment (Bowtie2 + SAMtools + BEDTools + Picard + deepTools) -> Peak Calling (MACS2/SICER2/SEACR + HOMER annotation) -> Visualization (IGV.js + heatmaps) -> Lab Extensions (DiffBind, Pearson correlation, Roman normalization, custom heatmaps) -> File download.

**Tech stack**: React 18 (Vite) + FastAPI (Python 3.11+) + PostgreSQL 15 + NGINX. Auth via fastapi-users (JWT + httpOnly cookie). Pipeline modules call bioinformatics tools via `subprocess.run()`. SSE for real-time updates. tus protocol for resumable uploads. Docker Compose for local dev.

**What distinguishes Cleave from CUTANA Cloud**: SEACR peak calling, MACS2 broad mode, FASTQ trimming (Trimmomatic + kseq), fragment size filter (<120bp), DiffBind differential analysis, custom reference-point heatmaps, Pearson correlation matrices, Roman normalization, auto-pipeline mode, FTP/SFTP server import, parallel pipeline processing, dark mode.

---

## 2. Phase-by-Phase Build Log

### Phase 1 — Foundation (2026-03-23 to 2026-03-24, 10 sessions)

**Scope**: Scaffold, auth, project/experiment CRUD, notifications, settings, UI shell, test infrastructure.

**What was built**:
- **Auth (1.1-1.2)**: fastapi-users library with custom login/register/refresh/logout endpoints. Dual-transport: access token in JSON body (15-min) + refresh token in httpOnly cookie (7-day). Argon2 password hashing via `pwdlib`. Rate limiting via `slowapi` (5/min login, 3/min register). Frontend `AuthContext` stores token in memory, Axios interceptor auto-refreshes on 401 with request queue (`isRefreshing` + `failedQueue`).
- **Project CRUD (1.3)**: Full CRUD with membership filtering (list only shows member projects). Creator auto-added as admin. `UserBrief` nested in `MemberRead`. Frontend: HomePage project cards, CreateProjectModal, ProjectDetailPage.
- **Member Management (1.4)**: Invite by email, change roles, remove members. Roles: `admin`, `contributor`, `viewer`. Guards: self-role-change (400), self-removal (400), last-admin demotion/removal (400), duplicate invite (409). Invite creates `project_invitation` notification.
- **Experiment CRUD (1.5)**: Create (100-char name limit, `CUT&RUN`/`CUT&Tag` assay types), list by project, get, update, delete. Permission: admin + contributor can mutate; viewer is read-only. Frontend: CreateExperimentModal, ExperimentView with tab routing.
- **Notifications (1.6)**: `GET /notifications`, `PATCH /notifications/:id/read`. Welcome notification on register, project_invitation on member invite. Frontend: NotificationPanel dropdown with bell icon, red unread badge, 30s polling.
- **Settings (1.7)**: `PATCH /users/me` updates firstName, lastName, emailNotifications. Frontend: SettingsPage with read-only email, editable name fields.
- **Tests (1.8)**: 46 tests across 5 files. Test infra: Postgres test DB (`cleave_test`), `NullPool`, autouse `setup_db` fixture, rate limiter disabled.

**Key decisions**: fastapi-users over hand-rolled auth; `CamelModel` base class for camelCase JSON; `require_project_role()` dependency for permission checks; `selectinload` to avoid async `MissingGreenlet`; TanStack Query for server state.

**API stubs created**: FASTQ upload, reactions, jobs, file download (all 501).

**Database**: 9 tables created across 2 migrations (`bce0e9c5d2ee` initial schema, `fafd5c9dc468` auth columns).

---

### Phase 2 — Data Management (2026-03-25 to 2026-03-26, 12 sessions)

**Scope**: FASTQ upload (multipart + tus resumable), FastQC, reactions CRUD + CSV import, trimming pipeline, file browser, file download.

**What was built**:
- **FASTQ Upload (2.1-2.2)**: tus v1.0.0 resumable upload via `tuspyserver` library with 3 DI hooks (files dir, validation, completion). Filename validation (`.fastq.gz`/`.fastq`/`.fq.gz`/`.fq`, `_R1`/`_R2` direction parsing). Auto-gzip of uncompressed FASTQs via async Queue producer/consumer. Atomic `storage_bytes` updates. Frontend: `FileUploadZone` with tus-js-client, per-file progress bars, cancel/resume. Legacy multipart endpoint kept alongside tus.
- **FastQC Integration (2.3-2.4)**: `pipelines/fastqc.py` module, background orchestration via `BackgroundTasks` with `async_session_factory()`. Auto-triggered post-upload. Frontend polls (5s `refetchInterval`) until `totalReads` populated. `FastqcReportModal` with iframe rendering and module pass/warn/fail sidebar.
- **Reactions (2.5-2.6)**: 8 endpoints: list, create, bulk create, CSV import, template download, FASTQ prefix detection, update, delete. CSV parsing with CUTANA-format column mapping. Unique constraint: `(experiment_id, organism, short_name)`. Frontend: `ReactionsEditor` (reusable in wizard) + `ReactionFormModal` with 16 fields.
- **Experiment Wizard (2.7)**: Extended 1-step modal to 3-step wizard (Details -> FASTQs -> Reactions). Experiment created at Step 1 "Next" (both FileUploadZone and ReactionsEditor need real `experimentId`).
- **Trimming Pipeline (2.8)**: `TrimmingStage(PipelineStage)` — Trimmomatic PE (adapter + quality) -> kseq_test (42bp fixed-length). `job_service.py` for job CRUD. `worker.py` with pipeline dispatcher (stage registry pattern). Frontend: adapter detection banner, in-progress banner, `TrimConfigModal`.
- **File Browser (2.9)**: `GET /experiments/:id/files` returns nested JSON file tree from disk scan. Recursive `FileNode` schema. Path traversal security. Frontend: dual-panel layout (tree + table).
- **File Download (2.10)**: True streaming zip via `stream-zip` library (flat memory). HMAC-signed download token system (5-min expiry). `X-Accel-Redirect` support for NGINX. Smart frontend: 1 file -> direct signed GET, 2+ files -> batch zip POST.

**Post-phase bug fixes (8 issues)**: `perPage` alias on projects, SECRET_KEY length, permission helpers DRY extraction (`services/permission_helpers.py`), 404/403 split for non-members vs wrong-role, async gzip refactor, streaming zip, signed download tokens, tus resumable uploads (replaced hand-rolled).

**Key decisions**: tus protocol for multi-GB FASTQs; R1/R2 pairing not enforced at upload (enforced at alignment); FastQC runs via BackgroundTasks (not job queue); CSV import is all-or-nothing; pipeline dispatcher uses stage registry pattern; file tree from disk scan (not DB records); HMAC-signed tokens for file download auth.

**Database**: 2 new migrations (`35ad430891c0` fastqc_report_path, `87e85de24803` adapter_status on fastq_files). Total: 4 migrations.

**Tests**: 151 total (105 new).

---

### Phase 3 — Core Pipeline (2026-03-27, 7 sessions)

**Scope**: Worker process + job queue hardening, SSE real-time status, alignment pipeline (13-step), alignment wizard UI, QC reports, analysis queue page.

**What was built**:
- **Worker (3.1)**: Enhanced to create per-job directories, run pipeline modules via dispatcher, track experiment status transitions. Created `services/job_output_service.py` for generic output persistence + atomic `storage_bytes`. Worker added as 4th Docker Compose service. Switched to structlog.
- **SSE (3.2)**: `services/sse_service.py` — async generator polling every 2s. Watermark-based state tracking prevents stale event bursts. `@microsoft/fetch-event-source` for JWT auth in Authorization header (not query param). SSE replaces 30s notification polling and 2s job polling.
- **Alignment Pipeline (3.3)**: `AlignmentStage(PipelineStage)` — 13-step per-reaction pipeline: Bowtie2 -> SAM->BAM -> properly-paired + MAPQ filter -> DAC exclusion list -> Picard SortSam -> MarkDuplicates -> duplicate removal -> BAM index -> unsmoothed bigWig (20bp RPKM) -> smoothed bigWig (100bp RPKM) -> TSS heatmap -> gene body heatmap -> E. coli spike-in (optional). Mock mode creates real stub files. `AlignmentQCReport` schema matching CUTANA CSV columns. Correct per-genome `EFFECTIVE_GENOME_SIZES` (fixes lab bug). All tool flags verified against lab reference scripts.
- **Alignment Wizard (3.4)**: 3-step wizard: Details -> Choose Reactions -> Alignment Settings. Reference genome auto-selects from organism. FASTQ path resolution prefers trimmed over raw. `NewAnalysisDropdown` with Alignment active, Peak Calling disabled.
- **QC Report (3.5)**: `GET /jobs/:jid/qc-report` (JSON) + `/download` (CSV). Frontend `AlignmentQCReportPanel` with 9-column metrics DataTable.
- **Sub-tabs (3.6)**: Info (details + methods text + notes), Input (reactions table), QC Report, Files (category-filtered), IGV (placeholder). `DetailRow` shared component extracted.
- **Analysis Queue (3.7)**: `GET /api/v1/jobs` — cross-project job list, paginated, filterable by status. `JobQueueRead` schema with flat response. Frontend: DataTable with 8 columns, search, status filter, pagination.

**Phase 3 bug-fix session**: SNAP-CUTANA K-MetStat spike-in QC (full implementation: 32 barcodes via `zgrep -c`, heatmap UI), E. coli spike-in normalization factor, "Last Job" in ExperimentView header, Notes inline editor, batch download in Files sub-tab, missing `perPage` alias, column-level filter dropdowns.

**Key decisions**: `job_dir` alongside `working_dir` (trimming writes to shared tree, alignment to per-job dir); SSE auth via Authorization header (not query param); combined lab's properly-paired filter with CUTANA's MAPQ filter in single samtools call; Picard invoked via `shutil.which("picard")` conda wrapper; QC data read from CSV on disk (not DB).

**Database**: No new migrations. Existing tables sufficient.

**Tests**: 213 total (62 new).

---

### Phase 4 — Peak Calling (2026-03-27, 4 sessions)

**Scope**: Peak calling pipeline (5 modes), 4-step wizard, QC reports (FRiP + annotation charts), sub-tabs.

**What was built**:
- **Peak Calling Pipeline (4.1)**: `PeakCallingStage(PipelineStage)` — 1,376 lines supporting all 5 peak caller modes:
  - MACS2 narrow (`-f BAMPE -q 0.01 -B --SPMR --keep-dup all`)
  - MACS2 broad (`--broad --broad-cutoff 0.1`)
  - SICER2 broad (FDR 0.01)
  - SEACR stringent (MACS2 bdg -> `change.bdg.py` float->int -> `SEACR_1.1.sh 0.01 non stringent`)
  - SEACR relaxed (same chain, `relaxed` mode)
  - Fragment size filter (<120bp, default ON) via `filter_below.awk` triple-pipe
  - IgG control as MACS2 `-c` flag, filtered BAM cached across reactions
  - FRiP calculation (`bedtools intersect` / `samtools view -c`)
  - HOMER annotation (`annotatePeaks.pl`, non-fatal on failure)
  - Post-peak blacklist subtraction
  - Mock mode with canned CUTANA CSVs
  - Methods text for manuscripts
- **Wizard (4.2)**: 4-step: Details -> Choose Alignment (radio table, only complete alignments) -> Choose Reactions (checkbox table) -> Peak Calling Settings (caller dropdown, peak size, IgG control per reaction, advanced thresholds + fragment filter).
- **QC Report (4.3)**: 3 new endpoints (peak QC JSON, metrics CSV, annotation CSV). HOMER annotation parsing maps prefixes to 10 CUTANA categories. `PeakAnnotationChart` — first chart in codebase (Recharts stacked bar with SVG-to-canvas PNG export). FRiP color coding (green/amber/red). Top called peaks section.
- **Sub-tabs (4.4)**: `PeakCallingTab` with 5 sub-tabs: Info, Input, QC Report (FRiP + annotation chart + top peaks), Files (6 categories), IGV (placeholder).

**Key decisions**: MACS2 default q-value `0.01` (lab standard, not CUTANA's 0.05); fragment filter default ON; IgG passed as MACS2 `-c` flag; SEACR uses numeric threshold `0.01` (not IgG bedgraph); peak caller/size is job-level (not per-reaction); HOMER failure is non-fatal.

**Database**: No new migrations.

**Tests**: ~283 total (66 new: 52 pipeline + 14 QC).

---

### Phase 5 — Visualization & Polish (2026-03-27 to 2026-03-28, 8 sessions)

**Scope**: IGV.js integration, QC report heatmaps, pipeline master logs, TypeScript/accessibility sweep, local dev bug fixes.

**What was built**:
- **IGV.js (5.1-5.3)**: `IGVPanel.tsx` (328 lines) — reusable component for both alignment and peak_calling modes. Dynamic `import('igv')` keeps ~1.5MB out of main bundle. Custom toolbar (genome label, reaction selector, refresh, full screen) + IGV.js built-in navigation. `SelectReactionsModal` for track selection. Backend: `POST /files/igv-tokens` (batch HMAC-signed URLs, 60-min TTL) + `GET /files/igv-serve` (RFC 7233 Range support: 200/206/416). Token refresh via `refetchInterval: 50min`.
- **QC Report Heatmaps**: TSS and gene body heatmap sections in `AlignmentQCReportPanel`. `HeatmapImage` component fetches signed URLs. Grid layout for multiple reactions. New `GET /jobs/:jid/outputs/:oid/signed-url` endpoint.
- **Peak Calling QC Enhancements**: Top peaks CSV download endpoint, reordered QC panel, enhanced annotation chart tooltip, fixed annotation stats parser (`int("9.0")` -> `int(float("9.0"))`).
- **Pipeline Master Logs**: `append_to_master_log()` helper in `base.py`. Both alignment and peak calling create consolidated log files registered as downloadable outputs.
- **TypeScript & Accessibility**: 6 TS2322 errors, 3 `noUncheckedIndexedAccess` violations, 2 TS2345 errors fixed. `aria-label` on checkboxes, `htmlFor`/`id` pairs on form elements, `type="button"` on ~15 buttons.
- **Test Infrastructure Fix**: `@pytest.mark.anyio` double-wrapping bug causing `RuntimeError: Task got Future attached to a different loop`. Fixed by removing all `@pytest.mark.anyio` markers from affected files.
- **Local Dev Bug Fixes (14 issues)**: FastQC blocking event loop -> `asyncio.to_thread()`, tus upload FastQC blocking -> `asyncio.create_task()`, storage_bytes not updating, FastQC report 401 -> signed URL flow, Bowtie2 missing read groups -> `--rg-id/--rg SM:/--rg LB:/--rg PL:ILLUMINA`, Uvicorn reload hang -> `--timeout-graceful-shutdown 3`, modal overflow -> `max-h-[90vh]`, FastQC per_page limit raised to 500, useSSE import path fix, httpx deprecation fix, SEACR default changed to stringent, access token TTL bumped 15min -> 30min, SSE MAX_RETRIES 3->10 with 3s reconnect delay.
- **Local Dev Script** (`scripts/run-local.sh`): conda/pyenv/PATH fixes, HOMER PATH, graceful shutdown, pg_isready fallback.

**Key decisions**: IGV auth via HMAC tokens in query params (IGV.js can't set Authorization headers on byte-range requests); 60-min IGV token TTL with proactive refresh; custom `StreamingResponse` for Range handling (not Starlette's `FileResponse`); FastQC execution via `asyncio.to_thread()` + `asyncio.create_task()`; SEACR is now default peak caller; access token TTL 30min.

**Database**: No new migrations.

**Tests**: 296 total (13 new: 10 IGV/Range + 3 infrastructure fixes).

---

### Phase 6 — Lab Extensions (2026-03-28, 4 sessions)

**Scope**: DiffBind, custom heatmaps, Pearson correlation, Roman normalization.

**What was built**:
- **DiffBind (6.1)**: `DiffBindStage` — 3 analysis modes: DESeq2 consensus peakset, DESeq2 custom peakset, edgeR+TMM custom peakset. Ported 3 lab R scripts with 3 bugs fixed (missing `)`, malformed `cat()`/`print()`, missing `dev.off()`). **Dynamic column handling**: backend parses TSV header for `Conc_<condition>` names, frontend builds columns from `report.columnNames`. 4-step wizard with sample sheet builder (autocomplete conditions, auto-replicate numbering, validation: >=4 samples, >=2 conditions, >=2 replicates per condition). 5 sub-tabs (Info, Input, Results with FDR coloring, Plots with PCA/MA/Volcano/Heatmaps, Files).
- **Custom Heatmaps (6.2)**: `CustomHeatmapStage` — deepTools `computeMatrix reference-point` + `plotHeatmap` + `plotProfile`. User-configurable flanking distance, reference point, sort order, color map. BED upload (`POST /experiments/:id/upload-bed`, simple multipart <50MB). 4-step wizard with combined BED source selector + sample table with drag-to-reorder. 3 sub-tabs (Info, Plot with heatmap + profile side-by-side, Files).
- **Pearson Correlation (6.3)**: `PearsonCorrelationStage` — two-subprocess chain: R/rtracklayer (bigWig -> coverage matrix at 50bp) + Python/seaborn (pairwise correlation heatmap). Multi-genome chromosome sets (mm10: chr1-19+chrX, hg38/hg19: chr1-22+chrX, dm6, sacCer3). Optional BED restriction. 4-step wizard with editable labels, reorder, auto-IgG-exclusion. 3 sub-tabs (Info, Plot, Files).
- **Roman Normalization (6.4)**: `RomanNormalizationStage` — mouse-only 99th-percentile quantile normalization with `manual.mask.ultimate.bed` masking (158 regions). First sample = normalization reference (NF=1.0). Mouse-only enforcement at two layers (frontend filter + backend hard error). Per-reaction output tracking (`reaction_id` on `normalization_bigwig` outputs). 4-step wizard with sample reorder + info banner. 3 sub-tabs (Info, Results with factors table + bar chart, Files).
- **Test Infrastructure Fix**: Replaced `Base.metadata.drop_all` with `DROP SCHEMA public CASCADE; CREATE SCHEMA public` — fixes intermittent failures from leftover `pg_type` entries.

**Key decisions**: DiffBind columns dynamic (never hardcoded); R scripts shipped as static files under `pipelines/scripts/`; DiffBind dependency chain via `parent_job_id` -> peak calling -> alignment; Pearson two-script chain preserved (mandatory reference compliance); masking mm10 only; Roman normalization reference sample is first in list (user-reorderable).

**Database**: No new migrations. All 4 job types use existing `analysis_jobs` with different `job_type` values and JSONB `params`.

**Tests**: 373 total (77 new: 21 DiffBind + 18 heatmap + 19 Pearson + 19 normalization).

---

### Phase 7 — Polish & QA (2026-03-28 to 2026-03-29, 10+ sessions)

**Scope**: Storage lifecycle, audit log, job termination/retry, email notifications, password reset, concurrent alignment, auto-pipeline mode, lab blacklist, pipeline bug fixes.

**What was built**:
- **Storage Lifecycle (7.1)**: `services/cleanup_service.py` — periodic deletion of expired pipeline logs (30-day retention) and stale tus staging files (48h). Worker integration. Disk cleanup on experiment/project delete (`shutil.rmtree()`). Admin API: `POST /admin/cleanup`, `GET /admin/storage-info`. Frontend `StorageGauge` component. 5 new config settings.
- **Experiment History (7.3)**: New `experiment_events` table (migration `4f02b80e7f9b`). `services/event_service.py` with transactional `log_event()` (no commit — flushed with parent). 10 event types: `fastq_uploaded`, `fastq_deleted`, `reaction_created`, `reactions_imported`, `reaction_updated`, `reaction_deleted`, `job_launched`, `job_completed`, `job_failed`, `metadata_updated`. Frontend `HistoryTab` with DataTable.
- **Job Termination & Retry (7.4)**: `POST /jobs/:id/terminate` — `TerminatedError` exception + `cancelled` callback on `run_cmd()`/`run_piped_cmd()` (checks DB between subprocess steps). Sync SQLAlchemy engine for termination checks. `POST /jobs/:id/retry` — creates new queued job from failed/terminated. `retry_of_job_id` column (separate from `parent_job_id`). `GET /jobs/:id/log-tail?lines=50`. Frontend: `JobErrorDetails` (error + log viewer) + `JobActions` (Terminate/Retry buttons). Global `ErrorBoundary` wrapping authenticated routes. Migration `19f7810a826a`.
- **Email + Password Reset (7.5)**: Amazon SES via boto3 (`asyncio.to_thread` wrapper). Jinja2 templates with `autoescape=True`. Job completion emails (respects user preferences). Custom forgot-password (always 202, 3/min rate limit) + reset-password endpoints. `password_changed_at` column + refresh invalidation. Migration `ddf72d64a676`.
- **Mark All Notifications Read**: `PATCH /notifications/read-all` (204). Frontend "Mark all read" button.
- **Concurrent Alignment**: `ThreadPoolExecutor` per-reaction. `_AlignmentContext` frozen dataclass. `_process_reaction()` standalone function. Thread allocation: `max(2, total // concurrent_count)`. `MAX_CONCURRENT_REACTIONS` config (default 8). Per-reaction log files merged post-execution. Partial failure + termination support.
- **Lab Custom Blacklist**: Lab's `250123blacklist.bed` (255 entries, mm10) -> `mm10.lab.blacklist.bed`. Extended `resolve_blacklist()` with `blacklist_type` param (`encode_dac`, `lab_custom`, `both`, `none`). Default `both` for mm10 peak calling.
- **Auto-Pipeline Mode**: Migration `1b988efe774f` (adds `auto_pipeline`, `auto_pipeline_status`, `auto_pipeline_config` to experiments). `auto_pipeline_service.py` chains: FastQC -> Trimming -> Alignment -> Peak Calling -> [Normalization] -> [DiffBind] -> [Heatmaps] -> [Pearson]. DiffBind condition auto-detection from `experimental_condition` + short_name patterns. Cancellation and error handling. Worker hooks (`on_job_complete`, `on_job_error`). Frontend: `AutoPipelineModal` + `AutoPipelineBanner` + "Run Full Pipeline" button.
- **BigWig Source Refactor**: `bigwig-utils.ts` + `ChooseBigWigSourceStep.tsx`. Pearson/Heatmap wizards prefer Roman-normalized bigWigs when available.
- **Pipeline Bug Fixes**: DiffBind "No significant sites" crash -> `safe_plot()` tryCatch; DiffBind BiocParallel fork crash on macOS -> SerialParam() fallback; Roman normalization bin mismatch -> intersection-based matrix; Roman normalization NA propagation -> NA replacement + na.rm guards; Pearson resolution mismatch -> parameterized `dx` (20bp for alignment, 50bp for rnorm).
- **UI Improvement Skill**: `.claude/skills/ui-improvement/SKILL.md` (650 lines) — prompt for systematic frontend polish. Not yet executed.

**Key decisions**: DB polling for termination (not signals/Redis); `retry_of_job_id` separate from `parent_job_id`; termination between subprocess steps (not mid-subprocess); Amazon SES via boto3 (sync + asyncio.to_thread); password reset always 202 (prevents email enumeration); `password_changed_at` for session invalidation; ThreadPoolExecutor for concurrent reactions; auto-pipeline chains sequentially (single-worker architecture); DiffBind condition detection: explicit field first, then pattern matching.

**Database**: 4 new migrations (experiment_events, password_changed_at, termination/retry columns, auto-pipeline columns). Total: 8 migrations.

**Tests**: ~441 total (68+ new).

---

### Phase 8 — UI Overhaul & Dark Mode (2026-03-29, 12 sessions)

**Scope**: Comprehensive frontend-only UI improvement. No backend changes, no new tests, no API changes. ~150+ frontend files modified across 7 passes.

**What was built**:
- **Pass 1 (Foundation)**: shadcn/ui integration (10 Radix primitives: dialog, dropdown-menu, tabs, tooltip, select, sonner, separator, badge, collapsible, scroll-area). `cn()` utility (clsx + tailwind-merge). Google Fonts: Source Serif 4 (display), Source Sans 3 (body), Source Code Pro (mono). CSS variable theming (light + dark HSL tokens). `tailwindcss-animate` plugin. Primary color changed from static hex to `hsl(var(--primary))`.
- **Pass 2 (Core Components)**: `Button` rewritten with CVA (loading, asChild, size props, variant aliases for zero call-site changes). `Modal` -> thin shadcn Dialog wrapper (focus trap, Escape, animations). `WizardModal` upgraded to Dialog base (completed steps show checkmark). `Card` -> CVA variants (default, interactive). `DataTable` -> lucide icons, emptyMessage prop. `StatusBadge` -> tinted backgrounds, animate-pulse on running. `JobErrorDetails` -> shadcn Collapsible. Mounted sonner `<Toaster>`.
- **Pass 2b (Selectors)**: ExperimentView sidebar active state (left accent bar + bg tint). Sub-tab active treatment. All job selectors replaced with shadcn `<Select>`.
- **Pass 3 (Layout)**: Navbar -> shadcn DropdownMenu, lucide icons, CleaveIcon SVG, `font-display` wordmark. Breadcrumbs -> lucide ChevronRight. NewAnalysisDropdown -> shadcn DropdownMenu with 6 lucide icons.
- **Pass 4 (Pages)**: Auth pages (CleaveIcon branding, Button loading). HomePage (EmptyState, interactive cards). ProjectDetailPage (icons, avatars). AnalysisQueuePage (lucide pagination). SettingsPage (split cards, shadcn Select).
- **Pass 5 (Feature Components)**: Touched 49 feature files. Deleted ALL remaining inline SVG functions and Unicode symbols -> lucide-react. `font-display` on all headings. `font-mono` on all numeric data. All spinners -> lucide `Loader2`.
- **Pass 5b (Critique)**: Cascading `font-display` on `DetailRow` and `Input` labels. Last Unicode entities replaced. 115 `font-display` instances across 35 files.
- **Pass 6 (Motion)**: `Spinner.tsx` component (replaced 43 inline Loader2 instances). Transition upgrades. Toast notifications added to 25 files via sonner. ESLint cleanup.
- **Pass 7 (Dark Mode)**: `ThemeToggle` (Sun/Moon) using next-themes. `ThemeProvider` in main.tsx. Semantic color mapping across ~110 TSX files (`text-gray-*` -> `text-muted-foreground`, `bg-white` -> `bg-card`, `border-gray-*` -> `border-border`, etc.). Colored tint banners get `dark:` variants.
- **Landing Page & Routing**: `LandingPage.tsx` at `/` (public). Dashboard moved to `/dashboard`. `CleaveIcon.tsx` shared DNA helix SVG (white backbones + gold cleave slash).
- **EmptyState Component**: Reusable dashed-border container. Applied to all 6 experiment tabs + HomePage.

**Key decisions**: shadcn/ui (Radix) for composable primitives; CVA for button variants with backward-compatible aliases; `darkMode: ['class']` + next-themes; lucide-react for all icons; sonner for toasts; `/` is landing page (public), `/dashboard` requires login.

**Verification**: Zero remaining inline SVGs, border-spinner patterns, Unicode symbols, or `border-gray-*` in TSX.

---

### Phase 9 — FTP/SFTP Import, Pipeline Parallelism, Gold Standard & Polish (2026-03-29 to 2026-03-30, 9 sessions)

**Scope**: FTP/SFTP server import, parallel trimming + peak calling, gold standard reference project, project filters/pagination, docs site, SSRF fixes, Trimmomatic/kseq fixes, favicon.

**What was built**:
- **FTP/SFTP Server Import**: Full stack. Backend: `saved_servers` table (Fernet AES-128-CBC encrypted passwords), browse via aioftp (FTP) + asyncssh (SFTP), background download via `asyncio.create_task()`, in-memory progress tracker, SSRF validation (blocks private IPs, localhost, AWS metadata), auto-triggers FastQC. 7 API endpoints. Frontend: 3-step WizardModal (Connect with saved servers -> Browse & Select -> Import with per-file progress). SSE event for import progress.
- **SSRF Fix**: Added `0.0.0.0/8` to blocklist. IPv6-mapped IPv4 unwrapping (`::ffff:127.0.0.1` now checked against IPv4 ranges).
- **Parallel Trimming**: `ThreadPoolExecutor` matching alignment's pattern. `_TrimmingContext` frozen dataclass. `_process_pair()` standalone function. Trimmomatic `-threads` gets per-pair count.
- **Trimmomatic & kseq Fixes**: Compiled kseq_test binary. Fixed Trimmomatic invocation: `_resolve_trimmomatic_cmd()` with 3 portable fallbacks (env var -> conda JAR -> PATH).
- **Parallel Peak Calling**: `ThreadPoolExecutor`. Pre-filters all unique IgG BAMs before thread dispatch (eliminates race conditions). Per-reaction log files merged post-execution.
- **Gold Standard Reference Project**: `is_reference` boolean on projects (migration `b4c7e2f19a53`). Modified all read-access queries (8 files) to use `outerjoin + OR is_reference` pattern. `GET /projects/reference` endpoint. `scripts/seed_reference_project.py` (idempotent). Frontend: gold-accented card on HomePage, read-only mode on ProjectDetailPage/ExperimentView.
- **Project Filters & Pagination**: `status` column on projects (migration `c5d8f3a10b64`). 5 filter query params on `GET /projects`. `GET /projects/filter-members` endpoint. `recompute_project_status()` wired into worker at all 3 job transitions. Frontend: `ProjectFilters.tsx` sidebar (status multi-select, members searchable, date picker), pagination, URL state persistence via `useSearchParams`.
- **Documentation Site**: `/docs` route with 17 pages. `DocsLayout` with collapsible sidebar. Content as structured TypeScript data (2,506 lines). Single `DocsPage` component with slug-based lookup. Mobile responsive.
- **Favicon**: `favicon.svg` using CleaveIcon design (DNA helix + gold slash).
- **Auto-Pipeline in Wizard**: Added Step 4 ("Pipeline") to experiment creation wizard with "Run Full Pipeline when done" toggle. Extracted `AutoPipelineConfigPanel` from `AutoPipelineModal` (DRY). Calls existing `POST /auto-pipeline` on wizard completion. Error-resilient (toast on failure, experiment still created).
- **Auto-Pipeline Race Fix**: `on_fastqc_complete()` now waits for ALL raw FASTQs to complete FastQC before evaluating adapter status (matching existing guard in `start_auto_pipeline()`).
- **Cleanup Default**: Changed `CLEANUP_ENABLED` default to `False` — nothing auto-deleted out of the box.
- **Auto-Pipeline Fixes**: Roman normalization default, `isMouse` derivation, Pearson description.
- **Sidebar Reordering**: Normalization moved above Heatmaps/Correlation to match pipeline execution order.

**Key decisions**: FTP import via `asyncio.create_task()` (not job queue — doesn't block worker); Fernet encryption for credentials; SSRF prevention with IPv6-mapped IPv4 unwrapping; all 3 CPU-bound pipelines now use identical ThreadPoolExecutor pattern; IgG pre-filtered before thread dispatch (no shared mutable cache); `is_reference` flag (not auto-adding members); project status stored (not computed) for query simplicity; staged filters (Apply/Clear); docs as hardcoded TypeScript (no markdown parser).

**Database**: 3 new migrations (saved_servers, is_reference, project status). Total: 11 migrations.

**Tests**: 474+ total (31+ new).

---

## 3. Cumulative Architecture Decisions

### Authentication & Authorization

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth library | fastapi-users | Production-audited, eliminates ~500 lines of security code |
| Token transport | Bearer body (30-min) + httpOnly cookie (7-day) | Access in memory (XSS-safe), refresh in cookie (CSRF-safe via SameSite=Lax) |
| File download auth | HMAC-SHA256 signed tokens | Enables browser-native downloads and IGV byte-range requests without JWT |
| IGV auth | HMAC tokens in query params (60-min) | IGV.js can't set Authorization headers on byte-range requests |
| SSE auth | Authorization header via @microsoft/fetch-event-source | Keeps JWT out of logs (vs query param) |
| Password reset | Custom endpoints (always 202) | Prevents email enumeration; matches existing wrapper pattern |
| Session invalidation | `password_changed_at` column | Closes stolen-cookie gap without full token blacklist |
| Credential encryption | Fernet (AES-128-CBC + HMAC) | FTP/SFTP passwords encrypted at rest |
| Permission model | `require_project_role()` dependency | 404 for non-members, 403 for wrong role |
| Reference project access | `is_reference` flag + outerjoin pattern | All authenticated users can read without membership rows |

### Data & Storage

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Upload protocol | tus v1.0.0 via tuspyserver | Chunked/resumable for multi-GB FASTQs |
| FTP/SFTP import | aioftp + asyncssh via asyncio.create_task() | Pure Python async; doesn't block pipeline worker |
| File tree source | Disk scan (not DB records) | Ensures all files visible (logs, FastQC artifacts, etc.) |
| Batch zip | stream-zip true streaming | Memory stays flat regardless of archive size |
| File serving (prod) | NGINX X-Accel-Redirect | FastAPI checks auth only, never streams large files |
| Range header support | Custom StreamingResponse | RFC 7233 for IGV.js byte-range requests |
| Storage cleanup | Worker-integrated periodic task | 30-day log retention, 48h tus staging retention |
| Path security | Validates paths within STORAGE_ROOT | Rejects `..`, absolute paths, symlinks |
| SSRF prevention | Blocked private IPs + localhost + AWS metadata + IPv6-mapped IPv4 | Defense in depth for lab deployment |

### Pipeline Architecture

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Job queue | PostgreSQL polling (FOR UPDATE SKIP LOCKED) | Single-instance deployment; simpler than Redis/Celery |
| Pipeline dispatcher | Stage registry pattern | `run(job_type, params)` dispatches to registered stage |
| Concurrency | ThreadPoolExecutor per-reaction (all 3 CPU-bound stages) | Frozen dataclass contexts, module-level workers, partial failure, termination |
| Thread allocation | max(2, total // concurrent_count) per reaction | MAX_CONCURRENT_REACTIONS=8 for m5.8xlarge (32 vCPU) |
| Termination | DB polling between subprocess steps | Sync callback queries `termination_requested_at` from separate engine |
| Mock mode | Creates real stub files on disk | File browser, download, and IGV depend on files at real paths |
| Auto-pipeline | Sequential chaining via parent_job_id | Single-worker; each step depends on previous outputs |
| FastQC execution | BackgroundTasks (asyncio.to_thread + asyncio.create_task) | Non-blocking; frontend polls until totalReads populated |
| Worker DB sessions | Per-poll-cycle (async_session_factory, not long-lived) | Avoids stale reads |

### Bioinformatics-Specific

| Decision | Choice | Rationale |
|----------|--------|-----------|
| MACS2 default q-value | 0.01 (not CUTANA's 0.05) | Lab standard, more stringent |
| Default peak caller | SEACR stringent | Lab consensus for CUT&RUN |
| Fragment filter | ON by default (<120bp) | Sub-nucleosomal fragments are biologically relevant |
| SEACR threshold | Numeric 0.01 (not IgG bedgraph) | Matches lab behavior |
| SEACR preprocessing | MACS2 bdg (no --SPMR) -> change.bdg.py -> SEACR | Exact lab chain |
| R1/R2 pairing | Not enforced at upload | Users may upload across sessions; enforce at alignment launch |
| DiffBind columns | Dynamic from TSV header | `Conc_<condition>` names depend on sample sheet |
| Pearson two-script chain | R + Python preserved | Mandatory reference compliance |
| Roman normalization | Mouse only (mm10) | Hardcoded chromosome list; no human equivalent |
| effectiveGenomeSize | Correct per-genome values | Fixes lab bug (mm10's value used for all organisms) |
| Blacklist default | Both (ENCODE DAC + lab custom) for mm10 | Lab's custom blacklist (255 entries) applied after ENCODE |
| BigWig preference | Downstream steps prefer Roman-normalized when available | 50bp resolution matches Pearson R script expectations |

### Frontend

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Component library | shadcn/ui (Radix primitives) | Composable, Tailwind-native, no runtime CSS-in-JS |
| State management | TanStack Query (server) + useState (local) | No global store needed at lab scale |
| Real-time | SSE (not WebSocket) | Unidirectional server->client sufficient for ~8-10 users |
| Dark mode | CSS variables + next-themes | System/light/dark with persistent preference |
| Icons | lucide-react | Tree-shakeable, consistent style, TypeScript-native |
| Toasts | sonner | Simple API via shadcn |
| IGV.js import | Dynamic import() | Keeps ~1.5MB out of main bundle |
| Chart library | Recharts | Already in project; stacked bar chart for annotations |
| Routing | `/` public landing, `/dashboard` auth | Marketing page at root |
| Training wheels | `is_training` flag on first-created project | Forces first-time users to learn parameters; auto-pipeline disabled, defaults cleared, educational hints shown |

---

## 4. Final API Surface

68+ endpoints across 14 routers under `/api/v1/`.

### Auth & Users
```
POST   /auth/login                                    # Returns JWT + sets refresh cookie
POST   /auth/register                                 # Creates account
POST   /auth/refresh                                  # Refreshes access token (validates password_changed_at)
POST   /auth/logout                                   # Deletes refresh cookie
POST   /auth/forgot-password                          # Sends reset email (always 202)
POST   /auth/reset-password                           # Completes password reset
GET    /users/me                                      # Current user profile
PATCH  /users/me                                      # Update profile (partial)
```

### Projects & Members
```
GET    /projects                                      # Paginated, member-filtered, 5 filter params
POST   /projects                                      # Create (creator = admin)
GET    /projects/:id                                  # Get project
PATCH  /projects/:id                                  # Update (admin)
DELETE /projects/:id                                  # Delete (admin, disk cleanup)
GET    /projects/:id/members                          # List members
POST   /projects/:id/members                          # Invite by email (admin)
PATCH  /projects/:id/members/:uid                     # Change role (admin)
DELETE /projects/:id/members/:uid                     # Remove member (admin)
GET    /projects/reference                            # Reference projects (all authenticated users)
GET    /projects/filter-members                       # Fellow members for filter sidebar
```

### Experiments
```
GET    /experiments                                   # List (filterable by projectId)
POST   /experiments?projectId=                        # Create experiment
GET    /experiments/:id                               # Get experiment
PATCH  /experiments/:id                               # Update experiment
DELETE /experiments/:id                               # Delete (disk cleanup)
GET    /experiments/:id/history                       # Paginated audit log
POST   /experiments/:id/auto-pipeline                 # Start one-click pipeline
POST   /experiments/:id/auto-pipeline/cancel          # Cancel auto-pipeline
POST   /experiments/:id/auto-pipeline/retry           # Retry failed step
```

### FASTQs & Upload
```
GET    /experiments/:id/fastqs                        # List FASTQs (paginated, up to 500)
POST   /experiments/:id/fastqs/upload                 # Multipart upload (legacy)
POST/PATCH/DELETE/GET /experiments/:id/tus/*           # tus v1.0.0 resumable upload
DELETE /experiments/:id/fastqs/:fid                   # Delete FASTQ + FastQC report
GET    /experiments/:id/fastqs/:fid/fastqc            # FastQC HTML report
GET    /experiments/:id/fastqs/:fid/fastqc-token      # Signed URL for iframe
GET    /experiments/:id/fastqs/:fid/fastqc-summary    # Structured module summary JSON
```

### Reactions
```
GET    /experiments/:id/reactions                     # Paginated reactions
POST   /experiments/:id/reactions                     # Create single
POST   /experiments/:id/reactions/bulk                # Bulk create from JSON
POST   /experiments/:id/reactions/import-csv          # CSV import (all-or-nothing)
GET    /experiments/:id/reactions/template             # Download CSV template
GET    /experiments/:id/reactions/prefixes             # Auto-detect FASTQ prefixes
PATCH  /experiments/:id/reactions/:rid                 # Update reaction
DELETE /experiments/:id/reactions/:rid                 # Delete reaction
```

### Analysis Jobs
```
POST   /experiments/:id/jobs                          # Submit job (any of 7 types)
GET    /experiments/:id/jobs                           # List experiment jobs
GET    /jobs                                           # Cross-project queue (filterable by status, jobType, search)
GET    /jobs/:jid                                      # Job detail (includes launcher UserBrief)
PATCH  /jobs/:jid                                      # Update notes
POST   /jobs/:jid/terminate                            # Terminate queued/running job
POST   /jobs/:jid/retry                                # Retry failed/terminated job
GET    /jobs/:jid/log-tail?lines=50                    # Last N lines of pipeline log
GET    /jobs/:jid/outputs?category=                    # List outputs (category filter)
GET    /jobs/:jid/outputs/:oid/signed-url              # Signed URL for any output file
```

### QC Reports & Pipeline Results
```
GET    /jobs/:jid/qc-report                           # Alignment QC (JSON)
GET    /jobs/:jid/qc-report/download                  # Alignment metrics CSV
GET    /jobs/:jid/peak-qc-report                      # Peak calling QC (JSON)
GET    /jobs/:jid/peak-qc-report/download             # Peak metrics CSV
GET    /jobs/:jid/peak-qc-report/top-peaks-csv        # Top called peaks CSV
GET    /jobs/:jid/peak-qc-report/annotation-csv       # Annotation percentages CSV
GET    /jobs/:jid/diffbind-report                     # DiffBind results (JSON, dynamic columns)
GET    /jobs/:jid/diffbind-report/download-results    # DiffBind TSV
GET    /jobs/:jid/diffbind-report/download-counts     # Normalized counts CSV
GET    /jobs/:jid/heatmap-report                      # Custom heatmap report
GET    /jobs/:jid/heatmap-report/download-matrix      # Heatmap matrix (.gz)
GET    /jobs/:jid/pearson-report                      # Pearson correlation report
GET    /jobs/:jid/pearson-report/download-correlation  # Correlation matrix CSV
GET    /jobs/:jid/pearson-report/download-coverage     # Coverage matrix CSV
GET    /jobs/:jid/normalization-report                # Roman normalization report
GET    /jobs/:jid/normalization-report/download-factors # Normalization factors CSV
```

### Files & Downloads
```
GET    /experiments/:id/files                          # File tree (disk scan, nested JSON)
GET    /experiments/:id/files/download?path=           # Single file download
POST   /experiments/:id/files/batch-download           # Streaming zip
POST   /jobs/:jid/files/batch-download                 # Job outputs zip
POST   /files/download-token                           # Generate HMAC-signed URL (5-min)
GET    /files/signed-download?token=                   # Serve via signed token
POST   /files/igv-tokens                               # Batch IGV tokens (60-min)
GET    /files/igv-serve?token=                         # Serve with Range headers (RFC 7233)
POST   /experiments/:id/upload-bed                     # Upload BED file (<50MB)
```

### Server Import (FTP/SFTP)
```
POST   /experiments/:id/server-import/browse           # Browse remote directory
POST   /experiments/:id/server-import/start            # Start background import
GET    /experiments/:id/server-import/:iid/progress    # Import progress
GET    /users/me/saved-servers                         # List saved credentials
POST   /users/me/saved-servers                         # Save new server
PATCH  /users/me/saved-servers/:id                     # Update saved server
DELETE /users/me/saved-servers/:id                     # Delete saved server
```

### Notifications & SSE
```
GET    /notifications/stream                           # SSE endpoint (2s poll, 15s keepalive)
GET    /notifications                                  # List notifications
PATCH  /notifications/read-all                         # Mark all read (204)
PATCH  /notifications/:id/read                         # Mark single read
```

### Admin
```
POST   /admin/cleanup                                  # Trigger storage cleanup (superuser)
GET    /admin/storage-info                             # Disk usage + quota
```

### Health
```
GET    /health                                         # {"status": "ok"}
```

---

## 5. Database Schema (Final State)

11 tables across 11 Alembic migrations.

### Migration History

| # | Migration ID | Phase | Description |
|---|---|---|---|
| 1 | `bce0e9c5d2ee` | 1 | Initial schema (9 tables: users, projects, project_members, experiments, fastq_files, reactions, analysis_jobs, job_outputs, notifications) |
| 2 | `fafd5c9dc468` | 1 | fastapi-users auth columns on users |
| 3 | `35ad430891c0` | 2 | Add `fastqc_report_path` to fastq_files |
| 4 | `87e85de24803` | 2 | Add `adapter_status` to fastq_files |
| 5 | `4f02b80e7f9b` | 7 | Add `experiment_events` table (10th table) |
| 6 | `ddf72d64a676` | 7 | Add `password_changed_at` to users |
| 7 | `19f7810a826a` | 7 | Add `termination_requested_at` and `retry_of_job_id` to analysis_jobs |
| 8 | `1b988efe774f` | 7 | Add `auto_pipeline`, `auto_pipeline_status`, `auto_pipeline_config` to experiments; `auto_pipeline` to analysis_jobs |
| 9 | `a3f1c8e92d47` | 9 | Add `saved_servers` table (11th table) |
| 10 | `b4c7e2f19a53` | 9 | Add `is_reference` to projects |
| 11 | `c5d8f3a10b64` | 9 | Add `status` to projects |
| 12 | `d7a3f1b82e49` | 12 | Add `is_training` to projects (training wheels mode) |

### Tables

1. **users** — Accounts (fastapi-users base + firstName, lastName, emailNotifications, password_changed_at)
2. **projects** — Top-level containers (name, description, storage_bytes, is_reference, is_training, status)
3. **project_members** — Role-based access (admin/contributor/viewer)
4. **experiments** — CUT&RUN/CUT&Tag analysis units (assay_type, status, auto_pipeline columns)
5. **fastq_files** — Uploaded FASTQ metadata (prefix, direction, is_trimmed, adapter_status, fastqc_report_path)
6. **reactions** — Sample metadata (16 fields including organism, antibody, spike-in; unique constraint on experiment_id + organism + short_name)
7. **analysis_jobs** — Unified job queue (JSONB params, parent_job_id for dependency chains, termination/retry columns, auto_pipeline flag)
8. **job_outputs** — Files produced by jobs (file_category, reaction_id nullable)
9. **notifications** — In-app alerts (type, title, message, link_target, is_read)
10. **experiment_events** — Audit log (action, resource_type, resource_id, detail)
11. **saved_servers** — FTP/SFTP credentials (Fernet-encrypted password, unique user_id + name)

---

## 6. Test Coverage (Final State)

**474+ tests** across 27 test files. All run inside Docker (`docker compose exec api pytest tests/`).

| Test File | Count | Phase | Scope |
|-----------|-------|-------|-------|
| `test_peak_calling_pipeline.py` | 56 | 4+9 | All 5 peak callers, fragment filter, FRiP, HOMER, concurrency |
| `test_files.py` | 38 | 2+5 | File tree, downloads, path traversal, batch download, X-Accel, IGV tokens, Range headers |
| `test_jobs_api.py` | 38 | 3+7 | Job CRUD, queue, QC endpoints, terminate/retry, log-tail, events |
| `test_projects.py` | 34 | 1+9 | CRUD, membership, permissions, filters, reference project access |
| `test_reactions.py` | 31 | 2 | CRUD, validation, CSV import, unique constraints, prefixes |
| `test_alignment_pipeline.py` | 29 | 3 | Validation, mock files, output categories, QC CSV, methods text |
| `test_server_import.py` | 23 | 9 | SSRF validation, encryption, browse mock, auth, saved servers, SSRF bypass |
| `test_pearson_correlation_pipeline.py` | 23 | 6+7 | Multi-genome, masking, validation, methods text |
| `test_diffbind_pipeline.py` | 21 | 6 | 3 modes, dynamic columns, validation |
| `test_roman_normalization_pipeline.py` | 19 | 6 | Mouse-only, validation, mock run |
| `test_custom_heatmap_pipeline.py` | 18 | 6 | deepTools params, validation, mock run |
| `test_email_service.py` | 17 | 7 | SES send, Jinja2 templates, graceful fallback |
| `test_auth.py` | 16 | 1+7 | Register, login, refresh, logout, protected, forgot/reset password |
| `test_fastq_upload.py` | 15 | 2 | Upload, validation, permissions, storage, list, delete |
| `test_qc_report.py` | 14 | 3+4 | Alignment QC (6) + Peak calling QC (8) |
| `test_fastqc.py` | 14 | 2+5 | Unit + integration, summary endpoint, resolver |
| `test_trimming_pipeline.py` | 13 | 2+9 | Validation, mock_run, methods text, concurrency |
| `test_cleanup_service.py` | 11 | 7 | Storage cleanup, retention policies, path traversal guard |
| `test_experiments.py` | 10 | 1 | CRUD, name validation, project membership |
| `test_experiment_events.py` | 9 | 7 | Audit log entries, pagination, auth, user isolation |
| `test_worker.py` | 8 | 3 | Poll cycle, job pickup, status transitions, output persistence |
| `test_alignment_concurrency.py` | 7 | 7 | ThreadPoolExecutor dispatch, partial failure, termination |
| `test_tus_upload.py` | 7 | 2 | tus protocol: create, upload, finalize, permissions |
| `test_notifications.py` | 7 | 1+7 | List, mark-read, mark-all-read, user isolation |
| `test_sse.py` | 6 | 3 | Auth rejection, generator lifecycle, events, user isolation |
| `test_users.py` | 4 | 1 | Profile get/update |
| `test_job_output_service.py` | 4 | 3 | Output persistence, storage accounting |
| `test_admin.py` | 18 | 10 | Superuser auth, user management, project/job admin, stats |

**Test infrastructure**: Postgres `cleave_test` DB, `NullPool`, schema cleanup via `DROP SCHEMA public CASCADE` per test, rate limiter disabled, `asyncio_mode = "auto"` (no `@pytest.mark.anyio` markers).

---

## 7. Complete File Inventory

### Backend Services (22 files)
```
backend/services/
├── admin_service.py              # Superuser admin panel (Phase 10)
├── auto_pipeline_service.py      # Auto-pipeline orchestration (Phase 7)
├── cleanup_service.py            # Storage lifecycle cleanup (Phase 7)
├── download_token_service.py     # HMAC-signed download URLs (Phase 2)
├── email_service.py              # Amazon SES email (Phase 7)
├── event_service.py              # Experiment audit events (Phase 7)
├── experiment_service.py         # Experiment CRUD + disk cleanup (Phase 1+7)
├── fastq_service.py              # FASTQ upload/list/delete (Phase 2)
├── fastqc_service.py             # Background FastQC orchestration (Phase 2)
├── file_service.py               # File tree, path validation, X-Accel (Phase 2)
├── job_output_service.py         # Generic job output persistence (Phase 3)
├── job_service.py                # Job CRUD + terminate/retry (Phase 2+7)
├── notification_service.py       # Notifications + mark-all-read (Phase 1+7)
├── permission_helpers.py         # Shared experiment permission checks (Phase 2)
├── project_service.py            # Project CRUD + filters + reference (Phase 1+9)
├── qc_report_service.py          # QC report CSV parsing (Phase 3+4+6)
├── reaction_service.py           # Reaction CRUD + CSV import (Phase 2)
├── server_credential_service.py  # Fernet credential storage (Phase 9)
├── server_import_service.py      # FTP/SFTP browse + import (Phase 9)
├── sse_service.py                # SSE event generator (Phase 3)
├── trimming_service.py           # Post-trim DB persistence (Phase 2)
└── user_service.py               # User profile (Phase 1)
```

### Backend Routers (14 files)
```
backend/routers/
├── admin.py              # Superuser admin panel: users, projects, jobs, stats, cleanup (Phase 7+10)
├── auth.py               # Login/register/refresh/logout/forgot/reset (Phase 1+7)
├── experiments.py        # Experiment CRUD + history + auto-pipeline (Phase 1+7)
├── fastq_files.py        # FASTQ list/delete/FastQC endpoints (Phase 2)
├── files.py              # File download, IGV serve, BED upload (Phase 2+5+6)
├── jobs.py               # Job CRUD + QC reports + terminate/retry (Phase 2+3+4+6+7)
├── members.py            # Member management (Phase 1)
├── notifications.py      # Notification list/read/stream (Phase 1+3+7)
├── projects.py           # Project CRUD + filters + reference (Phase 1+9)
├── server_import.py      # FTP/SFTP import endpoints (Phase 9)
├── tus_upload.py         # tus resumable upload (Phase 2)
└── users.py              # User profile (Phase 1)
```

### Backend Pipeline Modules (7 stages + base + dispatcher)
```
backend/pipelines/
├── __init__.py                # Stage registry dispatcher (Phase 2+)
├── base.py                    # Shared helpers: run_cmd, run_piped_cmd, resolve_blacklist, etc. (Phase 2+)
├── alignment.py               # 13-step alignment pipeline (Phase 3+7 concurrent)
├── custom_heatmap.py          # deepTools heatmaps (Phase 6)
├── diffbind.py                # DiffBind 3-mode (Phase 6)
├── fastqc.py                  # FastQC module (Phase 2)
├── methods_text.py            # Auto-generated methods text for all pipelines (Phase 3+)
├── peak_calling.py            # 5-mode peak calling (Phase 4+9 concurrent)
├── pearson_correlation.py     # R+Python correlation (Phase 6)
├── roman_normalization.py     # Mouse-only normalization (Phase 6)
└── trimming.py                # Trimmomatic + kseq_test (Phase 2+9 concurrent)
```

### Backend Pipeline Scripts & Reference Data
```
backend/pipelines/scripts/
├── diffbind_consensus.R          # DESeq2 consensus peakset (Phase 6)
├── diffbind_peaklist.R           # DESeq2 custom peakset (Phase 6)
├── diffbind_peaklist_edger.R     # edgeR variant (Phase 6)
├── pearson_matrix.R              # bigWig -> coverage matrix (Phase 6)
├── pearson_heatmap.py            # Correlation heatmap (Phase 6)
├── roman_normalization.R         # 99th percentile normalization (Phase 6)
└── roman_normalization_plot.py   # Normalization factors bar chart (Phase 6)

backend/pipelines/reference/
├── annotations/    mm10_refGene.bed
├── blacklists/     mm10, hg38, hg19, dm6, sacCer3 (.blacklist.bed + mm10.lab.blacklist.bed)
├── chrom_sizes/    *.chrom.sizes per genome
└── masks/          manual.mask.ultimate.bed (mm10, 158 entries)

backend/pipelines/tools/
├── SEACR_1.1.sh, filter_below.awk, change.bdg.py, kseq_test.c
```

### Backend Models (11 tables)
```
backend/models/
├── user.py, project.py, project_member.py
├── experiment.py, fastq_file.py, reaction.py
├── analysis_job.py, job_output.py
├── notification.py, experiment_event.py
└── saved_server.py
```

### Backend Schemas
```
backend/schemas/
├── user.py, project.py, experiment.py
├── fastq_file.py, reaction.py, job.py
├── notification.py, file.py
├── qc_report.py           # All QC schemas (alignment, peak, diffbind, heatmap, pearson, normalization)
├── experiment_event.py
├── admin.py               # Admin panel schemas (Phase 10)
├── auto_pipeline.py
└── server_import.py
```

### Backend Email Templates
```
backend/templates/
├── job_complete.html
├── password_reset.html
└── password_reset_confirm.html
```

### Frontend Components (~90+ files across feature domains)

**UI Primitives** (`components/ui/`):
```
Button.tsx, Modal.tsx, WizardModal.tsx, DataTable.tsx, Input.tsx
Card.tsx (layout/), StatusBadge.tsx, DetailRow.tsx, Spinner.tsx
EmptyState.tsx, StorageGauge.tsx, JobErrorDetails.tsx, JobActions.tsx
ThemeToggle.tsx, CleaveIcon.tsx, ErrorBoundary.tsx
ChooseBigWigSourceStep.tsx, useBigWigOutputs.ts
```

**shadcn Primitives** (`components/ui/`):
```
dialog.tsx, dropdown-menu.tsx, tabs.tsx, tooltip.tsx, select.tsx
sonner.tsx, separator.tsx, badge.tsx, collapsible.tsx, scroll-area.tsx
checkbox.tsx, popover.tsx, calendar.tsx
```

**Layout** (`components/layout/`):
```
Navbar.tsx, Breadcrumbs.tsx, Card.tsx, GradientBackground.tsx
NotificationPanel.tsx
```

**Feature Components** (by domain):
```
alignment/         7 files: NewAlignmentWizard, 3 steps, QCReportPanel, InfoPanel, InputPanel, FilesPanel
peak-calling/      10 files: NewPeakCallingWizard, 4 steps, QCReportPanel, InfoPanel, InputPanel, FilesPanel, PeakAnnotationChart
diffbind/          8 files: NewDiffBindWizard, 3 steps, ResultsPanel, PlotsPanel, FilesPanel
custom-heatmap/    5 files: NewCustomHeatmapWizard, 2 steps, PlotsPanel, FilesPanel
pearson-correlation/ 6 files: NewPearsonCorrelationWizard, 2 steps, PlotsPanel, FilesPanel
normalization/     6 files: NewNormalizationWizard, 2 steps, ResultsPanel, FilesPanel
igv/               2 files: IGVPanel, SelectReactionsModal
fastqs/            4 files: FileUploadZone, FastqcReportModal, TrimConfigModal, ServerImportModal
reactions/         3 files: CsvUploadZone, ReactionFormModal, ReactionsEditor
experiments/       5 files: CreateExperimentWizard, ExperimentDetailsStep, NewAnalysisDropdown, AutoPipelineModal, AutoPipelineBanner
projects/          1 file: ProjectFilters
docs/              8 files: DocsLayout, DocsNavbar, DocsSidebar, DocsPageRenderer, DocTable, DocCallout, DocStepList, DocCodeBlock, DocPrevNext
auth/              1 file: ProtectedRoute
```

**Pages**:
```
LandingPage, LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage
HomePage, ProjectDetailPage, ExperimentView, AnalysisQueuePage, SettingsPage, AdminPage
experiment/: DescriptionTab, FastqsTab, ReactionsTab, AlignmentTab, PeakCallingTab
             DiffBindTab, CustomHeatmapTab, PearsonCorrelationTab, NormalizationTab
             HistoryTab, AllFilesTab
docs/: DocsLandingPage, DocsPage
```

**API Modules** (`api/`):
```
axios.ts, auth.ts, projects.ts, experiments.ts, experimentEvents.ts
fastqs.ts, reactions.ts, jobs.ts, files.ts, notifications.ts
serverImport.ts, autoPipeline.ts, admin.ts, types.ts
```

**Hooks**:
```
useAuth.ts, useProjects.ts, useExperiments.ts, useExperimentHistory.ts
useFastqs.ts, useReactions.ts, useJobs.ts, useFiles.ts
useNotifications.ts, useSSE.ts, useIGVTracks.ts, useServerImport.ts, useAdmin.ts
```

**Lib**:
```
constants.ts, utils.ts, cn.ts, bigwig-utils.ts
docs-navigation.ts, docs-content.ts (2,506 lines)
```

### Tests (28 files)
```
backend/tests/
├── conftest.py
├── test_admin.py
├── test_auth.py, test_users.py, test_projects.py, test_experiments.py
├── test_notifications.py, test_experiment_events.py
├── test_fastq_upload.py, test_fastqc.py, test_tus_upload.py
├── test_reactions.py, test_files.py, test_streaming_zip.py
├── test_jobs_api.py, test_job_output_service.py, test_worker.py
├── test_sse.py, test_email_service.py, test_cleanup_service.py
├── test_trimming_pipeline.py, test_alignment_pipeline.py, test_alignment_concurrency.py
├── test_peak_calling_pipeline.py, test_qc_report.py
├── test_diffbind_pipeline.py, test_custom_heatmap_pipeline.py
├── test_pearson_correlation_pipeline.py, test_roman_normalization_pipeline.py
└── test_server_import.py
```

### Scripts
```
scripts/run-local.sh                    # Local dev startup (conda, pyenv, HOMER PATH)
scripts/seed_reference_project.py       # Idempotent gold standard seed
```

---

## 8. All Dependencies

### Backend (Python)

| Package | Purpose | Phase Added |
|---------|---------|-------------|
| fastapi | Web framework | 1 |
| uvicorn | ASGI server | 1 |
| sqlalchemy[asyncio] | Async ORM | 1 |
| asyncpg | Async PostgreSQL driver | 1 |
| alembic | Database migrations | 1 |
| pydantic | Request/response validation | 1 |
| pydantic-settings | Environment config | 1 |
| fastapi-users | Auth (JWT, password hashing) | 1 |
| pwdlib[argon2] | Argon2 password hashing | 1 |
| slowapi | Rate limiting | 1 |
| python-multipart | File uploads | 1 |
| structlog | Structured logging | 3 |
| tuspyserver | tus v1.0.0 resumable uploads | 2 |
| stream-zip | True streaming zip generation | 2 |
| boto3 | Amazon SES email | 7 |
| Jinja2 | HTML email templates | 7 |
| psycopg2-binary | Sync PostgreSQL (worker termination checks) | 7 |
| pandas | Data processing (Pearson heatmap) | 7 |
| matplotlib | Plot generation | 7 |
| seaborn | Correlation heatmap visualization | 7 |
| aioftp | Async FTP client | 9 |
| asyncssh | Async SSH/SFTP client | 9 |
| ruff | Linting + formatting (dev) | 1 |
| pytest, pytest-asyncio, httpx | Testing (dev) | 1 |

### Frontend (npm)

| Package | Purpose | Phase Added |
|---------|---------|-------------|
| react, react-dom | UI framework | 1 |
| vite | Build tool | 1 |
| typescript | Type system | 1 |
| tailwindcss | Utility CSS | 1 |
| @tanstack/react-table | Data tables | 1 |
| @tanstack/react-query | Server state management | 1 |
| axios | HTTP client | 1 |
| react-router-dom | Routing | 1 |
| recharts | Charts (annotation bar chart) | 4 |
| tus-js-client | tus upload client | 2 |
| @microsoft/fetch-event-source | SSE with JWT auth | 3 |
| igv | IGV.js genome browser | 5 |
| clsx | Conditional class composition | 8 |
| tailwind-merge | Tailwind class deduplication | 8 |
| class-variance-authority | Component variant management | 8 |
| tailwindcss-animate | Animation utilities | 8 |
| lucide-react | Icon library | 8 |
| next-themes | Dark mode management | 8 |
| Radix UI primitives | 10 shadcn primitives (via shadcn) | 8 |
| react-day-picker | Calendar date picker | 9 |
| date-fns | Date utilities | 9 |

### External Bioinformatics Tools (via subprocess)

| Tool | Purpose |
|------|---------|
| Bowtie2 | Alignment |
| SAMtools | BAM processing |
| BEDTools | Interval operations, blacklist subtraction |
| Picard | Duplicate marking/removal, sorting |
| deepTools | bigWig generation, heatmaps (bamCoverage, computeMatrix, plotHeatmap, plotProfile) |
| MACS2 | Peak calling (narrow + broad) |
| SICER2 | Broad peak calling |
| SEACR v1.1 | Peak calling (stringent + relaxed) |
| HOMER | Peak annotation (annotatePeaks.pl) |
| Trimmomatic | Adapter + quality trimming |
| kseq_test | Fixed-length read trimming (42bp) |
| FastQC | Quality control reports |
| R/Rscript | DiffBind, rtracklayer (Pearson), Roman normalization |
| Python | seaborn (Pearson heatmap), matplotlib (normalization plot) |

---

## 9. Known Issues / Tech Debt (Current)

### Open Items (as of Phase 10 — Admin Panel)

- **EC2 real-mode end-to-end validation**: Full pipeline tested locally with real tools on Mac but not yet on production EC2 instance.
- **Gold Standard project**: Seed script exists but needs actual rsync of dev-data to EC2 + execution in production.
- **EC2 deployment**: NGINX + TLS + systemd not yet configured (Phase 7.6/7.7).
- **SES sandbox mode**: New AWS accounts need production access request or verified recipient emails.
- **Subprocess kill for long-running steps**: Termination waits for current subprocess step (e.g., bowtie2). No SIGTERM to running process.
- **Heatmap/Pearson/Normalization tabs lack InfoPanel**: No Terminate/Retry buttons on those tabs (available via AnalysisQueuePage).
- **Per-project storage quotas**: Global only; no per-project DB column.
- **UI improvement skill**: Prompt created (.claude/skills/ui-improvement/SKILL.md) but no code changes executed.
- **Legacy multipart upload endpoint**: Kept alongside tus for backward compatibility. Consider removing.
- **Large directory lazy-loading**: Tree scan fine at current scale but may need pagination for very large experiments.
- **SICER2 real-mode**: Invocation implemented but not tested (requires SICER2 binary on EC2).
- **DiffBind custom peakset upload**: Currently only selects BED from existing peak calling outputs.
- **DiffBind consensus peakset export**: Not exported as downloadable file.
- **kseq_test binary**: Must be compiled per-platform (arm64 local, x86_64 EC2) — not committed to git.
- **Real FTP/SFTP testing**: Only mock mode validated; no actual server tests.
- **Docker rebuild needed**: `docker compose up -d --build api` to pick up aioftp/asyncssh.
- **NotificationPanel**: Still uses custom click-outside handler (doesn't fit DropdownMenu pattern).
- **Chart colors**: ANNOTATION_COLORS and TRACK_COLORS remain static hex (not themed for dark mode).
- **App3.tsx**: At repo root, superseded by `frontend/src/pages/LandingPage.tsx` — can be deleted.
- **Raw FASTQs (~16GB)**: Excluded from reference project rsync (not needed for browsing results).
- **Monitor m5.8xlarge**: Under real parallel pipeline load (32 vCPU).
- **Superuser bootstrap**: No UI for initial superuser creation — must promote via SQL (`UPDATE users SET is_superuser = true WHERE email = '...'`). Could add seed script or first-user-is-admin pattern.

### Resolved Across All Phases (Partial List of Major Fixes)

- Phase 2: Permission helpers DRY extraction, 404/403 split, streaming zip, signed download tokens, tus migration
- Phase 3: Worker DB sessions, storage_bytes consolidation, SNAP-CUTANA spike-in QC, column-level filters
- Phase 5: FastQC blocking event loop, Bowtie2 read groups, `@pytest.mark.anyio` double-wrapping, annotation stats parser, access token TTL
- Phase 6: DiffBind R script bugs (3), test DB cleanup (`DROP SCHEMA public CASCADE`)
- Phase 7: DiffBind crash on no significant sites, BiocParallel macOS crash, Roman normalization bin mismatch + NA propagation, Pearson resolution mismatch
- Phase 9: SSRF bypass vectors (0.0.0.0/8, IPv6-mapped IPv4), Trimmomatic invocation portability, `on_fastqc_complete` race condition (premature adapter evaluation)

---

## 10. Key Corrections to Lab Reference Scripts

These bugs were found in the lab's scripts and fixed in Cleave:

1. **effectiveGenomeSize bug** (`create_bams.sh`): Used mm10's value (2,467,481,108) for ALL organisms including human. Cleave uses correct per-genome values.

2. **DiffBind R script bugs** (3 bugs across `diffbind.R`, `diffbind_peaklist.R`, `diffbind_peaklist_edger.R`):
   - Missing `)` on `write.csv()` (line 88)
   - Malformed `cat()`/`print()` completion message (line 91-92)
   - Missing `dev.off()` between PNG and SVG device opens (5 plot blocks)

3. **DiffBind crash handling**: Added `safe_plot()` tryCatch wrapper for "no significant sites" case. Added `SerialParam()` fallback for BiocParallel fork crash on macOS.

4. **Roman normalization robustness**: Fixed mismatched bin counts (intersection-based matrix), NA propagation (replacement + na.rm guards).

5. **MACS2 q-value**: Lab uses 0.01; CUTANA Cloud uses 0.05. Cleave defaults to 0.01.

6. **Fragment size filter**: Undocumented in CUTANA Cloud. Lab filters to <120bp before peak calling. Cleave makes this default ON.

---

## Test Progression Across Phases

| Phase | New Tests | Cumulative |
|-------|-----------|------------|
| 1 | 46 | 46 |
| 2 | 105 | 151 |
| 3 | 62 | 213 |
| 4 | 66 | ~283 |
| 5 | 13 | 296 |
| 6 | 77 | 373 |
| 7 | 68+ | ~441 |
| 8 | 0 | ~441 |
| 9 | 31+ | 474+ |

---

## SSE Event Types (Final)

| Event | Data | Trigger |
|-------|------|---------|
| `notification` | `{id, type, title, message}` | New notification created |
| `job_status` | `{jobId, status, experimentId}` | Job status changed |
| `auto_pipeline_status` | `{experimentId, status}` | Auto-pipeline state change |
| `server_import_progress` | `{importId, status, completed, total}` | FTP/SFTP import progress |

---

## Frontend Routing (Final)

```
/                              LandingPage (public)
/login                         LoginPage
/register                      RegisterPage
/forgot-password               ForgotPasswordPage
/reset-password                ResetPasswordPage
/dashboard                     HomePage (projects grid + filters + pagination)
/projects/:id                  ProjectDetailPage
/experiments/:id               ExperimentView (tabbed sidebar)
  /description                 DescriptionTab
  /fastqs                      FastqsTab (tus upload, FastQC, server import)
  /reactions                   ReactionsTab (CRUD + CSV import)
  /alignment/:jid              AlignmentTab (Info, Input, QC Report, Files, IGV)
  /peaks/:jid                  PeakCallingTab (Info, Input, QC Report, Files, IGV)
  /diffbind/:jid               DiffBindTab (Info, Input, Results, Plots, Files)
  /normalization/:jid          NormalizationTab (Info, Results, Files)
  /heatmaps/:jid               CustomHeatmapTab (Info, Plot, Files)
  /correlations/:jid           PearsonCorrelationTab (Info, Plot, Files)
  /history                     HistoryTab (paginated event log)
  /files                       AllFilesTab (dual-panel tree + table)
/queue                         AnalysisQueuePage (global job list)
/settings                      SettingsPage
/docs                          DocsLandingPage (public)
/docs/:slug                    DocsPage (17 documentation pages)
```

---

## Pipeline Job Types

| Job Type | Pipeline Stage | Parent | Concurrency |
|----------|---------------|--------|-------------|
| `trimming` | TrimmingStage | None | ThreadPoolExecutor per-pair |
| `alignment` | AlignmentStage | trimming (optional) | ThreadPoolExecutor per-reaction |
| `peak_calling` | PeakCallingStage | alignment | ThreadPoolExecutor per-reaction |
| `diffbind` | DiffBindStage | peak_calling | Sequential (R subprocess) |
| `custom_heatmap` | CustomHeatmapStage | alignment or peak_calling | Sequential (deepTools subprocess) |
| `pearson_correlation` | PearsonCorrelationStage | alignment | Sequential (R + Python) |
| `roman_normalization` | RomanNormalizationStage | alignment | Sequential (R subprocess) |

---

*This summary was generated on 2026-03-30 from 9 individual phase summaries totaling ~55,000 words of build logs. It is intended to give a future Claude Code agent complete context about the Cleave platform without needing to read individual session logs.*
