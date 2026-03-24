# CUTANA Cloud Clone — Preliminary Architecture Plan

> **Status**: Preliminary / Living Document
> **Last updated**: 2026-03-23
> **Author**: Zakir Alibhai

**Name**: *Cleave*

---

## 1. Project Goals

Build a self-hosted clone of EpiCypher's CUTANA™ Cloud platform that:

1. **Replicates core CUTANA Cloud functionality**: FASTQ upload → FastQC → Alignment (Bowtie2) → BigWig generation → Peak Calling (MACS2) → HOMER annotation → IGV visualization → File download.
2. **Fills gaps in the original platform**: FASTQ trimming, SEACR peak calling, MACS2 broad mode, DiffBind differential peak analysis, custom heatmaps, Pearson correlation matrices, Roman normalization.
3. **Replaces the lab's manual CLI pipeline** with a GUI-driven workflow, eliminating the need for SSH access to the shared EC2 instance for routine analyses.
4. **Runs on a single dedicated AWS EC2 instance** with a web-accessible frontend, serving a small number of concurrent users (lab-scale, not enterprise).

### Non-Goals (for now)

- Multi-node compute scaling (Slurm/AWS Batch) — design for swappability, don't implement yet.
- ATAC-seq support — separate pipeline branch, lower priority.
- Cistrome DB integration — may remain a manual/export workflow.
- Public-facing deployment or multi-tenant SaaS architecture.

---

## 2. Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | React 18+ (Vite) | SPA suited for data-heavy dashboard UI. Vite for fast dev builds. No SSR needed — authenticated internal tool. |
| **UI Components** | TanStack Table, Tailwind CSS | Every CUTANA Cloud page has sortable/filterable/paginated tables. Tailwind for rapid styling without a heavy component library. |
| **Genome Browser** | IGV.js | Direct embed into React. Same approach as CUTANA Cloud. Loads smoothed bigWigs for visualization. |
| **Backend API** | FastAPI (Python 3.11+) | Async I/O, automatic OpenAPI docs, native to the bioinformatics ecosystem. Eliminates the two-language problem of Node + Python glue scripts. |
| **ASGI Server** | Uvicorn | Production ASGI server for FastAPI. Run behind NGINX reverse proxy. |
| **Database** | PostgreSQL 15+ | Concurrent read/write from web server + worker. JSONB for flexible job parameters. `LISTEN/NOTIFY` for real-time status propagation. |
| **Job Execution** | Custom Python worker process | Polls a `jobs` table, executes pipeline stages via `subprocess`, updates status. Single-process with configurable concurrency limit. |
| **Real-time Updates** | Server-Sent Events (SSE) | Unidirectional server→client push for job status. Simpler than WebSockets; sufficient for this use case. |
| **File Uploads** | tus protocol (chunked/resumable) | Multi-GB FASTQ files require resumable uploads over potentially unreliable connections. Python server (`tusd` or `tus-py`), JS client (`tus-js-client`). |
| **Auth** | JWT (access + refresh tokens) + bcrypt | Minimal, sufficient for small user base. FastAPI-native patterns. |
| **Reverse Proxy** | NGINX | TLS termination, static asset serving, proxying to Uvicorn. |
| **DNS/CDN** | Cloudflare | DNS pointing to EC2 instance. Optional: Cloudflare proxy for DDoS protection and caching of static assets. |
| **Process Management** | systemd | Native on Ubuntu. Units for: NGINX, PostgreSQL, Uvicorn (FastAPI), Worker process. Auto-restart, logging, dependency ordering. |
| **Local Dev** | Docker Compose | Postgres + FastAPI + Vite dev server. Pipeline stages stubbed/mocked locally, tested on EC2. |

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     EC2 Instance                        │
│                                                         │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │  NGINX   │───▶│  Uvicorn     │───▶│  PostgreSQL  │   │
│  │ :80/:443 │    │  (FastAPI)   │    │   :5432      │   │
│  │          │    │  :8000       │    │              │   │
│  └──────────┘    └──────┬───────┘    └──────┬───────┘   │
│       │                 │                   │           │
│       │           SSE connections      LISTEN/NOTIFY    │
│       │                 │                   │           │
│  Static assets    ┌─────┴────┐        ┌─────┴────┐     │
│  (React build)    │ tus upload│        │  Worker  │     │
│                   │ endpoint  │        │ Process  │     │
│                   └──────────┘        └─────┬────┘     │
│                                             │          │
│                                      ┌──────┴───────┐  │
│                                      │  Pipeline    │  │
│                                      │  Modules     │  │
│                                      │ (subprocess) │  │
│                                      └──────┬───────┘  │
│                                             │          │
│                                      ┌──────┴───────┐  │
│                                      │  Local Disk  │  │
│                                      │  /data/...   │  │
│                                      └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Request Flow

