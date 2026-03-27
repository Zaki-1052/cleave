# Cleave — Product Development Plan

> The definitive build roadmap. Each phase produces a verifiable increment. Steps within a phase are ordered by dependency. Implementation details live in `docs/` — this document tells you **what to do and when**.

---

## Current Status

**Phases 1 and 2 are complete.** Docker Compose runs Postgres + FastAPI + Vite. All 9 database tables exist (4 Alembic migrations). Auth, project/experiment CRUD, FASTQ upload (tus resumable), FastQC, reactions, trimming, file browser, and file download are all wired end-to-end. **151 tests passing** (46 from Phase 1, 105 from Phase 2). Ready for Phase 3 (Core Pipeline).

**What works right now:**
- `docker compose up` starts all 3 services
- `localhost:8000/api/v1/health` returns `{"status":"ok"}`
- `localhost:8000/docs` shows OpenAPI interactive docs
- `localhost:5173` serves the React app with full auth flow
- All Alembic migrations apply and reverse cleanly (4 migrations)
- `ruff check backend/` and `npx tsc --noEmit` pass
- tus resumable FASTQ uploads with per-file progress, cancel, resume
- FastQC auto-runs post-upload, reports viewable in modal
- Reactions CRUD + CSV import/export
- 3-step experiment creation wizard (Details → FASTQs → Reactions)
- Trimming pipeline (mock mode) with adapter detection banners
- File browser with dual-panel tree + table layout
- Streaming zip batch download with HMAC-signed download tokens

---

## Phase 1: Foundation

> **Goal**: A working web app where users can register, log in, create projects, manage members, create experiments, and navigate the UI shell. No file uploads, no pipelines — just auth + CRUD + navigation.

### 1.1 Auth Backend — End-to-End

Integrate `fastapi-users` to provide auth endpoints wired to the database. This replaces hand-rolled JWT/bcrypt code with library configuration.

- **Install**: `fastapi-users[sqlalchemy]` as the auth dependency. Remove `python-jose[cryptography]` and `passlib[bcrypt]` from `pyproject.toml`.
- **User model**: Extend `SQLAlchemyBaseUserTable` mixin while keeping custom fields (`first_name`, `last_name`, `email_notifications`).
- **Auth backend**: Configure `AuthenticationBackend` with `BearerTransport` (access token, 15-min expiry) and `CookieTransport` (refresh token, 7-day expiry, `httponly=True`, `samesite="lax"`, `secure=True` in prod).
- **Routers**: Include fastapi-users generated routers via `fastapi_users.get_auth_router()` and `get_register_router()`. Mount at `/api/v1/auth`.
- **`current_active_user` dependency**: Provided by fastapi-users — replaces hand-written `get_current_user`. Decodes JWT, loads user from DB, raises 401 on failure.
- **`UserManager` subclass**: Custom hooks (e.g., `on_after_register` to create a welcome notification). Lives in `auth_service.py`.
- **Password hashing**: Argon2 via `pwdlib` (fastapi-users default). Automatic upgrade of any existing bcrypt hashes on login.
- **Rate limiting**: Add `slowapi` middleware on `/api/v1/auth/login` (5/min per IP) and `/api/v1/auth/register` (3/min per IP). fastapi-users does not include rate limiting.

**Verify**: `curl -X POST /api/v1/auth/register` creates a user in the DB. `curl -X POST /api/v1/auth/login` returns tokens. `curl -H "Authorization: Bearer <token>" /api/v1/users/me` returns the user.

### 1.2 Auth Frontend — Login/Register Flow

Connect the `LoginPage` and `RegisterPage` forms to the API via `AuthContext`.

- Login form calls `authApi.login()`, stores token in memory, fetches user, redirects to `/`
- Register form calls `authApi.register()`, same flow
- `ProtectedRoute` redirects to `/login` when unauthenticated
- Page refresh attempts token refresh via cookie to restore session
- Logout clears in-memory token and user state

**Verify**: Register a user in the browser → redirected to home page. Refresh the page → still logged in (cookie refresh). Click logout → redirected to login.

### 1.3 Project CRUD — Backend + Frontend

Wire projects end-to-end: create, list, view, edit, delete.

- **Backend**: The router and service already exist. Verify they work with real DB queries. List endpoint should only return projects where the user is a member.
- **Frontend HomePage**: Replace placeholder with real data from `useProjects()`. Render project cards with name, modified date, description, storage size.
- **Create Project modal**: Form with name + description fields. On submit, call `createProject()`, invalidate query cache, show new project in grid.
- **ProjectDetailPage**: Fetch project by ID, show name, storage size, member list in sidebar. Show experiments table in main area (empty for now).

