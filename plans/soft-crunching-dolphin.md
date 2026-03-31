# Phase 1 Cleanup: Dev Infrastructure Fixes

## Context

Before starting Phase 1.3 (Project CRUD), four dev infrastructure issues need fixing. The test database uses SQLite which can't handle JSONB columns (needed for `analysis_jobs.params`). Ruff isn't available inside the Docker container. ESLint has no config file so `npm run lint` fails. And a speculative item in todos.md should be cleaned up.

---

## 1. Switch test database from SQLite to Postgres

### Create `docker/init-test-db.sql` (new file)
```sql
CREATE DATABASE cleave_test;
```
Postgres Docker image runs `.sql` files from `/docker-entrypoint-initdb.d/` on first container init. This creates the test DB alongside the main `cleave` DB using the same user/password.

**Note**: Only runs on first container creation. Existing volumes need `docker compose down -v` first.

### Modify `docker-compose.yml`
- Add volume mount to `db` service: `./docker/init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql:ro`
- Add `TEST_DATABASE_URL: postgresql+asyncpg://cleave:dev@db:5432/cleave_test` to `api` service environment

### Modify `backend/tests/conftest.py`
- Replace `sqlite+aiosqlite:///./test.db` with `os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://cleave:dev@localhost:5432/cleave_test")`
- Add `import os` at top
- Add `import models  # noqa: F401` to ensure all 9 tables are registered with `Base.metadata` before `create_all`
- Keep all fixture signatures identical — 13 auth tests unchanged

The env var fallback lets tests run both from host (`localhost:5432`) and inside the container (`db:5432` via env var).

### Modify `backend/pyproject.toml`
- Remove `"aiosqlite"` from `[project.optional-dependencies] dev` — no longer needed

### Modify `.env.example`
- Add `TEST_DATABASE_URL=postgresql+asyncpg://cleave:dev@localhost:5432/cleave_test` after `DATABASE_URL`

---

## 2. Add ruff to Docker API image

### Modify `backend/Dockerfile`
- Change `RUN pip install --no-cache-dir .` → `RUN pip install --no-cache-dir ".[dev]"`

This is a dev-only Docker image (prod uses systemd). `ruff` is already in `pyproject.toml` dev deps — the Dockerfile just wasn't installing them.

---

## 3. Create ESLint flat config for frontend

### Create `frontend/eslint.config.js` (new file)
All ESLint packages already in `devDependencies`. Create flat config using:
- `@eslint/js` recommended rules
- `typescript-eslint` recommended rules (applied to `**/*.{ts,tsx}` only)
- `eslint-plugin-react-hooks` recommended rules
- `eslint-plugin-react-refresh` with `only-export-components` warning
- `globals.browser` for browser environment
- Ignore `dist/` directory

Standard Vite + React + TypeScript ESLint config — nothing custom.

---

## 4. Update `docs/todos.md`

### Changes:
- **Check off** the test database item (line 55): `- [ ]` → `- [x]` with short "Fixed:" note
- **Remove** the `Consider splitting CLAUDE.md pipeline rules` bullet (line 88) — speculative, not actionable
- **Check off** both dev tooling items (lines 92-93): `- [ ]` → `- [x]` with short "Fixed:" notes
- If "Documentation maintenance" subsection has only checked-off items after removal, keep the heading (it's fine)

---

## Verification

```bash
# Rebuild everything (destroy old pgdata so init script runs)
docker compose down -v
docker compose up -d --build api

# Task 1: test DB exists
docker compose exec db psql -U cleave -l | grep cleave_test

# Task 2: ruff works in container
docker compose exec api ruff check .

# Task 1: all 13 auth tests pass on Postgres
docker compose exec api pytest -v

# Task 3: ESLint passes
cd frontend && npm run lint

# Task 4: visual inspection of todos.md
```

## Files Changed

| File | Action |
|------|--------|
| `docker/init-test-db.sql` | CREATE |
| `docker-compose.yml` | MODIFY — 2 lines added |
| `backend/tests/conftest.py` | MODIFY — SQLite→Postgres, env var, models import |
| `backend/pyproject.toml` | MODIFY — remove aiosqlite |
| `backend/Dockerfile` | MODIFY — `.[dev]` |
| `.env.example` | MODIFY — add TEST_DATABASE_URL |
| `frontend/eslint.config.js` | CREATE |
| `docs/todos.md` | MODIFY — check off 3 items, remove 1 |