1. **User opens app** → NGINX serves the React SPA (static files).
2. **API calls** → NGINX proxies `/api/*` to Uvicorn (FastAPI).
3. **File uploads** → NGINX proxies `/uploads/*` to the tus endpoint (handled by FastAPI or a dedicated tus server process).
4. **Job submission** → FastAPI writes a row to `analysis_jobs` table with status `QUEUED`.
5. **Job execution** → Worker process polls `analysis_jobs`, picks up queued jobs, runs pipeline modules, updates status to `RUNNING` → `COMPLETE` or `ERROR`.
6. **Status updates** → Worker updates the DB; FastAPI's SSE endpoint uses `LISTEN/NOTIFY` (or polling) to push updates to the connected client.
7. **File access** → FastAPI serves file metadata; downloads are served by NGINX via `X-Accel-Redirect` (offloads large file transfer from the Python process).

### Job Execution Model (Detail)

The worker is a standalone Python process (`worker.py`) managed by systemd. Its loop:

```
while True:
    job = poll_for_next_queued_job()     # SELECT ... WHERE status = 'QUEUED' ORDER BY created_at LIMIT 1 FOR UPDATE
    if job:
        update_status(job.id, 'RUNNING')
        try:
            result = pipelines.run(job.type, job.params)   # dispatches to correct pipeline module
            update_status(job.id, 'COMPLETE', result)
        except PipelineError as e:
            update_status(job.id, 'ERROR', error=str(e))
    else:
        sleep(POLL_INTERVAL)             # e.g., 2 seconds
```

**Concurrency**: Initially single-threaded (one job at a time). Alignment is CPU/memory-intensive enough that parallel jobs on a small instance would OOM. The concurrency limit is a config variable — if the instance is upsized later, bump it.

**Swappability**: The `pipelines.run(job_type, params)` dispatch is the abstraction boundary. Today it calls `subprocess.run(...)`. Tomorrow it could submit a Slurm `.sb` file or an AWS Batch job. The web layer and database schema don't change.

---

## 4. Data Model

### Entity Relationships

```
User ──┬── owns ──── Project
       │                │
       │           has many
       │                │
       └── member of ── Experiment
                           │
                      has many ──┬── FastqFile
                                 ├── Reaction
                                 ├── AnalysisJob ──── JobOutput (files)
                                 └── (linked via Reaction)
```

### Core Tables

