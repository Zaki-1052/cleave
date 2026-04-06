# 2026-03-27 — Bugfixes & Local Dev Setup for Real Pipeline Testing

## What was done

### Bug Fixes
- **useSSE.ts import path**: Fixed `useAuth` import from `@/contexts/AuthContext` → `@/hooks/useAuth` (matching all other files)
- **Deprecation warnings**:
  - httpx: Replaced per-request `cookies=` with `client.cookies.set()` in `test_auth.py` (test_refresh, test_logout)
  - FastAPI: Replaced `HTTP_422_UNPROCESSABLE_ENTITY` → `HTTP_422_UNPROCESSABLE_CONTENT` in `fastq_files.py` and `reactions.py`

### UI Improvement
- **Alignment QC Report info panel**: Moved from side-by-side layout to below the metrics table, collapsed by default with toggle. Uses responsive grid (1/2/3 columns) when expanded. Page was too narrow for side-by-side.

### Local Dev Script (`scripts/run-local.sh`)
- Fixed conda activation: wrapped in `set +u`/`set -u` to handle gfortran activation script's unbound variables
- Fixed env verification: check `CONDA_DEFAULT_ENV` instead of `which python` (pyenv shims interfered)
- Fixed pyenv/conda PATH conflict: prepend `$CONDA_PREFIX/bin` to PATH so conda Python takes priority over pyenv shims
- Fixed alembic/uvicorn resolution: use `python -m alembic` and `python -m uvicorn` instead of bare commands
- Fixed Postgres readiness check: added Docker-based `pg_isready` fallback when the tool isn't installed locally
- Installed backend deps (`pip install -e ".[dev]"`) into conda env using `$CONDA_PREFIX/bin/pip`

### Worker Process
- Worker wasn't in `docker compose ps` — needed explicit `docker compose up -d worker` to start it
- Documented the 3-terminal local dev workflow: API + Worker + Frontend

## Files modified
- `frontend/src/hooks/useSSE.ts` — fixed import path
- `frontend/src/components/alignment/AlignmentQCReportPanel.tsx` — layout change + collapsible info panel
- `backend/tests/test_auth.py` — httpx cookie deprecation fix
- `backend/routers/fastq_files.py` — HTTP 422 deprecation fix
- `backend/routers/reactions.py` — HTTP 422 deprecation fix
- `scripts/run-local.sh` — multiple fixes for conda/pyenv/PATH issues

## Key decisions
- Local dev with real pipeline: use `./scripts/run-local.sh` (API) + `./scripts/run-local.sh worker` (worker) + `npm run dev` (frontend)
- Switch back to Docker for mock mode: kill local processes, `docker compose up -d api worker`

## Open items
- Full end-to-end test of real pipeline mode (alignment with actual bioinformatics tools) still pending
- `brew link --force libpq` was needed for `pg_isready` on Mac
