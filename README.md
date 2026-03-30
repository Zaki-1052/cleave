# Cleave

A self-hosted CUT&RUN/CUT&Tag bioinformatics web platform for the Ferguson Lab at UCSD. Cleave replicates [EpiCypher's CUTANA Cloud](https://www.epicypher.com/cutana-cloud/) and extends it with lab-specific pipeline features -- trimming, SEACR peak calling, MACS2 broad mode, DiffBind differential analysis, custom heatmaps, Pearson correlation, Roman normalization, and auto-pipeline mode.

Built for ~8-10 lab members. Runs on a single AWS EC2 instance. 492+ backend tests passing.

## What It Does

**FASTQ upload** (tus resumable + FTP/SFTP import) &rarr; **FastQC** &rarr; **Trimming** (Trimmomatic + kseq 42bp) &rarr; **Alignment** (Bowtie2 + SAMtools + BEDTools + Picard + deepTools) &rarr; **Peak Calling** (MACS2 / SICER2 / SEACR + HOMER annotation) &rarr; **Visualization** (IGV.js + heatmaps) &rarr; **Lab Extensions** (DiffBind, correlation, normalization) &rarr; **File download**

Auto-pipeline mode chains FastQC, Trimming, Alignment, and Peak Calling into a single one-click operation.

| Feature | CUTANA Cloud | Cleave |
|---------|:---:|:---:|
| FASTQ upload + FastQC | Yes | Yes |
| FTP/SFTP server import | Yes | Yes |
| Bowtie2 alignment + QC | Yes | Yes |
| MACS2 narrow peaks | Yes | Yes |
| SICER2 broad peaks | Yes | Yes |
| SEACR peak calling | - | Yes |
| MACS2 broad mode | - | Yes |
| FASTQ trimming (Trimmomatic + kseq) | - | Yes |
| Fragment size filter (<120bp) | - | Yes |
| DiffBind differential analysis | - | Yes |
| Custom reference-point heatmaps | - | Yes |
| Pearson correlation matrices | - | Yes |
| Roman normalization | - | Yes |
| SNAP-CUTANA spike-in QC | Yes | Yes |
| E. coli spike-in normalization | Yes | Yes |
| IGV.js genome browser | Yes | Yes |
| Auto-generated methods text | Yes | Yes |
| Parallel pipeline processing | - | Yes |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 (Vite), TypeScript, Tailwind CSS, shadcn/ui (Radix primitives), TanStack Table, TanStack Query, Recharts, IGV.js, tus-js-client, lucide-react, next-themes, sonner |
| Backend | FastAPI (Python 3.11+), Uvicorn, SQLAlchemy 2.0 (async), Alembic, Pydantic v2, tuspyserver, aioftp, asyncssh |
| Database | PostgreSQL 15+ |
| Auth | fastapi-users (JWT access 30-min + httpOnly refresh cookie 7-day), Argon2, slowapi rate limiting |
| Pipeline | Python worker process calling Bowtie2, SAMtools, BEDTools, Picard, deepTools, MACS2, SICER2, SEACR, HOMER, Trimmomatic, DiffBind (R) via subprocess |
| Real-time | SSE (server-sent events) with @microsoft/fetch-event-source for JWT-authenticated streaming |
| Dev | Docker Compose (Postgres + FastAPI + Worker + Vite), local dev script (`scripts/run-local.sh`) |
| Prod | NGINX reverse proxy, systemd, single EC2 instance |

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- Node.js 20+ (for local frontend dev outside Docker)
- Python 3.11+ (for local backend dev outside Docker)

### Run with Docker Compose

```bash
git clone <repo-url> cleave && cd cleave

# Start all services (Postgres + FastAPI + Vite dev server)
docker compose up -d

# Generate and apply database migrations
docker compose exec api alembic upgrade head

# Verify
curl http://localhost:8000/api/v1/health    # {"status":"ok"}
open http://localhost:5173                   # React app
open http://localhost:8000/docs              # OpenAPI docs
```

### Run Locally (without Docker)

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp ../.env.example .env   # edit DATABASE_URL to point to your Postgres
alembic upgrade head
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

## Project Structure

```
cleave/
├── backend/
│   ├── main.py                  FastAPI app entry point
│   ├── auth.py                  fastapi-users config (UserManager, JWT strategies)
│   ├── config.py                Pydantic Settings (reads .env)
│   ├── database.py              Async SQLAlchemy engine + session
│   ├── dependencies.py          FastAPI Depends (auth, permissions)
│   ├── logging_config.py        structlog setup (JSON in prod, console in dev)
│   ├── worker.py                Standalone job queue worker
│   ├── models/                  SQLAlchemy 2.0 ORM models (11 tables)
│   ├── schemas/                 Pydantic v2 request/response schemas
│   ├── routers/                 FastAPI route handlers (14 routers)
│   ├── services/                Business logic layer (21 services)
│   ├── migrations/              Alembic migrations (9 versioned migrations)
│   ├── pipelines/               Pipeline modules + reference data
│   │   ├── adapters/            Trimmomatic adapter FASTAs
│   │   ├── reference/           Blacklists, chrom sizes, masks, annotations
│   │   ├── scripts/             R scripts (DiffBind, Pearson, Roman normalization)
│   │   └── tools/               SEACR, kseq_test, filter_below.awk, change.bdg.py
│   └── tests/                   pytest tests (492+ passing)
│
├── frontend/
│   └── src/
│       ├── api/                 Axios client + API modules
│       ├── components/          Reusable UI components
│       │   ├── layout/          Navbar, Breadcrumbs, Card, GradientBackground
│       │   ├── ui/              shadcn/ui primitives, DataTable, WizardModal, EmptyState
│       │   ├── auth/            ProtectedRoute
│       │   ├── alignment/       Alignment wizard + QC report
│       │   ├── peak-calling/    Peak calling wizard + annotation charts
│       │   ├── diffbind/        DiffBind wizard + results (volcano, MA, PCA plots)
│       │   ├── igv/             IGV.js genome browser wrapper
│       │   ├── custom-heatmap/  Custom heatmap wizard
│       │   ├── pearson-correlation/  Correlation matrix UI
│       │   └── normalization/   Roman normalization UI
│       ├── contexts/            AuthContext, ThemeProvider (dark mode)
│       ├── hooks/               TanStack Query hooks for all API resources
│       ├── lib/                 Constants, utilities, cn() helper
│       └── pages/               Route-level pages + LandingPage
│
├── scripts/                     Dev scripts (run-local.sh)
├── docs/                        Architecture, specs, UI reference, decisions
├── references/                  Lab pipeline scripts (read-only reference)
├── cutana/                      Exported CUTANA Cloud QC data (reference schemas)
├── test_data/                   Downsampled FASTQs for local testing
├── docker-compose.yml           Dev environment (db + api + worker + frontend)
└── .env.example                 Environment variable template
```

## Database Schema

11 tables managed via 9 Alembic migrations:

- **users** -- accounts extending fastapi-users base model (Argon2 password hashes)
- **projects** -- top-level organizational containers
- **project_members** -- role-based access (admin / contributor / viewer)
- **experiments** -- CUT&RUN or CUT&Tag analysis units within a project
- **fastq_files** -- uploaded paired-end FASTQ metadata (adapter status, trimming state)
- **reactions** -- sample metadata linked to FASTQs (organism, antibody, spike-in)
- **analysis_jobs** -- unified job queue (JSONB params, parent_job_id for dependency chains, termination/retry support, auto-pipeline tracking)
- **job_outputs** -- files produced by analysis jobs
- **notifications** -- in-app alerts (job completion, project invitations)
- **saved_servers** -- FTP/SFTP server credentials (Fernet-encrypted passwords)
- **experiment_events** -- audit log entries for experiment history tracking

## API

RESTful under `/api/v1/`. JWT required except `/api/v1/auth/*` and `/api/v1/health`. 14 route modules.

```
# Auth & Users
POST   /api/v1/auth/login|register|refresh|logout
POST   /api/v1/auth/forgot-password|reset-password
GET    /api/v1/users/me
PATCH  /api/v1/users/me

# Projects & Members
GET    /api/v1/projects                     # paginated, filtered by membership
POST   /api/v1/projects
GET    /api/v1/projects/:id
PATCH  /api/v1/projects/:id                 # admin only
DELETE /api/v1/projects/:id                 # admin only
GET    /api/v1/projects/:id/members
POST   /api/v1/projects/:id/members         # admin only

# Experiments
GET    /api/v1/experiments                   # ?projectId= filter
POST   /api/v1/experiments?projectId=
GET    /api/v1/experiments/:id
PATCH  /api/v1/experiments/:id
DELETE /api/v1/experiments/:id
GET    /api/v1/experiments/:id/events        # audit log

# FASTQ Files & Upload
GET    /api/v1/experiments/:id/fastqs
POST   /api/v1/experiments/:id/fastqs/upload # tus resumable upload endpoint
DELETE /api/v1/experiments/:id/fastqs/:fid

# Reactions
GET    /api/v1/experiments/:id/reactions
POST   /api/v1/experiments/:id/reactions
POST   /api/v1/experiments/:id/reactions/import-csv
GET    /api/v1/experiments/:id/reactions/template

# Analysis Jobs & Outputs
POST   /api/v1/experiments/:id/jobs          # submit alignment, peak calling, etc.
POST   /api/v1/experiments/:id/auto-pipeline # one-click full pipeline
GET    /api/v1/experiments/:id/jobs
GET    /api/v1/jobs                           # cross-project queue
GET    /api/v1/jobs/:jid
POST   /api/v1/jobs/:jid/terminate
POST   /api/v1/jobs/:jid/retry
GET    /api/v1/jobs/:jid/qc-report
GET    /api/v1/jobs/:jid/outputs

# Files & Downloads
GET    /api/v1/experiments/:id/files         # file tree
GET    /api/v1/files/download                # HMAC-signed token download
POST   /api/v1/experiments/:id/files/batch-download

# Server Import (FTP/SFTP)
POST   /api/v1/server-import/connect
POST   /api/v1/server-import/browse
POST   /api/v1/server-import/import
GET    /api/v1/server-import/saved-servers

# Real-time & Notifications
GET    /api/v1/notifications
GET    /api/v1/notifications/stream          # SSE endpoint
PATCH  /api/v1/notifications/:id/read

# Admin
GET    /api/v1/admin/stats                   # system-wide statistics

# Health
GET    /api/v1/health                        # {"status": "ok"}
```

Interactive docs at `http://localhost:8000/docs`.

## Development

```bash
# Local dev (all services via Docker Compose)
docker compose up -d

# Local dev (without Docker — runs backend + worker + frontend)
./scripts/run-local.sh

# Lint backend
cd backend && ruff check . && ruff format .

# Type-check frontend
cd frontend && npx tsc --noEmit

# Run backend tests (MUST use Docker — tests need Postgres)
docker compose exec api pytest tests/test_specific.py           # single file
docker compose exec api pytest tests/test_specific.py -k "name" # single test
docker compose exec api pytest tests/                           # full suite (492+ tests)

# Create a new migration after model changes
docker compose exec api alembic revision --autogenerate -m "description"
docker compose exec api alembic upgrade head

# Rebuild API container after dependency changes
docker compose up -d --build api
```

## Implementation Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1. Foundation | Scaffold, auth, project/experiment CRUD, UI shell | Complete |
| 2. Data Management | FASTQ upload (tus resumable), FastQC, reactions, trimming, file browser | Complete |
| 3. Core Pipeline | Worker, SSE, alignment, QC reports, spike-in QC | Complete |
| 4. Peak Calling | MACS2/SICER2/SEACR, HOMER, FRiP, fragment filter | Complete |
| 5. Visualization | IGV.js genome browser, byte-range serving | Complete |
| 6. Lab Extensions | DiffBind, custom heatmaps, Pearson correlation, Roman normalization | Complete |
| 7. Polish & QA | Storage lifecycle, job termination/retry, auto-pipeline, audit log | In Progress |
| 8. UI Overhaul | shadcn/ui, dark mode, typography system, landing page | Complete |
| 9. FTP/SFTP Import | Server import wizard, saved credentials, SSRF prevention | Complete |

## Documentation

Detailed specs in `docs/`:

| Document | Contents |
|----------|----------|
| `PLAN.md` | Build roadmap, phase-by-phase implementation steps, done criteria |
| `cutana-architecture-plan.md` | System architecture, data model, API routes, deployment |
| `cleave-spec-decisions.md` | Resolved questions, script audit, parameter reference, bug fixes |
| `cf-lab-pipeline-spec.md` | Lab pipeline stages, scripts, parameters, feature gaps |
| `cutana-cloud-ui.md` | Page-by-page UI reference with component specs |
| `cutana-cloud-docs.md` | Platform behavior, QC interpretation, terminology |
| `cutana-cloud-info.md` | Workflow details, pricing, software versions |

## UI & Design

- **Dark mode** -- full light/dark theme support via CSS variables and next-themes, toggle in navbar
- **shadcn/ui** -- 10 Radix UI primitives (Dialog, DropdownMenu, Select, Tabs, Tooltip, ScrollArea, Collapsible, Badge, Separator, Sonner) with CVA-based styling
- **Typography** -- Source Serif 4 (headings), Source Sans 3 (body), Source Code Pro (monospace)
- **Icon system** -- lucide-react replaces all inline SVGs
- **Toast notifications** -- sonner for transient feedback
- **Landing page** -- animated pipeline visualization at `/`, feature comparison table, live stats
- **EmptyState pattern** -- consistent empty-state illustrations across all list views

## Key Design Decisions

- **Async everywhere** -- async SQLAlchemy engine, all handlers and services are `async def`
- **Single job queue** -- `analysis_jobs` table polled by a standalone worker process. Configurable concurrency (alignment is CPU/memory-heavy)
- **JSONB params** -- `analysis_jobs.params` stores all job-specific config. No per-job-type tables
- **MACS2 q-value defaults to 0.01** (lab standard), not 0.05 (CUTANA Cloud). Both available in Advanced Settings
- **SEACR uses numeric threshold 0.01** by default (top 1% AUC), not IgG control. Both modes available
- **Fragment size filter (<120bp) is default ON** before peak calling. Sub-nucleosomal fragments are the biologically relevant CUT&RUN signal
- **Auto-pipeline mode** -- one-click FastQC, Trim, Align, Peak Call chain with parent_job_id dependency tracking
- **30-min access tokens** -- JWT access (30-min) + httpOnly refresh cookie (7-day). Rate limited: 5/min login, 3/min register
- **HMAC-signed download tokens** -- file downloads use time-limited HMAC tokens for auth instead of JWT, enabling direct browser downloads and IGV.js byte-range requests
- **Mock pipeline mode** -- `PIPELINE_MODE=mock` stubs all pipeline calls for frontend/API dev without bioinformatics tools
- **Large files served via NGINX** `X-Accel-Redirect` in production. FastAPI only checks auth, never streams large files
- **SSRF prevention** -- FTP/SFTP server import blocks private IP ranges, localhost, and AWS metadata endpoints
- **Fernet encryption** -- saved server credentials encrypted at rest with per-instance key

## License

Private. Ferguson Lab, UCSD.