**Verify**: Create a project → it appears on the home page. Click it → project detail page loads with correct data. Create a second project → both visible.

### 1.4 Project Members

Wire member management: invite by email, list members, change roles, remove members.

- **Backend**: Member endpoints already exist. Add notification creation when a member is invited (call `notification_service.create_notification`).
- **Frontend**: Add "Manage Members" link to project sidebar. Build the Manage Members modal per `cutana-cloud-ui.md` §2a: add member form (email + role dropdown), existing member list with role dropdowns, disable own role.

**Verify**: Invite a second user to a project → they see it on their home page. Change their role → reflected in the member list. Remove them → project disappears from their home page.

### 1.5 Experiment CRUD — Backend + Frontend

Wire experiment creation and listing within a project.

- **Backend**: The router and service exist. Ensure `create_experiment` enforces the 100-char name limit and valid assay types (`CUT&RUN`, `CUT&Tag`).
- **ProjectDetailPage experiments table**: Fetch experiments for the project via `getExperiments(projectId)`. Render with columns: Name (link), Modified, Assay, Last Job, Status. Use the `DataTable` component.
- **Create Experiment**: Build a minimal version of the New Experiment wizard (step 1 only — name, assay type, description). Steps 2 (FASTQs) and 3 (Reactions) are Phase 2. On submit, create experiment and navigate to it.
- **ExperimentView**: Fetch experiment by ID. Show name in header, status badge, tab navigation. Wire the Description tab to show real experiment metadata (ID, created by, created date, status, size).

**Verify**: Create an experiment in a project → it appears in the experiments table. Click it → experiment view loads with correct metadata. Navigate between tabs → routing works.

### 1.6 Notifications

Wire the notification system so users get alerts for key events.

- **Backend**: The service exists. Wire `notifications` router to list and mark-read. Add a `GET /api/v1/notifications` endpoint that returns the current user's notifications (most recent first).
- **Frontend**: Build the notification dropdown panel per `cutana-cloud-ui.md` §3. Bell icon in `Navbar` opens a dropdown. Fetch notifications from API. Show type icon, title, message, timestamp. Clicking a notification marks it read.
- **Generation**: Notifications are created server-side by services (e.g., `project_service.add_member` creates a "Project Invitation" notification for the invited user).

**Verify**: Invite a user to a project → they see a notification in the bell dropdown. Click it → marked as read.

### 1.7 Settings Page

Wire the account settings page.

- Show user's email (read-only), editable first/last name, email notification preference dropdown
- On save, call `PATCH /api/v1/users/me`

**Verify**: Update first name on settings page → name changes in navbar.

### 1.8 Phase 1 Tests

Implement the test stubs in `tests/`. Use httpx `AsyncClient` with the FastAPI test transport. The implementation under test is fastapi-users, not custom code, but the test assertions are the same — they verify the API contract, not the internals.

- `test_auth.py`: Register, login, refresh, protected route access
- `test_projects.py`: CRUD, creator is admin, member-only visibility, admin-only operations
- `test_experiments.py`: CRUD, name length validation, project membership required

**Verify**: `pytest backend/tests/` passes all tests.

### Phase 1 Done Criteria

- [x] Can register, login, logout, and refresh sessions
- [x] Can create/list/edit/delete projects
- [x] Can invite/remove project members with role management
- [x] Can create/list/edit/delete experiments within projects
- [x] Notification bell shows project invitation alerts
- [x] Settings page updates user profile
- [x] All test stubs have real implementations and pass
- [x] UI matches CUTANA Cloud visual language (gradient, cards, pill buttons, status badges)

---

## Phase 2: Data Management

> **Goal**: Users can upload FASTQ files, view FastQC reports, define reactions (sample metadata), and browse all files in an experiment. Trimming pipeline is available but runs in mock mode locally.

### Prerequisites

- Phase 1 complete
- Test FASTQs available at `test_data/` (already done)

### 2.1 FASTQ Upload — Backend

Build the upload endpoint and file storage.

- `POST /api/v1/experiments/:id/fastqs/upload` accepts multipart file uploads
- Store files at `{STORAGE_ROOT}/projects/{project_id}/{experiment_id}/fastqs/raw/`
- Create `fastq_files` DB records: parse filename for prefix, read direction (R1/R2), file size
- Validate: paired-end naming convention, `.fastq.gz` or `.fastq` format, filename starts with alphanumeric
- Auto-gzip uncompressed FASTQs
- Update `experiments.storage_bytes` and `projects.storage_bytes`

