# Phase 5 Summary — Visualization & Polish

> 8 sessions across 2026-03-27 and 2026-03-28. Phase 5 is **complete** (all 6 done criteria checked off) plus substantial bug-fix and polish work for real pipeline testing. **296 tests passing** (13 new in Phase 5: 10 IGV/Range + 3 test infrastructure fixes). Total project tests: 296.

---

## What Was Built

### IGV.js Integration (5.1)
- **`IGVPanel.tsx`** (328 lines): Core reusable IGV.js browser component supporting both `alignment` and `peak_calling` modes. Dynamic `import('igv')` keeps ~1.5MB library out of main bundle. Custom toolbar with Reference Genome label, Select Reactions button (badge count), Refresh, and Full Screen. Track building adapts per mode — alignment loads smoothed bigWig signal tracks; peak calling loads bigWig tracks + BED annotation tracks (format auto-derived from `job.params.peak_caller` + `peak_size`: narrowPeak/broadPeak/bed).
- **`SelectReactionsModal.tsx`** (149 lines): Checkbox reaction picker following existing `ChooseReactionsStep` pattern. Select-all with indeterminate state, selected count display.
- **`useIGVTracks.ts`** hook: TanStack Query wrapper around `getIGVTokens()` with `refetchInterval: 50min` for proactive token refresh during long browsing sessions.
- **Backend IGV file serving** (`routers/files.py`):
  - `POST /api/v1/files/igv-tokens` — batch generates HMAC-signed URLs for IGV file access (JWT-authenticated, project membership verified, 60-min TTL)
  - `GET /api/v1/files/igv-serve` — serves files with RFC 7233 Range header support (token-authenticated, no JWT). Range handling: 200 (full file), 206 (partial content with `Content-Range`), 416 (range not satisfiable), malformed → 200 fallback.
  - Uses `StreamingResponse` (not Starlette's `FileResponse`) to avoid built-in Range handling conflicts. In NGINX mode: delegates to `X-Accel-Redirect` (NGINX handles Range natively).
- **Schemas**: `IGVTokenRequest` and `IGVTokenResponse` in `schemas/file.py`.
- Replaced IGV placeholder sub-tab in both `AlignmentTab.tsx` and `PeakCallingTab.tsx` with `<IGVPanel>`.
- Added `igv` npm dependency (ships its own TypeScript types).

### Track Loading & IGV Controls (5.2-5.3)
- Phases 5.2 and 5.3 were ~90% complete from Phase 5.1 due to IGV.js's comprehensive built-in controls.
- **Removed duplicate Save Image button** — IGV.js renders its own via `showSVGButton: true` default.
- **Added `autoscale: true`** to signal track configs — ensures Y-axis scale labels render on each track.
- **Fixed `allReactions` referential instability** — `reactionsData?.items ?? []` created new array every render during loading; wrapped in `useMemo` to stabilize.
- **Fixed TS2339** on `createBrowser`/`removeBrowser` — dynamic `import('igv')` returns module namespace, not default export; changed to `const { default: igv } = await import('igv')`.
- Custom toolbar retains only Cleave-specific controls (genome label, reaction selector, refresh, full screen); all navigation controls (chromosome dropdown, locus input, zoom slider, toggle buttons) come from IGV.js built-in via `showNavigation: true`.

### QC Report Heatmaps
- **TSS and Gene Body heatmap sections** added to `AlignmentQCReportPanel`:
  - `HeatmapSection` component fetches job outputs by category (`tss_heatmap`, `genebody_heatmap`)
  - `HeatmapImage` component fetches HMAC-signed URL per image, renders inline with `&display=inline`
  - Each image has "Download PNG" button, collapsible "About" info panel matching CUTANA Cloud descriptions
  - Grid layout (2-3 columns) for multiple reactions
- **New backend endpoint**: `GET /jobs/{job_id}/outputs/{output_id}/signed-url` generates HMAC-signed download URLs for any job output file (validates project membership, returns URL + filename).
- **New frontend API**: `getOutputSignedUrl()` in `api/jobs.ts`.

### Peak Calling QC Enhancements
- **Top called peaks CSV download**: backend endpoint `GET /jobs/{jid}/peak-qc-report/top-peaks-csv`, frontend `downloadTopPeaksCsv()`, download button on Top Called Peaks section.
- **Reordered QC panel**: Top Called Peaks now renders above Peak Annotation Plots (matches CUTANA Cloud layout).
- **Enhanced peak annotation chart tooltip**: Shows Annotation, Percentage, Control Short Name, Peak Type, Peak Caller, Significance Threshold on hover (passed `metrics` prop from QC panel to `PeakAnnotationChart` for tooltip context lookup).
- **Fixed annotation stats parser bug**: `int("9.0")` → `int(float("9.0"))` — HOMER outputs float counts in annotation stats files, parser was silently skipping every line due to `ValueError`.

### Pipeline Master Logs
- **`append_to_master_log()`** helper added to `pipelines/base.py` — writes timestamped sections to a consolidated log file.
- **Extended `run_cmd` and `run_piped_cmd`** with optional `master_log` parameter — automatically appends subprocess output to master log when provided.
- **Alignment pipeline**: creates `logs/alignment.log` with all subprocess output consolidated per reaction.
- **Peak calling pipeline**: creates `logs/peak_calling.log`, consolidates individual tool logs at end. Added missing `append_to_master_log` calls for HOMER and blacklist subtraction subprocess calls.
- Both master logs registered as downloadable job outputs.

### TypeScript & Accessibility Sweep
- **6 TS2322 errors** fixed: `PEAK_CALLING_DEFAULTS` `as const` made `useState(0.01)` infer literal type `0.01`, incompatible with `(v: number) => void` props. Fixed by adding explicit `number`/`boolean` type annotations.
- **3 `noUncheckedIndexedAccess` violations** fixed: `array[0].prop` flagged as possibly undefined even after `length > 0` guard. Fixed via variable extraction + truthiness guards.
- **2 TS2345 file category literal type errors** fixed: Extracted `AlignmentFileCategory` and `PeakCallingFileCategory` union types from constants, cast `e.target.value` in handlers.
- **Accessibility**: `aria-label` on all header/row checkboxes (5 components), `htmlFor`/`id` pairs on 6 selects + 7 number inputs, `aria-label` on 2 notes textareas + 1 radio, `type="button"` on ~15 buttons to prevent implicit form submission.

### Test Infrastructure Fix
- **`@pytest.mark.anyio` double-wrapping bug**: pytest-asyncio (`asyncio_mode = "auto"`) AND anyio's pytest plugin both wrapped async generator fixtures. `db_session` fixture setup ran in one plugin's event loop, teardown in the other's — asyncpg connections are loop-bound, causing `RuntimeError: Task got Future attached to a different loop`. Fixed by removing all `@pytest.mark.anyio` markers from `test_files.py` (30) and `test_tus_upload.py` (7). Result: 296 passed, 0 errors (was 296 passed + 7 teardown errors).

### Local Dev / Real Pipeline Bug Fixes
- **FastQC blocking event loop**: `subprocess.run()` called synchronously in async background task, freezing server ~35s per file. Fixed with `await asyncio.to_thread()`.
- **tus upload FastQC blocking**: Completion handler awaited FastQC inline. Changed to `asyncio.create_task()` (fire-and-forget).
- **storage_bytes not updating**: `update_storage_bytes()` in tus handler called after `db.commit()` with no second commit. Added missing `await db.commit()`.
- **FastQC report 401 Unauthorized**: Iframe loaded report URL without auth headers. Implemented HMAC-signed URL flow: new `GET /fastqc-token` endpoint generates short-lived signed URL, iframe uses `&display=inline` to render HTML.
- **Bowtie2 missing read groups**: Picard MarkDuplicates failed with null read group. Added `--rg-id`, `--rg SM:`, `--rg LB:`, `--rg PL:ILLUMINA` flags to Bowtie2 command.
- **Uvicorn reload hang**: SSE `while True` loop held connections open during hot-reload. Added `--timeout-graceful-shutdown 3`.
- **Modal overflow**: `ReactionFormModal` expanded beyond viewport. Added `max-h-[90vh]` and `overflow-y-auto` to `Modal` component.
- **FastQC per_page limit**: Backend capped at 100, but `NewAlignmentWizard` requests `perPage=500`. Raised limit.
- **FastQC completion notification**: Added user notification when all files are processed.
- **Removed redundant FastQC sidebar**: FastQC HTML already has its own summary; custom sidebar was redundant.
- **useSSE.ts import path**: Fixed `useAuth` import from `@/contexts/AuthContext` → `@/hooks/useAuth`.
- **Deprecation warnings**: Fixed httpx per-request `cookies=` → `client.cookies.set()`, FastAPI `HTTP_422_UNPROCESSABLE_ENTITY` → `HTTP_422_UNPROCESSABLE_CONTENT`.
- **Alignment QC Report layout**: Moved info panel from side-by-side to below metrics table, collapsed by default.
- **HOMER PATH**: Added `$HOME/homer/bin` to PATH in `scripts/run-local.sh`.
- **HOMER C++ binaries**: Compiled for ARM Mac (`~/homer/cpp/make` with `unset CPATH` to fix `<cmath>` header conflict).
- **SEACR default**: Changed peak calling wizard default from MACS2 narrow → SEACR stringent (matches lab standard).
- **Access token TTL**: Bumped from 15 min → 30 min.
- **SSE reconnection**: Increased MAX_RETRIES 3→10, added 3-second delay before reconnect to survive hot-reloads.

### Local Dev Script (`scripts/run-local.sh`)
- Fixed conda activation: wrapped in `set +u`/`set -u` for gfortran activation script's unbound variables.
- Fixed env verification: check `CONDA_DEFAULT_ENV` instead of `which python` (pyenv shims interfered).
- Fixed pyenv/conda PATH conflict: prepend `$CONDA_PREFIX/bin` to PATH so conda Python takes priority.
- Fixed alembic/uvicorn resolution: use `python -m alembic` and `python -m uvicorn` instead of bare commands.
- Fixed Postgres readiness check: added Docker-based `pg_isready` fallback.
- Documented 3-terminal local dev workflow: API (`./scripts/run-local.sh`) + Worker (`./scripts/run-local.sh worker`) + Frontend (`npm run dev`).

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| IGV auth | HMAC signed tokens in query params | IGV.js can't set Authorization headers on byte-range requests; tokens in URL are the only option |
| IGV token TTL | 60 minutes | Long enough for interactive browsing sessions; shorter than access token would allow |
| IGV token refresh | `refetchInterval: 50min` (active timer) | Proactive refresh prevents silent failures during long browsing; passive `staleTime` would only refresh on re-render |
| IGV import | Dynamic `import('igv')` | Keeps ~1.5MB library out of main bundle; loads on-demand when user opens IGV tab |
| IGV controls | Built-in IGV.js controls for navigation | Custom toolbar only for Cleave-specific features (genome label, reaction selector, refresh, full screen) |
| Peak track format | Derived from `job.params.peak_caller` + `peak_size` | Automatic narrowPeak/broadPeak/bed format without user configuration |
| Range header support | Custom `StreamingResponse` implementation | Starlette's `FileResponse` has built-in Range handling that conflicts with our auth token flow |
| Heatmap rendering | Signed URL `<img>` tags (not blob URLs) | Consistent with FastQC and IGV patterns; security via HMAC tokens |
| Master log approach | `append_to_master_log()` helper in `base.py` | Consolidates subprocess output into single downloadable file per pipeline run |
| FastQC execution | `asyncio.to_thread()` + `asyncio.create_task()` | Non-blocking subprocess for background tasks; fire-and-forget from tus handler |
| SEACR as default caller | Changed from MACS2 narrow | Lab consensus: SEACR stringent is the default for peak calling |
| Access token TTL | 30 min (up from 15 min) | 15 min caused frequent re-auth during interactive sessions |
| Test markers | Removed all `@pytest.mark.anyio` | `asyncio_mode = "auto"` handles async test detection; dual markers caused event loop conflicts |

---

## API Status After Phase 5

### Newly Implemented (Phase 5)
- `POST /api/v1/files/igv-tokens` — Batch generate HMAC-signed URLs for IGV file access (60-min TTL)
- `GET /api/v1/files/igv-serve` — Serve files with RFC 7233 Range header support (token-authenticated)
- `GET /api/v1/jobs/{id}/outputs/{output_id}/signed-url` — HMAC-signed download URL for any job output
- `GET /api/v1/jobs/{id}/peak-qc-report/top-peaks-csv` — Top called peaks CSV download
- `GET /api/v1/experiments/{id}/fastqs/{fid}/fastqc-token` — Signed URL for FastQC report iframe rendering

### Enhanced (Phase 5)
- `GET /api/v1/files/signed-download` — Added `display=inline` query param for in-browser rendering (heatmaps, FastQC)
- `GET /api/v1/jobs/{id}/peak-qc-report` — Annotation stats parsing fixed (float count handling)
- `PATCH /api/v1/jobs/{id}` — Notes editing (already existed from Phase 3, wired in Phase 5 UI)

---

## Database Schema Changes

No new migrations in Phase 5. The existing 4 migrations (2 from Phase 1, 2 from Phase 2) already had all required tables. All new features use existing tables (`job_outputs` for file serving, `analysis_jobs` for job params).

---

## Test Coverage

| Test File | Count | Scope |
|-----------|-------|-------|
| `test_peak_calling_pipeline.py` | 52 | Validation (18), mock run (12), methods text (8), helpers (9), schemas/constants (5) |
| `test_files.py` | 38 | File tree, downloads, path traversal, batch download, X-Accel, **IGV tokens (3), IGV serve auth (2), Range headers (5)** |
| `test_reactions.py` | 31 | CRUD, validation, permissions, unique constraints, CSV import, prefixes |
| `test_alignment_pipeline.py` | 29 | Validation, mock files, output categories, QC CSV, log parsing, methods text, schema |
| `test_jobs_api.py` | 21 | Job create, get, list, permissions, outputs, queue, QC endpoints |
| `test_projects.py` | 16 | Project CRUD, membership, permissions |
| `test_fastq_upload.py` | 15 | Upload, validation, permissions, storage, list, delete |
| `test_qc_report.py` | 14 | Alignment QC (6) + Peak calling QC (8) |
| `test_fastqc.py` | 14 | FastQC unit + integration, summary endpoint, resolver |
| `test_auth.py` | 13 | Auth endpoints (register, login, refresh, logout, protected) |
| `test_experiments.py` | 10 | Experiment CRUD, name validation, project membership |
| `test_trimming_pipeline.py` | 9 | Validate (5), mock_run, return shape, methods text (2) |
| `test_worker.py` | 8 | Worker poll cycle, job pickup, status transitions, output persistence |
| `test_tus_upload.py` | 7 | tus protocol: create, upload, finalize, permissions, validation |
| `test_sse.py` | 6 | Auth rejection, generator lifecycle, notification events, job status, user isolation |
| `test_notifications.py` | 5 | Notification list, mark-read |
| `test_users.py` | 4 | User profile get/update |
| `test_job_output_service.py` | 4 | Output persistence, storage update, category assignment, empty outputs |
| **Total** | **296** | |

All tests run inside Docker (`docker compose exec api pytest tests/`). `ruff check` + `ruff format --check`: clean. `tsc --noEmit`: clean.

---

## New Files Created in Phase 5

### Backend Schemas (Extended)
- `backend/schemas/file.py` — Added `IGVTokenRequest`, `IGVTokenResponse`

### Frontend Components (2 new)
- `frontend/src/components/igv/IGVPanel.tsx` — Core reusable IGV.js browser (328 lines, alignment + peak calling modes)
- `frontend/src/components/igv/SelectReactionsModal.tsx` — Reaction picker for IGV tracks (149 lines)

### Frontend Hooks (1 new)
- `frontend/src/hooks/useIGVTracks.ts` — TanStack Query hook for IGV token management with proactive refresh

### Frontend API (Extended)
- `frontend/src/api/files.ts` — Added `getIGVTokens()`
- `frontend/src/api/jobs.ts` — Added `getOutputSignedUrl()`, `downloadTopPeaksCsv()`

---

## Files Significantly Modified in Phase 5

### Backend
- `backend/routers/files.py` — IGV token + serve endpoints, Range header handling, `display=inline` support
- `backend/routers/jobs.py` — `signed-url` endpoint for job outputs, `top-peaks-csv` endpoint
- `backend/routers/fastq_files.py` — `fastqc-token` signed URL endpoint, per_page limit raised to 500
- `backend/routers/tus_upload.py` — Async FastQC (`asyncio.create_task`), storage commit fix
- `backend/pipelines/base.py` — `append_to_master_log()`, `run_cmd`/`run_piped_cmd` master_log parameter (169 lines)
- `backend/pipelines/alignment.py` — Bowtie2 read group flags, master log wiring
- `backend/pipelines/peak_calling.py` — Master log wiring, HOMER/blacklist log calls
- `backend/services/fastqc_service.py` — `asyncio.to_thread()` for non-blocking subprocess, notification on completion
- `backend/services/qc_report_service.py` — Annotation stats float parse fix, top peaks CSV service
- `backend/config.py` — `IGV_TOKEN_EXPIRY_SECONDS`, access token TTL 30 min

### Frontend
- `frontend/src/pages/experiment/AlignmentTab.tsx` — Replaced IGV placeholder with `<IGVPanel mode="alignment">`
- `frontend/src/pages/experiment/PeakCallingTab.tsx` — Replaced IGV placeholder with `<IGVPanel mode="peak_calling">`
- `frontend/src/components/alignment/AlignmentQCReportPanel.tsx` — TSS/Gene Body heatmap sections, collapsible info panel, layout improvements
- `frontend/src/components/peak-calling/PeakCallingQCReportPanel.tsx` — Top peaks download, reordered sections, metrics prop to chart
- `frontend/src/components/peak-calling/PeakAnnotationChart.tsx` — Enhanced tooltip with metrics context
- `frontend/src/components/fastqs/FastqcReportModal.tsx` — Signed URL flow, removed redundant sidebar
- `frontend/src/components/ui/Modal.tsx` — `max-h-[90vh]` + `overflow-y-auto` scroll fix
- `frontend/src/hooks/useSSE.ts` — Import path fix, retry/delay improvements (MAX_RETRIES 10, 3s delay)
- `frontend/src/lib/constants.ts` — Explicit type annotations for `PEAK_CALLING_DEFAULTS`, `AlignmentFileCategory`/`PeakCallingFileCategory` union types

### Tests
- `backend/tests/test_files.py` — 10 new IGV/Range tests, removed `@pytest.mark.anyio` markers
- `backend/tests/test_tus_upload.py` — Removed `@pytest.mark.anyio` markers
- `backend/tests/test_auth.py` — httpx cookie deprecation fix

### Scripts
- `scripts/run-local.sh` — conda/pyenv/PATH fixes, HOMER PATH, graceful shutdown, pg_isready fallback

---

## Dependencies Added in Phase 5

| Package | Version | Purpose |
|---------|---------|---------|
| `igv` | (npm) | IGV.js genome browser with built-in TypeScript types |

No new backend Python dependencies.

---

## Known Issues / Tech Debt

### Resolved in Phase 5
- ~~IGV sub-tab was placeholder~~ → Full implementation in both Alignment and Peak Calling tabs
- ~~No Range header support for byte-range file serving~~ → RFC 7233 implementation with 200/206/416
- ~~FastQC report iframe 401~~ → HMAC-signed URL flow
- ~~FastQC blocking event loop~~ → `asyncio.to_thread()` + fire-and-forget
- ~~`@pytest.mark.anyio` teardown errors~~ → Removed dual markers, 0 errors
- ~~Annotation stats parser silently failing~~ → `int(float())` for HOMER's float counts
- ~~No heatmap images in QC report~~ → TSS and Gene Body heatmaps with signed URL rendering
- ~~No pipeline master logs~~ → Consolidated logs for both alignment and peak calling
- ~~Bowtie2 missing read groups~~ → Added `--rg-id`, `--rg SM:`, `--rg LB:`, `--rg PL:ILLUMINA`
- ~~SEACR not default caller~~ → Changed wizard default to SEACR stringent (lab standard)
- ~~Access token too short (15 min)~~ → Bumped to 30 min
- ~~SSE fragile on hot-reload~~ → MAX_RETRIES 10, 3s reconnect delay
- ~~Modal overflow~~ → `max-h-[90vh]` + `overflow-y-auto`

### Still Open
- **EC2 real-mode end-to-end validation**: Full pipeline (upload → FastQC → trim → align → peak call) tested locally with real tools on Mac but not yet on production EC2 instance.
- **Email notifications**: Deferred to Phase 7.5 (needs Amazon SES configuration).
- **NGINX production config**: `X-Accel-Redirect` and Range header delegation implemented in code but NGINX config is Phase 7.
- **R1/R2 FASTQ pairing**: Not enforced at upload time (enforced at alignment launch).
- **Legacy multipart upload endpoint**: Kept alongside tus for backward compatibility — consider removing in Phase 7.
- **Large directory lazy-loading**: Tree scan is fine at current scale but may need pagination for very large experiments.

---

## Phase 5 Done Criteria Status

- [x] IGV.js renders in both Alignment and Peak Calling tabs
- [x] Reaction selector loads tracks on demand
- [x] Signal tracks display RPKM-normalized coverage (smoothed bigWig)
- [x] Peak calling BED tracks shown as annotation bars below signal
- [x] Navigation, zoom, and image export work (via IGV.js built-in controls)
- [x] Byte-range serving works for large bigWig/BAM files (RFC 7233)

---

## What's Next: Phase 6 (Lab Extensions)

DiffBind differential peak analysis (sample sheet builder, R subprocess, dynamic column names, volcano/MA/PCA plots), custom reference-point heatmaps (user-provided BED files), Pearson correlation matrices (bigWig pairwise correlation heatmaps), Roman normalization (mouse-only, 99th-percentile quantile normalization with masking). See `docs/PLAN.md` Phase 6 for full spec.

Key prerequisites already completed:
- Alignment produces BAMs and bigWigs that feed into all Phase 6 features
- Peak calling produces BED files for DiffBind input
- All reference scripts already in `references/` (diffbind.R, normalization.r, peak_extractor.r, pearson.py, heatmaps.sh)
- 3 DiffBind R script bugs documented in `cleave-spec-decisions.md` §4 (ready to fix when porting)
- Masking BED for Roman normalization already in `backend/pipelines/reference/masks/`
- Pipeline dispatcher extensible for new job types
- Job queue and worker infrastructure running