```sql
-- Users & Auth
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,          -- login identifier
    password_hash   TEXT NOT NULL,
    first_name      TEXT,
    last_name       TEXT,
    email_notifications TEXT DEFAULT 'always',     -- 'always', 'on_error', 'never'
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Projects
CREATE TABLE projects (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    created_by      INT REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE project_members (
    project_id      INT REFERENCES projects(id) ON DELETE CASCADE,
    user_id         INT REFERENCES users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'contributor',  -- 'admin', 'contributor', 'viewer'
    can_download    BOOLEAN DEFAULT TRUE,
    can_delete      BOOLEAN DEFAULT FALSE,
    invited_by      INT REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);

-- Experiments
CREATE TABLE experiments (
    id              SERIAL PRIMARY KEY,
    project_id      INT REFERENCES projects(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,                  -- 100 char limit enforced in app
    assay_type      TEXT NOT NULL,                  -- 'CUT&RUN', 'CUT&Tag'
    description     TEXT,
    status          TEXT DEFAULT 'new',             -- 'new', 'in_progress', 'complete', 'error', 'terminated'
    created_by      INT REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- FASTQ Files
CREATE TABLE fastq_files (
    id              SERIAL PRIMARY KEY,
    experiment_id   INT REFERENCES experiments(id) ON DELETE CASCADE,
    filename        TEXT NOT NULL,
    prefix          TEXT NOT NULL,                  -- shared R1/R2 prefix (FASTQ Prefix)
    read_direction  TEXT NOT NULL,                  -- 'R1' or 'R2'
    file_size_bytes BIGINT,
    total_reads     BIGINT,
    file_path       TEXT NOT NULL,                  -- path on disk relative to storage root
    is_trimmed      BOOLEAN DEFAULT FALSE,
    upload_source   TEXT,                           -- 'local', 'basespace', 'aws', 'server', 'experiment_copy'
    uploaded_at     TIMESTAMPTZ DEFAULT now()
);

-- Reactions (Sample Metadata)
CREATE TABLE reactions (
    id              SERIAL PRIMARY KEY,
    experiment_id   INT REFERENCES experiments(id) ON DELETE CASCADE,
    fastq_prefix    TEXT NOT NULL,                  -- links to fastq_files.prefix
    short_name      TEXT NOT NULL,
    organism        TEXT NOT NULL,                  -- 'Mouse', 'Human', 'Drosophila', 'Yeast'
    assay_type      TEXT NOT NULL,
    cutana_spike_in TEXT DEFAULT 'None',            -- 'None', 'KMetStat'
    cutana_spike_in_target TEXT,                    -- 'Unmodified', 'H3K4me3', 'H3K27me3', etc.
    ecoli_spike_in  BOOLEAN DEFAULT FALSE,
    -- Optional metadata
    cell_type       TEXT,
    cell_number     TEXT,
    sample_prep     TEXT,
    experimental_condition TEXT,
    antibody_vendor TEXT,
    antibody_cat_no TEXT,
    antibody_lot_no TEXT,
    cutana_spike_in_2 TEXT,
    cutana_spike_in_target_2 TEXT,
    UNIQUE (experiment_id, organism, short_name)    -- unique short names per organism per experiment
);

-- Analysis Jobs (unified table for all pipeline stages)
CREATE TABLE analysis_jobs (
    id              SERIAL PRIMARY KEY,
    experiment_id   INT REFERENCES experiments(id) ON DELETE CASCADE,
    job_type        TEXT NOT NULL,                  -- 'fastqc', 'trimming', 'alignment', 'peak_calling', 'diffbind', etc.
    name            TEXT NOT NULL,                  -- user-provided name (30 char limit for alignment/peak calling)
    notes           TEXT,
    status          TEXT DEFAULT 'queued',          -- 'queued', 'running', 'complete', 'error', 'terminated'
    params          JSONB NOT NULL DEFAULT '{}',    -- all job-specific configuration
    parent_job_id   INT REFERENCES analysis_jobs(id),  -- e.g., peak calling references its alignment job
    launched_by     INT REFERENCES users(id),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    duration_seconds INT,
    error_message   TEXT,
    methods_text    TEXT,                           -- auto-generated methods paragraph
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Job Outputs (files produced by analysis jobs)
CREATE TABLE job_outputs (
    id              SERIAL PRIMARY KEY,
    job_id          INT REFERENCES analysis_jobs(id) ON DELETE CASCADE,
    reaction_id     INT REFERENCES reactions(id),   -- NULL for job-level outputs (e.g., QC reports)
    file_category   TEXT NOT NULL,                  -- 'unique_bam', 'bigwig', 'smoothed_bigwig', 'bed', 'heatmap', 'fastqc', 'frip', 'annotation', 'log', etc.
    filename        TEXT NOT NULL,
    file_path       TEXT NOT NULL,
    file_type       TEXT,                           -- extension: 'bam', 'bai', 'bw', 'bed', 'png', 'csv', 'html', etc.
    file_size_bytes BIGINT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Notifications
CREATE TABLE notifications (
    id              SERIAL PRIMARY KEY,
    user_id         INT REFERENCES users(id) ON DELETE CASCADE,
    type            TEXT NOT NULL,                  -- 'job_complete', 'job_error', 'project_invitation'
    title           TEXT NOT NULL,
    message         TEXT NOT NULL,
    link_target     TEXT,                           -- URL path to navigate to on click
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

### Key Schema Notes

- **`analysis_jobs.params` (JSONB)** stores all job-specific configuration without requiring per-job-type tables. For example, an alignment job's params might look like:
  ```json
  {
    "reaction_ids": [1, 2, 3, 4, 5],
    "reference_genome": "mm10",
    "remove_duplicates": true,
    "remove_dac_exclusion": true,
    "bam_coverage_bin_size": 20,
    "smoothed_bin_size": 100
  }
  ```
  A peak calling job's params:
  ```json
  {
    "alignment_job_id": 42,
    "reaction_ids": [2, 3, 4, 5],
    "igg_control_reaction_id": 1,
    "peak_caller": "macs2",
    "peak_size": "narrow",
    "reference_genome": "mm10"
  }
  ```
  This keeps the schema stable as new pipeline stages are added.

- **`parent_job_id`** encodes the dependency chain (peak calling depends on alignment, DiffBind depends on peak calling + alignment).

- **`job_outputs`** links produced files back to both the job and (optionally) the specific reaction, enabling the per-reaction file browsing that CUTANA Cloud provides.

---

## 5. File Storage Layout

All experiment data lives on local disk under a structured root directory:

```
/data/cutana-clone/
├── uploads/                          # tus upload staging area (in-progress uploads)
├── projects/
│   └── {project_id}/
│       └── {experiment_id}/
│           ├── fastqs/               # uploaded/imported FASTQ files
│           │   ├── raw/              # original uploads
│           │   └── trimmed/          # post-trimming output (if trimmed)
│           ├── fastqc/               # FastQC HTML reports
│           ├── jobs/
│           │   └── {job_id}/         # all outputs for a specific analysis job
│           │       ├── bams/
│           │       ├── bigwigs/
│           │       ├── beds/
│           │       ├── heatmaps/
│           │       ├── annotations/
│           │       ├── qc/
│           │       └── logs/
│           └── igv_cache/            # cached files optimized for IGV.js serving
```

### Storage Lifecycle

Intermediate files are the primary storage consumers. Policy (configurable per-project):

| File Category | Retention | Rationale |
|---|---|---|
| Final unique BAMs | Kept until manual delete | Primary analysis output, input to peak calling. |
| Intermediate BAMs (pre-filter stages) | Auto-delete after 7 days post-job-completion | Regenerable from FASTQs. |
| bigWigs (smoothed + unsmoothed) | Kept until manual delete | Needed for IGV and heatmaps. |
| BED files, annotations | Kept until manual delete | Small files, primary peak calling output. |
| Trimming artifacts | Auto-delete after job completion | Only trimmed FASTQs are needed downstream. |
| Raw FASTQs | Kept until manual delete | Source data; user responsible for backups. |
| FastQC reports | Kept until manual delete | Small HTML files. |
| Pipeline logs | Auto-delete after 30 days | Useful for debugging, not long-term. |

A nightly cron job (or worker task) enforces retention policies and updates `experiments.storage_size`.

### File Serving Strategy

- **Small files** (QC reports, CSVs, PNGs, BED files): Served directly by FastAPI.
- **Large files** (BAMs, bigWigs, FASTQs): Served by NGINX via `X-Accel-Redirect`. FastAPI checks auth/permissions, then returns a response header pointing NGINX to the file on disk. This keeps the Python process free while NGINX efficiently streams the file.
- **IGV.js data**: IGV.js requests byte ranges of bigWig/BAM files. NGINX handles `Range` requests natively, so files are served without loading them fully into memory.

---

## 6. Pipeline Module Architecture

Each pipeline stage is a Python module under `pipelines/` exposing a standard interface:

```
backend/
├── pipelines/
│   ├── __init__.py           # dispatch: run(job_type, params) → result
│   ├── base.py               # PipelineStage base class, logging, subprocess helpers
│   ├── fastqc.py             # Stage 0: FastQC report generation
│   ├── trimming.py           # Stage 1: Adapter trimming (auto-detect + user override)
│   ├── alignment.py          # Stage 2: Bowtie2 alignment + post-processing
│   ├── bigwig.py             # Stage 3: deepTools bamCoverage (called by alignment, but separable)
│   ├── peak_calling.py       # Stage 4: MACS2 / SICER2 / SEACR
│   ├── annotation.py         # Stage 5: HOMER peak annotation
│   ├── heatmaps.py           # Stage 6: deepTools computeMatrix + plotHeatmap
│   ├── diffbind.py           # Stage 7: DiffBind (R subprocess)
│   ├── normalization.py      # Stage 8: Roman normalization (R subprocess, mouse only)
│   ├── correlation.py        # Stage 9: Pearson correlation matrix
│   └── methods_text.py       # Auto-generates methods paragraph from job params + tool versions
```

### Standard Module Interface

```python
class PipelineStage:
    """Base class for all pipeline stages."""

    def validate(self, params: dict) -> list[str]:
        """Validate params before execution. Returns list of error messages (empty = valid)."""
        ...

    def run(self, job_id: int, params: dict, working_dir: Path) -> PipelineResult:
        """Execute the pipeline stage. Updates job status in DB during execution."""
        ...

    def generate_methods_text(self, params: dict) -> str:
        """Generate manuscript-ready methods text for this stage."""
        ...
