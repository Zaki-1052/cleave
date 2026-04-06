# Phase 7 Summary — Polish & QA

> 10+ sessions across 2026-03-28 and 2026-03-29. Phase 7 is **in progress** — 5 of 8 done criteria checked off; 3 remaining (Gold Standard project, EC2 deployment, end-to-end validation with real lab data). **~441 tests passing** (68+ new in Phase 7). Additionally includes pipeline bug fixes for Phase 6 lab extensions, concurrent alignment, auto-pipeline mode, UI improvement skill creation, auto-pipeline retry/SSE, and Pearson resolution fix.

---

## What Was Built

### Storage Lifecycle Management (7.1)

- **Cleanup service** (`services/cleanup_service.py`): Periodic deletion of expired pipeline logs (30-day retention) and stale tus staging files (48h retention). Atomic `storage_bytes` decrements grouped by experiment/project.
- **Worker integration**: `_maybe_run_cleanup()` in main loop, gated by `CLEANUP_INTERVAL_HOURS` (default 24h). Errors logged, never crash the worker.
- **Disk cleanup on delete**: `delete_experiment` and `delete_project` now `shutil.rmtree()` on-disk directories and decrement project `storage_bytes`. Previously only DB records were cascade-deleted — files were orphaned on disk.
- **Admin API** (`routers/admin.py`): `POST /admin/cleanup` (superuser manual trigger), `GET /admin/storage-info` (quota + disk usage for frontend gauges).
- **Frontend StorageGauge** (`StorageGauge.tsx`): Progress bar with green/amber/red thresholds when `STORAGE_QUOTA_BYTES > 0`, text-only fallback when quota is 0. Integrated into project sidebar and experiment description tab.
- **Path traversal guard**: `cleanup_expired_logs()` resolves and validates absolute paths against `STORAGE_ROOT` before `unlink()`.
- **Config**: 5 new settings — `CLEANUP_ENABLED`, `CLEANUP_INTERVAL_HOURS`, `LOG_RETENTION_DAYS`, `STORAGE_QUOTA_BYTES`, `TUS_STAGING_RETENTION_HOURS`.
- **Tests**: 11 new tests. Intermediate BAMs already cleaned by alignment pipeline during execution — no 7-day retention policy needed.

### Experiment History / Audit Log (7.3)

- **New `experiment_events` table** with Alembic migration (`4f02b80e7f9b`): id, experiment_id (FK CASCADE), user_id (FK SET NULL), action (String 50), resource_type, resource_id, detail, created_at.
- **Event service** (`services/event_service.py`): `log_event()` (transactional, no commit — flushed atomically with parent operation), `log_event_standalone()` (worker sessions with own commit), `list_events()` (paginated, auth-checked).
- **API endpoint**: `GET /api/v1/experiments/{id}/history?page=1&perPage=25`.
- **10 event types** wired at all mutation points: `fastq_uploaded` (tus + multipart), `fastq_deleted`, `reaction_created`, `reactions_imported`, `reaction_updated`, `reaction_deleted`, `job_launched`, `job_completed`, `job_failed`, `metadata_updated`.
- **Frontend**: `HistoryTab.tsx` with DataTable (Date, User, Action with color-coding, Details).
- **Tests**: 9 new tests in `test_experiment_events.py`.

### Error Handling & Job Management (7.4)

