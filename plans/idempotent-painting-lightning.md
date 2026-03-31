# Phase 1.1: Auth Backend with fastapi-users

## Context

The Phase 1 scaffold has a complete **hand-rolled JWT auth implementation** (python-jose + passlib/bcrypt) across ~200 lines in `auth_service.py`, `routers/auth.py`, and `dependencies.py`. Per CLAUDE.md and PLAN.md, this must be replaced with `fastapi-users` — a community-audited library that eliminates security-critical glue code. The URL (`coleferguson.com`) is public-facing, so auth code should be battle-tested library code, not hand-rolled.

**Key constraint**: The project uses **integer primary keys** (not UUIDs), and needs a **dual-transport** pattern: Bearer token (access, 15-min) returned in response body + httpOnly cookie (refresh, 7-day) set on response. fastapi-users' generated routers use single-transport-per-backend, so login/register/refresh endpoints will use fastapi-users internals (UserManager, JWTStrategy) with thin custom wrappers.

---

## Implementation Steps

### Step 1: Update dependencies (`backend/pyproject.toml`)

**Remove**: `python-jose[cryptography]`, `passlib[bcrypt]`
**Add**: `fastapi-users[sqlalchemy]`, `slowapi`

Then rebuild the Docker container: `docker compose up -d --build api`

### Step 2: Update User model (`backend/models/user.py`)

Replace `class User(Base)` with `class User(SQLAlchemyBaseUserTable[int], Base)`.

The mixin provides: `id` (int PK), `email`, `hashed_password`, `is_active`, `is_superuser`, `is_verified`.

**Keep** custom fields: `first_name`, `last_name`, `email_notifications`, `created_at`.
**Keep** relationships: `projects_created`, `memberships`, `notifications`.
**Remove** fields now provided by mixin: `id`, `email`, `password_hash`.

```python
from fastapi_users.db import SQLAlchemyBaseUserTable

class User(SQLAlchemyBaseUserTable[int], Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    first_name: Mapped[str | None] = mapped_column(String)
    last_name: Mapped[str | None] = mapped_column(String)
    email_notifications: Mapped[str] = mapped_column(String, default="always")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # relationships unchanged
    projects_created: Mapped[list["Project"]] = relationship(back_populates="creator")
    memberships: Mapped[list["ProjectMember"]] = relationship(back_populates="user")
    notifications: Mapped[list["Notification"]] = relationship(back_populates="user")
```

### Step 3: Generate Alembic migration

The migration must:
1. **Rename column** `password_hash` → `hashed_password` (fastapi-users convention)
2. **Add column** `is_active` (Boolean, NOT NULL, default True)
3. **Add column** `is_superuser` (Boolean, NOT NULL, default False)
4. **Add column** `is_verified` (Boolean, NOT NULL, default False)

Autogenerate via `docker compose exec api alembic revision --autogenerate -m "fastapi_users_auth"`, then verify the migration applies and reverses cleanly.

Existing bcrypt hashes remain valid — fastapi-users' `PasswordHelper` (pwdlib) auto-detects bcrypt and upgrades to Argon2 on next login.

### Step 4: Create auth configuration (`backend/auth.py` — NEW FILE)

Central fastapi-users wiring. Contains:

- **`get_user_db()`** — yields `SQLAlchemyUserDatabase(session, User)`
- **`UserManager(IntegerIDMixin, BaseUserManager[User, int])`** — custom subclass with:
  - `on_after_register` hook → creates welcome notification via `notification_service.create_notification()`
- **`get_user_manager()`** — dependency yielding UserManager
- **Access JWT strategy** — `JWTStrategy(secret=settings.SECRET_KEY, lifetime_seconds=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)`
- **Refresh JWT strategy** — `JWTStrategy(secret=settings.REFRESH_SECRET_KEY, lifetime_seconds=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400)`
- **Auth backend** — `AuthenticationBackend(name="jwt", transport=BearerTransport(...), get_strategy=get_access_jwt_strategy)`
- **`FastAPIUsers[User, int]`** instance
- **`current_active_user`** — `fastapi_users_instance.current_user(active=True)`

### Step 5: Rewrite auth router (`backend/routers/auth.py`)

Replace the hand-rolled endpoints with thin wrappers that use fastapi-users' `UserManager` and `JWTStrategy` internally. This gives us the dual-transport pattern (access token in body + refresh cookie).

**`POST /login`** — accepts JSON `{email, password}`, authenticates via `user_manager.authenticate()`, returns `{access_token, token_type}`, sets `fapiusers_refresh` httpOnly cookie.

**`POST /register`** — accepts JSON `{email, password, first_name?, last_name?}`, creates user via `user_manager.create()`, returns `{access_token, token_type}` + sets refresh cookie. Status 201.

**`POST /refresh`** — reads `fapiusers_refresh` cookie, validates via refresh JWTStrategy, issues new access token + rotates refresh cookie.

**`POST /logout`** — clears the refresh cookie.

Cookie config (from `cutana-architecture-plan.md` §9):
- `key="fapiusers_refresh"`
- `httponly=True`
- `samesite="lax"`
- `secure=True` in prod (read from settings), `False` in dev
- `max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400`

### Step 6: Update dependencies (`backend/dependencies.py`)

