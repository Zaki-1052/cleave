# Cleave — Technical Specification

> **Status**: Living Document — reflects the system as built through Phase 9
> **Last updated**: 2026-03-29
> **Author**: Zakir Alibhai
> **Supersedes**: `cutana-architecture-plan.md`, `PLAN.md`, `cleave-spec-decisions.md`, `todos.md`

Self-hosted CUT&RUN/CUT&Tag bioinformatics platform for the Ferguson Lab at UCSD. Replicates EpiCypher's CUTANA Cloud and extends it with lab-specific pipeline features. Single EC2 instance, ~8-10 users. 500+ backend tests passing.

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        EC2 Instance                         │
│                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │  NGINX   │───▶│  Uvicorn     │───▶│   PostgreSQL 15  │   │
│  │ :80/:443 │    │  (FastAPI)   │    │     :5432        │   │
│  │          │    │  :8000       │    │                  │   │
│  └──────────┘    └──────┬───────┘    └────────┬─────────┘   │
│       │                 │                     │             │
│       │          SSE connections         poll / write       │
│       │                 │                     │             │
│  Static assets   ┌──────┴────────┐     ┌──────┴──────┐     │
│  (React build)   │ tus upload    │     │   Worker    │     │
│                  │ endpoint      │     │  (async)    │     │
│                  └───────────────┘     └──────┬──────┘     │
│                                              │            │
│                                       ┌──────┴───────┐    │
│                                       │  Pipeline    │    │
│                                       │  Modules     │    │
│                                       │ (subprocess) │    │
│                                       └──────┬───────┘    │
│                                              │            │
│                                       ┌──────┴───────┐    │
│                                       │  Local Disk  │    │
│                                       │  /data/...   │    │
│                                       └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Request Flow

1. Browser loads React SPA from NGINX (static files).
2. API calls proxied via NGINX to Uvicorn (FastAPI) at `/api/v1/*`.
3. FASTQ uploads use tus protocol (chunked/resumable) or FTP/SFTP server import.
4. Job submission writes a row to `analysis_jobs` with status `queued`.
5. Worker polls `analysis_jobs`, picks up queued jobs, runs pipeline modules via subprocess, updates status.
6. SSE endpoint pushes job status changes and notifications to connected clients (2s poll).
7. Large file downloads served via NGINX `X-Accel-Redirect` in production; FastAPI checks auth only.

### Docker Compose Services (Local Dev)

| Service | Image/Build | Port | Purpose |
|---------|------------|------|---------|
| `db` | `postgres:15` | 5432 | PostgreSQL database |
| `api` | `./backend` | 8000 | FastAPI with hot-reload |
| `worker` | `./backend` | -- | Job queue processor (same image, `python worker.py`) |
| `frontend` | `node:20-slim` | 5173 | Vite dev server |

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 (Vite), TypeScript, Tailwind CSS, shadcn/ui (Radix), TanStack Table + Query, Recharts, IGV.js, tus-js-client, lucide-react, next-themes, sonner |
| Backend | FastAPI (Python 3.11+), Uvicorn, SQLAlchemy 2.0 (async), Alembic, Pydantic v2, tuspyserver, aioftp, asyncssh |
| Database | PostgreSQL 15+ (asyncpg driver) |
| Auth | fastapi-users (JWT 30-min access + httpOnly 7-day refresh cookie), Argon2, slowapi rate limiting |
| Pipeline | Python worker process calling Bowtie2, SAMtools, BEDTools, Picard, deepTools, MACS2, SICER2, SEACR, HOMER, Trimmomatic, DiffBind (R) via subprocess |
| Real-time | SSE with `@microsoft/fetch-event-source` (JWT in Authorization header) |
| Prod | NGINX reverse proxy, systemd, single EC2 instance |

---

## 3. Database Schema

11 tables managed via 13 Alembic migrations. All timestamps use `TIMESTAMPTZ DEFAULT now()`.

### Entity Relationships

```
users
├── projects (created_by FK)
├── project_members (user_id FK)
├── notifications (user_id FK)
├── saved_servers (user_id FK)
└── experiment_events (user_id FK, SET NULL on delete)

projects
├── project_members (project_id FK, CASCADE)
└── experiments (project_id FK, CASCADE)

experiments
├── fastq_files (experiment_id FK, CASCADE)
├── reactions (experiment_id FK, CASCADE)
├── analysis_jobs (experiment_id FK, CASCADE)
└── experiment_events (experiment_id FK, CASCADE)

analysis_jobs
├── job_outputs (job_id FK, CASCADE)
├── parent_job (self-referential FK via parent_job_id)
└── retry_of_job (self-referential FK via retry_of_job_id)

reactions
└── job_outputs (reaction_id FK, nullable)
```

### 3.1 users

Extends `SQLAlchemyBaseUserTable[int]` from fastapi-users.

| Column | Type | Constraints |
|--------|------|-------------|
| id | Integer | PK |
| email | String | UNIQUE, NOT NULL |
| hashed_password | String | NOT NULL |
| is_active | Boolean | NOT NULL, default true |
| is_superuser | Boolean | NOT NULL, default false |
| is_verified | Boolean | NOT NULL, default false |
| first_name | String | nullable |
| last_name | String | nullable |
| email_notifications | String | NOT NULL, default "always" |
| password_changed_at | DateTime(tz) | nullable |
| created_at | DateTime(tz) | NOT NULL, server_default=now() |

### 3.2 projects

| Column | Type | Constraints |
|--------|------|-------------|
| id | Integer | PK |
| name | String | NOT NULL |
| description | String | nullable |
| created_by | Integer | FK(users.id) |
| storage_bytes | BigInteger | NOT NULL, default 0 |
| is_reference | Boolean | NOT NULL, default false |
| is_training | Boolean | NOT NULL, default false |
| status | String | NOT NULL, default "new" |
| created_at | DateTime(tz) | server_default=now() |
| updated_at | DateTime(tz) | server_default=now(), onupdate=now() |

