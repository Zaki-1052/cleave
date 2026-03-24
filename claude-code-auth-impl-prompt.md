# Task: Implement Phase 1.1 — Auth Backend with fastapi-users

## Goal

Wire the auth backend end-to-end using `fastapi-users`. After this task, registration, login, token refresh, and the `current_active_user` dependency all work against a real database. The API contract (endpoints, request/response shapes, cookie behavior) matches what the frontend already expects.

This is **backend implementation only** — do not touch the frontend, do not write tests (those are Phase 1.2 and 1.8 respectively).

## Current State

The Phase 1 scaffold is complete. The backend has stub files for models, schemas, routers, services, and dependencies. Nothing is wired end-to-end yet. Read the scaffold to understand what exists before modifying anything.

## Reference Documentation

Read these before implementing — they contain the authoritative specs:

- `@docs/PLAN.md` §1.1 — What to build, verification steps
- `@docs/scaffold-prompt.md` §2.2–2.7 — File-level specs for deps, models, schemas, routers, services, dependencies
- `@docs/cutana-architecture-plan.md` §9 — Auth flow, cookie config, rate limiting requirements
- `@docs/cleave-spec-decisions.md` §12 — Infrastructure decisions (items 5, 6, 9)
- `@CLAUDE.md` — Project conventions, coding standards

The docs are the source of truth. If anything in this prompt conflicts with the docs, the docs win.

## Scope

### In scope
- Install `fastapi-users[sqlalchemy]` and `slowapi`; remove `python-jose[cryptography]` and `passlib[bcrypt]` from `pyproject.toml`
- Update the `User` model to extend `SQLAlchemyBaseUserTable` while preserving custom fields
- Generate a new Alembic migration for any User model changes
- Configure the fastapi-users `AuthenticationBackend` (JWT strategy + transports)
- Create a `UserManager` subclass with custom hooks
- Mount the generated auth routers at `/api/v1/auth`
- Wire `current_active_user` as the auth dependency
- Apply `slowapi` rate limiting to login and register endpoints
- Update `dependencies.py` — replace any hand-rolled `get_current_user` with fastapi-users equivalent. **Do not remove or modify `require_project_role`** — it is unrelated to this task.

### Out of scope
- Frontend changes (Phase 1.2)
- Test implementation (Phase 1.8)
- Password reset flow (deferred to Phase 3)
- Any non-auth functionality (project CRUD, experiments, notifications, etc.)

## Key Constraints

1. **Cookie configuration must be explicit and auditable.** The exact `CookieTransport` parameters are specified in `cutana-architecture-plan.md` §9. These are security-critical — do not use library defaults without verifying they match the spec.

2. **Preserve existing scaffold code.** The stub files contain non-auth code (e.g., `require_project_role` in `dependencies.py`, project/experiment schemas, notification service). Only modify auth-related parts. If a file mixes auth and non-auth code, change only the auth parts.

3. **Alembic migration.** The User model is changing (extending `SQLAlchemyBaseUserTable` adds columns like `is_active`, `is_superuser`, `is_verified`). Generate an autogenerate migration and verify it applies and reverses cleanly.

4. **The env vars `SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`, and `REFRESH_TOKEN_EXPIRE_DAYS` already exist in `.env.example` and `config.py`.** Use them in the fastapi-users configuration rather than hardcoding values.

5. **Docker Compose.** The existing `docker compose up` must still work after your changes. Verify.

## Verification

These must all pass when you're done — they come directly from PLAN.md §1.1:

```bash
# Register a new user
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'
# → 201, user created in DB

# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test@example.com","password":"testpass123"}'
# → 200, returns access token, sets refresh cookie

# Access protected endpoint
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/v1/users/me
# → 200, returns user object

# Refresh
curl -X POST http://localhost:8000/api/v1/auth/refresh \
  --cookie "fapiusers_refresh=<cookie_value>"
# → 200, returns new access token

# Health check still works
curl http://localhost:8000/api/v1/health
# → {"status":"ok"}

# Linting passes
cd backend && ruff check . && ruff format --check .

# Migration round-trip
docker compose exec api alembic upgrade head
docker compose exec api alembic downgrade base
docker compose exec api alembic upgrade head
```

## Session Logging

After completing the implementation, write a session log to `logs/` per the project convention in CLAUDE.md.