- **Job termination**: `POST /jobs/{id}/terminate` endpoint. `TerminatedError` exception class + `cancelled: Callable` parameter on `run_cmd()`/`run_piped_cmd()` — checks DB between subprocess steps. Sync SQLAlchemy engine in worker for termination checks (pipeline code is synchronous). Worker catches `TerminatedError` separately: sets status to `terminated`, creates notification, logs event. Race condition handling: worker checks `termination_requested_at` before starting pipeline. All 7 pipeline stages updated to pass `cancelled` callback through to subprocess helpers.
- **Job retry**: `POST /jobs/{id}/retry` — creates new queued job from failed/terminated job (409 for non-retryable states). `retry_of_job_id` column links retried job to original (separate from `parent_job_id` dependency chain). Preserves original job's `experiment_id`, `job_type`, `name`, `params`, `parent_job_id`.
- **Error details UI**: `GET /jobs/{id}/log-tail?lines=50` returns last N lines of pipeline master log. `JobErrorDetails` component: full error message + collapsible pipeline log viewer with copy buttons. Replaces simple red error boxes in AlignmentInfoPanel, PeakCallingInfoPanel, DiffBindInfoPanel. `JobActions` component: reusable Terminate/Retry buttons, used in InfoPanels and AnalysisQueuePage.
- **Global error boundary**: `ErrorBoundary` class component wrapping authenticated routes in `App.tsx` with friendly fallback UI ("Try Again" / "Return to Home" buttons).
- **Database migration** (`19f7810a826a`): `termination_requested_at` (TIMESTAMPTZ) and `retry_of_job_id` (FK → self) on `analysis_jobs`. Fixed `parent_job` relationship with explicit `foreign_keys` to resolve self-referential FK ambiguity.
- **Tests**: 13 new tests in `test_jobs_api.py` (terminate, retry, log-tail, event logging).

### Email Notifications + Password Reset (7.5)

- **Amazon SES email service** (`services/email_service.py`): `boto3` (sync, `asyncio.to_thread` wrapper) with Jinja2 `autoescape=True` HTML templates. Graceful skip when SES unconfigured (no crash if `AWS_SES_REGION` not set).
- **Job completion emails**: Wired into `worker.py` after in-app notification. Respects user's `email_notifications` preference (`always`/`on_error`/`never`). Includes job name, experiment, project, duration, "View Results" link.
- **Password reset**: Custom `/forgot-password` (always 202 — prevents email enumeration, 3/min rate limit) and `/reset-password` (5/min) endpoints wrapping fastapi-users `UserManager`. Reset email with HMAC token link.
- **Session invalidation**: `password_changed_at` column + Alembic migration (`ddf72d64a676`). Refresh endpoint rejects tokens issued before password change.
- **Frontend**: `ForgotPasswordPage`, `ResetPasswordPage`, "Forgot your password?" link on LoginPage.
- **Config**: Replaced 5 unused SMTP placeholder vars with `AWS_SES_REGION`, `AWS_SES_FROM_EMAIL`, `APP_URL`, `RESET_TOKEN_LIFETIME_SECONDS`.
- **Tests**: 20 new tests (17 email service + 3 auth password reset).

### Mark All Notifications Read

- **Backend**: `mark_all_read(db, user_id)` service function + `PATCH /api/v1/notifications/read-all` endpoint (204 No Content).
- **Frontend**: "Mark all read" text button in NotificationPanel header, visible only when `unreadCount > 0`.
- **Tests**: 2 new tests (bulk mark-read + user isolation).

### Concurrent Reaction Processing in Alignment Pipeline

- **`ThreadPoolExecutor`-based concurrency**: Refactored alignment from sequential `for rxn in reactions:` loop to concurrent dispatch. Created `_AlignmentContext` frozen dataclass for shared immutable state. Extracted loop body into standalone `_process_reaction()` function — each thread gets its own reaction, log file, and returns its own results (no shared mutable state).
- **Thread allocation**: `max(2, total_threads // concurrent_count)` per reaction. `MAX_CONCURRENT_REACTIONS` config setting (default 8).
- **Per-reaction log files** merged into master log after all threads complete (zero contention).
- **Partial failure handling**: Surviving reactions continue; all-fail raises `PipelineError`. `TerminatedError` cancels remaining futures immediately via `executor.shutdown(cancel_futures=True)`.
- **Mock mode parallelized too** for test consistency.
- **Fixed missing `psycopg2-binary` dependency** — worker's sync termination checks need it.
- **Tests**: 7 new concurrency tests.

### Lab Custom Blacklist for Peak Calling

