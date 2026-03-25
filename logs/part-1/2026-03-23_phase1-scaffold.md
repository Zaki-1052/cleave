# Phase 1 Scaffold — Session Log

**Date**: 2026-03-23
**Scope**: Complete monorepo scaffolding per `scaffold-prompt.md`

## What Was Done

- Created root config files: `.env.example`, `.gitignore`, `docker-compose.yml`
- Created full backend scaffold (FastAPI + SQLAlchemy 2.0 async + Alembic + Pydantic v2):
  - Core: `config.py`, `database.py`, `main.py`, `dependencies.py`, `logging_config.py`, `worker.py`
  - 8 SQLAlchemy models: user, project, project_member, experiment, fastq_file, reaction, analysis_job, job_output, notification
  - 9 Pydantic schema modules with `CamelModel` base (camelCase API responses)
  - 9 router modules (auth/users/projects/experiments fully wired, 5 stub routers returning 501)
  - 4 service modules (auth, project, experiment, notification)
  - Alembic async migration env with `sys.path` fix for container compatibility
  - Pipeline stubs (`__init__.py` dispatch + `base.py` ABC)
  - Test scaffolding (conftest + 3 test files with placeholder functions)
- Copied 27 reference files to `backend/pipelines/` (adapters, blacklists, chrom_sizes, masks, tools)
- Created full frontend scaffold (React 18 + Vite + TypeScript + Tailwind + TanStack):
  - Config: `package.json`, `vite.config.ts` (with `/api` proxy + `@/` alias), `tailwind.config.js` (CUTANA palette), `tsconfig*.json`
  - API layer: Axios client with auth interceptor + token refresh, auth/projects/experiments modules, TypeScript types
  - State: `AuthContext` (in-memory tokens), `useAuth` hook, `useProjects` TanStack Query hooks
  - 11 UI components: Navbar, Breadcrumbs, GradientBackground, Card, Button, StatusBadge, DataTable, Modal, WizardModal, Input, ProtectedRoute
  - 14 page components with full route structure matching CUTANA Cloud
- Generated and applied initial Alembic migration (9 tables)
- All 3 Docker Compose services running (db, api, frontend)

## Decisions Made

- Excluded `pipelines/tools/`, `pipelines/adapters/`, and `migrations/versions/` from ruff (third-party/auto-generated code)
- Added `sys.path.insert` in `migrations/env.py` to resolve imports when Alembic runs inside Docker container
- Frontend Docker service uses `sh -c "npm install && npm run dev"` to handle anonymous volume mount for node_modules
- `pyproject.toml` uses explicit `py-modules` + `packages.find` for setuptools discovery (flat layout)
- Added `structlog` for structured JSON logging (`logging_config.py`) — console renderer in dev (TTY), JSON renderer in production

## Open Items

- Auth flow not yet functional end-to-end (register/login/protected routes)
- Experiment CRUD not yet wired to frontend (API exists, no UI integration)
- Stub routers (reactions, fastqs, jobs, files, notifications) return 501
- Test functions are placeholders (`pass` bodies)
- No Dockerfile for frontend (using `node:20-slim` image directly)

## Key File Paths

```
.env.example, .gitignore, docker-compose.yml
backend/{config,database,main,dependencies,logging_config,worker}.py
backend/models/{user,project,experiment,fastq_file,reaction,analysis_job,job_output,notification}.py
backend/schemas/{common,auth,user,project,experiment,reaction,fastq_file,job,notification}.py
backend/routers/{auth,users,projects,experiments,reactions,fastq_files,jobs,files,notifications}.py
backend/services/{auth_service,project_service,experiment_service,notification_service}.py
backend/migrations/env.py, versions/bce0e9c5d2ee_initial_schema.py
backend/pipelines/{__init__,base}.py + adapters/ + reference/ + tools/
frontend/src/{main,App}.tsx
frontend/src/api/{client,auth,projects,experiments,types}.ts
frontend/src/contexts/AuthContext.tsx
frontend/src/components/{layout,ui,auth}/
frontend/src/pages/ (14 page components)
```