**Verify**: Upload test FASTQs via curl → files on disk, records in DB, storage size updated.

### 2.2 FASTQ Upload — Frontend

Build the upload UI on the FASTQs tab.

- Drag-and-drop zone + file picker per `cutana-cloud-ui.md` §6c
- Progress indicator per file
- After upload completes, refresh the FASTQs table
- FASTQs table shows: filename, size, uploaded date, total reads (null until FastQC runs), FASTQC link (disabled until report exists)

**Verify**: Drag test FASTQs onto the upload zone → progress bar → files appear in table.

### 2.3 FastQC Integration

Auto-run FastQC after FASTQ upload.

- Create `pipelines/fastqc.py` module extending `PipelineStage`
- In mock mode: copy a sample FastQC report from `cutana/fastqc/` as the result
- In real mode: run `fastqc -o <output_dir> <fastq_file>`
- Store HTML report at `{experiment_dir}/fastqc/{filename}.html`
- Update `fastq_files.total_reads` from FastQC output
- Trigger automatically post-upload (inline, not via job queue — FastQC is fast)

**Verify**: Upload a FASTQ → FastQC report appears → total reads column populated.

### 2.4 FastQC Report Viewer

Build the FastQC modal per `cutana-cloud-ui.md` §6b-i.

- Click the FASTQC icon in the FASTQs table → modal opens
- Modal renders the FastQC HTML report in an iframe
- Download Report button serves the HTML file
- Summary sidebar shows pass/fail/warning for each module

**Verify**: Click FastQC icon → modal shows the report with correct metrics.

### 2.5 Reactions — Backend

Build reactions CRUD and CSV import/export.

- `GET/POST/PATCH/DELETE /api/v1/experiments/:id/reactions`
- `POST /api/v1/experiments/:id/reactions/import-csv` — parse CSV, bulk-create reactions
- `GET /api/v1/experiments/:id/reactions/template` — download CSV template
- Enforce unique constraint: `(experiment_id, organism, short_name)`
- Auto-detect FASTQ prefix → reaction mapping from uploaded filenames

**Verify**: Create reactions via API → records in DB. Upload CSV → bulk creation works. Download template → valid CSV.

### 2.6 Reactions — Frontend

Build the reactions table and edit wizard per `cutana-cloud-ui.md` §6d and §6e.

- Reactions tab shows the table: FASTQ Prefix, R1/R2 checkmarks, Short Name, Assay Type, Organism
- Edit button opens the reactions wizard (step 3 of experiment creation)
- CSV upload zone at top, manual table below
- Editable columns: FASTQ Prefix (dropdown from uploaded files), Short Name, Organism, CUTANA Spike in, E.coli Spike in
- Customize Columns toggle for optional fields (cell type, antibody info, etc.)

**Verify**: Edit reactions in the table → saved to DB. Upload a CSV → table populated.

### 2.7 Experiment Creation Wizard — Complete

Extend the experiment wizard from step 1 (Phase 1) to include steps 2 and 3.

- Step 2 (FASTQs): Reuse the upload component from 2.2
- Step 3 (Reactions): Reuse the reactions editor from 2.6
- "Save" saves without closing. "Update Experiment" saves and navigates to experiment view.

**Verify**: Create a new experiment through all 3 wizard steps → experiment has FASTQs and reactions.

### 2.8 Trimming Pipeline Module

Build the trimming pipeline (runs in mock mode locally, real mode on EC2).

- Create `pipelines/trimming.py` implementing the two-stage trim: Trimmomatic → kseq_test
- Parameters from `cleave-spec-decisions.md` §6 (ILLUMINACLIP, LEADING, TRAILING, etc.)
- Mock mode: sleep 2s, copy input FASTQs as "trimmed" output
- After FastQC: parse Adapter Content module, flag files with >5% adapter contamination
- Frontend: show "Adapters detected — trimming recommended" banner on FASTQs tab with Trim/Skip/Configure options
- Trimmed FASTQs stored at `fastqs/trimmed/`, new `fastq_files` records with `is_trimmed=True`

**Verify**: Upload FASTQs → adapter detection banner appears. Click Trim → job created → (mock) trimmed files appear.

### 2.9 File Browser

Build the All Files tab per `cutana-cloud-ui.md` §6h.

- `GET /api/v1/experiments/:id/files` returns the file tree as nested JSON
- Build from disk: scan the experiment directory, return folder/file metadata
- Frontend: dual-panel layout — directory tree on left, file table on right
- Click a folder in the tree → right panel shows its contents
- Download button for selected files

**Verify**: After uploading FASTQs, the All Files tab shows the directory tree with `fastqs/raw/` containing the uploaded files.