- Copied lab's custom blacklist (`references/250123blacklist.bed`, 255 entries, mm10) to `backend/pipelines/reference/blacklists/mm10.lab.blacklist.bed`.
- Extended `resolve_blacklist()` in `base.py` with `blacklist_type` parameter (`encode_dac`, `lab_custom`, `both`, `none`).
- Updated `peak_calling.py` to support sequential subtraction with multiple blacklists ("both" mode applies ENCODE DAC first, then lab custom).
- Added blacklist dropdown to Peak Calling Advanced Settings (frontend), with "Lab Custom" and "Both" options gated to mm10 only.
- Updated auto-generated methods text to describe which blacklist was applied.
- Default changed to `both` (ENCODE DAC + Lab Custom) for mm10 peak calling.

### Roman Normalization Refactor + Auto-Pipeline Mode

**Part A: BigWig Source Refactor**
- Created `frontend/src/lib/bigwig-utils.ts` — shared `resolveReactionBigwig()` utility supporting both `bigwig` and `normalization_bigwig` file categories.
- Created `ChooseBigWigSourceStep.tsx` — reusable wizard step for selecting bigWig source (normalization preferred, alignment fallback).
- Refactored Pearson Correlation and Custom Heatmap wizards to prefer Roman-normalized bigWigs (50bp resolution) when available, with alignment bigWig fallback + resolution warning.

**Part B: Auto-Pipeline Mode**
- **Migration** (`1b988efe774f`): Adds `auto_pipeline`, `auto_pipeline_status`, `auto_pipeline_config` columns to experiments; `auto_pipeline` flag to analysis_jobs.
- **`auto_pipeline_service.py`**: Full orchestration service chaining jobs sequentially: FastQC → Trimming → Alignment → Peak Calling → Normalization → DiffBind → Heatmaps → Pearson.
  - DiffBind condition auto-detection from `experimental_condition` field + short_name patterns (ctrl/mut/wt/ko).
  - Auto-replicate numbering within conditions.
  - Normalization skip for non-mouse; DiffBind skip if conditions undetectable.
  - Cancellation support (terminates queued jobs, preserves completed).
  - Error handling (pauses pipeline, sets status to error).
- **Worker hooks**: `on_job_complete` and `on_job_error` for auto-pipeline jobs.
- **FastQC hook**: `on_fastqc_complete` triggers trimming step when all files are processed.
- **API**: `POST /experiments/{id}/auto-pipeline` and `POST /experiments/{id}/auto-pipeline/cancel`.
- **Frontend**: `AutoPipelineModal.tsx` (config modal with genome selector, peak caller options, step toggles) + `AutoPipelineBanner.tsx` (step progress banner with color-coded states) + "Run Full Pipeline" button in ExperimentView header.

### Pipeline Bug Fixes (Phase 6 Lab Extensions)

**DiffBind fixes**:
- "No significant sites" crash: All 3 DiffBind R scripts crashed when DESeq2 found no significant differential peaks. Fixed with `safe_plot()` helper using `tryCatch` — plots that fail are skipped with warning, while results TSV and normalized counts are still saved.
- BiocParallel fork crash on macOS: `dba.count()` failed due to forked parallel workers. Fixed with `tryCatch` retry using `SerialParam()` if parallel execution fails (parallel on AWS, serial fallback on macOS).

**Roman normalization fixes**:
- Mismatched bin counts between samples: Different bigWig files had slightly different coverage extents at chromosome edges. Fixed by computing intersection of bin names across all samples before building coverage matrix.
- NA propagation in masking step: `as.numeric()` on some bin names produced NAs. Fixed with: (1) replace NAs in matrix with 0, (2) `remove[is.na(remove)] <- FALSE` before subsetting, (3) `na.rm = TRUE` on quantile call.

**Pearson correlation**:
- Root cause of near-zero correlations identified: alignment bigWigs are 20bp resolution, but the R script assumes 50bp (matching Roman-normalized bigWigs). Fix: Pearson wizard now prefers rnorm bigWigs when available. Full resolution-matching deferred.

**Other fixes**:
- History tab 422 error: `perPage=200` exceeded backend `le=100` validation. Changed to `perPage=100`.
- Added `pandas`, `matplotlib`, `seaborn` to `backend/pyproject.toml` for Pearson heatmap.

### UI Improvement Skill