- **Remove**: `get_current_user()`, `HTTPBearer`, `decode_token` import
- **Add**: Import `current_active_user` from `auth.py`
- **Update `require_project_role()`**: Change its inner dependency from `Depends(get_current_user)` to `Depends(current_active_user)`
- **Preserve**: `require_project_role()` logic entirely unchanged

```python
from auth import current_active_user

def require_project_role(roles: list[str]):
    async def _check(
        project_id: int,
        current_user: User = Depends(current_active_user),  # changed
        db: AsyncSession = Depends(get_db),
    ) -> User:
        # ... same logic ...
    return _check
```

### Step 7: Update all routers that use `get_current_user`

Replace `Depends(get_current_user)` with `Depends(current_active_user)` in:

| File | Occurrences |
|------|-------------|
| `routers/users.py` | 2 (get_me, update_me) |
| `routers/projects.py` | 4 (list, create, get, list_members) |
| `routers/experiments.py` | 5 (list, create, get, update, delete) |

Import changes: `from dependencies import get_current_user` → `from auth import current_active_user`

Note: `require_project_role` endpoints (update/delete project, manage members) get the new dependency transitively — no direct changes needed.

### Step 8: Update schemas (`backend/schemas/auth.py`, `backend/schemas/user.py`)

**`schemas/auth.py`**: Keep `TokenResponse`. Remove `LoginRequest`, `RegisterRequest`, `RefreshRequest` — replaced by fastapi-users schemas or custom Pydantic models in the auth router.

**`schemas/user.py`**: Add `is_active: bool` to `UserRead` so the frontend can see account status.

**New schemas** (in `schemas/auth.py` or `auth.py`): Create `UserCreate` and `UserUpdate` extending fastapi-users base schemas with custom fields:

```python
from fastapi_users import schemas as fu_schemas

class UserCreate(fu_schemas.BaseUserCreate):
    first_name: str | None = None
    last_name: str | None = None

class UserUpdate(fu_schemas.BaseUserUpdate):
    first_name: str | None = None
    last_name: str | None = None
    email_notifications: str | None = None
```

### Step 9: Add rate limiting (`backend/main.py`)

Add `slowapi` middleware:

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

Apply decorators on auth endpoints:
- `@limiter.limit("5/minute")` on `POST /login`
- `@limiter.limit("3/minute")` on `POST /register`

### Step 10: Update `main.py` router includes

- Keep `app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])`
- Keep `app.include_router(users.router, prefix="/api/v1/users", tags=["users"])`
- No changes to other router includes

### Step 11: Add cookie secure setting (`backend/config.py`)

Add one new setting:
```python
COOKIE_SECURE: bool = False  # Set True in production (.env)
```

### Step 12: Delete old auth service (`backend/services/auth_service.py`)

This file is fully replaced by fastapi-users. Delete entirely — no other file imports from it except the old `routers/auth.py` (rewritten) and `dependencies.py` (rewritten).

### Step 13: Update `.env.example`

Add: `COOKIE_SECURE=false`

---

## Files Modified (Summary)

| File | Action |
|------|--------|
| `backend/pyproject.toml` | Remove 2 deps, add 2 |
| `backend/auth.py` | **CREATE** — fastapi-users config |
| `backend/models/user.py` | Extend SQLAlchemyBaseUserTable |
| `backend/migrations/versions/xxx_fastapi_users_auth.py` | **CREATE** — autogenerated |
| `backend/routers/auth.py` | Rewrite with fastapi-users internals |
| `backend/routers/users.py` | Swap dependency import |
| `backend/routers/projects.py` | Swap dependency import |
| `backend/routers/experiments.py` | Swap dependency import |
| `backend/dependencies.py` | Remove get_current_user, update require_project_role |
| `backend/schemas/auth.py` | Rewrite with fastapi-users base schemas |
| `backend/schemas/user.py` | Add is_active field |
| `backend/config.py` | Add COOKIE_SECURE |
| `backend/main.py` | Add slowapi middleware |
| `backend/services/auth_service.py` | **DELETE** |
| `.env.example` | Add COOKIE_SECURE |

## Files NOT Modified

- `backend/database.py` — no changes needed
- `backend/models/__init__.py` — User import unchanged
- `backend/services/notification_service.py` — called by UserManager hook, not modified
- `backend/services/project_service.py` — receives user_id from routers, no auth coupling
- All frontend files — out of scope (Phase 1.2)
- Test files — out of scope (Phase 1.8)

---

## Verification

All commands from the implementation prompt:

```bash
# 1. Register
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'
# Expect: 201, user in DB

# 2. Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'
# Expect: 200, {"access_token": "...", "token_type": "bearer"}, Set-Cookie header

# 3. Protected endpoint
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/v1/users/me
# Expect: 200, user object

# 4. Refresh
curl -X POST http://localhost:8000/api/v1/auth/refresh \
  --cookie "fapiusers_refresh=<cookie_value>"
# Expect: 200, new access token

# 5. Health check
curl http://localhost:8000/api/v1/health
# Expect: {"status":"ok"}

# 6. Linting
cd backend && ruff check . && ruff format --check .

# 7. Migration round-trip
docker compose exec api alembic upgrade head
docker compose exec api alembic downgrade base
docker compose exec api alembic upgrade head
```

---

## Session Log

After implementation, write session log to `logs/YYYY-MM-DD_auth-backend-fastapi-users.md` per CLAUDE.md convention.