### 2.10 File Download

- `GET /api/v1/jobs/:jid/files/:fid/download` serves files
- In dev: FastAPI streams the file directly
- In prod: use `X-Accel-Redirect` header for NGINX to serve (implement the header logic now, NGINX config is Phase 7)
- Batch download: zip selected files server-side and stream

**Verify**: Click download on a FASTQ file → file downloads correctly in browser.

### Phase 2 Done Criteria

- [x] Can upload paired-end FASTQs via drag-and-drop
- [x] FastQC runs automatically, reports viewable in modal
- [x] Reactions defined manually or via CSV upload
- [x] Full experiment creation wizard (3 steps) works end-to-end
- [x] Adapter detection flags contaminated FASTQs
- [x] Trimming runs in mock mode, produces "trimmed" files
- [x] All Files tab shows experiment directory tree
- [x] Individual and batch file download works

---

## Phase 3: Core Pipeline

> **Goal**: The alignment pipeline runs end-to-end. Users launch alignment jobs via a wizard, see real-time status updates, and view QC reports, files, and heatmaps. The Analysis Queue shows all jobs across projects.

### Prerequisites

- Phase 2 complete
- **EC2 only**: Bowtie2 indices for mm10, hg38, ecoli (scp from lab instance — see `todos.md`)
- **EC2 only**: Gene annotation BEDs for TSS/gene body heatmaps (UCSC Table Browser)
- **EC2 only**: HOMER genome data (`configureHomer.pl -install mm10`)

### 3.1 Worker Process & Job Queue

Make the worker actually process jobs.

- `worker.py` already has the poll loop. Enhance it:
  - Parse `job.params` to determine the pipeline module
  - Create the working directory structure: `{experiment_dir}/jobs/{job_id}/`
  - Call `pipelines.run(job_type, params, working_dir)`
  - On completion: update `analysis_jobs.status`, `completed_at`, `duration_seconds`
  - On error: update `analysis_jobs.error_message`, set status to `error`
  - Create `job_outputs` records for all produced files
  - Create notification for the user who launched the job
- Add worker to Docker Compose as a 4th service (same image, different command)

**Verify**: Insert a job row with status `queued` → worker picks it up, runs mock pipeline, sets status to `complete`, creates notification.

### 3.2 SSE for Real-Time Status

Implement server-sent events so the frontend sees job status changes live.

- `GET /api/v1/notifications/stream` — SSE endpoint for the current user
- Implementation: 2-second polling of `notifications` and `analysis_jobs` tables (not PG LISTEN/NOTIFY — per `cleave-spec-decisions.md` §1)
- Frontend: connect to SSE on mount, invalidate TanStack Query caches when job status changes
- `JobStatusBadge` component subscribes to SSE for live dot-color updates

**Verify**: Launch a job → status badge updates from Queued → Running → Complete without page refresh.

### 3.3 Alignment Pipeline Module

Build `pipelines/alignment.py` — the core pipeline stage.

- Mock mode: sleep 5s, generate canned QC stats from `cutana/H3K4me3/Mouse mm10_alignment_metrics.csv`, create placeholder output files
- Real mode (EC2): chain of subprocess calls:
  1. Bowtie2 alignment (`--dovetail --phred33 -p <nproc>`)
  2. SAM → BAM conversion (samtools)
  3. Multi-mapper removal (samtools view -q 10)
  4. DAC Exclusion List filtering (bedtools intersect with blacklist BEDs)
  5. Duplicate marking + removal (Picard MarkDuplicates)
  6. bigWig generation (deepTools bamCoverage, 20bp + 100bp bins, RPKM normalization, correct effectiveGenomeSize per genome)
  7. TSS + Gene Body heatmaps (deepTools computeMatrix + plotHeatmap)
- Capture stdout/stderr to `{job_dir}/logs/`
- Generate methods text from `pipelines/methods_text.py`
- E. coli spike-in: if `ecoli_spike_in=True` in reactions, also align to E. coli genome, compute normalization factor
- Record all outputs in `job_outputs` table with correct `file_category`

**Verify** (mock): Launch alignment → mock outputs created → QC data matches CUTANA export format.
**Verify** (EC2): Launch alignment with test FASTQs → real BAMs and bigWigs produced → QC metrics match expected ranges.

### 3.4 Alignment Wizard UI

Build the New Alignment wizard per `cutana-cloud-ui.md` §7 (3 steps).