- Created `.claude/skills/ui-improvement/SKILL.md` (650 lines) — a comprehensive skill prompt for a systematic frontend polish pass.
- Design direction: "Scientific Clarity" — serif headings, mono data, borders over shadows.
- Component library: shadcn/ui + lucide-react icons.
- Structured as 7 sequential implementation passes (typography, icons, components, motion, layout, color, dark mode).
- **No code changes made** — prompt is ready to execute.

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Intermediate BAM cleanup | Not needed — pipeline already cleans them | Alignment pipeline deletes all intermediates during execution; only pipeline logs need periodic cleanup |
| Storage quota | Global config var (not per-project DB column) | Sufficient for single-EC2 deployment with ~8-10 users |
| Event logging transactionality | `log_event()` does NOT commit — flushed with parent | Worker uses standalone variant with its own session |
| Action column type | Plain string (not enum) | New event types can be added without migrations |
| Termination mechanism | DB polling (not signals/Redis) | Worker and API are separate processes; DB column is simplest reliable inter-process signal for single-worker architecture |
| `retry_of_job_id` vs reusing `parent_job_id` | Separate column | Avoids semantic overload; parent_job_id encodes dependency chains, retry is a different concept |
| Termination granularity | Between subprocess steps (not mid-subprocess) | Response time = current subprocess step duration; acceptable for v1 |
| Sync engine for termination checks | 1-pool sync SQLAlchemy engine in worker | Pipeline stages are synchronous (`subprocess.run`); avoids async/sync mismatch |
| Email transport | Amazon SES via boto3 (sync + `asyncio.to_thread`) | Already on AWS; pennies per email |
| HTML email templates | Jinja2 with `autoescape=True` | Prevents HTML injection from user-provided job/experiment/project names |
| Password reset auth endpoints | Custom (not `get_reset_password_router()`) | Matches existing login/register wrapper pattern; gives rate limiting control; prevents email enumeration (always 202) |
| Session invalidation on password change | `password_changed_at` column + refresh check | Closes stolen-cookie gap without a full token blacklist; 30-min access tokens still survive (acceptable for lab scale) |
| Alignment concurrency | `ThreadPoolExecutor` per-reaction | Per-reaction log files (not shared lock) for zero-contention thread-safe logging |
| Concurrent reaction count | `MAX_CONCURRENT_REACTIONS=8` (configurable) | Production target: m5.8xlarge (32 vCPUs, 128GB RAM) → 8 reactions × 4 threads each |
| Lab blacklist scope | mm10 only | Lab blacklist (`250123blacklist.bed`) is mouse-specific; UI conditionally shows options |
| Blacklist "both" mode | Sequential subtraction (ENCODE DAC first, then lab custom) | Not merged into one file — preserves provenance and allows selective use |
| Auto-pipeline chaining | Sequential (not parallel) | Single-worker architecture; each step depends on previous outputs |
| DiffBind condition detection | Two tiers: explicit `experimental_condition` field first, then short_name pattern matching | Handles both well-annotated and minimal reaction metadata |
| BigWig source for downstream steps | Prefer rnorm bigWigs when available | Roman-normalized bigWigs at 50bp resolution match lab workflow expectations for Pearson correlation |

---

## API Status After Phase 7

### Newly Implemented (Phase 7)
- `POST /api/v1/admin/cleanup` — Manual trigger for storage cleanup (superuser only)
- `GET /api/v1/admin/storage-info` — Global storage quota + usage info
- `GET /api/v1/experiments/{id}/history` — Experiment audit log (paginated)
- `POST /api/v1/jobs/{id}/terminate` — Terminate queued/running job
- `POST /api/v1/jobs/{id}/retry` — Retry failed/terminated job (creates new job)
- `GET /api/v1/jobs/{id}/log-tail?lines=50` — Last N lines of pipeline master log
- `POST /api/v1/auth/forgot-password` — Request password reset email (always 202)
- `POST /api/v1/auth/reset-password` — Reset password with HMAC token
- `PATCH /api/v1/notifications/read-all` — Mark all notifications read (204)
- `POST /api/v1/experiments/{id}/auto-pipeline` — Start full auto-pipeline
- `POST /api/v1/experiments/{id}/auto-pipeline/cancel` — Cancel auto-pipeline
- `POST /api/v1/experiments/{id}/auto-pipeline/retry` — Retry failed auto-pipeline step (resumes chain)

