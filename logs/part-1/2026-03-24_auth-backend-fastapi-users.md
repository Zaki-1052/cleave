# 2026-03-24 — Phase 1.1: Auth Backend with fastapi-users

## What was done
- Replaced hand-rolled JWT auth (python-jose + passlib/bcrypt) with fastapi-users library
- Updated User model to extend `SQLAlchemyBaseUserTable[int]` (adds `hashed_password`, `is_active`, `is_superuser`, `is_verified`)
- Created Alembic migration: renames `password_hash` → `hashed_password`, adds 3 boolean columns
- Created `backend/auth.py` — central fastapi-users config (UserManager, JWT strategies, auth backend, `current_active_user` dependency)
- Rewrote `backend/routers/auth.py` — login/register/refresh/logout using UserManager + JWTStrategy with dual transport (bearer in body + httpOnly refresh cookie)
- Updated all routers (users, projects, experiments) to use `current_active_user` instead of `get_current_user`
- Updated `dependencies.py` — removed old auth, kept `require_project_role()`
- Added `slowapi` rate limiting (5/min login, 3/min register)
- Created `backend/rate_limit.py` to avoid circular import between main.py and routers
- Deleted `backend/services/auth_service.py` (fully replaced)
- Updated schemas, config, .env.example
- Implemented auth test suite (13 tests) in `backend/tests/test_auth.py` with proper fixtures in `conftest.py`
- Ran `ruff format .` across entire backend (9 files reformatted from scaffold)
- Added `aiosqlite` to dev dependencies for test DB
- Updated `docs/todos.md` with Phase 1.1 completion checklist and code review findings

## Decisions made
- **Custom login/register endpoints** instead of fastapi-users generated routers — needed for dual-transport pattern (access token in JSON body + refresh token in httpOnly cookie)
- **`_Credentials` adapter class** bridges our JSON `{email, password}` input to fastapi-users' expected `{username, password}` format
- **`rate_limit.py` module** holds the slowapi Limiter instance to avoid circular imports (main.py imports routers, routers need limiter)
- **`foreign_keys` on User relationships** — required after extending `SQLAlchemyBaseUserTable` because `project_members.invited_by` creates ambiguous FK paths
- **SQLite for auth tests only** — works for auth-only tests (no JSONB columns), but must switch to Postgres test DB before Phase 1.3 when tests touch `analysis_jobs.params`
- **Rate limiter disabled in tests** via `limiter.enabled = False` in autouse fixture — avoids 429s from fixture registrations hitting the 3/min limit
- **Refresh test asserts contract, not bytes** — fastapi-users `generate_jwt` has no `iat`/`jti`, so same-second tokens are identical. Test verifies the refreshed token works on a protected endpoint (the actual contract) rather than asserting token bytes differ

## Open items
- Frontend not connected (Phase 1.2)
- Password reset deferred (Phase 3, needs SES)
- `on_after_register` hook creates welcome notification — needs testing with real notification flow
- Test DB must migrate from SQLite to Postgres before Phase 1.3 (JSONB incompatibility)
- Known issues from code review captured in `docs/todos.md` (path traversal, CORS withCredentials, mock mode files, Axios refresh queue, domain validation rules)

## Key file paths
- `backend/auth.py` (NEW) — fastapi-users config
- `backend/rate_limit.py` (NEW) — slowapi limiter
- `backend/routers/auth.py` — rewritten auth endpoints
- `backend/models/user.py` — extended with SQLAlchemyBaseUserTable
- `backend/dependencies.py` — simplified, uses current_active_user
- `backend/migrations/versions/fafd5c9dc468_fastapi_users_auth.py` — new migration
- `backend/services/auth_service.py` (DELETED)
- `backend/tests/conftest.py` — test fixtures (SQLite DB, client, registered_user)
- `backend/tests/test_auth.py` — 13 auth tests (all passing)
- `docs/todos.md` — updated with 1.1 completion + code review findings
