# Cleave — Phase 1 Scaffolding Plan

> **Goal**: Create the complete directory structure, dependency files, configuration, Docker Compose setup, database schema (as SQLAlchemy models + Alembic), FastAPI app skeleton, and React app skeleton for a project called **Cleave**. This is PLANNING ONLY — describe what each file should contain and why, but do NOT write implementation code yet. The output should be a step-by-step plan that, when executed, produces a fully wired scaffold where `docker compose up` starts Postgres + FastAPI + Vite dev server, the frontend can call the backend, and the database schema is applied via Alembic migrations.

> **Environment**: macOS local development. Production target is a single AWS EC2 Ubuntu instance, but we are NOT setting up production infra yet — only local dev via Docker Compose.

Read the project documentation thoroughly before planning:
- `@cutana-cloud-docs.md` — Platform behavior reference
- `@cutana-architecture-plan.md` — Tech stack, DB schema, API routes, frontend routes, deployment plan
- `@cutana-cloud-info.md` — Detailed workflow, pricing, software versions
- `@cf-lab-pipeline-spec.md` — Lab pipeline scripts, parameters, feature gaps
- `@cutana-cloud-ui.md` — Page-by-page UI reference
- `@cleave-spec-decisions.md` — Resolved questions, script audit, parameter reference, corrections
- `@CLAUDE.md` — Project conventions, coding standards, response format

---

## Context