### Enhanced (Phase 7)
- `POST /api/v1/auth/refresh` — Now rejects tokens issued before `password_changed_at`
- `POST /api/v1/experiments/{id}/jobs` — Worker now runs with termination checking between subprocess steps
- `GET /api/v1/jobs` — Analysis Queue now has Actions column (terminate/retry)

---

## Database Schema Changes (3 new migrations in Phase 7)

| Migration | Description |
|-----------|-------------|
| `4f02b80e7f9b` | Add `experiment_events` table (audit log) |
| `ddf72d64a676` | Add `password_changed_at` to `users` |
| `19f7810a826a` | Add `termination_requested_at` and `retry_of_job_id` to `analysis_jobs` |
| `1b988efe774f` | Add `auto_pipeline`, `auto_pipeline_status`, `auto_pipeline_config` to `experiments`; `auto_pipeline` to `analysis_jobs` |

Total: 8 migrations (4 from Phase 1-2 + 4 from Phase 7).

---

## Test Coverage

| Test File | Count | Scope |
|-----------|-------|-------|
| `test_peak_calling_pipeline.py` | 52 | Validation (18), mock run (12), methods text (8), helpers (9), schemas/constants (5) |
| `test_files.py` | 38 | File tree, downloads, path traversal, batch download, X-Accel, IGV tokens, Range headers |
| `test_alignment_pipeline.py` | 29 | Validation, mock files, output categories, QC CSV, log parsing, methods text, schema |
| `test_jobs_api.py` | 38 | Job create, get, list, permissions, outputs, queue, QC endpoints, **terminate, retry, log-tail, events, auto-pipeline retry** |
| `test_reactions.py` | 31 | CRUD, validation, permissions, unique constraints, CSV import, prefixes |
| `test_diffbind_pipeline.py` | 21 | Validation (13), mock run (6), methods text (2) |
| `test_roman_normalization_pipeline.py` | 19 | Validation (11), mock run (6), methods text (2) |
| `test_pearson_correlation_pipeline.py` | 23 | Validation (13), mock run (6), methods text (4) |
| `test_custom_heatmap_pipeline.py` | 18 | Validation (10), mock run (6), methods text (2) |
| `test_email_service.py` | **17** | SES send, Jinja2 templates, graceful fallback, job/reset email content |
| `test_projects.py` | 16 | Project CRUD, membership, permissions |
| `test_fastq_upload.py` | 15 | Upload, validation, permissions, storage, list, delete |
| `test_qc_report.py` | 14 | Alignment QC (6) + Peak calling QC (8) |
| `test_fastqc.py` | 14 | FastQC unit + integration, summary endpoint, resolver |
| `test_auth.py` | 16 | Auth endpoints (register, login, refresh, logout, protected, **forgot/reset password**) |
| `test_cleanup_service.py` | **11** | Log cleanup, tus staging, storage decrement, path traversal guard |
| `test_experiments.py` | 10 | Experiment CRUD, name validation, project membership |
| `test_experiment_events.py` | **9** | Event logging, pagination, auth, user isolation, event types |
| `test_trimming_pipeline.py` | 9 | Validate (5), mock_run, return shape, methods text (2) |
| `test_worker.py` | 8 | Worker poll cycle, job pickup, status transitions, output persistence |
| `test_alignment_concurrency.py` | **7** | ThreadPoolExecutor dispatch, partial failure, termination cancel, sequential fallback |
| `test_tus_upload.py` | 7 | tus protocol: create, upload, finalize, permissions, validation |
| `test_notifications.py` | **7** | Notification list, mark-read, **mark-all-read, user isolation** |
| `test_sse.py` | 6 | Auth rejection, generator lifecycle, notification events, job status, user isolation |
| `test_users.py` | 4 | User profile get/update |
| `test_job_output_service.py` | 4 | Output persistence, storage update, category assignment, empty outputs |
| **Total** | **~441** | |

All tests run inside Docker (`docker compose exec api pytest tests/`). `ruff check` + `ruff format --check`: clean. `tsc --noEmit` / `npm run build`: clean.

---