### 3.3 project_members

| Column | Type | Constraints |
|--------|------|-------------|
| project_id | Integer | PK, FK(projects.id, CASCADE) |
| user_id | Integer | PK, FK(users.id, CASCADE) |
| role | String | NOT NULL, default "contributor" |
| can_download | Boolean | default true |
| can_delete | Boolean | default false |
| invited_by | Integer | FK(users.id), nullable |
| created_at | DateTime(tz) | server_default=now() |

Roles: `admin`, `contributor`, `viewer`.

### 3.4 experiments

| Column | Type | Constraints |
|--------|------|-------------|
| id | Integer | PK |
| project_id | Integer | FK(projects.id, CASCADE), NOT NULL |
| name | String(100) | NOT NULL |
| assay_type | String | NOT NULL |
| description | String | nullable |
| status | String | NOT NULL, default "new" |
| created_by | Integer | FK(users.id) |
| storage_bytes | BigInteger | NOT NULL, default 0 |
| auto_pipeline | Boolean | NOT NULL, default false |
| auto_pipeline_status | String | nullable |
| auto_pipeline_config | JSON | nullable |
| created_at | DateTime(tz) | server_default=now() |
| updated_at | DateTime(tz) | server_default=now(), onupdate=now() |

Status enums: `new`, `in_progress`, `complete`, `error`, `terminated`.

### 3.5 fastq_files

| Column | Type | Constraints |
|--------|------|-------------|
| id | Integer | PK |
| experiment_id | Integer | FK(experiments.id, CASCADE), NOT NULL |
| filename | String | NOT NULL |
| prefix | String | NOT NULL |
| read_direction | String | NOT NULL ("R1"/"R2") |
| file_size_bytes | BigInteger | nullable |
| total_reads | BigInteger | nullable (populated by FastQC) |
| file_path | String | NOT NULL (relative to STORAGE_ROOT) |
| is_trimmed | Boolean | default false |
| adapter_status | String | nullable ("pass"/"warn"/"fail") |
| fastqc_report_path | String | nullable |
| upload_source | String | nullable ("local"/"server"/"instance"/"trimming") |
| is_symlink | Boolean | NOT NULL, default false |
| uploaded_at | DateTime(tz) | server_default=now() |

### 3.6 reactions

| Column | Type | Constraints |
|--------|------|-------------|
| id | Integer | PK |
| experiment_id | Integer | FK(experiments.id, CASCADE), NOT NULL |
| fastq_prefix | String | NOT NULL |
| short_name | String | NOT NULL |
| organism | String | NOT NULL |
| assay_type | String | NOT NULL |
| cutana_spike_in | String | default "None" |
| cutana_spike_in_target | String | nullable |
| ecoli_spike_in | Boolean | default false |
| cell_type, cell_number, sample_prep, experimental_condition | String | nullable |
| antibody_vendor, antibody_cat_no, antibody_lot_no | String | nullable |
| cutana_spike_in_2, cutana_spike_in_target_2 | String | nullable |

**Unique constraint**: `(experiment_id, organism, short_name)`.

### 3.7 analysis_jobs

| Column | Type | Constraints |
|--------|------|-------------|
| id | Integer | PK |
| experiment_id | Integer | FK(experiments.id, CASCADE), NOT NULL |
| job_type | String | NOT NULL |
| name | String(30) | NOT NULL |
| notes | String | nullable |
| status | String | default "queued" |
| params | JSON | NOT NULL, default {} |
| parent_job_id | Integer | FK(analysis_jobs.id), nullable |
| launched_by | Integer | FK(users.id) |
| started_at | DateTime(tz) | nullable |
| completed_at | DateTime(tz) | nullable |
| duration_seconds | Integer | nullable |
| error_message | String | nullable |
| methods_text | String | nullable |
| termination_requested_at | DateTime(tz) | nullable |
| retry_of_job_id | Integer | FK(analysis_jobs.id), nullable |
| auto_pipeline | Boolean | default false |
| created_at | DateTime(tz) | server_default=now() |

Job types: `trimming`, `alignment`, `peak_calling`, `diffbind`, `custom_heatmap`, `pearson_correlation`, `roman_normalization`.
Status enums: `queued`, `running`, `complete`, `error`, `terminated`.

### 3.8 job_outputs

| Column | Type | Constraints |
|--------|------|-------------|
| id | Integer | PK |
| job_id | Integer | FK(analysis_jobs.id, CASCADE), NOT NULL |
| reaction_id | Integer | FK(reactions.id), nullable |
| file_category | String | NOT NULL |
| filename | String | NOT NULL |
| file_path | String | NOT NULL (relative to STORAGE_ROOT) |
| file_type | String | nullable (extension) |
| file_size_bytes | BigInteger | nullable |
| created_at | DateTime(tz) | server_default=now() |

### 3.9 notifications

| Column | Type | Constraints |
|--------|------|-------------|
| id | Integer | PK |
| user_id | Integer | FK(users.id, CASCADE), NOT NULL |
| type | String | NOT NULL |
| title | String | NOT NULL |
| message | String | NOT NULL |
| link_target | String | nullable |
| is_read | Boolean | default false |
| created_at | DateTime(tz) | server_default=now() |

### 3.10 experiment_events

| Column | Type | Constraints |
|--------|------|-------------|
| id | Integer | PK |
| experiment_id | Integer | FK(experiments.id, CASCADE), NOT NULL |
| user_id | Integer | FK(users.id, SET NULL), nullable |
| action | String(50) | NOT NULL |
| resource_type | String(50) | nullable |
| resource_id | Integer | nullable |
| detail | String | nullable |
| created_at | DateTime(tz) | server_default=now() |

### 3.11 saved_servers