- Step 1 (Details): Alignment name (30-char limit), notes textarea, About panel with pipeline description
- Step 2 (Choose Reactions): Checkbox table of experiment's reactions
- Step 3 (Alignment Settings): Reactions table with Reference Genome dropdown per reaction. Advanced Settings collapsible: Remove Duplicates (checkbox, default on), Remove DAC Exclusion List (checkbox, default on), BAM Coverage Bin Size (20), Smoothed Bin Size (100)
- "Start Alignment" button submits `POST /api/v1/experiments/:id/jobs` with `job_type: "alignment"` and all params as JSONB

**Verify**: Walk through the wizard → job created in DB with correct params → worker picks it up.

### 3.5 Alignment QC Report

Build the QC Report sub-tab under Alignment per `cutana-cloud-ui.md` §6f-iii.

- Define `AlignmentQCReport` Pydantic schema from `cutana/H3K4me3/Mouse mm10_alignment_metrics.csv`
- `GET /api/v1/jobs/:jid/qc-report` returns structured JSON
- Frontend: Seq Stats and Alignment Metrics table (Total Read Pairs, Aligned, Unique Alignment Rate, etc.)
- Right-side info panel explaining each metric
- Download Data as CSV button
- SNAP-CUTANA spike-in heatmap (if spike-in reactions present)
- E. coli alignment rate column

**Verify**: View alignment QC → table shows correct metrics. Download CSV → matches original format.

### 3.6 Alignment Info, Input, Files Sub-tabs

Build the remaining Alignment sub-tabs.

- **Info** (`cutana-cloud-ui.md` §6f-i): Details card (Run ID, Created By, Date, Status), Run Methods card (auto-generated methods text), Notes card
- **Input** (`cutana-cloud-ui.md` §6f-ii): Reactions table showing input parameters used (Short Name, Assay Type, Organism, Reference Genome, CUTANA Spike in, E.coli Spike in)
- **Files** (`cutana-cloud-ui.md` §6f-iv): Dropdown to select file category (Unique BAM, bigWig, smoothed bigWig, TSS Heatmaps, Gene Body Heatmaps, FastQC). Table of files with download buttons. Description text for each category.

**Verify**: All sub-tabs render with correct data from the completed alignment job.

### 3.7 Analysis Queue Page

Wire the Analysis Queue page per `cutana-cloud-ui.md` §5.

- `GET /api/v1/jobs` returns all jobs across projects (paginated, filterable)
- Backend: join through `experiments` → `project_members` to enforce membership
- Frontend: DataTable with columns: Name, Project, Experiment, Executable (job_type), Launched By, Started Running, Duration, Status
- Column filters and search

**Verify**: Launch jobs in different projects → all visible in the queue. Filter by status → correct results.

### Phase 3 Done Criteria

- [ ] Worker picks up queued jobs and runs pipeline modules
- [ ] SSE pushes real-time status updates to the browser
- [ ] Alignment wizard creates correctly parameterized jobs
- [ ] Mock alignment produces QC data matching CUTANA export format
- [ ] QC report renders with stats table and spike-in heatmap
- [ ] Alignment files browsable and downloadable by category
- [ ] Methods text auto-generated with tool versions and parameters
- [ ] Analysis Queue shows cross-project job list
- [ ] (EC2) Real alignment runs with test FASTQs and produces valid outputs

---

## Phase 4: Peak Calling

> **Goal**: Peak calling runs on completed alignments. All three callers (MACS2 narrow/broad, SICER2, SEACR stringent/relaxed) work. QC reports show FRiP scores and peak annotation plots.

### Prerequisites

- Phase 3 complete (alignment outputs exist to feed into peak calling)

### 4.1 Peak Calling Pipeline Module

Build `pipelines/peak_calling.py`.

- Mock mode: generate canned results from `cutana/H3K4me3/peak_caller_metrics.csv` and `top_called_peaks.csv`
- Real mode: dispatch to correct caller based on `params.peak_caller`:
  - **MACS2 narrow**: `macs2 callpeak -f BAMPE -q 0.01 -B --SPMR --keep-dup all`
  - **MACS2 broad**: `macs2 callpeak --broad --broad-cutoff 0.1 -B --SPMR --keep-dup all`
  - **SICER2**: `sicer2` with FDR 0.01
  - **SEACR**: MACS2 bedgraph → `change.bdg.py` float→int → `SEACR_1.1.sh 0.01 non stringent/relaxed`
- Fragment filter (<120bp): if enabled (default ON), filter BAMs with `filter_below.awk` before calling
- IgG control: pass IgG BAM as control to MACS2 `-c` flag
- FRiP calculation: `bedtools intersect` reads-in-peaks ÷ `samtools view -c` total reads
- HOMER annotation: `annotatePeaks.pl` on called peaks
- Generate methods text for peak calling