## New Files Created in Phase 7

### Backend Services
- `backend/services/cleanup_service.py` — Periodic storage cleanup (logs, tus staging)
- `backend/services/event_service.py` — Experiment audit event logging
- `backend/services/email_service.py` — Amazon SES email (job notifications, password reset)
- `backend/services/auto_pipeline_service.py` — Full auto-pipeline orchestration

### Backend Routers
- `backend/routers/admin.py` — Cleanup trigger + storage info endpoints

### Backend Models
- `backend/models/experiment_event.py` — Audit log ORM model

### Backend Schemas
- `backend/schemas/experiment_event.py` — Event read schema
- `backend/schemas/auto_pipeline.py` — AutoPipelineConfig schema

### Backend Templates
- `backend/templates/job_complete.html` — Job notification email (Jinja2)
- `backend/templates/password_reset.html` — Password reset link email
- `backend/templates/password_reset_confirm.html` — Password changed confirmation email

### Backend Migrations
- `backend/migrations/versions/4f02b80e7f9b_add_experiment_events.py`
- `backend/migrations/versions/ddf72d64a676_add_password_changed_at_to_users.py`
- `backend/migrations/versions/19f7810a826a_add_termination_and_retry_columns.py`
- `backend/migrations/versions/1b988efe774f_add_auto_pipeline_columns.py`

### Backend Tests
- `backend/tests/test_cleanup_service.py` — 11 tests
- `backend/tests/test_experiment_events.py` — 9 tests
- `backend/tests/test_email_service.py` — 17 tests
- `backend/tests/test_alignment_concurrency.py` — 7 tests

### Backend Pipeline Reference
- `backend/pipelines/reference/blacklists/mm10.lab.blacklist.bed` — Lab's custom mm10 blacklist (255 entries)

### Frontend Components
- `frontend/src/components/ui/StorageGauge.tsx` — Storage usage progress bar
- `frontend/src/components/ui/JobErrorDetails.tsx` — Error message + pipeline log viewer
- `frontend/src/components/ui/JobActions.tsx` — Reusable Terminate/Retry buttons
- `frontend/src/components/ui/ChooseBigWigSourceStep.tsx` — BigWig source wizard step (normalization vs alignment)
- `frontend/src/components/ErrorBoundary.tsx` — Global React error boundary
- `frontend/src/components/experiments/AutoPipelineModal.tsx` — Auto-pipeline config modal
- `frontend/src/components/experiments/AutoPipelineBanner.tsx` — Step progress banner

### Frontend Pages
- `frontend/src/pages/ForgotPasswordPage.tsx` — Password reset request form
- `frontend/src/pages/ResetPasswordPage.tsx` — New password entry form

### Frontend API/Hooks
- `frontend/src/api/experimentEvents.ts` — History API module
- `frontend/src/api/autoPipeline.ts` — Auto-pipeline API functions
- `frontend/src/hooks/useExperimentHistory.ts` — History query hook
- `frontend/src/lib/bigwig-utils.ts` — Shared bigWig resolution utility

### Skills
- `.claude/skills/ui-improvement/SKILL.md` — UI polish skill prompt (650 lines, not yet executed)

---

## Files Significantly Modified in Phase 7

