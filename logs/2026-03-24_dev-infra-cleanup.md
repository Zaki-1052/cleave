# 2026-03-24 — Dev Infrastructure Cleanup (Pre-Phase 1.3)

## What was done

- **Switched test DB from SQLite to Postgres**: `conftest.py` now uses `TEST_DATABASE_URL` env var pointing to a `cleave_test` Postgres database. Added `NullPool` to avoid asyncpg event loop conflicts between tests. Init script (`docker/init-test-db.sql`) auto-creates the DB on first container start. Removed `aiosqlite` dependency.
- **Added ruff to Docker API image**: Changed Dockerfile from `pip install .` to `pip install ".[dev]"` so ruff, pytest, and other dev tools are available inside the container.
- **Created ESLint flat config**: Added `frontend/eslint.config.js` with ESLint 9 flat config format — TypeScript, React Hooks, React Refresh rules. All deps were already in `package.json`. Passes with 0 errors (1 expected warning on AuthContext).
- **Cleaned up todos.md**: Checked off 3 resolved items (test DB, ruff, ESLint). Removed speculative "Consider splitting CLAUDE.md" item.

## Decisions made

- `NullPool` required for async test engine — asyncpg connections are tied to event loops, and pytest-asyncio creates a new loop per test. Without NullPool, connections from one test's loop leak into the next.
- `import models` added to conftest to ensure all 9 tables are registered with `Base.metadata.create_all`, rather than relying on transitive imports through `main → routers → services → models`.
- Existing `docker compose down -v` required for developers with existing pgdata volumes (init script only runs on first container creation).

## Open items

- JWT key length warnings in tests (dev keys too short) — cosmetic, not blocking
- AuthContext ESLint warning (exports context + component) — standard React pattern, harmless

## Key file paths

- `docker/init-test-db.sql` (new)
- `docker-compose.yml` (modified)
- `backend/tests/conftest.py` (modified)
- `backend/pyproject.toml` (modified)
- `backend/Dockerfile` (modified)
- `.env.example` (modified)
- `frontend/eslint.config.js` (new)
- `docs/todos.md` (modified)
