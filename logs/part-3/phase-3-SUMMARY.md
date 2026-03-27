# Phase 3 Summary — Core Pipeline

> 7 sessions on 2026-03-27. Phase 3 is **complete** (all 7 steps done). 7 of 9 done criteria checked off; 2 deferred (EC2 real-mode validation, SNAP-CUTANA spike-in heatmap). **213 tests passing** (62 new in Phase 3).

---

## What Was Built

### Worker Process & Job Queue (3.1)
- Enhanced `worker.py` to create per-job directories at `{STORAGE_ROOT}/projects/{pid}/{eid}/jobs/{jid}/`, run pipeline modules via dispatcher, and track experiment status transitions (`new` → `in_progress` → `complete`/`error`).
- Created `services/job_output_service.py` — generic `persist_job_outputs()` that creates `JobOutput` records and atomically updates `storage_bytes`. Consolidated all `update_storage_bytes` copies into this single module.
- `job_dir: Path` parameter added to `PipelineStage` interface (alongside existing `working_dir`). Trimming uses `working_dir` (shared experiment tree), alignment uses `job_dir`.
- Worker added as 4th Docker Compose service (same image, `python worker.py` command).
- Switched worker logging from `logging` to `structlog`. Added `link_target` to notifications.

### SSE Real-Time Status (3.2)
- Created `services/sse_service.py` — async generator polling `notifications` + `analysis_jobs` tables every 2s. Watermark-based state tracking prevents stale event bursts on connect. Job visibility scoped via `project_members` join. Keepalive comments every ~15s. Graceful degradation on DB errors (5 consecutive → close stream, frontend reconnects).
- `GET /api/v1/notifications/stream` endpoint with standard Bearer auth.
- Frontend: `useSSE.ts` hook using `@microsoft/fetch-event-source` (JWT in `Authorization` header, not query param — keeps tokens out of logs). SSE events invalidate TanStack Query caches: `notification` → `['notifications']`, `job_status` → `['job', id]` + `['jobs', experimentId]` + `['experiments']` on terminal status.
- Removed 30s notification polling and 2s job polling — SSE replaces both. FASTQs 5s polling kept (FastQC runs via BackgroundTasks, not job queue).

### Alignment Pipeline Module (3.3)
- `AlignmentStage(PipelineStage)` — full 13-step real-mode pipeline per reaction:
  1. Bowtie2 alignment (`--dovetail --phred33 -p <nproc>`)
  2. SAM → BAM conversion (samtools)
  3. Properly-paired + MAPQ filter (`-f 3 -F 4 -F 8 -q 10`)
  4. DAC Exclusion List filtering (bedtools intersect with blacklist BEDs)
  5. Picard SortSam (coordinate sort)
  6. Picard MarkDuplicates
  7. Duplicate removal (`-F 1024`)
  8. BAM indexing
  9. Unsmoothed bigWig (bamCoverage, 20bp bins, RPKM)
  10. Smoothed bigWig (bamCoverage, 100bp bins, RPKM)
  11. TSS heatmap (computeMatrix reference-point + plotHeatmap)
  12. Gene body heatmap (computeMatrix scale-regions + plotHeatmap)
  13. E. coli spike-in alignment (if enabled)