### Backend
- `backend/config.py` — 10+ new settings (cleanup, SES, auto-pipeline, concurrency, blacklist)
- `backend/worker.py` — Cleanup integration, termination checking, sync engine, auto-pipeline hooks, email sending
- `backend/auth.py` — UserManager hooks for forgot/reset password
- `backend/routers/auth.py` — forgot-password/reset-password endpoints + refresh invalidation
- `backend/routers/jobs.py` — terminate, retry, log-tail endpoints
- `backend/routers/experiments.py` — history endpoint, auto-pipeline endpoints
- `backend/routers/notifications.py` — read-all endpoint
- `backend/services/notification_service.py` — mark_all_read function
- `backend/services/job_service.py` — terminate_job, retry_job, get_job_log_tail
- `backend/services/experiment_service.py` — disk cleanup on delete, event logging
- `backend/services/project_service.py` — disk cleanup on delete
- `backend/services/fastqc_service.py` — on_fastqc_complete hook for auto-pipeline
- `backend/services/fastq_service.py` — event logging on upload/delete
- `backend/services/reaction_service.py` — event logging on CRUD
- `backend/models/analysis_job.py` — termination/retry/auto-pipeline columns, relationship fix
- `backend/models/user.py` — `password_changed_at` column
- `backend/models/experiment.py` — auto-pipeline columns
- `backend/pipelines/alignment.py` — Full refactor: sequential → ThreadPoolExecutor concurrent dispatch
- `backend/pipelines/base.py` — `TerminatedError`, `cancelled` param on helpers, `resolve_blacklist()` blacklist_type param
- `backend/pipelines/peak_calling.py` — Lab blacklist support, multi-blacklist subtraction
- `backend/pipelines/methods_text.py` — Blacklist mention in methods text
- `backend/pipelines/scripts/diffbind_consensus.R` — safe_plot() tryCatch, BiocParallel fallback
- `backend/pipelines/scripts/diffbind_peaklist.R` — same fixes
- `backend/pipelines/scripts/diffbind_peaklist_edger.R` — same fixes
- `backend/pipelines/scripts/roman_normalization.R` — bin intersection fix, NA propagation fix
- `backend/pyproject.toml` — Added psycopg2-binary, pandas, matplotlib, seaborn

### Frontend
- `frontend/src/pages/ExperimentView.tsx` — Auto-pipeline button, modal, banner
- `frontend/src/pages/AnalysisQueuePage.tsx` — Actions column (terminate/retry)
- `frontend/src/pages/experiment/HistoryTab.tsx` — Replaced stub with full implementation
- `frontend/src/components/layout/NotificationPanel.tsx` — Mark all read button
- `frontend/src/components/alignment/AlignmentInfoPanel.tsx` — JobErrorDetails + JobActions
- `frontend/src/components/peak-calling/PeakCallingInfoPanel.tsx` — JobErrorDetails + JobActions
- `frontend/src/components/diffbind/DiffBindInfoPanel.tsx` — JobErrorDetails + JobActions
- `frontend/src/components/peak-calling/PeakCallingSettingsStep.tsx` — Blacklist dropdown
- `frontend/src/components/peak-calling/NewPeakCallingWizard.tsx` — Blacklist state wiring
- `frontend/src/components/pearson-correlation/NewPearsonCorrelationWizard.tsx` — BigWig source refactor
- `frontend/src/components/custom-heatmap/NewCustomHeatmapWizard.tsx` — BigWig source refactor
- `frontend/src/api/notifications.ts` — markAllRead function
- `frontend/src/api/types.ts` — Auto-pipeline fields on Experiment and AnalysisJob
- `frontend/src/hooks/useNotifications.ts` — useMarkAllNotificationsRead hook
- `frontend/src/lib/constants.ts` — BLACKLIST_OPTIONS, default changed to "both"
- `frontend/src/App.tsx` — ErrorBoundary wrapper, forgot/reset password routes

---

## Dependencies Added in Phase 7

| Package | Version | Purpose |
|---------|---------|---------|
| `boto3` | (pip) | Amazon SES email sending |
| `Jinja2` | (pip) | HTML email templates with autoescape |
| `psycopg2-binary` | (pip) | Sync PostgreSQL driver for worker termination checks |
| `pandas` | (pip) | Pearson correlation heatmap data processing |
| `matplotlib` | (pip) | Pearson/normalization plot generation |
| `seaborn` | (pip) | Pearson correlation heatmap visualization |

No new npm dependencies.

---

## Known Issues / Tech Debt