```

Each module calls external tools via `subprocess.run()`, captures stdout/stderr to log files in the job's output directory, and raises `PipelineError` on non-zero exit codes.

### Trimming Pipeline (New — Not in CUTANA Cloud)

The trimming stage is the primary gap being filled. The lab's `integrated.sh` reveals a **two-stage trimming process**:

**Stage 1 — Trimmomatic** (adapter + quality trimming):
- Tool: Trimmomatic (Java JAR, PE mode)
- Adapters: `Truseq3.PE.fa` (Illumina TruSeq3 paired-end) with `ILLUMINACLIP:2:15:4:4:true`
- Quality filters: `LEADING:20 TRAILING:20 SLIDINGWINDOW:4:15 MINLEN:25`
- Threading: 16 threads (parameterize based on instance CPU count)
- Encoding: phred33
- Produces: paired + unpaired output FASTQs (only paired used downstream)

**Stage 2 — `kseq_test`** (fixed-length trim):
- Tool: `kseq_test` (from CUTRUNTools, a C-based FASTQ length trimmer)
- Reads a target length from a `length` file in the working directory
- Trims all reads to exactly that length (likely 50 bp for standard 2×50 CUT&RUN)
- Purpose: Normalizes read lengths across samples for consistent alignment behavior
- **Open question**: Need to confirm typical `length` value and whether it varies per experiment (see Q9 in Open Questions)

**Clone implementation flow**:
1. **Post-upload**: FastQC runs automatically on all uploaded FASTQs.
2. **Adapter detection**: Parse FastQC output for the "Adapter Content" module. Flag files where adapter contamination exceeds a threshold (e.g., >5% at any base position).
3. **User notification**: Frontend displays: "Adapters detected in N/M files — trimming recommended" with options:
   - **Trim (recommended)** — runs trimming with default parameters.
   - **Skip** — proceed to alignment with untrimmed FASTQs.
   - **Configure** — expose trim parameters (adapter file, quality thresholds, target length, MINLEN).
4. **Execution**: Runs Trimmomatic (stage 1) → `kseq_test` (stage 2). Writes trimmed FASTQs to `fastqs/trimmed/`. Updates `fastq_files` table entries to point to trimmed versions.
5. **Post-trim FastQC**: Re-runs FastQC on trimmed files for verification.

**Default parameters** (from lab script, exposed as configurable in Advanced Settings):

| Parameter | Default | Description |
|---|---|---|
| Adapter file | `Truseq3.PE.fa` | Illumina TruSeq3 PE adapters |
| ILLUMINACLIP | `2:15:4:4:true` | seed mismatches : palindrome threshold : simple threshold : min adapter length : keep both reads |
| LEADING | 20 | Cut bases from read start below quality 20 |
| TRAILING | 20 | Cut bases from read end below quality 20 |
| SLIDINGWINDOW | 4:15 | Window size 4, required quality 15 |
| MINLEN | 25 | Discard reads shorter than 25 bp after trimming |
| Target length (kseq) | 42 | Fixed-length trim in stage 2 — trims all reads to exactly 42 bp |

**Dependency note**: Trimmomatic requires Java. Add `openjdk-17-jre` (or similar) to the instance setup. The `kseq_test` binary needs to be compiled from the CUTRUNTools source or copied from the lab instance.

### Peak Caller Support Matrix

The clone supports three peak callers (vs. CUTANA Cloud's two):

| Peak Caller | Mode | Targets | Threshold | Source |
|---|---|---|---|---|
| **MACS2** | Narrow | H3K4me3, H3K4me1, CTCF, TFs | q-value 0.05 | CUTANA Cloud + Lab |
| **MACS2** | Broad | Me-CUT&RUN (methylation marks) | q-value 0.05 (broad) | Lab only |

### Alignment Parameters (from `integrated.sh`)

The lab script confirms the following Bowtie2 invocation:

```
bowtie2 -p 16 --dovetail --phred33 -x <genome_index> -1 <R1_trimmed> -2 <R2_trimmed>
```

Key flags:
- **`--dovetail`**: Allows mates to extend past each other. Critical for CUT&RUN/CUT&Tag where enzymatic cleavage can produce very short fragments where R1 and R2 overlap significantly.
- **`-p 16`**: 16 threads. Parameterize in the clone based on instance vCPU count.
- **`--phred33`**: Standard Illumina quality encoding.

Post-alignment (from the script): SAM → BAM conversion via `samtools view -bS -@ 16`, then SAM file is deleted to save space. The remaining filtering steps (multi-mapper removal, DAC exclusion list, duplicate removal) are handled in subsequent pipeline stages, consistent with CUTANA Cloud's approach.

**Resource note from Slurm headers**: The script requests `--mem=32000` (32 GB RAM) and 12 hours max runtime on a single node. This confirms the `t3.xlarge` (16 GB) may be tight for alignment — a `t3.2xlarge` (32 GB, 8 vCPU) might be more appropriate. To be validated during benchmarking on the existing lab instance.
| **SICER2** | Broad | H3K27me3, other diffuse marks | FDR 0.01 | CUTANA Cloud |
| **SEACR** | Stringent | General CUT&RUN (lab default) | Empirical threshold | Lab only |
| **SEACR** | Relaxed | Exploratory / low-signal | Empirical threshold | Lab only |

The Peak Calling Settings UI should expose all five options in a single dropdown (or two dropdowns: caller + mode).

---

## 7. API Design (High-Level)

RESTful API under `/api/v1/`. All endpoints require JWT auth except `/api/v1/auth/*`.

### Auth
```
POST   /api/v1/auth/login          → { access_token, refresh_token }
POST   /api/v1/auth/refresh         → { access_token }
POST   /api/v1/auth/register        → { user }
```

### Users
```
GET    /api/v1/users/me             → user profile
PATCH  /api/v1/users/me             → update profile (name, notification prefs)
```

### Projects
```
GET    /api/v1/projects             → list projects (filterable by status, member, date)
POST   /api/v1/projects             → create project
GET    /api/v1/projects/:id         → project detail + experiments summary
PATCH  /api/v1/projects/:id         → update project metadata
DELETE /api/v1/projects/:id         → delete project (admin only)
```

### Project Members
```
GET    /api/v1/projects/:id/members
POST   /api/v1/projects/:id/members         → invite member
PATCH  /api/v1/projects/:id/members/:uid    → change role
DELETE /api/v1/projects/:id/members/:uid    → remove member
```

### Experiments
```
GET    /api/v1/projects/:pid/experiments
POST   /api/v1/projects/:pid/experiments     → create experiment (step 1: details)
GET    /api/v1/experiments/:id               → full experiment detail
PATCH  /api/v1/experiments/:id               → update metadata
DELETE /api/v1/experiments/:id
```

### FASTQ Files
```
GET    /api/v1/experiments/:id/fastqs        → list FASTQ files
POST   /api/v1/experiments/:id/fastqs/upload → initiate tus upload
DELETE /api/v1/experiments/:id/fastqs/:fid
GET    /api/v1/fastqs/:fid/fastqc           → FastQC report data
```

### Reactions
```
GET    /api/v1/experiments/:id/reactions
POST   /api/v1/experiments/:id/reactions     → create/bulk-create from CSV
PATCH  /api/v1/experiments/:id/reactions/:rid
DELETE /api/v1/experiments/:id/reactions/:rid
POST   /api/v1/experiments/:id/reactions/import-csv  → upload CSV reaction sheet
GET    /api/v1/experiments/:id/reactions/template     → download CSV template
```

### Analysis Jobs
```
POST   /api/v1/experiments/:id/jobs          → submit new job (alignment, peak calling, etc.)
GET    /api/v1/experiments/:id/jobs           → list jobs for experiment
GET    /api/v1/jobs/:jid                      → job detail (status, params, methods text)
GET    /api/v1/jobs/:jid/outputs              → list output files
GET    /api/v1/jobs/:jid/qc-report            → QC report data (structured JSON for frontend rendering)
DELETE /api/v1/jobs/:jid                       → terminate running job / delete completed job
```

### Files
```
GET    /api/v1/jobs/:jid/files/:fid/download  → download file (via X-Accel-Redirect)
GET    /api/v1/experiments/:id/files           → full file tree (All Files tab)
POST   /api/v1/experiments/:id/files/batch-download → zip + download selected files
```

### Real-Time
```
GET    /api/v1/jobs/:jid/status-stream        → SSE endpoint for job status updates
GET    /api/v1/notifications/stream            → SSE endpoint for user notifications
```

### Analysis Queue (Cross-Project)
```
GET    /api/v1/jobs                            → all jobs across projects (filterable, paginated)
```

---

## 8. Frontend Architecture

### Route Structure

```
/                               → Home (Projects Dashboard)
/projects/:id                   → Project Detail (Experiments Table)
/projects/:id/members           → Manage Members (modal, but could be a route)
/experiments/:id                → Experiment View (tabbed)
/experiments/:id/description    → Description tab
/experiments/:id/fastqs         → FASTQs tab
/experiments/:id/reactions      → Reactions tab
/experiments/:id/alignment/:jid → Alignment tab (sub-tabs: Info, Input, QC, Files, IGV)
/experiments/:id/peaks/:jid     → Peak Calling tab (sub-tabs: Info, Input, QC, Files, IGV)
/experiments/:id/history        → History tab
/experiments/:id/files          → All Files tab
/queue                          → Analysis Queue (cross-project job list)
/settings                       → Account Settings
```

### State Management

- **Server state**: TanStack Query (React Query). All API data fetched/cached/invalidated through query keys. Job status updates via SSE invalidate relevant queries automatically.
- **Local UI state**: React `useState`/`useReducer` for form state, modal visibility, table filters. No need for a global store (Redux, Zustand) at this scale.

### Key Frontend Components

| Component | Notes |
|---|---|
| `DataTable` | Reusable wrapper around TanStack Table. Column sort, filter dropdowns, search, pagination, column customization toggle, full-screen mode, CSV download. Used on almost every page. |
| `WizardModal` | Multi-step modal (numbered steps connected by lines). Used for: New Experiment (3 steps), New Alignment (3 steps), New Peak Calling (4 steps), FASTQ upload, Reactions edit. |
| `FileUploader` | tus-js-client integration. Drag-and-drop zone, progress bars per file, resume on failure, cancel support. |
| `IgvViewer` | Wrapper around `igv.js`. Reaction selector, genome dropdown, track configuration. Lazy-loads tracks only when user selects reactions. |
| `QcReport` | Renders alignment and peak calling QC data: stat tables, heatmap images, stacked bar charts (peak annotation). Uses Recharts or similar for the charts. |
| `JobStatusBadge` | Colored dot + status text component. Subscribes to SSE for live updates. |
| `NotificationPanel` | Dropdown from bell icon. Fetches from notifications API. SSE for real-time new notifications. |

### Design System

Replicate CUTANA Cloud's visual language:

- Gradient background (sky blue → seafoam → lime → gold/amber) applied to `body` or root container.
- White card containers with rounded corners and subtle box shadows as the primary layout unit.
- Primary blue (`#4AAED9`) for interactive elements, links, table headers.
- Status color system: green (complete), blue (new), cyan (in progress), red (error), gray (terminated).
- Pill-shaped buttons: solid fill for primary actions, outlined for secondary.
- The gradient + white cards aesthetic is distinctive enough to be worth replicating — it's a strong visual identity.

---

## 9. Authentication & Authorization

### Auth Flow

1. User registers with email + password. Password hashed with bcrypt (cost factor 12).
2. Login returns JWT access token (short-lived, 15 min) + refresh token (long-lived, 7 days, stored in httpOnly cookie).
3. All API requests include `Authorization: Bearer <access_token>`.
4. FastAPI dependency (`get_current_user`) validates JWT on every protected endpoint.
5. Refresh endpoint issues new access token using refresh cookie.

### Authorization Model

Two levels:

1. **Project-level roles** (`project_members.role`):
   - **Admin**: Full CRUD on project, experiments, members, jobs. Can change others' roles.
   - **Contributor**: Can create experiments, upload FASTQs, run analyses, download files. Cannot manage members or delete the project. Copy/download/delete permissions configurable per-user.
   - **Viewer**: Read-only access to project data and files.

2. **Endpoint-level checks**: FastAPI dependencies check project membership + role before allowing operations. E.g., `require_project_role(project_id, ['admin'])` for member management endpoints.

---

## 10. Deployment & Infrastructure

### EC2 Instance

- **Recommended size**: `t3.xlarge` (4 vCPU, 16 GB RAM) as a starting point. Benchmark a single Bowtie2 alignment run and adjust.
- **Storage**: GP3 EBS volume, sized to expected data volume. Start with 500 GB; monitor usage via the app's storage reporting.
- **OS**: Ubuntu 22.04 LTS.

### Instance Setup

1. Install system packages: PostgreSQL, NGINX, Python 3.11+, Node.js (for building frontend), Java (OpenJDK 17+ for Trimmomatic), conda (for bioinformatics tools).
2. Create conda environment for pipeline tools: Bowtie2, SAMtools, BEDTools, Picard, deepTools, MACS2, SICER2, SEACR, HOMER, FastQC, Trim Galore/Cutadapt, R + DiffBind.
3. Clone app repo to `/opt/cutana-clone/` (or similar).
4. Set up PostgreSQL database and run migrations.
5. Build frontend (`npm run build` in `frontend/`), output to NGINX static directory.
6. Configure NGINX: TLS (Cloudflare origin cert or Let's Encrypt), static file serving, proxy to Uvicorn, tus upload path, `X-Accel-Redirect` for file downloads.
7. Create systemd units: `cutana-api.service` (Uvicorn), `cutana-worker.service` (worker process).
8. Start services, verify.

### NGINX Config (Sketch)

```nginx
server {
    listen 443 ssl;
    server_name cutana.example.com;

    ssl_certificate     /etc/ssl/cloudflare-origin.pem;
    ssl_certificate_key /etc/ssl/cloudflare-origin-key.pem;

    # Static frontend
    location / {
        root /opt/cutana-clone/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # SSE — disable buffering
    location /api/v1/jobs/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
    }

    # tus uploads
    location /uploads/ {
        proxy_pass http://127.0.0.1:8000;
        client_max_body_size 0;          # no limit for chunked uploads
        proxy_request_buffering off;
    }

    # File downloads via X-Accel-Redirect
    location /internal-files/ {
        internal;
        alias /data/cutana-clone/projects/;
    }
}
```

---

## 11. Local Development Workflow

### Docker Compose (Local Dev)

```yaml
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: cutana
      POSTGRES_USER: cutana
      POSTGRES_PASSWORD: dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  api:
    build: ./backend
    command: uvicorn main:app --reload --host 0.0.0.0 --port 8000
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
      - ./dev-data:/data/cutana-clone    # local file storage
    environment:
      DATABASE_URL: postgresql://cutana:dev@db:5432/cutana
      PIPELINE_MODE: mock                 # stub pipeline calls locally
    depends_on:
      - db

volumes:
  pgdata:
```

### Pipeline Mocking

When `PIPELINE_MODE=mock`, pipeline modules return canned results after a short delay instead of calling real tools. This allows full frontend/API development without bioinformatics tools installed. Real pipeline testing happens on the EC2 instance.

```python
# pipelines/base.py
class PipelineStage:
    def run(self, job_id, params, working_dir):
        if settings.PIPELINE_MODE == 'mock':
            return self.mock_run(job_id, params, working_dir)
        return self.real_run(job_id, params, working_dir)
```

---

## 12. Implementation Order

Phased approach — each phase produces a usable increment:

### Phase 1: Foundation (Web App Shell)
- [ ] Project scaffolding: FastAPI backend, React frontend, Docker Compose, DB migrations.
- [ ] Auth system: register, login, JWT, protected routes.
- [ ] Project CRUD: create, list, detail, update, delete.
- [ ] Project member management: invite, roles, permissions.
- [ ] Experiment CRUD: create wizard (step 1 — details only), list, detail.
- [ ] Basic UI: gradient background, card layout, nav bar, breadcrumbs, data tables.
- [ ] Notification system (DB + API + frontend panel).

### Phase 2: Data Management
- [ ] FASTQ upload via tus protocol (chunked, resumable).
- [ ] FastQC auto-generation post-upload.
- [ ] FastQC report viewer (modal).
- [ ] Reactions table: manual entry + CSV upload/download.
- [ ] Adapter detection from FastQC → trimming recommendation UI.
- [ ] Trimming pipeline stage.
- [ ] File browser (All Files tab).
- [ ] File download (individual + batch).

### Phase 3: Core Pipeline
- [ ] Worker process + job queue infrastructure.
- [ ] SSE for real-time job status updates.
- [ ] Alignment pipeline: Bowtie2 + SAMtools + BEDTools + Picard + deepTools.
- [ ] Alignment wizard UI (3 steps).
- [ ] Alignment QC report (stats table, spike-in heatmap, TSS/gene body heatmaps).
- [ ] Alignment file browser (BAMs, bigWigs, heatmaps, FastQC).
- [ ] Auto-generated methods text.
- [ ] Analysis Queue page.
- [ ] Email notifications on job completion.

### Phase 4: Peak Calling
- [ ] Peak calling pipeline: MACS2 narrow + broad, SICER2, SEACR stringent + relaxed.
- [ ] Peak calling wizard UI (4 steps).
- [ ] IgG control assignment UI.
- [ ] Peak calling QC report (FRiP, peak annotation stacked bar chart, top peaks).
- [ ] Peak calling file browser (BED, FRiP, annotation, stats).
- [ ] HOMER annotation integration.
- [ ] Blacklist subtraction (post-peak-calling, lab-style).

### Phase 5: Visualization
- [ ] IGV.js integration (Alignment + Peak Calling tabs).
- [ ] Reaction selector for IGV tracks.
- [ ] Per-track configuration (scale, color, display mode).
- [ ] Save Image export from IGV.

### Phase 6: Lab-Specific Extensions
- [ ] DiffBind: sample sheet builder UI, condition/replicate assignment, R subprocess execution, results visualization (volcano plots, MA plots, heatmaps).
- [ ] Custom heatmaps: user-provided BED reference points (beyond preset TSS/gene body).
- [ ] Pearson correlation matrices: bigWig → pairwise correlation → heatmap visualization.
- [ ] Roman normalization: mouse-only, R subprocess, sample-to-sample normalization.

### Phase 7: Polish & QA
- [ ] Storage lifecycle management (auto-delete intermediate files, storage gauges).
- [ ] Gold Standard reference project (pre-loaded read-only data).
- [ ] Experiment history/audit log.
- [ ] Error handling, retry logic, graceful job termination.
- [ ] Instance deployment, NGINX config, systemd units, Cloudflare DNS.
- [ ] End-to-end testing with real lab data.

---

## 13. Open Questions

| #   | Question                                                          | Context                                                                                                                                                                                                          | Decision                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Which trimming tool does `integrated.sh` use?                     | Needed to determine trim module implementation.                                                                                                                                                                  | **Resolved: Trimmomatic** (Java JAR) with a second-stage fixed-length trim via `kseq_test`. See §6 Trimming Pipeline for full params.                                                                                                                             |
| 2   | What adapter sequences are used?                                  | Needed for trimming config.                                                                                                                                                                                      | **Resolved: Illumina TruSeq3 PE** (`Truseq3.PE.fa`). Adapter file lives at `/home/ubuntu/cutruntools/adapters/Truseq3.PE.fa` on the lab instance.                                                                                                                 |
| 3   | Backend framework for real-time: pure SSE or add WebSocket later? | SSE is sufficient for job status (server→client). No collaborative editing needed.                                                                                                                               | **SSE only.** No WebSocket needed for ~8–10 lab members.                                                                                                                                                                                                          |
| 4   | S3 backup for file durability?                                    | Local disk is a single point of failure. S3 sync would add resilience.                                                                                                                                           | **Defer.** Implement local-first, add async S3 sync as a later enhancement.                                                                                                                                                                                       |
| 5   | Exact EC2 instance type?                                          | Need to benchmark alignment memory/CPU usage to right-size. `t3.xlarge` (4 vCPU, 16 GB) is the starting hypothesis. Script requests 32 GB via Slurm — may need a larger instance or memory-aware job scheduling. | **TBD** — will test on existing larger lab instance first, then migrate to a right-sized dedicated instance.                                                                                                                                                      |
| 6   | Domain name?                                                      | Needed for Cloudflare DNS + TLS setup.                                                                                                                                                                           | **Resolved: `coleferguson.com`** — low priority, end-of-project task.                                                                                                                                                                                             |
| 7   | Multi-user concurrency model?                                     | How many lab members will use this simultaneously? Affects worker concurrency and instance sizing.                                                                                                               | **Resolved: ~8–10 lab members.** Single-job worker is fine; unlikely to have more than 1–2 concurrent analysis requests.                                                                                                                                          |
| 8   | DiffBind output bug workaround                                    | Lab notes a known bug where the top row of output is missing column names. Build the fix into the pipeline module, or wait for an upstream DiffBind fix?                                                         | **Build it in** — add header row programmatically post-execution.                                                                                                                                                                                                 |
| 9   | `kseq_test` second-stage trim — what length?                      | `integrated.sh` reads from a `length` file in the working directory.                                                                                                                                             | **Resolved: 42 bp.** The `length` file contains `42`. This is shorter than the expected 50 bp for 2×50 sequencing — likely accounts for adapter/quality trimming losses. The clone should default to 42 but allow user override.                                  |
| 10  | Trimmomatic adapter file                                          | Need a copy of `Truseq3.PE.fa` from the lab instance for the clone's trimming module.                                                                                                                            | **Resolved.** Adapter files copied from `/home/ubuntu/cutruntools/adapters/`. All four files secured: `Truseq3.PE.fa` (260 B, primary), `Truseq3.SE.fa`, `NexteraPE-PE.fa`, `TruSeqAdapters.fa`. Ship all four with the clone to support different library preps. |
