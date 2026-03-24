# Cleave

A self-hosted CUT&RUN/CUT&Tag bioinformatics web platform for the Ferguson Lab at UCSD. Cleave replicates [EpiCypher's CUTANA Cloud](https://www.epicypher.com/cutana-cloud/) and extends it with lab-specific pipeline features — trimming, SEACR peak calling, MACS2 broad mode, DiffBind differential analysis, custom heatmaps, Pearson correlation, and Roman normalization.

Built for ~8-10 lab members. Runs on a single AWS EC2 instance.

## What It Does

**FASTQ upload** &rarr; **FastQC** &rarr; **Trimming** &rarr; **Alignment** (Bowtie2) &rarr; **BigWig generation** (deepTools) &rarr; **Peak Calling** (MACS2 / SICER2 / SEACR) &rarr; **HOMER annotation** &rarr; **IGV visualization** &rarr; **File download**

| Feature | CUTANA Cloud | Cleave |
|---------|:---:|:---:|
| FASTQ upload + FastQC | Yes | Yes |
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

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 (Vite), TypeScript, Tailwind CSS, TanStack Table, TanStack Query |
| Backend | FastAPI (Python 3.11+), Uvicorn, SQLAlchemy 2.0 (async), Alembic, Pydantic v2 |
| Database | PostgreSQL 15+ |
| Auth | fastapi-users (JWT access + httpOnly refresh cookie), Argon2 |
| Pipeline | Python worker process calling bioinformatics tools via subprocess |
| Real-time | SSE (server-sent events) for job status updates |
| Dev | Docker Compose (Postgres + FastAPI + Vite) |
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
│   ├── config.py                Pydantic Settings (reads .env)
│   ├── database.py              Async SQLAlchemy engine + session
│   ├── dependencies.py          FastAPI Depends (auth, permissions)
│   ├── logging_config.py        structlog setup (JSON in prod, console in dev)
│   ├── worker.py                Standalone job queue worker
│   ├── models/                  SQLAlchemy 2.0 ORM models
│   ├── schemas/                 Pydantic v2 request/response schemas
│   ├── routers/                 FastAPI route handlers
│   ├── services/                Business logic layer
│   ├── migrations/              Alembic migrations (async)
│   ├── pipelines/               Pipeline modules + reference data
│   │   ├── adapters/            Trimmomatic adapter FASTAs
│   │   ├── reference/           Blacklists, chrom sizes, masks
│   │   └── tools/               SEACR, kseq_test, helper scripts
│   └── tests/                   pytest test stubs
│
├── frontend/
│   └── src/
│       ├── api/                 Axios client + API modules
│       ├── components/          Reusable UI components
│       │   ├── layout/          Navbar, Breadcrumbs, Card, GradientBackground
│       │   ├── ui/              Button, DataTable, Modal, WizardModal, Input
│       │   └── auth/            ProtectedRoute
│       ├── contexts/            AuthContext (JWT in memory)
│       ├── hooks/               useAuth, useProjects (TanStack Query)
│       ├── lib/                 Constants, utilities
│       └── pages/               Route-level page components
│
├── docs/                        Architecture, specs, UI reference, decisions
├── references/                  Lab pipeline scripts (read-only reference)
├── cutana/                      Exported CUTANA Cloud QC data (reference schemas)
├── test_data/                   Downsampled FASTQs for local testing
├── docker-compose.yml           Dev environment (db + api + frontend)
└── .env.example                 Environment variable template
```

## Database Schema

9 tables managed via Alembic migrations:

- **users** — accounts extending fastapi-users base model (Argon2 password hashes)
- **projects** — top-level organizational containers
- **project_members** — role-based access (admin / contributor / viewer)
- **experiments** — CUT&RUN or CUT&Tag analysis units within a project
- **fastq_files** — uploaded paired-end FASTQ metadata
- **reactions** — sample metadata linked to FASTQs (organism, antibody, spike-in)
- **analysis_jobs** — unified job queue (JSONB params, parent_job_id for dependency chains)
- **job_outputs** — files produced by analysis jobs
- **notifications** — in-app alerts (job completion, project invitations)

## API

RESTful under `/api/v1/`. JWT required except `/api/v1/auth/*`.

```
POST   /api/v1/auth/login|register|refresh
GET    /api/v1/users/me
GET    /api/v1/projects                    # paginated, filtered by membership
POST   /api/v1/projects
GET    /api/v1/projects/:id
PATCH  /api/v1/projects/:id                # admin only
DELETE /api/v1/projects/:id                # admin only
GET    /api/v1/projects/:id/members
POST   /api/v1/projects/:id/members        # admin only
GET    /api/v1/experiments                  # ?projectId= filter
POST   /api/v1/experiments?projectId=
GET    /api/v1/experiments/:id
PATCH  /api/v1/experiments/:id
DELETE /api/v1/experiments/:id
GET    /api/v1/health                       # {"status": "ok"}
```

Interactive docs at `http://localhost:8000/docs`.

## Development

```bash
# Lint backend
cd backend && ruff check . && ruff format .

# Type-check frontend
cd frontend && npx tsc --noEmit

# Run backend tests
cd backend && pytest

# Create a new migration after model changes
docker compose exec api alembic revision --autogenerate -m "description"
docker compose exec api alembic upgrade head

# Rebuild API container after dependency changes
docker compose up -d --build api
```

## Implementation Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1. Foundation | Scaffold, auth, project/experiment CRUD, UI shell | In Progress |
| 2. Data Management | FASTQ upload, FastQC, reactions, trimming, file browser | Planned |
| 3. Core Pipeline | Worker, SSE, alignment, QC reports, spike-in QC | Planned |
| 4. Peak Calling | MACS2/SICER2/SEACR, HOMER, FRiP, fragment filter | Planned |
| 5. Visualization | IGV.js integration | Planned |
| 6. Lab Extensions | DiffBind, custom heatmaps, Pearson correlation, Roman normalization | Planned |
| 7. Polish & QA | Storage lifecycle, error handling, deployment, e2e testing | Planned |

## Documentation

Detailed specs in `docs/`:

| Document | Contents |
|----------|----------|
| `cutana-architecture-plan.md` | System architecture, data model, API routes, deployment |
| `cleave-spec-decisions.md` | Resolved questions, script audit, parameter reference, bug fixes |
| `cf-lab-pipeline-spec.md` | Lab pipeline stages, scripts, parameters, feature gaps |
| `cutana-cloud-ui.md` | Page-by-page UI reference with component specs |
| `cutana-cloud-docs.md` | Platform behavior, QC interpretation, terminology |
| `cutana-cloud-info.md` | Workflow details, pricing, software versions |

## Key Design Decisions

- **Async everywhere** — async SQLAlchemy engine, all handlers and services are `async def`
- **Single job queue** — `analysis_jobs` table polled by a standalone worker process. One job at a time (alignment is CPU/memory-heavy)
- **JSONB params** — `analysis_jobs.params` stores all job-specific config. No per-job-type tables
- **MACS2 q-value defaults to 0.01** (lab standard), not 0.05 (CUTANA Cloud). Both available in Advanced Settings
- **Fragment size filter (<120bp) is default ON** before peak calling. Sub-nucleosomal fragments are the biologically relevant CUT&RUN signal
- **Mock pipeline mode** — `PIPELINE_MODE=mock` stubs all pipeline calls for frontend/API dev without bioinformatics tools
- **Large files served via NGINX** `X-Accel-Redirect` in production. FastAPI only checks auth, never streams large files

## License

Private. Ferguson Lab, UCSD.