### 4.2 Peak Calling Wizard UI

Build the 4-step wizard per `cutana-cloud-ui.md` §8.

- Step 1 (Details): Peak Calling name (30-char limit), notes, About panel
- Step 2 (Choose Alignment): Select from completed alignment runs
- Step 3 (Choose Reactions): Checkbox table from the selected alignment
- Step 4 (Peak Calling Settings): Reactions table with IgG Control dropdown, Reference Genome (inherited), Peak Caller dropdown (MACS2/SICER2/SEACR), Peak Size (Narrow/Broad/Stringent/Relaxed). Advanced Settings: q-value threshold, fragment filter checkbox (default ON), broad cutoff

**Verify**: Walk through wizard → job created with `parent_job_id` pointing to the alignment job → worker runs it.

### 4.3 Peak Calling QC Report

Build the QC Report per `cutana-cloud-ui.md` §6g-iii.

- Define `PeakCallingQCReport` Pydantic schema from `cutana/H3K4me3/peak_caller_metrics.csv`
- Peak Calling Stats: peak count, FRiP score per reaction
- Peak Annotation Plots: stacked horizontal bar chart (Recharts) showing genomic feature distribution per reaction. Categories: Promoter, Exon, Intron, Intergenic, 3UTR, 5UTR, TTS, ncRNA, miRNA, pseudo
- Top Called Peaks: table of top peaks by score with chromosome, start, end
- Download as PNG / CSV buttons

**Verify**: View peak calling QC → FRiP table, annotation bar chart, top peaks table all render correctly.

### 4.4 Peak Calling Sub-tabs

Build Info, Input, Files sub-tabs (same pattern as alignment).

- **Info**: Run ID, methods text, notes
- **Input**: Reactions table with IgG control, peak caller, peak size
- **Files**: Categories — BED Files, FRiP Score, Peak Annotation, Peak Annotation Stats

### Phase 4 Done Criteria

- [ ] All 5 peak caller modes work (MACS2 narrow/broad, SICER2, SEACR stringent/relaxed)
- [ ] Fragment filter (<120bp) applied by default before calling
- [ ] IgG control correctly assigned per reaction
- [ ] SEACR preprocessing chain (MACS2 bdg → integer conversion → SEACR) works
- [ ] FRiP calculation produces scores >0.2 for good enrichment targets
- [ ] HOMER annotates peaks to genomic features
- [ ] QC report shows FRiP table and annotation stacked bar chart
- [ ] Peak calling files browsable by category (BED, FRiP, Annotation)

---

## Phase 5: Visualization

> **Goal**: IGV.js genome browser embedded in Alignment and Peak Calling tabs. Users select reactions, view signal tracks, and compare across samples.

### 5.1 IGV.js Integration

Build the IGV sub-tab per `cutana-cloud-ui.md` §6f-v.

