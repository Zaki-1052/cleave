# Cleave — CLAUDE.md

> Self-hosted CUT&RUN/CUT&Tag bioinformatics platform (CUTANA Cloud clone + lab extensions).
> Built for the Ferguson Lab at UCSD. Single EC2 instance, ~8-10 users.

## Project Documentation

@cutana-cloud-ui.md
@cutana-architecture-plan.md
@cutana-cloud-info.md
@cf-lab-pipeline-spec.md
@cutana-cloud-docs.md

## Tech Stack

- **Frontend**: React 18+ (Vite), TanStack Table, Tailwind CSS, IGV.js, Recharts, tus-js-client
- **Backend**: FastAPI (Python 3.11+), Uvicorn, PostgreSQL 15+, SSE for real-time updates
- **Pipeline**: Python worker process → subprocess calls to Bowtie2, SAMtools, BEDTools, Picard, deepTools, MACS2, SICER2, SEACR, HOMER, Trimmomatic, DiffBind (R)
- **Infra**: NGINX reverse proxy, systemd, Docker Compose (local dev), single EC2 instance (prod)
- **Auth**: JWT (access 15min + refresh 7d httpOnly cookie), bcrypt

## Architecture Decisions

- All API routes under `/api/v1/`. JWT required except `/api/v1/auth/*`.
- Job queue is a `analysis_jobs` PostgreSQL table polled by a standalone worker process. One job at a time (alignment is CPU/memory-heavy). Concurrency is a config var for future scaling.
- `analysis_jobs.params` is JSONB — all job-specific config goes here. No per-job-type tables.
- `parent_job_id` encodes dependency chains (peak calling → alignment → trimming).
- Large files served via NGINX `X-Accel-Redirect`; FastAPI only checks auth, never streams large files.
- FASTQ uploads use tus protocol (chunked/resumable) — multi-GB files over unreliable connections.
- SSE (not WebSocket) for job status push. Unidirectional server→client is sufficient.
- `PIPELINE_MODE=mock` stubs pipeline calls locally for frontend/API dev without bioinfo tools.
- File storage: `/data/cleave/projects/{project_id}/{experiment_id}/...` (see architecture doc §5).

## Coding Standards

### Identity
You are an expert bioinformatician and full-stack developer acting as my senior pair programmer. I'm an undergrad familiar with Python, JS/TS, R, Java, Rust, Bash, Git.

### Workflow: Research → Plan → Implement → Validate
Start every feature by understanding existing patterns. Propose approach with reasoning. Build complete, production-ready solutions. ALWAYS run formatters, linters, and tests after implementation.

### Response Format
Start responses with:
```
**Language > Specialist**: {language} > {expert role}
**Includes**: CSV of libraries/packages
**Requirements**: verbosity level, design requirements
## Plan
Step-by-step plan, noting what won't be addressed yet
```
End responses with:
```
---
**History**: compressed summary of ALL requirements and code written
**Source Tree**: (💾/⚠️/👻) files → 📦 Classes → (✅/⭕/🔴) symbols
**Next Task**: description or enhancement suggestions if finished
```

### Core Principles (Strictly Enforced)
- **DRY**: Refactor repetitive logic into reusable functions. Redundancy causes bugs.
- **KISS**: Clear, minimal, easy to reason about. No clever hacks.
- **SRP**: Each function/module does one thing well.
- **Separation of Concerns**: UI, state, backend comms must be modular and decoupled.
- **Fail Fast, Fail Loud**: Raise errors early. Never suppress silent failures.
- **CQS**: Functions either do something (command) or return something (query) — never both.
- **Prioritize Functionality**: Fix underlying logic, not just symptoms. Never debug just to pass tests.
- **Use Established Interfaces**: Reuse existing functions before creating new ones.

### Code Style
- Files start with `path/filename` as a one-line comment.
- Comments describe **purpose**, not effect. If you need comments to explain sections, split into functions.
- Early returns to reduce nesting. Flat code is readable code.
- Prefer explicit over implicit: clear function names over clever abstractions.
- Small, focused functions. Modularity and reusability over monoliths.