### Resolved in Phase 7
- ~~No storage cleanup~~ → Cleanup service with configurable retention for logs and tus staging
- ~~Disk files orphaned on experiment/project delete~~ → `shutil.rmtree()` + storage_bytes decrement
- ~~No audit trail for experiment actions~~ → 10 event types logged to `experiment_events` table
- ~~No job termination~~ → DB-polled cancellation with TerminatedError between subprocess steps
- ~~No job retry~~ → Creates new job from failed/terminated job with original params
- ~~No error details UI~~ → Pipeline log tail + error message in dedicated component
- ~~No global error boundary~~ → React ErrorBoundary on authenticated routes
- ~~No email notifications~~ → Amazon SES with Jinja2 templates, respects user preferences
- ~~No password reset~~ → Custom endpoints with HMAC tokens, session invalidation via `password_changed_at`
- ~~No mark-all-read for notifications~~ → Bulk update endpoint + frontend button
- ~~Sequential alignment pipeline~~ → Concurrent per-reaction processing via ThreadPoolExecutor
- ~~No lab custom blacklist~~ → mm10 lab blacklist with "both" mode (ENCODE DAC + lab custom)
- ~~DiffBind crash on no significant sites~~ → `safe_plot()` tryCatch wrapper in all R scripts
- ~~DiffBind BiocParallel fork crash on macOS~~ → SerialParam() fallback on parallel failure
- ~~Roman normalization bin mismatch~~ → Intersection-based matrix construction
- ~~Roman normalization NA propagation~~ → NA replacement + na.rm guards
- ~~Downstream wizards didn't prefer normalized bigWigs~~ → ChooseBigWigSourceStep with normalization preference
- ~~No auto-pipeline mode~~ → Full sequential chaining with condition auto-detection
- ~~No auto-pipeline retry~~ → Retry button on error banner, `POST /experiments/{id}/auto-pipeline/retry`, chain resumes via `auto_pipeline=True` flag
- ~~No auto-pipeline SSE events~~ → Dedicated `auto_pipeline_status` SSE event type, eliminates race conditions
- ~~Pearson resolution mismatch~~ → Parameterized `dx` in R script (20bp for alignment, 50bp for rnorm bigWigs)
- ~~`retry_job()` broke auto-pipeline chain~~ → Now copies `auto_pipeline` flag and resets experiment status

### Still Open
- **Gold Standard reference project**: Pre-loaded read-only project not yet created (Phase 7.2).
- **EC2 deployment**: NGINX + TLS + systemd not yet configured (Phase 7.6).
- **End-to-end validation with real lab data**: Full pipeline tested locally with real tools on Mac but not yet on production EC2 instance (Phase 7.7).
- **SES sandbox mode**: New AWS accounts need production access request or verified recipient emails.
- **Subprocess kill for long-running steps**: Termination waits for current subprocess step to finish (e.g., bowtie2). No SIGTERM to running process.
- **Heatmap/Pearson/Normalization tabs lack InfoPanel**: No Terminate/Retry buttons on those tabs (available via AnalysisQueuePage).
- **Per-project storage quotas**: Global only; no per-project DB column.
- **UI improvement skill**: Prompt created but no code changes executed.

---

## Phase 7 Done Criteria Status

- [x] Storage cleanup runs on schedule, space reclaimed
- [ ] Gold Standard project visible to all users
- [x] Job termination and retry work
- [x] Email notifications sent on job completion
- [ ] EC2 instance running with NGINX + TLS + systemd
- [ ] Full pipeline validated with real lab data
- [ ] All QC metrics within expected ranges
- [ ] Platform accessible via `coleferguson.com`

### Additional Completed (Beyond Original Plan)
- [x] Experiment history / audit log (10 event types)
- [x] Password reset with session invalidation
- [x] Mark all notifications read
- [x] Concurrent alignment reaction processing (ThreadPoolExecutor)
- [x] Lab custom blacklist for peak calling
- [x] Auto-pipeline mode (full sequential chaining)
- [x] BigWig source refactor (normalization preference for downstream steps)
- [x] DiffBind crash fixes (no significant sites + BiocParallel macOS)
- [x] Roman normalization crash fixes (bin mismatch + NA propagation)
- [x] Global React error boundary
- [x] UI improvement skill prompt authored
- [x] Auto-pipeline retry mechanism (Retry button on error, `POST /experiments/{id}/auto-pipeline/retry`)
- [x] Auto-pipeline SSE events (dedicated `auto_pipeline_status` event type)
- [x] Pearson correlation resolution fix (parameterized `dx` — 20bp for alignment, 50bp for rnorm)
- [x] Fix: `retry_job()` preserves `auto_pipeline` flag on retried jobs