Cleave is a self-hosted CUT&RUN/CUT&Tag bioinformatics web platform (cloning EpiCypher's CUTANA Cloud + lab extensions). It serves ~8-10 users in a single research lab. The stack is:

- **Frontend**: React 18+ (Vite, TypeScript), Tailwind CSS, TanStack Table, TanStack Query, React Router v6, Axios, IGV.js (later), Recharts (later), tus-js-client (later)
- **Backend**: FastAPI (Python 3.11+), Uvicorn, SQLAlchemy 2.0 (async), Alembic, Pydantic v2, fastapi-users[sqlalchemy], slowapi, python-multipart
- **Database**: PostgreSQL 15+
- **Dev environment**: Docker Compose (Postgres + FastAPI + Vite dev server)
- **Pipeline**: Python worker process calling bioinformatics tools via subprocess — NOT scaffolded in Phase 1, but the `pipelines/` directory structure is created with a base class stub

---

## Part 1: Directory Structure

Create this exact structure. Every file listed here should be created. Files marked `(empty)` are placeholder `__init__.py` or empty modules that establish the package structure. Files marked `(config)` contain configuration. Files marked `(skeleton)` need a minimal working implementation described in Part 2.

```
cleave/
├── .env.example                          (config) All environment variables with defaults/placeholders
├── .gitignore                            (config) Python, Node, Postgres, IDE ignores
├── docker-compose.yml                    (config) Postgres + FastAPI + frontend dev
├── README.md                             (skeleton) Project overview, setup instructions
├── CLAUDE.md                             (already exists — do not modify)
│
├── backend/
│   ├── pyproject.toml                    (config) Python deps, project metadata, ruff config
│   ├── alembic.ini                       (config) Alembic config pointing to migrations/
│   ├── Dockerfile                        (config) Python 3.11-slim, pip install, uvicorn entrypoint
│   ├── main.py                           (skeleton) FastAPI app creation, middleware, router includes
│   ├── config.py                         (skeleton) Pydantic Settings class, reads .env
│   ├── database.py                       (skeleton) SQLAlchemy async engine, session factory, Base
│   │
│   ├── models/                           SQLAlchemy ORM models (one file per entity)
│   │   ├── __init__.py                   (empty) Re-exports all models for Alembic discovery
│   │   ├── user.py                       (skeleton) User model
│   │   ├── project.py                    (skeleton) Project + ProjectMember models
│   │   ├── experiment.py                 (skeleton) Experiment model
│   │   ├── fastq_file.py                 (skeleton) FastqFile model
│   │   ├── reaction.py                   (skeleton) Reaction model
│   │   ├── analysis_job.py               (skeleton) AnalysisJob model
│   │   ├── job_output.py                 (skeleton) JobOutput model
│   │   └── notification.py               (skeleton) Notification model
│   │
│   ├── schemas/                          Pydantic v2 request/response schemas
│   │   ├── __init__.py                   (empty)
│   │   ├── auth.py                       (skeleton) UserRead, UserCreate, UserUpdate (extend fastapi-users base schemas)
│   │   ├── user.py                       (skeleton) UserRead, UserUpdate
│   │   ├── project.py                    (skeleton) ProjectCreate, ProjectRead, ProjectUpdate, ProjectListResponse
│   │   ├── experiment.py                 (skeleton) ExperimentCreate, ExperimentRead, ExperimentUpdate
│   │   ├── reaction.py                   (skeleton) ReactionCreate, ReactionRead, ReactionBulkCreate
│   │   ├── fastq_file.py                 (skeleton) FastqFileRead
│   │   ├── job.py                        (skeleton) JobCreate, JobRead, JobListResponse
│   │   ├── notification.py               (skeleton) NotificationRead
│   │   └── common.py                     (skeleton) PaginatedResponse generic, ErrorResponse, StatusEnum
│   │
│   ├── routers/                          FastAPI APIRouter modules (one per resource)
│   │   ├── __init__.py                   (empty)
│   │   ├── auth.py                       (skeleton) /api/v1/auth/* — fastapi-users generated routers (login, register, refresh)
│   │   ├── users.py                      (skeleton) /api/v1/users/me — profile CRUD
│   │   ├── projects.py                   (skeleton) /api/v1/projects/* — project CRUD + members
│   │   ├── experiments.py                (skeleton) /api/v1/experiments/* — experiment CRUD
│   │   ├── reactions.py                  (skeleton) /api/v1/experiments/:id/reactions/*
│   │   ├── fastq_files.py               (skeleton) /api/v1/experiments/:id/fastqs/*
│   │   ├── jobs.py                       (skeleton) /api/v1/experiments/:id/jobs/* + /api/v1/jobs/*
│   │   ├── files.py                      (skeleton) /api/v1/jobs/:jid/files/*
│   │   └── notifications.py             (skeleton) /api/v1/notifications/*
│   │
│   ├── services/                         Business logic layer (routers call these, not DB directly)
│   │   ├── __init__.py                   (empty)
│   │   ├── auth_service.py               (skeleton) UserManager subclass with custom hooks (on_after_register, etc.)
│   │   ├── project_service.py            (skeleton) Project CRUD, member management, permission checks
│   │   ├── experiment_service.py         (skeleton) Experiment CRUD, status management
│   │   └── notification_service.py       (skeleton) Create notifications, mark read
│   │
│   ├── dependencies.py                   (skeleton) FastAPI Depends: get_db, current_active_user (via fastapi-users), require_project_role
│   │
│   ├── migrations/                       Alembic migrations directory
│   │   ├── env.py                        (skeleton) Alembic env — imports all models, uses async engine
│   │   ├── script.py.mako                (config) Alembic migration template
│   │   └── versions/                     (empty dir) Auto-generated migrations go here
│   │
│   ├── pipelines/                        Pipeline modules (Phase 3+, but structure created now)
│   │   ├── __init__.py                   (skeleton) Dispatch function: run(job_type, params) → result
│   │   ├── base.py                       (skeleton) PipelineStage base class with validate/run/mock_run
│   │   ├── adapters/                     Trimmomatic adapter FASTAs (copy from references/)
│   │   │   ├── Truseq3.PE.fa
│   │   │   ├── Truseq3.SE.fa
│   │   │   ├── NexteraPE-PE.fa
│   │   │   └── TruSeqAdapters.fa
│   │   ├── reference/                    Static reference data
│   │   │   ├── blacklists/
│   │   │   │   ├── mm10.blacklist.bed
│   │   │   │   ├── hg38.blacklist.bed
│   │   │   │   └── hg19.blacklist.bed
│   │   │   ├── chrom_sizes/
│   │   │   │   ├── mm10.chrom.sizes
│   │   │   │   ├── hg38.chrom.sizes
│   │   │   │   ├── hg19.chrom.sizes
│   │   │   │   └── ecoli.chrom.sizes
│   │   │   └── masks/
│   │   │       └── manual.mask.ultimate.bed
│   │   └── tools/                        Pipeline helper scripts (copy from references/)
│   │       ├── SEACR_1.1.sh
│   │       ├── SEACR_1.1.R
│   │       ├── filter_below.awk
│   │       ├── change.bdg.py
│   │       ├── get_summits_seacr.py
│   │       ├── get_summits_broadPeak.py
│   │       ├── kseq_test.c
│   │       ├── kseq.h
│   │       └── make_kseq_test.sh
│   │
│   ├── worker.py                         (skeleton) Standalone worker process — polls analysis_jobs, runs pipelines
│   │
│   └── tests/
│       ├── __init__.py                   (empty)
│       ├── conftest.py                   (skeleton) pytest fixtures: test DB, test client, test user, auth headers
│       ├── test_auth.py                  (skeleton) Auth endpoint tests (register, login, refresh, protected route)
│       ├── test_projects.py              (skeleton) Project CRUD + member tests
│       └── test_experiments.py           (skeleton) Experiment CRUD tests
│
├── frontend/
│   ├── package.json                      (config) React, Vite, Tailwind, TanStack deps
│   ├── tsconfig.json                     (config) TypeScript config (strict mode)
│   ├── tsconfig.app.json                 (config) App-specific TS config
│   ├── tsconfig.node.json                (config) Node/Vite TS config
│   ├── vite.config.ts                    (config) Vite config with API proxy to :8000
│   ├── tailwind.config.js                (config) Tailwind with custom colors matching CUTANA palette
│   ├── postcss.config.js                 (config) PostCSS for Tailwind
│   ├── index.html                        (config) Vite entry HTML
│   ├── .eslintrc.cjs                     (config) ESLint for React + TS
│   │
│   └── src/
│       ├── main.tsx                      (skeleton) React root, BrowserRouter, QueryClientProvider
│       ├── App.tsx                        (skeleton) Route definitions, layout wrapper
│       ├── index.css                     (config) Tailwind directives + CUTANA gradient CSS custom properties
│       ├── vite-env.d.ts                 (config) Vite type declarations
│       │
│       ├── api/
│       │   ├── client.ts                 (skeleton) Fetch wrapper: base URL, auth headers, token refresh, error normalization
│       │   ├── auth.ts                   (skeleton) login(), register(), refresh(), logout()
│       │   ├── projects.ts               (skeleton) getProjects(), createProject(), getProject(), updateProject(), etc.
│       │   ├── experiments.ts            (skeleton) getExperiments(), createExperiment(), etc.
│       │   └── types.ts                  (skeleton) TypeScript types mirroring backend Pydantic schemas
│       │
│       ├── hooks/
│       │   ├── useAuth.ts                (skeleton) Auth context hook: login, logout, current user, isAuthenticated
│       │   └── useProjects.ts            (skeleton) TanStack Query hooks for project CRUD
│       │
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Navbar.tsx            (skeleton) Top nav: logo, Home, Analysis Queue, bell icon, user dropdown
│       │   │   ├── Breadcrumbs.tsx       (skeleton) Breadcrumb trail component
│       │   │   ├── GradientBackground.tsx (skeleton) The CUTANA sky-blue→gold gradient wrapper
│       │   │   └── Card.tsx              (skeleton) White rounded-corner card container
│       │   ├── ui/
│       │   │   ├── Button.tsx            (skeleton) Pill-shaped button (primary/secondary/outlined variants)
│       │   │   ├── StatusBadge.tsx       (skeleton) Colored dot + status text
│       │   │   ├── DataTable.tsx         (skeleton) TanStack Table wrapper — sort, filter, search, pagination, column customization
│       │   │   ├── WizardModal.tsx       (skeleton) Multi-step modal with numbered step indicators
│       │   │   ├── Modal.tsx             (skeleton) Base modal overlay component
│       │   │   └── Input.tsx             (skeleton) Form input with label, validation state, help icon
│       │   └── auth/
│       │       └── ProtectedRoute.tsx    (skeleton) Redirect to /login if not authenticated
│       │
│       ├── pages/
│       │   ├── LoginPage.tsx             (skeleton) Email + password form, register link
│       │   ├── RegisterPage.tsx          (skeleton) Email + password + name form
│       │   ├── HomePage.tsx              (skeleton) Projects dashboard (filter sidebar + project cards grid)
│       │   ├── ProjectDetailPage.tsx     (skeleton) Left sidebar (info + members) + experiments table
│       │   ├── ExperimentView.tsx        (skeleton) Experiment header + left tab sidebar + Outlet for sub-routes
│       │   ├── experiment/
│       │   │   ├── DescriptionTab.tsx    (skeleton) Details card + description card
│       │   │   ├── FastqsTab.tsx         (skeleton) FASTQ files table
│       │   │   ├── ReactionsTab.tsx      (skeleton) Reactions metadata table
│       │   │   ├── AlignmentTab.tsx      (skeleton) Sub-tabs: Info, Input, QC, Files, IGV (placeholder for Phase 3+)
│       │   │   ├── PeakCallingTab.tsx    (skeleton) Sub-tabs placeholder (Phase 4)
│       │   │   ├── HistoryTab.tsx        (skeleton) Placeholder
│       │   │   └── AllFilesTab.tsx       (skeleton) Dual-panel file browser placeholder
│       │   ├── AnalysisQueuePage.tsx     (skeleton) Cross-project job list table
│       │   └── SettingsPage.tsx          (skeleton) Account info, notification prefs
│       │
│       ├── contexts/
│       │   └── AuthContext.tsx            (skeleton) React context for auth state (tokens, user, login/logout)
│       │
│       └── lib/
│           ├── constants.ts              (config) Status colors, role labels, assay types, organism list
│           └── utils.ts                  (skeleton) formatBytes, formatDate, formatDuration utilities
│
└── references/                           (already exists — lab scripts, configs, conda envs. Do NOT modify)
```

---

## Part 2: File Contents Specification

For each `(skeleton)` file, describe its purpose and what it should contain. For `(config)` files, specify the exact configuration values. Do NOT write full implementations — describe the structure, imports, exports, and key design decisions so that each file can be implemented correctly in a follow-up pass.

### 2.1 Root Config Files

**`.env.example`** — enumerate ALL environment variables with sensible defaults:
```
# Database
DATABASE_URL=postgresql+asyncpg://cleave:dev@localhost:5432/cleave

# Auth
SECRET_KEY=change-me-in-production
REFRESH_SECRET_KEY=change-me-too
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# App
CORS_ORIGINS=http://localhost:5173
STORAGE_ROOT=/data/cleave
UPLOAD_MAX_SIZE_MB=5000
PIPELINE_MODE=mock

# Worker
WORKER_POLL_INTERVAL_SECONDS=2

# Email (Phase 3 — leave empty for now)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=

# Genomes (Phase 3 — paths to Bowtie2 indices)
GENOME_INDEX_DIR=/data/cleave/genomes
```

**`docker-compose.yml`** — three services:
- `db`: postgres:15, env vars for POSTGRES_DB/USER/PASSWORD=`cleave`/`cleave`/`dev`, port 5432, named volume `pgdata`
- `api`: builds from `./backend/Dockerfile`, command `uvicorn main:app --reload --host 0.0.0.0 --port 8000`, port 8000, mounts `./backend:/app` and `./dev-data:/data/cleave`, env: `DATABASE_URL`, `PIPELINE_MODE=mock`, `CORS_ORIGINS=http://localhost:5173`, `SECRET_KEY=dev-secret-key`, depends_on `db`
- `frontend`: `node:20-slim`, working_dir `/app`, command `npm run dev -- --host 0.0.0.0`, port 5173, mounts `./frontend:/app` and anonymous volume for `node_modules`

**`.gitignore`** — include: `__pycache__`, `.env`, `node_modules`, `dist`, `*.pyc`, `.ruff_cache`, `pgdata`, `dev-data`, `.pytest_cache`, `*.egg-info`, `.vscode`, `.idea`, `*.bam`, `*.bw`, `*.fastq.gz` (don't accidentally commit genomic data)

### 2.2 Backend Config Files

**`backend/pyproject.toml`** — project name `cleave-backend`, Python >=3.11. Dependencies:
- Runtime: `fastapi>=0.109`, `uvicorn[standard]`, `sqlalchemy[asyncio]>=2.0`, `asyncpg`, `alembic`, `pydantic>=2.0`, `pydantic-settings`, `fastapi-users[sqlalchemy]`, `slowapi`, `python-multipart`, `httpx` (for testing)
- Dev: `pytest`, `pytest-asyncio`, `ruff`, `httpx`

Ruff config section: line-length 100, select `["E", "F", "I", "W"]`, target Python 3.11.

**`backend/alembic.ini`** — standard Alembic config. `sqlalchemy.url` should be overridden by `env.py` reading from the app's config (NOT hardcoded in ini).

**`backend/Dockerfile`** — `FROM python:3.11-slim`, `WORKDIR /app`, copy `pyproject.toml`, `pip install .`, copy source, expose 8000, CMD `uvicorn main:app --host 0.0.0.0 --port 8000`.

### 2.3 Backend Application Files

**`backend/config.py`** — Pydantic `BaseSettings` class with all env vars from `.env.example`. Use `model_config = SettingsConfigDict(env_file=".env")`. Export a singleton `settings = Settings()`.

**`backend/database.py`** — Create async SQLAlchemy engine from `settings.DATABASE_URL`. Create `async_sessionmaker`. Define `Base = declarative_base()`. Export `get_db` async generator for FastAPI Depends.

**`backend/main.py`** — Create `FastAPI(title="Cleave", version="0.1.0")` app. Add CORS middleware with `settings.CORS_ORIGINS`. Include all routers with `/api/v1` prefix. Add a `/api/v1/health` endpoint returning `{"status": "ok"}`.

**`backend/dependencies.py`** — Key dependencies:
- `get_db`: yields async DB session (from database.py)
- `current_active_user`: provided by fastapi-users — decodes JWT from `Authorization: Bearer` header, loads User from DB, raises 401 if invalid. Replaces hand-written `get_current_user`.
- `require_project_role(project_id, roles)`: checks `project_members` table for current user's role, raises 403 if insufficient. This is still custom code, not part of fastapi-users.

### 2.4 Backend Models

All models use SQLAlchemy 2.0 mapped_column syntax. Follow the schema EXACTLY as defined in `cutana-architecture-plan.md` §4, with these additions:

- The `User` model should extend fastapi-users' `SQLAlchemyBaseUserTable` mixin while keeping our custom fields (`first_name`, `last_name`, `email_notifications`). The mixin provides `id`, `email`, `hashed_password`, `is_active`, `is_superuser`, `is_verified` — do not redefine these.
- All `TIMESTAMPTZ` columns use `DateTime(timezone=True)` with `server_default=func.now()`
- Add `__tablename__` to every model
- The `analysis_jobs.params` JSONB column uses `Column(JSON)` in SQLAlchemy
- `project_members` uses a composite primary key (project_id, user_id)
- Add string length constraints matching the UI: experiment name 100 chars, analysis job name 30 chars
- Add `storage_bytes: Mapped[int] = mapped_column(BigInteger, default=0)` to both `projects` and `experiments` tables

### 2.5 Backend Schemas

Pydantic v2 models. Key patterns:
- Auth-related schemas (`UserRead`, `UserCreate`, `UserUpdate`) are provided by fastapi-users base schemas. Extend them to include custom fields (`first_name`, `last_name`, `email_notifications`) if needed on registration. The `LoginRequest`, `TokenResponse`, and `RegisterRequest` schemas from the original plan are no longer hand-written — fastapi-users handles these internally.
- Every non-auth entity has `Create`, `Read`, and (where applicable) `Update` schemas
- `Read` schemas include `id` and timestamps; `Create` schemas don't
- Use `model_config = ConfigDict(from_attributes=True)` on all Read schemas for ORM compatibility
- `common.py` defines: `PaginatedResponse[T]` (generic with `items: list[T]`, `total: int`, `page: int`, `per_page: int`), `ErrorResponse` (`error: str`, `detail: str | None`, `field_errors: dict | None`), and string enums for `ExperimentStatus`, `JobStatus`, `ProjectRole`, `AssayType`, `Organism`

### 2.6 Backend Routers

Each router is a FastAPI `APIRouter` with appropriate prefix and tags. Phase 1 implements CRUD for auth, users, projects (with members), and experiments. Other routers (reactions, fastqs, jobs, files, notifications) are created as empty skeletons with a single placeholder endpoint that returns 501 Not Implemented.

The auth router is generated by fastapi-users via `fastapi_users.get_auth_router()` and `get_register_router()`, mounted at `/api/v1/auth`. The generated routers provide the same three endpoints: `POST /login` (returns access + refresh tokens), `POST /register` (creates user, returns tokens), `POST /refresh` (reads refresh token from cookie or body, returns new access token). We may add a thin wrapper for any custom behavior (like creating a notification on registration via the `UserManager.on_after_register` hook).

### 2.7 Backend Services

Thin service layer between routers and the database. Each service receives a DB session and performs queries. This keeps routers focused on HTTP concerns (parsing requests, returning responses) and services focused on business logic (permission checks, validation, data access).

`auth_service.py` is now primarily a `UserManager` subclass with custom hooks rather than hand-rolled auth logic. Most functions (`hash_password`, `verify_password`, `create_access_token`, etc.) are internal to fastapi-users. This file provides: `on_after_register` (create a welcome notification), `on_after_forgot_password` (deferred to Phase 3 when SES is configured), and any custom validation logic. Rate limiting via `slowapi` should also be configured here or in `main.py` — apply to `/api/v1/auth/login` (5/min per IP) and `/api/v1/auth/register` (3/min per IP).

`project_service.py` handles: `create_project()` (also adds creator as admin member), `list_projects_for_user()`, `get_project()`, `update_project()`, `delete_project()`, `add_member()`, `remove_member()`, `update_member_role()`, `check_permission()`.

### 2.8 Backend Tests

`conftest.py` sets up: an async test database (use a separate `cleave_test` database or SQLite for speed), a `TestClient` via httpx's `AsyncClient`, fixtures for creating a test user and getting auth headers.

Test files contain placeholder test functions with descriptive names (e.g., `test_register_creates_user`, `test_login_returns_tokens`, `test_create_project_requires_auth`, `test_project_creator_is_admin`) — each with a `pass` body and a `# TODO: implement` comment. This establishes the test structure without writing test logic yet.

### 2.9 Backend Pipeline Stubs

`pipelines/__init__.py` has a `run(job_type: str, params: dict, working_dir: Path) -> dict` dispatch function that raises `NotImplementedError` for all job types in real mode and returns canned results in mock mode.

`pipelines/base.py` defines the `PipelineStage` abstract base class with `validate()`, `run()`, `mock_run()`, and `generate_methods_text()` methods. Also defines `PipelineError(Exception)`.

### 2.10 Frontend Config Files

**`package.json`** — dependencies:
- Runtime: `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `@tanstack/react-table`, `axios`, `recharts` (for later charts)
- Dev: `typescript`, `@types/react`, `@types/react-dom`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `postcss`, `autoprefixer`, `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint-plugin-react-hooks`

**`vite.config.ts`** — React plugin, dev server proxy: `/api` → `http://localhost:8000` (so frontend can call backend without CORS in dev via the proxy, as a fallback alongside CORS middleware).

**`tailwind.config.js`** — extend theme with CUTANA color palette:
```js
colors: {
  primary: { DEFAULT: '#4AAED9', dark: '#3A8EBF' },
  status: {
    new: '#3F51B5',
    'in-progress': '#00BCD4',
    complete: '#4CAF50',
    error: '#B71C1C',
    terminated: '#9E9E9E',
  },
  accent: { teal: '#2BBCC4', gold: '#F5A623' },
}
```

**`index.css`** — Tailwind directives (`@tailwind base/components/utilities`) plus CSS custom properties for the gradient background:
```css
:root {
  --gradient-bg: linear-gradient(180deg, #87CEEB 0%, #7ECFCF 25%, #90D5A0 50%, #C5D94E 75%, #E8B84B 100%);
}
```

### 2.11 Frontend Application Files

**`src/main.tsx`** — renders `<BrowserRouter>` wrapping `<QueryClientProvider>` wrapping `<AuthProvider>` wrapping `<App />`.

**`src/App.tsx`** — React Router v6 route definitions. Layout route wraps all authenticated pages with `<Navbar>` + `<Breadcrumbs>` + `<GradientBackground>`. Auth routes (`/login`, `/register`) use a minimal layout. Experiment view uses nested routes with `<Outlet>` for tab content.

Route structure:
```
/login → LoginPage
/register → RegisterPage
/ → ProtectedRoute
  / → HomePage
  /projects/:id → ProjectDetailPage
  /experiments/:id → ExperimentView
    /experiments/:id/description → DescriptionTab (index route)
    /experiments/:id/fastqs → FastqsTab
    /experiments/:id/reactions → ReactionsTab
    /experiments/:id/alignment/:jid → AlignmentTab
    /experiments/:id/peaks/:jid → PeakCallingTab
    /experiments/:id/history → HistoryTab
    /experiments/:id/files → AllFilesTab
  /queue → AnalysisQueuePage
  /settings → SettingsPage
```

**`src/api/client.ts`** — an Axios instance created with `axios.create({ baseURL: '/api/v1' })`. A request interceptor adds `Authorization: Bearer <token>` from auth context. A response interceptor catches 401 errors, attempts token refresh, and retries the original request once. A second response interceptor normalizes error responses into a consistent `ApiError` shape. All other api modules (`auth.ts`, `projects.ts`, etc.) import and use this configured Axios instance.

**`src/contexts/AuthContext.tsx`** — React context providing: `user` (current user object or null), `accessToken` (string or null), `login(email, password)`, `register(email, password, firstName, lastName)`, `logout()`, `isAuthenticated` (boolean). Tokens stored in memory (not localStorage — per artifact restrictions and security best practice). On mount, attempt refresh via cookie to restore session.

### 2.12 Frontend Pages

All page components should be minimal skeletons that render the correct layout structure (cards, headers, placeholder text) but with no real data fetching or interactivity yet. The goal is to verify routing works and the visual shell looks right.

- `HomePage`: gradient background, left sidebar with "Projects Filters" heading, main area with "Projects" heading and a placeholder card grid.
- `ProjectDetailPage`: left sidebar with project name and "Members" section, main area with "Experiments" table heading and "+ Create Experiment" button.
- `ExperimentView`: experiment name header with "NEW ANALYSIS" button, left sidebar with tab links, `<Outlet>` for tab content.
- All tab pages: white card with the tab name as heading and "Coming soon" placeholder text.

---

## Part 3: Wiring Verification Checklist

After scaffolding, these should all work:

1. `docker compose up` starts all three services without errors
2. `http://localhost:8000/api/v1/health` returns `{"status": "ok"}`
3. `http://localhost:8000/docs` shows FastAPI auto-generated OpenAPI docs
4. `http://localhost:5173` shows the React app with the gradient background
5. Frontend can call the health endpoint via Vite proxy (no CORS errors)
6. `docker compose exec api alembic upgrade head` applies all migrations to Postgres
7. `docker compose exec api alembic downgrade base` cleanly reverses all migrations
8. `docker compose exec db psql -U cleave -d cleave -c '\dt'` shows all expected tables
9. `cd backend && ruff check .` passes with no errors
10. `cd frontend && npx tsc --noEmit` passes with no type errors

---

## Part 4: Key Design Decisions to Enforce

1. **SQLAlchemy 2.0 style only.** Use `Mapped[]` type annotations, `mapped_column()`, `relationship()` with string-based `back_populates`. No legacy `Column()` style except for JSONB.

2. **Async everywhere.** The DB engine is async (`create_async_engine`). The session factory is `async_sessionmaker`. All service functions are `async def`. All router handlers are `async def`.

3. **Pydantic v2 only.** Use `model_config = ConfigDict(...)` instead of inner `class Config`. Use `model_validator` instead of `validator`. Field definitions use standard Python type hints.

4. **No global state in modules.** The `settings` singleton in `config.py` is the ONE exception. Everything else is passed via dependency injection (FastAPI `Depends`).

5. **Consistent API response format.** List endpoints return `PaginatedResponse[T]`. Error responses return `ErrorResponse`. All responses use camelCase field names via Pydantic `alias_generator` (the DB uses snake_case, the API uses camelCase, Pydantic handles the translation).

6. **Frontend path aliases.** Configure Vite/TypeScript to use `@/` as an alias for `src/` so imports read `import { Button } from '@/components/ui/Button'` rather than relative path chains.

7. **No placeholder "Lorem ipsum" text in the UI.** Use real labels from the CUTANA Cloud UI reference (`cutana-cloud-ui.md`). If a feature isn't implemented yet, show the real heading with a muted "Not yet implemented" message.