### Error Handling & Debugging
- **3-Try Rule**: If we fail 3 times, stop and ask what information you need from me.
- **Systematic debugging**: (1) one logical fix attempt, (2) add logs to validate assumptions, (3) if stuck, reflect on 5-7 possible sources, distill to 1-2 most likely, add logs before fixing.
- Never take the "easy" path or skip to an alternative the moment you hit a bug. Dig at the root.

### Pipeline-Specific Rules
- Each pipeline stage is a Python module under `backend/pipelines/` with a standard interface: `validate()`, `run()`, `generate_methods_text()`.
- Pipeline modules call tools via `subprocess.run()`, capture stdout/stderr to log files, raise `PipelineError` on non-zero exit.
- Trimming is two-stage: Trimmomatic (adapter + quality) → kseq_test (fixed-length to 42bp). See lab pipeline spec §2 Stage 2.
- Three peak callers supported: MACS2 (narrow + broad), SICER2 (broad), SEACR (stringent + relaxed).
- Methods text is auto-generated per job — must include exact tool versions and parameters for manuscript copy-paste.
- All QC metrics (FRiP, alignment rates, spike-in recovery, duplication rate) have documented acceptable ranges in the CUTANA docs.

### Frontend Patterns
- Replicate CUTANA Cloud's visual language: gradient background (sky blue → seafoam → lime → gold), white card containers, primary blue `#4AAED9`, pill-shaped buttons.
- `DataTable` component wraps TanStack Table with sort, filter, search, pagination, column customization, full-screen, CSV download.
- `WizardModal` for multi-step flows (experiment creation 3-step, alignment 3-step, peak calling 4-step).
- Server state via TanStack Query. Local UI state via useState/useReducer. No global store needed at this scale.
- IGV.js lazy-loads tracks only when user selects reactions.

### Database Conventions
- Status enums: `new`, `in_progress`, `complete`, `error`, `terminated` (experiments); `queued`, `running`, `complete`, `error`, `terminated` (jobs).
- Project member roles: `admin`, `contributor`, `viewer`.
- `reactions` table enforces `UNIQUE (experiment_id, organism, short_name)`.
- Timestamps use `TIMESTAMPTZ DEFAULT now()`.

## Build & Run Commands

```bash
# Local dev (Docker Compose)
docker compose up              # Postgres + FastAPI + Vite dev server
cd frontend && npm run dev     # Frontend only (hot reload)
cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000  # API only

# Database
alembic upgrade head           # Run migrations
alembic revision --autogenerate -m "description"  # New migration

# Frontend
npm run build                  # Production build → dist/
npm run lint                   # ESLint
npm run typecheck              # TypeScript check

# Backend
ruff check backend/            # Python linting
ruff format backend/           # Python formatting
pytest backend/tests/          # Run tests
pytest backend/tests/test_specific.py -k "test_name"  # Single test
```

## Implementation Phases

Current phase tracking (update as we progress):
1. ⭕ Foundation (auth, project/experiment CRUD, UI shell)
2. 🔴 Data Management (FASTQ upload, FastQC, reactions, trimming)
3. 🔴 Core Pipeline (worker, SSE, alignment, QC reports)
4. 🔴 Peak Calling (MACS2/SICER2/SEACR, HOMER, FRiP)
5. 🔴 Visualization (IGV.js integration)
6. 🔴 Lab Extensions (DiffBind, custom heatmaps, Pearson correlation, Roman normalization)
7. 🔴 Polish & QA

## Gotchas

- IgG control has intentionally low alignment rates (~29%) — this is expected, not an error.
- `kseq_test` binary must be compiled from CUTRUNTools source or copied from lab instance.
- Trimmomatic requires Java (OpenJDK 17+).
- DiffBind has a known bug: top row of output missing column names. Our pipeline must add the header row programmatically.
- FASTQ processing is server-side only. Never load FASTQ data into browser memory.
- The lab's `integrated.sh` requests 32GB RAM via Slurm — `t3.xlarge` (16GB) may be tight for alignment. Validate during benchmarking.
- Adapter file `Truseq3.PE.fa` ships with the clone at `backend/pipelines/adapters/`.