| Column | Type | Constraints |
|--------|------|-------------|
| id | Integer | PK |
| user_id | Integer | FK(users.id, CASCADE), NOT NULL |
| name | String | NOT NULL |
| protocol | String | NOT NULL ("ftp"/"sftp") |
| host | String | NOT NULL |
| port | Integer | nullable |
| username | String | NOT NULL |
| encrypted_password | String | NOT NULL (Fernet AES-128-CBC) |
| default_path | String | server_default "/" |
| created_at | DateTime(tz) | server_default=now() |
| updated_at | DateTime(tz) | server_default=now(), onupdate=now() |

**Unique constraint**: `(user_id, name)`.

---

## 4. Authentication & Authorization

### Auth Flow

1. User registers with email + password. Password hashed with Argon2 via `pwdlib`.
2. Login returns JWT access token (30-min, Bearer header) + refresh token (7-day, httpOnly cookie, `SameSite=Lax`, `Secure=true` in prod).
3. All API requests include `Authorization: Bearer <access_token>`.
4. `current_active_user` dependency (from fastapi-users) validates JWT on every protected endpoint.
5. Refresh endpoint issues new access token using refresh cookie. Validates `password_changed_at` to invalidate tokens after password change.
6. Rate limiting: `/auth/login` (5/min per IP), `/auth/register` (3/min per IP), `/auth/refresh` (10/min per IP).
7. Password reset via email token (1h expiry, requires AWS SES).

### Authorization Model

Two levels:

1. **Project-level roles** (`project_members.role`):
   - **Admin**: Full CRUD on project, experiments, members, jobs. Can change others' roles.
   - **Contributor**: Can create experiments, upload FASTQs, run analyses, download files. Cannot manage members or delete the project.
   - **Viewer**: Read-only access to project data and files.

2. **Endpoint-level checks**: `require_project_role(roles)` dependency returns 404 for non-members, 403 for wrong role.

### File Download Auth

HMAC-SHA256 signed tokens for browser-native downloads and IGV.js byte-range requests:
- Download tokens: 5-min TTL, used for file downloads without JWT
- IGV tokens: 60-min TTL, used for genome browser track loading
- Format: `base64url(payload).base64url(signature)`
- Constant-time signature verification

### Credential Encryption

Saved FTP/SFTP server passwords encrypted at rest with Fernet (AES-128-CBC + HMAC). Key derived from `SECRET_KEY` via SHA-256 -> base64.

---

## 5. API Reference

71+ endpoints across 13 routers under `/api/v1/`. JWT required except auth and health endpoints.

### Auth & Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | No | Returns JWT + sets refresh cookie |
| POST | `/auth/register` | No | Creates account, returns JWT |
| POST | `/auth/refresh` | Cookie | Refreshes access token |
| POST | `/auth/logout` | No | Deletes refresh cookie |
| POST | `/auth/forgot-password` | No | Sends reset email (always returns 202) |
| POST | `/auth/reset-password` | No | Completes password reset |
| GET | `/users/me` | Yes | Current user profile |
| PATCH | `/users/me` | Yes | Update profile (partial) |

### Projects & Members

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/projects` | Yes | Paginated projects (member-filtered) |
| POST | `/projects` | Yes | Create project (creator = admin) |
| GET/PATCH/DELETE | `/projects/:id` | Yes | CRUD (delete = admin only) |
| GET | `/projects/:id/members` | Any role | List members |
| POST | `/projects/:id/members` | Admin | Invite by email |
| PATCH/DELETE | `/projects/:id/members/:uid` | Admin | Change role / remove |

### Experiments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/experiments` | Yes | List (filterable by `projectId`) |
| POST | `/experiments?projectId=` | Contributor+ | Create experiment |
| GET/PATCH/DELETE | `/experiments/:id` | Yes | CRUD |
| GET | `/experiments/:id/history` | Yes | Paginated audit log |
| POST | `/experiments/:id/auto-pipeline` | Contributor+ | Start one-click pipeline |
| POST | `/experiments/:id/auto-pipeline/cancel` | Contributor+ | Cancel auto-pipeline |
| POST | `/experiments/:id/auto-pipeline/retry` | Contributor+ | Retry failed step |