- Install `igv` npm package
- Build `IgvViewer` React component wrapping `igv.createBrowser()`
- Lazy-load: render only when user selects reactions (don't load heavy data by default)
- Reference genome selector dropdown (mm10, hg38, etc.)
- "Select Reactions" button opens a reaction picker modal with checkboxes

### 5.2 Track Loading

- Load smoothed bigWig files as signal tracks
- For peak calling: also load BED files as annotation tracks below signal tracks
- Track labels: `{JobName}-{ShortName}`
- Per-track Y-axis scale display
- Backend: serve bigWig/BAM files with proper `Range` header support for byte-range requests

### 5.3 IGV Controls

- Chromosome dropdown navigation
- Coordinate input field for locus jumping
- Zoom slider
- Toggle buttons: Track Labels, Crosshairs, Center Line
- Save Image: export current view as PNG

**Verify**: Select 3 reactions → 3 signal tracks render in IGV → navigate to a known enrichment locus → peaks visible → Save Image produces a PNG.

### Phase 5 Done Criteria

- [ ] IGV.js renders in both Alignment and Peak Calling tabs
- [ ] Reaction selector loads tracks on demand
- [ ] Signal tracks display RPKM-normalized coverage
- [ ] Peak calling BED tracks shown as colored bars below signal
- [ ] Navigation, zoom, and image export work
- [ ] Byte-range serving works for large bigWig/BAM files

---

## Phase 6: Lab Extensions

> **Goal**: Features that go beyond CUTANA Cloud — DiffBind differential analysis, custom heatmaps, Pearson correlation, Roman normalization. These are the lab's most-requested additions.

### Prerequisites

- Phases 3-4 complete (need alignment outputs + peak files)
- Fix 3 DiffBind R script bugs documented in `cleave-spec-decisions.md` §4

### 6.1 DiffBind Differential Peak Analysis

The most complex extension. Requires a new wizard, R subprocess execution, and results visualization.

- **Sample sheet builder UI**: User selects reactions, assigns Condition (ctrl/mut) and Replicate numbers. Frontend generates the CSV format that DiffBind expects (SampleID, Factor, Condition, Replicate, bamReads, Peaks, Peakcaller).
- **Pipeline module** (`pipelines/diffbind.py`): Run the fixed `diffbind.R` script via R subprocess. Handle dynamic output column names (`Conc_X`, `Conc_Y` depend on Condition values — do NOT hardcode).
- **Results visualization**: Volcano plot, MA plot, PCA plot, correlation heatmap. Render the PNG/SVG outputs from DiffBind. Downloadable results table.
- **Consensus peakset mode**: Support `diffbind_peaklist.R` variant where user provides a custom peak BED.

**Verify**: Select 4 reactions (2 ctrl, 2 mut) → build sample sheet → run DiffBind → PCA, volcano, MA plots render → results table downloadable.

### 6.2 Custom Reference-Point Heatmaps

Extend the built-in TSS/Gene Body heatmaps with user-provided BED files.

- **UI**: Upload a BED file of reference points (summits, enhancers, custom regions)
- **Pipeline module** (`pipelines/heatmaps.py`): `deepTools computeMatrix reference-point -R <user_bed> -S <bigwigs> -a 1500 -b 1500` → `plotHeatmap`
- Options: flanking distance, sort order, color scale
- Reference implementation: `references/genomewide_plots/heatmaps.sh`

**Verify**: Upload a summit BED → heatmap generated → displays in the UI.

### 6.3 Pearson Correlation Matrices

Pairwise bigWig correlation for replicate concordance assessment.

- **Pipeline module** (`pipelines/correlation.py`): Port `references/media_pearson_corr/peak_extractor.r` (bigWig → coverage matrix) + `pearson.py` (matrix → heatmap)
- **UI**: Select reactions to compare → correlation heatmap rendered
- Optional: restrict to peaks within a BED region

**Verify**: Select 4 reactions → pairwise correlation heatmap shows high concordance between replicates.

### 6.4 Roman Normalization

Mouse-only sample-to-sample normalization.

- **Pipeline module** (`pipelines/normalization.py`): Port `references/media_normalization/normalization.r`
- Algorithm: 99th-percentile quantile normalization with `manual.mask.ultimate.bed` masking (already in `pipelines/reference/masks/`)
- Input: bigWig files from alignment. Output: `*_rnorm.bw` normalized bigWig files
- Mouse only (chr1-19, chrX). Show error if user selects non-mouse samples.

**Verify**: Select 4 mouse bigWigs → normalized bigWigs produced → load in IGV to compare pre/post normalization.

### Phase 6 Done Criteria

- [ ] DiffBind runs with sample sheet builder, produces differential peaks + plots
- [ ] Dynamic DiffBind column names handled correctly (not hardcoded)
- [ ] Custom heatmaps from user-provided BED files
- [ ] Pearson correlation matrices for replicate QC
- [ ] Roman normalization for mouse samples (with masking)

---

## Phase 7: Polish & QA

> **Goal**: Production-ready deployment on EC2. Storage management, error handling, Gold Standard project, and end-to-end testing with real lab data.

### 7.1 Storage Lifecycle Management

- Nightly cron/worker task enforces retention policies (see `cutana-architecture-plan.md` §5):
  - Auto-delete intermediate BAMs 7 days after job completion
  - Auto-delete trimming artifacts after job completion
  - Auto-delete pipeline logs after 30 days
- Update `experiments.storage_bytes` and `projects.storage_bytes` after each cleanup
- Show storage usage gauges in project sidebar and experiment detail

### 7.2 Gold Standard Reference Project

- Pre-load a read-only project with pre-analyzed data (alignment + peak calling outputs from the CUTANA Cloud test run)
- Crown icon and visual distinction per `cutana-cloud-ui.md` §1
- Allows new users to explore outputs without uploading their own data

### 7.3 Experiment History / Audit Log

- History tab per `cutana-cloud-ui.md` §6: log of all actions (job launches, file uploads, metadata changes)
- Store events in a simple `experiment_events` table or derive from existing data

### 7.4 Error Handling & Job Management

- Graceful job termination: "Terminate" button on running jobs, sends signal to worker
- Retry logic: failed jobs can be re-queued with same parameters
- Error details: show full error message and last 50 lines of pipeline log in UI
- Global error boundary in React for unhandled frontend errors

### 7.5 Email Notifications

- Amazon SES integration for job completion emails
- Env vars: `AWS_SES_REGION`, `AWS_SES_FROM_EMAIL`
- Respect user's `email_notifications` preference (always / on_error / never)
- Email contains: job name, experiment name, project name, status, duration, link to results
- Enable fastapi-users password reset flow (`get_reset_password_router()`) — config flag flip, not a feature build. Add `/auth/forgot-password` to slowapi rate limiting list.

### 7.6 EC2 Deployment

- Provision dedicated EC2 instance (start with `t3.xlarge`, benchmark alignment memory)
- Install system packages: PostgreSQL, NGINX, Python 3.11+, Node.js, Java (OpenJDK 17+ for Trimmomatic), conda
- Create conda environment for pipeline tools (reference: `references/conda_envs/`)
- Transfer Bowtie2 indices from lab instance
- Build frontend (`npm run build` → `dist/`)
- Configure NGINX: TLS (Cloudflare origin cert), static files, API proxy, SSE (no buffering), tus uploads, `X-Accel-Redirect` for file downloads
- Create systemd units: `cleave-api.service`, `cleave-worker.service`
- Cloudflare DNS: point `coleferguson.com` to EC2 instance
- Test the full pipeline with real lab FASTQs

### 7.7 End-to-End Testing

- Upload real lab FASTQs (H3K4me3 ctrl/mut paired-end, 5 reactions)
- Run full pipeline: upload → FastQC → trim → align → peak call
- Validate QC metrics against known-good values:
  - Unique alignment rate: 70-95% for targets, ~29% for IgG
  - Duplication rate: <30%
  - E. coli alignment rate: <5%
  - FRiP: >0.2 for H3K4me3
- Compare bigWig signal and peaks to CUTANA Cloud outputs
- Test DiffBind with ctrl vs mut conditions
- Test all file downloads, IGV visualization, and report exports

### Phase 7 Done Criteria

- [ ] Storage cleanup runs on schedule, space reclaimed
- [ ] Gold Standard project visible to all users
- [ ] Job termination and retry work
- [ ] Email notifications sent on job completion
- [ ] EC2 instance running with NGINX + TLS + systemd
- [ ] Full pipeline validated with real lab data
- [ ] All QC metrics within expected ranges
- [ ] Platform accessible via `coleferguson.com`

---

## Cross-Cutting Concerns

These apply throughout all phases, not to any single step.

### Testing Strategy

- **Phase 1**: httpx `AsyncClient` integration tests for all API endpoints. Manual browser testing for frontend.
- **Phase 2+**: Add tests for each pipeline module (mock mode). Test file upload/download paths.
- **Phase 3+**: Pipeline tests with downsampled test FASTQs in `test_data/`. Validate output file existence and format.
- **All phases**: `ruff check backend/` and `npx tsc --noEmit` must pass before any commit.

### Frontend Patterns

- Every page follows: fetch data with TanStack Query → loading spinner → render → error state
- Server state via TanStack Query. Local UI state via `useState`/`useReducer`. No global store.
- Wizard modals for multi-step flows. `WizardModal` component handles step navigation.
- `DataTable` wraps TanStack Table for all tabular data (sort, filter, search, pagination, column customization).
- Match CUTANA Cloud visual language at every step (reference `cutana-cloud-ui.md` for exact layouts).

### Backend Patterns

- Router → Service → Database. Routers handle HTTP, services handle business logic, models handle persistence.
- All service functions are `async def`, receive a DB session, return domain objects.
- fastapi-users `current_active_user` dependency on every protected endpoint. `require_project_role` (custom) for permission checks.
- Pipeline modules follow the `PipelineStage` base class interface: `validate()`, `run()`, `mock_run()`, `generate_methods_text()`.
- `PIPELINE_MODE=mock` for all local development. Real pipelines only run on EC2 with bioinformatics tools installed.

### Key Reference Documents

| When you need... | Read... |
|---|---|
| UI layouts, component specs, page structure | `docs/cutana-cloud-ui.md` |
| Database schema, API routes, system architecture | `docs/cutana-architecture-plan.md` |
| Pipeline parameters, tool versions, bug fixes | `docs/cleave-spec-decisions.md` |
| Lab workflow, script details, feature gaps | `docs/cf-lab-pipeline-spec.md` |
| Platform behavior, QC interpretation, terminology | `docs/cutana-cloud-docs.md` |
| Workflow details, pricing model, normalization | `docs/cutana-cloud-info.md` |