- Mock mode creates real stub files on disk (empty BAMs/bigWigs, 1x1 PNGs, canned QC CSV from CUTANA export) so file browser/downloads/IGV work locally.
- `AlignmentQCReport` Pydantic schema matching exact CUTANA Cloud CSV columns.
- `methods_text.py` with correct per-genome `EFFECTIVE_GENOME_SIZES` (fixes lab's create_bams.sh bug that used mm10 values for all organisms).
- All tool flags match lab reference scripts exactly (verified against integrated.sh, integrated.step2.sh, create_bams.sh). Combined lab's properly-paired filter with CUTANA's MAPQ filter in single samtools call.

### Alignment Wizard UI (3.4)
- 3-step wizard: Details → Choose Reactions → Alignment Settings.
- **Step 1 (Details)**: Name input (30-char limit with counter), notes textarea, About panel with pipeline description.
- **Step 2 (Choose Reactions)**: Checkbox table with select-all, indeterminate state, selected count.
- **Step 3 (Alignment Settings)**: Reference genome dropdown (auto-selects from organism), reactions summary table, collapsible Advanced Settings (Remove Duplicates, Remove DAC Exclusion List, BAM Coverage Bin Size 20, Smoothed Bin Size 100).
- FASTQ path resolution prefers trimmed FASTQs over raw when both exist for a prefix.
- `NewAnalysisDropdown` replaces static button — Alignment active, Peak Calling disabled (Phase 4).
- `AlignmentTab` shows alignments dropdown selector, job details card, sub-tab navigation.

### Alignment QC Report (3.5)
- `GET /api/v1/jobs/:jid/qc-report` — structured JSON from `AlignmentQCReport` schema.
- `GET /api/v1/jobs/:jid/qc-report/download` — raw CSV file download.
- `qc_report_service.py` reads alignment_metrics.csv from disk, parses into Pydantic models. Auth via project membership join.
- Frontend `AlignmentQCReportPanel`: metrics DataTable (9 columns), About info panel, CSV download button. SNAP-CUTANA spike-in section renders conditional placeholder (checks job params for spike-in flags).
- Sub-tab navigation added to AlignmentTab: Info, Input, QC Report, Files, IGV.

### Alignment Info, Input, Files Sub-tabs (3.6)
- **Info** (`cutana-cloud-ui.md` §6f-i compliant): Three-card layout — Details card (Run ID, Created By, Date, Status), Run Methods card (auto-generated methods text with copy button), Notes card.
- **Input**: Reactions DataTable (6 columns: Short Name, Assay Type, Organism, Reference Genome, CUTANA Spike in, E.coli Spike in) cross-referencing job params with experiment reactions.
- **Files**: Category dropdown (Unique BAM, bigWig, smoothed bigWig, TSS Heatmaps, Gene Body Heatmaps, FastQC), description text per category, checkbox-selectable files table with download.
- `launcher: UserBrief` added to `JobRead` schema so Info shows "Created By" name (follows Experiment/creator pattern).
- `GET /api/v1/jobs/:jid/outputs?category=` endpoint for category-filtered file browsing.
- Extracted shared `DetailRow` component from `DescriptionTab` into `components/ui/DetailRow.tsx`.

### Analysis Queue Page (3.7)
- `GET /api/v1/jobs` — cross-project job list, paginated, filterable by status. Joins `AnalysisJob → Experiment → ProjectMember` for membership scoping.
- `JobQueueRead` schema with `from_job()` classmethod bridging ORM relationships into flat response (experiment name, project name, launcher name).
- Frontend `AnalysisQueuePage`: DataTable with 8 columns (Name, Project, Experiment, Executable, Launched By, Started Running, Duration, Status), search input, status filter dropdown, server-side pagination.
- Any project member role (admin, contributor, viewer) can see jobs in the queue.

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Job working directories | `job_dir` alongside `working_dir` | Trimming writes to shared experiment tree, alignment writes to per-job `jobs/{jid}/` dir |
| SSE auth | `@microsoft/fetch-event-source` with Authorization header | Keeps JWT out of NGINX logs, Cloudflare edge logs, browser devtools (vs. query param) |
| SSE state tracking | Watermark-based (`last_notification_id`, `{job_id: status}` dict) | Prevents stale event bursts on connect; only emits deltas |
| SSE vs polling | SSE replaces notification (30s) and job (2s) polling | Except FASTQ 5s polling — FastQC runs via BackgroundTasks, not job queue |
| Alignment filter combo | Lab's `-f 3 -F 4 -F 8` + CUTANA's `-q 10` in single samtools call | Combines properly-paired filter with MAPQ filter; stricter than either alone |
| Picard invocation | `shutil.which("picard")` conda wrapper | Not `java -jar`; works with conda-installed Picard |
| E. coli spike-in | Piped bowtie2→samtools (Harvard pattern) | Avoids intermediate SAM file on disk |
| Mock mode files | Real stub files on disk (empty BAMs, 1x1 PNGs, canned QC CSV) | File browser, downloads, and IGV (Phase 5) depend on files at real paths |
| QC data storage | Read from CSV file on disk, not DB | Files are source of truth; consistent with pipeline architecture |
| Sub-tab navigation | `useState` within AlignmentTab | Simpler than nested routes since job ID already in URL |
| Input tab reactions | Cross-reference `job.params.reactions` with experiment reactions client-side | Avoids backend changes; organism/assay derived from reaction data |
| Analysis Queue schema | Separate `JobQueueRead` (not extending `JobRead`) | Keeps experiment-scoped endpoints unchanged; flat response with project/experiment names |
| Methods text | Auto-generated with correct per-genome effective genome sizes | Fixes lab bug where mm10's effectiveGenomeSize (2467481108) was used for all organisms |
| Fragment filter | Deferred to Phase 4 (peak calling) | `filter_below.awk` is a peak calling preprocessing step, not alignment |

---

## API Status After Phase 3

### Newly Implemented (Phase 3)
- `GET /api/v1/notifications/stream` — SSE endpoint for real-time notifications + job status
- `GET /api/v1/jobs/:jid/qc-report` — Alignment QC report as structured JSON
- `GET /api/v1/jobs/:jid/qc-report/download` — Alignment QC report as CSV download
- `GET /api/v1/jobs/:jid/outputs?category=` — Job output files filtered by category
- `GET /api/v1/jobs` — Cross-project job list (Analysis Queue), paginated, status-filterable

### Enhanced (Phase 3)
- `GET /api/v1/jobs/:jid` — Now includes `launcher` (UserBrief) in response
- `POST /api/v1/experiments/:id/jobs` — Now triggers real pipeline execution via worker (was stub)

### Still Stub (Phase 4+)
- Peak calling job type (dispatcher registered but no `PeakCallingStage` yet)
- `GET /jobs/:jid/qc-report` for peak calling jobs (409 if not alignment type)

---

## Database Schema Changes

No new migrations in Phase 3. The existing 4 migrations (2 from Phase 1, 2 from Phase 2) already had all required tables (`analysis_jobs`, `job_outputs`, `notifications`). The `launcher` relationship on `AnalysisJob` was already defined via the `launched_by` FK — Phase 3 just added `selectinload` to queries.

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
| `test_jobs_api.py` | 25 | Job create, get, list, permissions, adapter_status, outputs, queue, QC endpoints |
| `test_trimming_pipeline.py` | 9 | Validate (5), mock_run creates files, return shape, methods text (2) |
| `test_files.py` | 24 | Tree listing, downloads, path traversal, batch download, X-Accel |
| `test_tus_upload.py` | 7 | tus protocol: create, upload, finalize, permissions, validation |
| `test_streaming_zip.py` | 6 | stream-zip integration, compression strategies, limits |
| `test_worker.py` | 8 | Worker poll cycle, job pickup, status transitions, generic output persistence |
| `test_job_output_service.py` | 4 | Output persistence, storage update, category assignment, empty outputs |
| `test_sse.py` | 6 | Auth rejection, generator lifecycle, notification events, job status events, user isolation |
| `test_alignment_pipeline.py` | 27 | Validation, mock files, output categories, QC CSV, log parsing, methods text, schema |
| `test_qc_report.py` | 6 | QC JSON, CSV download, 404, 409 not-complete, unauthorized, download-not-complete |
| **Total** | **213** | |

All tests run inside Docker (`docker compose exec api pytest tests/`). `ruff check` + `ruff format --check`: clean. `tsc --noEmit`: clean.

---

## New Files Created in Phase 3

### Backend Services
- `backend/services/job_output_service.py` — Generic job output persistence + storage accounting
- `backend/services/sse_service.py` — SSE event generator (2s polling, watermark state, keepalive)
- `backend/services/qc_report_service.py` — QC report CSV parsing + auth

### Backend Pipeline Modules
- `backend/pipelines/alignment.py` — 13-step alignment pipeline (mock + real mode)
- `backend/pipelines/methods_text.py` — Auto-generated methods text with tool versions

### Backend Schemas
- `backend/schemas/qc_report.py` — `AlignmentQCReport`, `AlignmentReactionMetrics` Pydantic models

### Frontend Components
- `frontend/src/components/alignment/NewAlignmentWizard.tsx` — 3-step alignment wizard
- `frontend/src/components/alignment/AlignmentDetailsStep.tsx` — Wizard step 1
- `frontend/src/components/alignment/ChooseReactionsStep.tsx` — Wizard step 2
- `frontend/src/components/alignment/AlignmentSettingsStep.tsx` — Wizard step 3
- `frontend/src/components/alignment/AlignmentQCReportPanel.tsx` — QC report table + info panel
- `frontend/src/components/alignment/AlignmentInfoPanel.tsx` — Details/Methods/Notes three-card layout
- `frontend/src/components/alignment/AlignmentInputPanel.tsx` — Input reactions table
- `frontend/src/components/alignment/AlignmentFilesPanel.tsx` — Category-filtered file browser
- `frontend/src/components/experiments/NewAnalysisDropdown.tsx` — New Analysis dropdown
- `frontend/src/components/ui/DetailRow.tsx` — Shared label-value row component

### Frontend Hooks
- `frontend/src/hooks/useSSE.ts` — SSE connection with JWT auth, reconnection, cache invalidation

### Tests
- `backend/tests/test_worker.py` — 8 worker integration tests
- `backend/tests/test_job_output_service.py` — 4 output service unit tests
- `backend/tests/test_sse.py` — 6 SSE tests
- `backend/tests/test_alignment_pipeline.py` — 27 alignment pipeline tests
- `backend/tests/test_qc_report.py` — 6 QC report endpoint tests

---

## Dependencies Added in Phase 3

| Package | Version | Purpose |
|---------|---------|---------|
| `@microsoft/fetch-event-source` | — | Fetch-based EventSource with custom header support (SSE with JWT auth) |

No new backend Python dependencies — all pipeline tools (bowtie2, samtools, picard, etc.) are external binaries invoked via `subprocess.run()`, available in the `cleave-pipeline` conda env.

---

## Known Issues / Tech Debt

### Resolved in Phase 3
- ~~Worker DB session management~~ → Uses `async_session_factory()` for per-poll-cycle sessions (not long-lived)
- ~~`update_storage_bytes` duplication~~ → Consolidated all copies to `job_output_service.py`
- ~~Job notifications missing `link_target`~~ → Added `/experiments/{id}` link

### Still Open
- **SNAP-CUTANA K-MetStat spike-in QC**: UI has conditional placeholder, but pipeline doesn't yet run barcode grep on FASTQs. All 32 barcode sequences available in `references/media_misc/k_metstat_script.sh`. Low effort to implement.
- **E. coli spike-in normalization factor**: Pipeline aligns to E. coli genome but normalization factor not surfaced in QC report columns.
- **EC2 real-mode validation**: Real alignment pipeline implemented but not yet tested with actual FASTQs on EC2 instance.
- **Email notifications**: Deferred to Phase 7.5 (needs Amazon SES configuration).
- **"Last Job" in ExperimentView header**: Still shows static "None" — needs wiring to actual job data.
- **Notes "Manage" link**: No-op in Info sub-tab (editing not implemented).
- **Batch download in Files sub-tab**: Opens multiple browser tabs (one per file) — could use zip download.
- **`list_experiment_jobs` endpoint**: Missing `perPage` alias — frontend pagination may silently default to 25.
- **Column-level filter dropdowns**: Analysis Queue uses search + status dropdown, not per-column filters per spec §5.
- **IGV sub-tab**: Phase 5 stub placeholder.

---

## Phase 3 Done Criteria Status

- [x] Worker picks up queued jobs and runs pipeline modules
- [x] SSE pushes real-time status updates to the browser
- [x] Alignment wizard creates correctly parameterized jobs
- [x] Mock alignment produces QC data matching CUTANA export format
- [x] QC report renders with stats table (spike-in heatmap is placeholder)
- [x] Alignment files browsable and downloadable by category
- [x] Methods text auto-generated with tool versions and parameters
- [x] Analysis Queue shows cross-project job list
- [ ] (EC2) Real alignment runs with test FASTQs — pending deployment

---

## What's Next: Phase 4 (Peak Calling)

Peak calling pipeline (MACS2 narrow/broad, SICER2, SEACR stringent/relaxed), 4-step wizard UI, IgG control assignment, fragment size filter (<120bp via `filter_below.awk`), FRiP calculation, HOMER peak annotation, peak annotation stacked bar chart QC report, peak calling file browser. See `docs/PLAN.md` Phase 4 for full spec.

Key prerequisites already completed:
- Alignment pipeline produces BAMs that feed into peak calling
- Worker + job queue infrastructure running (built in Phase 3.1)
- Pipeline dispatcher registered for all job types (built in Phase 2.8, extended in Phase 3.3)
- Fragment filter (`filter_below.awk`) already in `backend/pipelines/tools/`
- SEACR preprocessing tools (`change.bdg.py`, `SEACR_1.1.sh`) already in `backend/pipelines/tools/`
- `parent_job_id` column exists in `analysis_jobs` for peak calling → alignment dependency chain