### FASTQs & Upload

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/experiments/:id/fastqs` | Yes | List FASTQs (paginated, up to 500) |
| POST | `/experiments/:id/fastqs/upload` | Contributor+ | Multipart upload (legacy) |
| POST/PATCH/DELETE/GET | `/experiments/:id/tus/*` | Contributor+ | tus v1.0.0 resumable upload |
| DELETE | `/experiments/:id/fastqs/:fid` | Contributor+ | Delete FASTQ + FastQC report |
| GET | `/experiments/:id/fastqs/:fid/fastqc` | Yes | FastQC HTML report |
| GET | `/experiments/:id/fastqs/:fid/fastqc-token` | Yes | Signed URL for iframe |
| GET | `/experiments/:id/fastqs/:fid/fastqc-summary` | Yes | Structured module summary |

### Reactions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/experiments/:id/reactions` | Yes | Paginated reactions |
| POST | `/experiments/:id/reactions` | Contributor+ | Create single |
| POST | `/experiments/:id/reactions/bulk` | Contributor+ | Bulk create from JSON |
| POST | `/experiments/:id/reactions/import-csv` | Contributor+ | CSV import (all-or-nothing) |
| GET | `/experiments/:id/reactions/template` | Yes | Download CSV template |
| GET | `/experiments/:id/reactions/prefixes` | Yes | Auto-detect FASTQ prefixes |
| PATCH/DELETE | `/experiments/:id/reactions/:rid` | Contributor+ | Update / delete |

### Analysis Jobs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/experiments/:id/jobs` | Contributor+ | Submit job (any type) |
| GET | `/experiments/:id/jobs` | Yes | List experiment jobs |
| GET | `/jobs` | Yes | Cross-project queue (filterable) |
| GET | `/jobs/:jid` | Yes | Job detail |
| PATCH | `/jobs/:jid` | Contributor+ | Update notes |
| POST | `/jobs/:jid/terminate` | Contributor+ | Terminate queued/running job |
| POST | `/jobs/:jid/retry` | Contributor+ | Retry failed/terminated job |
| GET | `/jobs/:jid/log-tail` | Yes | Last N lines of log |
| GET | `/jobs/:jid/outputs?category=` | Yes | List outputs (category filter) |
| GET | `/jobs/:jid/outputs/:oid/signed-url` | Yes | Signed URL for output |

### QC Reports & Pipeline Results

| Method | Path | Description |
|--------|------|-------------|
| GET | `/jobs/:jid/qc-report` | Alignment QC (JSON) |
| GET | `/jobs/:jid/qc-report/download` | Alignment metrics CSV |
| GET | `/jobs/:jid/peak-qc-report` | Peak calling QC (JSON) |
| GET | `/jobs/:jid/peak-qc-report/download` | Peak metrics CSV |
| GET | `/jobs/:jid/peak-qc-report/top-peaks-csv` | Top called peaks CSV |
| GET | `/jobs/:jid/peak-qc-report/annotation-csv` | Annotation percentages CSV |
| GET | `/jobs/:jid/diffbind-report` | DiffBind results (JSON) |
| GET | `/jobs/:jid/diffbind-report/download-results` | DiffBind TSV |
| GET | `/jobs/:jid/diffbind-report/download-counts` | Normalized counts CSV |
| GET | `/jobs/:jid/heatmap-report` | Custom heatmap report |
| GET | `/jobs/:jid/heatmap-report/download-matrix` | Heatmap matrix (.gz) |
| GET | `/jobs/:jid/pearson-report` | Pearson correlation report |
| GET | `/jobs/:jid/pearson-report/download-correlation` | Correlation matrix CSV |
| GET | `/jobs/:jid/pearson-report/download-coverage` | Coverage matrix CSV |
| GET | `/jobs/:jid/normalization-report` | Roman normalization report |
| GET | `/jobs/:jid/normalization-report/download-factors` | Normalization factors CSV |

### Files & Downloads

| Method | Path | Description |
|--------|------|-------------|
| GET | `/experiments/:id/files` | File tree (disk scan) |
| GET | `/experiments/:id/files/download?path=` | Single file download |
| POST | `/experiments/:id/files/batch-download` | Streaming zip |
| POST | `/jobs/:jid/files/batch-download` | Job outputs zip |
| POST | `/files/download-token` | Generate HMAC-signed URL (5-min) |
| GET | `/files/signed-download?token=` | Serve via signed token |
| POST | `/files/igv-tokens` | Batch IGV tokens (60-min) |
| GET | `/files/igv-serve?token=` | Serve with Range headers (RFC 7233) |
| POST | `/experiments/:id/upload-bed` | Upload BED file (<50MB) |

### Server Import (FTP/SFTP)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/experiments/:id/server-import/browse` | Browse remote directory |
| POST | `/experiments/:id/server-import/start` | Start background import |
| GET | `/experiments/:id/server-import/:iid/progress` | Import progress |
| GET | `/users/me/saved-servers` | List saved credentials |
| POST/PATCH/DELETE | `/users/me/saved-servers[/:id]` | CRUD saved servers |

### Local Path Import (Instance)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/experiments/:id/local-import/browse` | Browse local directory on instance |
| POST | `/experiments/:id/local-import/start` | Start background copy/symlink import |
| GET | `/experiments/:id/local-import/:iid/progress` | Import progress |

### Notifications & SSE

| Method | Path | Description |
|--------|------|-------------|
| GET | `/notifications/stream` | SSE endpoint (2s poll, keepalive 15s) |
| GET | `/notifications` | List notifications |
| PATCH | `/notifications/read-all` | Mark all read |
| PATCH | `/notifications/:id/read` | Mark single read |

### Admin

All admin endpoints require `is_superuser = true`. Gated via `require_superuser` FastAPI dependency (403 if not superuser).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/stats` | System-wide aggregate statistics (users, projects, experiments, jobs, storage) |
| GET | `/admin/users` | List all users (paginated, search, role/active filter) |
| PATCH | `/admin/users/:id` | Toggle is_superuser / is_active (cannot modify self, cannot demote last superuser) |
| GET | `/admin/projects` | List all projects (not member-scoped, paginated, search) |
| DELETE | `/admin/projects/:id` | Force-delete project + disk cleanup |
| GET | `/admin/jobs` | List all jobs (not member-scoped, paginated, search, status filter) |
| POST | `/admin/jobs/:id/terminate` | Force-terminate queued/running job |
| POST | `/admin/cleanup` | Trigger storage cleanup (expired logs + stale tus uploads) |
| GET | `/admin/storage-info` | Disk usage + quota |

---

## 6. Pipeline Architecture

Each pipeline stage is a Python module under `backend/pipelines/` implementing the `PipelineStage` interface: `validate()`, `run()`, `mock_run()`, `generate_methods_text()`.

### Stage Registry

```python
_STAGES = {
    "trimming": TrimmingStage,
    "alignment": AlignmentStage,
    "peak_calling": PeakCallingStage,
    "diffbind": DiffBindStage,
    "custom_heatmap": CustomHeatmapStage,
    "pearson_correlation": PearsonCorrelationStage,
    "roman_normalization": RomanNormalizationStage,
}
```

FastQC runs inline (not via job queue) — triggered automatically post-upload.

### Shared Helpers (base.py)

- `run_cmd()` — Execute subprocess, log to master log
- `run_piped_cmd()` — Execute piped commands (cmd1 | cmd2)
- `count_bam_reads()` — `samtools view -c`
- `resolve_blacklist()` — Find blacklist BED for genome
- `append_to_master_log()` — Timestamped section to consolidated log
- `get_threads()` — CPU count (fallback 4)

### 6.1 Trimming

**Two-stage**: Trimmomatic PE (adapter + quality) -> kseq_test (fixed-length 42bp). Concurrent processing via ThreadPoolExecutor (pairs processed in parallel, threads divided among concurrent pairs).

```bash
# Stage 1: Trimmomatic
java -jar trimmomatic PE -threads <N> -phred33 \
  <R1> <R2> <R1_paired> <R1_unpaired> <R2_paired> <R2_unpaired> \
  ILLUMINACLIP:<adapters>:2:15:4:4:true \
  LEADING:20 TRAILING:20 SLIDINGWINDOW:4:15 MINLEN:25

# Stage 2: kseq_test
kseq_test <paired_input> 42 <output>
```

### 6.2 Alignment

**13-step per-reaction pipeline** with concurrent processing via ThreadPoolExecutor:

1. `bowtie2 -p <N> --dovetail --phred33 --rg-id <name> -x <index> -1 <R1> -2 <R2>`
2. `samtools view -bS` (SAM -> BAM)
3. `samtools view -bh -f 3 -F 4 -F 8 -q 10` (properly-paired + MAPQ filter)
4. `bedtools intersect -v -abam <bam> -b <blacklist>` (DAC exclusion, optional)
5. `picard SortSam SORT_ORDER=coordinate`
6. `picard MarkDuplicates`
7. `samtools view -bh -F 1024` (duplicate removal, optional)
8. `samtools index`
9. `bamCoverage --binSize 20 --normalizeUsing RPKM --effectiveGenomeSize <size>` (unsmoothed bigWig)
10. `bamCoverage --binSize 100 --normalizeUsing RPKM` (smoothed bigWig)
11. `computeMatrix reference-point --referencePoint TSS` + `plotHeatmap` (TSS heatmap)
12. `computeMatrix scale-regions` + `plotHeatmap` (gene body heatmap)
13. E. coli spike-in alignment + K-MetStat barcode counting (optional)

### 6.3 Peak Calling

Supports 5 modes. Fragment filter (<120bp) default ON. Concurrent processing via ThreadPoolExecutor (reactions processed in parallel). IgG control BAMs are pre-filtered before dispatch for thread safety. Partial failure supported — individual reaction errors are collected, only fatal if ALL reactions fail.

| Caller | Mode | Default Threshold | Command |
|--------|------|-------------------|---------|
| MACS2 | narrow | q=0.01 | `macs2 callpeak -f BAMPE -q 0.01 -B --SPMR --keep-dup all` |
| MACS2 | broad | cutoff=0.1 | `macs2 callpeak --broad --broad-cutoff 0.1 -B --SPMR --keep-dup all` |
| SICER2 | broad | FDR=0.01 | `sicer -t <bam> -s <genome> -w 200 -g 600 --false_discovery_rate 0.01` |
| SEACR | stringent | 0.01 | MACS2 bdg -> `change.bdg.py` -> `SEACR_1.1.sh 0.01 non stringent` |
| SEACR | relaxed | 0.01 | Same chain with `relaxed` mode |

Post-peak: blacklist subtraction, FRiP calculation (`bedtools intersect` / `samtools view -c`), HOMER annotation (`annotatePeaks.pl`).

### 6.4 DiffBind

3 analysis modes via R subprocess. Fixes 3 documented bugs from lab's original scripts.

| Mode | R Script | Statistical Engine |
|------|----------|--------------------|
| `deseq2_consensus` | `diffbind_consensus.R` | DESeq2 with consensus peakset |
| `deseq2_peaklist` | `diffbind_peaklist.R` | DESeq2 with user-supplied peakset |
| `edger_peaklist` | `diffbind_peaklist_edger.R` | edgeR + TMM normalization |

Output columns (`Conc_X`, `Conc_Y`) are dynamic — parsed from TSV header, never hardcoded.

### 6.5 Custom Heatmaps

```bash
computeMatrix reference-point --referencePoint <center|TSS|TES> \
  -R <user_bed> -S <bigwigs...> -a <downstream> -b <upstream> -o <matrix.gz>
plotHeatmap -m <matrix> --samplesLabel <labels> -out <heatmap.png>
plotProfile -m <matrix> --samplesLabel <labels> --perGroup -out <profile.png>
```

### 6.6 Pearson Correlation

Two-script chain (mandatory reference compliance):
1. R/rtracklayer: bigWig -> coverage matrix at 50bp resolution (with mm10 masking)
2. Python/seaborn: pairwise Pearson correlation heatmap

Multi-genome chromosome sets: mm10 (chr1-19+chrX), hg38/hg19 (chr1-22+chrX), dm6 (chr2L/2R/3L/3R/4/X), sacCer3 (chrI-XVI).

### 6.7 Roman Normalization

Mouse-only (mm10). 99th-percentile quantile normalization with `manual.mask.ultimate.bed` masking (158 regions). All samples normalized to the first sample listed (NF=1.0).

```bash
Rscript roman_normalization.R <sample_sheet.csv> <results_dir> <mask_path>
```

### Effective Genome Sizes

| Genome | Size | Note |
|--------|------|------|
| mm10 | 2,467,481,108 | Lab scripts used this for ALL genomes (bug) |
| hg38 | 2,913,022,398 | Cleave uses correct per-genome values |
| hg19 | 2,864,785,220 | |
| dm6 | 142,573,017 | |
| sacCer3 | 12,157,105 | |

### Pipeline Reference Data

```
pipelines/
├── adapters/          Truseq3.PE.fa, Truseq3.SE.fa, NexteraPE-PE.fa, TruSeqAdapters.fa
├── reference/
│   ├── annotations/   mm10_refGene.bed (TSS/gene body heatmaps)
│   ├── blacklists/    mm10, hg38, hg19, dm6, sacCer3 (.blacklist.bed + .lab.blacklist.bed)
│   ├── chrom_sizes/   *.chrom.sizes per genome
│   └── masks/         manual.mask.ultimate.bed (mm10, 158 entries)
├── scripts/           R/Python scripts (DiffBind, Pearson, Roman normalization)
└── tools/             SEACR_1.1.sh, filter_below.awk, change.bdg.py, kseq_test.c, summit extractors
```

---

## 7. Worker Process

Standalone async process (`worker.py`) managed by systemd in production.

### Main Loop

```
while True:
    job = poll_for_queued_job()           # SELECT ... FOR UPDATE SKIP LOCKED
    if job:
        check_termination()               # User cancelled while queued?
        update_status("running")
        create_job_directory()
        try:
            result = pipelines.run(job_type, params, cancelled=check_fn)
            persist_outputs(result)
            update_status("complete")
            notify_user()
            trigger_auto_pipeline()       # If auto-pipeline enabled
        except TerminatedError:
            update_status("terminated")
        except Exception as e:
            update_status("error", e)
    maybe_run_cleanup()                   # Every CLEANUP_INTERVAL_HOURS
    sleep(WORKER_POLL_INTERVAL_SECONDS)
```

### Key Design

- **Pessimistic row lock**: `FOR UPDATE SKIP LOCKED` prevents duplicate processing
- **Pipeline runs outside DB session**: Avoids holding connections during long pipelines
- **Termination check**: Sync callback queries `termination_requested_at` from a separate engine
- **Post-pipeline hooks**: Trimming creates FastqFile records + triggers FastQC; alignment/peak calling use generic `persist_job_outputs()`
- **Auto-pipeline integration**: Calls `on_job_complete()` / `on_job_error()` to chain next step
- **Cleanup integration**: Runs `cleanup_expired_logs()` + `cleanup_stale_tus_uploads()` on configurable interval

### Auto-Pipeline Chain

One-click pipeline chains: FastQC -> Trim -> Align -> Peak Call -> [Normalization] -> [DiffBind] -> [Heatmap] -> [Pearson].

Status flow: `pending_fastqc` -> `running` -> `complete` | `error` | `cancelled`.

---

## 8. File Storage & Serving

### Directory Layout

```
/data/cleave/
├── projects/{project_id}/{experiment_id}/
│   ├── fastqs/raw/           Uploaded FASTQs
│   ├── fastqs/trimmed/       Post-trimming FASTQs
│   ├── fastqc/               FastQC HTML reports
│   ├── beds/                 User-uploaded BED files
│   └── jobs/{job_id}/        Per-job outputs (BAMs, bigWigs, BEDs, heatmaps, logs)
├── uploads/                  tus staging area (incomplete uploads)
└── genomes/                  Bowtie2 indices (read-only mount)
```

### Serving Strategy

- **Small files** (QC reports, CSVs, PNGs): FastAPI `FileResponse`
- **Large files** (BAMs, bigWigs): NGINX `X-Accel-Redirect` in production (`NGINX_FILE_SERVING=true`)
- **IGV.js**: RFC 7233 Range header support (200/206/416 responses) with HMAC-signed tokens
- **Batch download**: Streaming zip via `stream-zip` library (flat memory usage). `ZIP_STORED` for compressed files, `ZIP_DEFLATED` for text.
- **Download auth**: HMAC-signed tokens in URL (5-min TTL for downloads, 60-min for IGV)

### Path Security

All file-serving endpoints validate paths stay within `STORAGE_ROOT/projects/{project_id}/{experiment_id}/`. Rejects `..`, absolute paths, and symlinks.

---

## 9. Real-Time Updates (SSE)

`GET /api/v1/notifications/stream` — persistent SSE connection per authenticated user.

### Event Types

| Event | Data | Trigger |
|-------|------|---------|
| `notification` | `{id, type, title, message}` | New notification created |
| `job_status` | `{jobId, status, experimentId}` | Job status changed |
| `auto_pipeline_status` | `{experimentId, status}` | Auto-pipeline state change |
| `server_import_progress` | `{importId, status, completed, total}` | FTP/SFTP import progress |

### Implementation

- **Polling**: 2-second interval against `notifications` + `analysis_jobs` tables
- **State tracking**: Watermark-based (`last_notification_id`, `{job_id: status}` dict) — only emits deltas
- **Keepalive**: SSE comment every 15 seconds
- **Auth**: JWT in `Authorization` header via `@microsoft/fetch-event-source`
- **Frontend**: SSE events invalidate TanStack Query caches for automatic UI refresh

---

## 10. Frontend Architecture

### Routing

```
/                          LandingPage (public)
/login                     LoginPage
/register                  RegisterPage
/forgot-password           ForgotPasswordPage
/reset-password            ResetPasswordPage
/dashboard                 HomePage (projects grid)
/projects/:id              ProjectDetailPage (experiments + members)
/experiments/:id           ExperimentView (tabbed)
  /description             DescriptionTab
  /fastqs                  FastqsTab (tus upload, FastQC)
  /reactions               ReactionsTab (CRUD + CSV import)
  /alignment/:jid          AlignmentTab (5 sub-tabs: Info, Input, QC, Files, IGV)
  /peaks/:jid              PeakCallingTab (5 sub-tabs)
  /diffbind/:jid           DiffBindTab (5 sub-tabs: Info, Input, Results, Plots, Files)
  /heatmaps/:jid           CustomHeatmapTab (3 sub-tabs: Info, Plot, Files)
  /correlations/:jid       PearsonCorrelationTab (3 sub-tabs)
  /normalization/:jid      NormalizationTab (3 sub-tabs: Info, Results, Files)
  /history                 HistoryTab (paginated event log)
  /files                   AllFilesTab (dual-panel tree + table)
/queue                     AnalysisQueuePage (global job list)
/settings                  SettingsPage
/admin                     AdminPage (superuser only, 4 tabs: System, Users, Projects, Jobs)
```

### State Management

- **Server state**: TanStack React Query (staleTime 30s, 1 retry). Cache keys: `['resource', id, {params}]`.
- **Auth state**: React Context (`AuthContext`) with in-memory JWT token, auto-refresh on 401.
- **Local UI state**: `useState` / `useReducer`. No global store.
- **Real-time**: SSE hook (`useSSE`) invalidates query caches on event arrival.

### Component Organization (90 files)

Feature-based folders: `alignment/`, `peak-calling/`, `diffbind/`, `custom-heatmap/`, `pearson-correlation/`, `normalization/`, `igv/`, `fastqs/`, `reactions/`, `experiments/`, `projects/`, `ui/`, `layout/`, `auth/`.

Pattern per analysis type: `NewXxxWizard.tsx` + `XxxDetailsStep.tsx` + `XxxSettingsStep.tsx` + `XxxInfoPanel.tsx` + `XxxFilesPanel.tsx` + `XxxQCReportPanel.tsx`.

### Design System

- **shadcn/ui**: 10 Radix primitives (Dialog, DropdownMenu, Select, Tabs, Tooltip, ScrollArea, Collapsible, Badge, Separator, Sonner)
- **CVA**: Class Variance Authority for Button, Card variants
- **Dark mode**: CSS variables + `next-themes` (`darkMode: ['class']`)
- **Typography**: Source Serif 4 (headings), Source Sans 3 (body), Source Code Pro (monospace)
- **Icons**: lucide-react (all inline SVGs removed)
- **Toasts**: sonner for transient feedback
- **Colors**: Gradient background (sky blue -> teal -> lime -> gold), primary `#4AAED9`, status colors

---

## 11. Configuration Reference

All settings via environment variables, loaded by Pydantic `BaseSettings`.

### Database & Auth

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://cleave:dev@localhost:5432/cleave` | Async database URL |
| `SECRET_KEY` | (dev placeholder) | JWT signing + Fernet key derivation (min 32 chars) |
| `REFRESH_SECRET_KEY` | (dev placeholder) | Refresh token signing key |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 30 | JWT access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | 7 | Refresh cookie lifetime |
| `COOKIE_SECURE` | false | Require HTTPS for cookies (MUST be true in prod) |
| `RESET_TOKEN_LIFETIME_SECONDS` | 3600 | Password reset token TTL |

### Application

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |
| `STORAGE_ROOT` | `/data/cleave` | Root directory for all file storage |
| `UPLOAD_MAX_SIZE_MB` | 5000 | Max single upload size |
| `PIPELINE_MODE` | `mock` | `mock` for dev, `real` for production |
| `GENOME_INDEX_DIR` | `/data/cleave/genomes` | Bowtie2 index directory |

### Worker & Pipeline

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKER_POLL_INTERVAL_SECONDS` | 2.0 | Job queue poll frequency |
| `MAX_CONCURRENT_REACTIONS` | 8 | Parallel reactions in alignment/peak calling |
| `SSE_KEEPALIVE_SECONDS` | 15 | SSE keepalive interval |

### File Serving

| Variable | Default | Description |
|----------|---------|-------------|
| `NGINX_FILE_SERVING` | false | Enable X-Accel-Redirect |
| `NGINX_INTERNAL_PREFIX` | `/internal-files/` | NGINX internal redirect path |
| `DOWNLOAD_TOKEN_EXPIRY_SECONDS` | 300 | Signed download token TTL |
| `IGV_TOKEN_EXPIRY_SECONDS` | 3600 | IGV file access token TTL |
| `BATCH_DOWNLOAD_MAX_FILES` | 100 | Max files per batch download |
| `BATCH_DOWNLOAD_MAX_BYTES` | 10GB | Max total batch download size |

### Storage Lifecycle

| Variable | Default | Description |
|----------|---------|-------------|
| `CLEANUP_ENABLED` | true | Enable automatic cleanup |
| `CLEANUP_INTERVAL_HOURS` | 24 | Cleanup run frequency |
| `LOG_RETENTION_DAYS` | 30 | Pipeline log retention |
| `STORAGE_QUOTA_BYTES` | 0 | Storage quota (0 = no limit) |
| `TUS_STAGING_RETENTION_HOURS` | 48 | Incomplete upload retention |

### Email (Amazon SES)

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_SES_REGION` | `""` | SES region (empty = disabled) |
| `AWS_SES_FROM_EMAIL` | `""` | Verified sender address |
| `APP_URL` | `http://localhost:5173` | Frontend URL for email links |

---

## 12. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth library | fastapi-users | Production-audited, eliminates ~500 lines of security code |
| Token transport | Bearer body + httpOnly cookie | Access in memory (XSS-safe), refresh in cookie (CSRF-safe via SameSite=Lax) |
| Job queue | PostgreSQL polling (not Redis/Celery) | Single-instance deployment, one job at a time, simpler infra |
| MACS2 default q-value | 0.01 (not 0.05) | Lab standard, more stringent than CUTANA Cloud |
| Default peak caller | SEACR stringent | Lab consensus for CUT&RUN peak calling |
| Fragment filter | ON by default (<120bp) | Sub-nucleosomal fragments are the biologically relevant signal |
| SEACR threshold mode | Numeric 0.01 (not IgG control) | Matches lab behavior; both modes available |
| DiffBind columns | Dynamic from TSV header | `Conc_X`/`Conc_Y` depend on sample sheet condition names |
| File download auth | HMAC-signed tokens | Enables browser-native downloads and IGV byte-range requests |
| SSE (not WebSocket) | 2-second polling | Unidirectional server->client is sufficient for ~8-10 users |
| Upload protocol | tus v1.0.0 via tuspyserver | Chunked/resumable for multi-GB FASTQs |
| FTP/SFTP import | aioftp + asyncssh | Pure Python async, no system deps; SSRF prevention built in |
| Local path import | shutil.copy2 / os.symlink | Copy default, symlink optional; shares progress tracking with server import; rejects STORAGE_ROOT and system dirs |
| Pipeline mock mode | Creates real stub files on disk | File browser, download, and IGV depend on files at real paths |
| effectiveGenomeSize | Correct per-genome values | Fixes lab bug where mm10's value was used for all organisms |
| Roman normalization | Mouse only (mm10) | Hardcoded chromosome list (chr1-19+chrX); no human equivalent |
| Auto-pipeline | Job dependency chain via parent_job_id | One-click FastQC -> Trim -> Align -> Peak Call with conditional branching |
| Pipeline parallelism | ThreadPoolExecutor per-reaction | Alignment, trimming, and peak calling all process reactions/pairs concurrently; thread budget divided among concurrent workers; partial failure support |
| Dark mode | CSS variables + next-themes | System/light/dark with persistent preference |
| Admin panel | `require_superuser` dependency + tabbed frontend page | Superuser-only; user/project/job management, system stats, cleanup trigger |
| Training wheels | `is_training` flag on first-created project | First-time users must learn parameters: auto-pipeline disabled, defaults cleared, educational hints shown |

---

## 13. Corrections to Lab Reference Scripts

These bugs were found in the lab's scripts and fixed in Cleave:

1. **effectiveGenomeSize bug**: Lab's `create_bams.sh` uses mm10's value (2,467,481,108) for ALL organisms including human. Cleave uses correct per-genome values.

2. **DiffBind R script bugs** (3 bugs in `references/DPA/`):
   - Missing `)` on `write.csv()` (line 88)
   - Malformed `cat()`/`print()` completion message (line 91-92)
   - Missing `dev.off()` between PNG and SVG device opens (5 plot blocks)

3. **MACS2 q-value**: Lab uses 0.01 consistently; CUTANA Cloud uses 0.05. Cleave defaults to 0.01 with 0.05 available in Advanced Settings.

4. **Fragment size filter**: Undocumented in CUTANA Cloud. Lab's `integrated.step2.sh` filters to <120bp before peak calling. Cleave makes this default ON and configurable.

---

## 14. Test Suite

548+ tests across 31 test files, all running inside Docker (`docker compose exec api pytest tests/`).

| Test File | Count | Scope |
|-----------|-------|-------|
| test_peak_calling_pipeline.py | 56 | All 5 peak callers, fragment filter, FRiP, HOMER, concurrency |
| test_files.py | 38 | File tree, downloads, path traversal, IGV, Range headers |
| test_jobs_api.py | 38 | Job CRUD, queue, QC endpoints, terminate/retry |
| test_reactions.py | 31 | CRUD, validation, CSV import, unique constraints |
| test_alignment_pipeline.py | 29 | Validation, mock files, QC CSV, methods text |
| test_local_import.py | 23 | Path validation, browse, import validation, progress |
| test_server_import.py | 23 | SSRF, encryption, browse, auth, saved servers |
| test_pearson_correlation_pipeline.py | 23 | Multi-genome, masking, validation |
| test_diffbind_pipeline.py | 21 | 3 modes, dynamic columns, validation |
| test_roman_normalization_pipeline.py | 19 | Mouse-only, validation, mock run |
| test_custom_heatmap_pipeline.py | 18 | deepTools params, validation, mock run |
| test_email_service.py | 17 | Email templates, SES integration |
| test_projects.py | 16 | CRUD, membership, permissions |
| test_auth.py | 16 | Register, login, refresh, logout, protected |
| test_fastq_upload.py | 15 | Upload, validation, storage, list, delete |
| test_qc_report.py | 14 | Alignment QC + Peak calling QC endpoints |
| test_fastqc.py | 14 | Unit + integration, summary, resolver |
| test_trimming_pipeline.py | 13 | Validation, mock_run, methods text, concurrency |
| test_cleanup_service.py | 11 | Storage cleanup, retention policies |
| test_experiments.py | 10 | CRUD, name validation, project membership |
| test_experiment_events.py | 9 | Audit log entries, event creation |
| test_worker.py | 8 | Poll cycle, job pickup, status transitions |
| test_tus_upload.py | 7 | tus protocol: create, upload, finalize |
| test_notifications.py | 7 | List, mark-read |
| test_alignment_concurrency.py | 7 | ThreadPoolExecutor, partial failure, ordering |
| test_sse.py | 6 | Auth, lifecycle, events, user isolation |
| test_users.py | 4 | Profile get/update |
| test_job_output_service.py | 4 | Output persistence, storage accounting |
| test_download_token_service.py | 5 | HMAC token roundtrip, expiry, tampering, malformed input |
| test_pipeline_base.py | 5 | get_threads, append_to_master_log, resolve_blacklist, run_cmd |
| test_fastq_validation.py | 5 | Filename parsing, extension variants, path traversal, direction |
| test_admin.py | 18 | Superuser auth, user management, project/job admin, stats |

All tests use Postgres (`cleave_test` DB). Schema cleanup via `DROP SCHEMA public CASCADE` per test. `ruff check` + `ruff format --check` + `npm run build` all clean.

---

## 15. Supported Reference Genomes

| Organism | Build | Alignment | Peak Calling | Heatmaps | Normalization |
|----------|-------|-----------|-------------|----------|---------------|
| Mouse | mm10 | Yes | Yes | Yes | Yes (Roman) |
| Human | hg38 | Yes | Yes | Yes | No |
| Human | hg19 | Yes | Yes | Yes | No |
| Drosophila | dm6 | Yes | Yes | Yes | No |
| Yeast | sacCer3 | Yes | Yes | No | No |
| E. coli | K12 MG1655 | Spike-in only | -- | -- | -- |
