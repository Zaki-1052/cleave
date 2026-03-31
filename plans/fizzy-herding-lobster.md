# Phase 7.5 — Email Notifications + Password Reset

## Context

Phases 1–6 are complete (373 tests passing). The in-app notification system works (DB + SSE), but no emails are sent. The `email_notifications` preference field (`always`/`on_error`/`never`) exists on the user model and frontend settings page but isn't wired to anything. Password reset was deferred to when SES was configured — fastapi-users already has `reset_password_token_secret` set in `UserManager`. The PLAN.md spec says this is "a config flag flip, not a feature build."

**Outcome**: Users receive email when their jobs finish (respecting preference), and can reset their password via email link.

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| AWS SDK | `boto3` (sync, wrapped in `asyncio.to_thread`) | SES `send_email` is a single fast HTTP POST. `aioboto3` adds `aiohttp` dep chain for no real benefit. |
| Email templates | Jinja2 with `Environment(autoescape=True)` + `.html` files in `backend/templates/` | Auto-escapes all `{{ var }}` by default — prevents HTML injection from user-provided strings (job names, experiment names, project names). `string.Template` does zero escaping. |
| Password reset endpoints | Custom wrappers (like login/register) | Matches existing pattern, gives rate limiting control, prevents email enumeration (always 202). |
| Reset token expiry | Explicit `RESET_TOKEN_LIFETIME_SECONDS` config var (default 3600) | Don't rely on library defaults that can change between versions for security-sensitive features. |
| Session invalidation on password reset | `password_changed_at` column checked during token refresh | Closes the gap where stolen refresh cookies survive a password reset, without a full token blacklist. Small addition (1 column + ~10 lines in refresh endpoint). |
| SES unconfigured behavior | Graceful skip (log + return False) | Dev/test work without SES. No exceptions thrown. |
| Project name in worker | Extend existing experiment query with a `JOIN Project` | One extra column, zero new queries. |
| App URL for links | New `APP_URL` config var | `CORS_ORIGINS` can be multi-valued; we need a single canonical frontend URL. |

---

## Implementation Steps

### Step 1: Add dependencies

**File**: `backend/pyproject.toml`
- Add `"boto3"` and `"jinja2"` to `dependencies` list

Jinja2 is not currently installed as a transitive dep (Starlette lists it as optional). It was manually installed in the container (`pip install jinja2` → 3.1.6) but must be in pyproject.toml for Docker rebuilds.

### Step 2: Update config

**File**: `backend/config.py`
- Remove: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` (5 unused placeholder vars)
- Add:
  ```python
  # Email (Amazon SES)
  AWS_SES_REGION: str = ""            # empty = SES disabled (dev/test)
  AWS_SES_FROM_EMAIL: str = ""        # must be SES-verified address in production
  APP_URL: str = "http://localhost:5173"  # frontend URL for email links

  # Password reset
  RESET_TOKEN_LIFETIME_SECONDS: int = 3600  # 1 hour
  ```

**File**: `.env.example`
- Replace SMTP block with:
  ```
  # Email (Amazon SES — leave empty for local dev, emails will be skipped)
  AWS_SES_REGION=
  AWS_SES_FROM_EMAIL=
  APP_URL=http://localhost:5173

  # Password reset token lifetime (seconds)
  RESET_TOKEN_LIFETIME_SECONDS=3600
  ```

**File**: `docker-compose.yml`
- Add `AWS_SES_REGION: ""`, `AWS_SES_FROM_EMAIL: ""`, `APP_URL: http://localhost:5173` to both `api` and `worker` environment blocks

### Step 3: Add `password_changed_at` to User model + migration

**File**: `backend/models/user.py`
- Add column:
  ```python
  password_changed_at: Mapped[datetime | None] = mapped_column(
      DateTime(timezone=True), nullable=True, default=None
  )
  ```

**Run**: `docker compose exec api alembic revision --autogenerate -m "add password_changed_at to users"`
**Run**: `docker compose exec api alembic upgrade head`

### Step 4: Create email templates

**Directory**: `backend/templates/` (new)

All templates use Jinja2 `{{ var }}` syntax with autoescape. Inline CSS only (email clients strip `<style>` blocks). Clean, minimal HTML — no images.

**4a.** `job_complete.html` — Job notification email
- Variables: `job_name`, `experiment_name`, `project_name`, `status`, `status_color`, `duration`, `results_url`, `app_name`, `preference`
- Status color: `#4CAF50`=complete, `#B71C1C`=error, `#9E9E9E`=terminated
- Summary table: Job, Experiment, Project, Duration
- "View Results" CTA button → `{{ results_url }}`
- Footer: "You received this because your notification preference is set to '{{ preference }}'. Change it in Settings."

**4b.** `password_reset.html` — Reset link email
- Variables: `reset_url`, `user_name`, `app_name`
- "Reset Password" CTA button → `{{ reset_url }}`
- "If you didn't request this, ignore this email."
- "This link expires in 1 hour."

**4c.** `password_reset_confirm.html` — Confirmation email
- Variables: `user_name`, `login_url`, `app_name`
- "Your password has been changed" notice

### Step 5: Create email service

**File**: `backend/services/email_service.py` (new)

```python
# Module-level lazy SES client
_ses_client = None

def _get_ses_client():
    """Returns boto3 SES client, or None if SES is unconfigured."""

# Jinja2 environment with autoescape
_jinja_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent.parent / "templates"),
    autoescape=True,
)

def _render_template(name: str, **kwargs) -> str:
    """Render an HTML template with auto-escaped variables."""
    return _jinja_env.get_template(name).render(**kwargs)

def _send_email_sync(to, subject, html_body) -> bool:
    """Send via SES (sync). Catches ClientError, logs, returns bool."""

async def send_email(to, subject, html_body) -> bool:
    """Async wrapper via asyncio.to_thread. Non-blocking."""

def should_send_job_email(preference: str, job_status: str) -> bool:
    """Gate: always→True, never→False, on_error→only if status=='error'."""

def _format_duration(seconds: int | None) -> str:
    """Human-readable: None→'N/A', 45→'45s', 125→'2m 5s', 3725→'1h 2m'."""

async def send_job_notification_email(
    to, job_name, experiment_name, project_name, status,
    duration_seconds, experiment_id, preference
) -> bool:
    """Send job email if preference allows. Renders template, calls send_email."""

async def send_password_reset_email(to, token, user_name) -> bool:
    """Render password_reset.html with reset URL, send via SES."""

async def send_password_reset_confirmation_email(to, user_name) -> bool:
    """Render password_reset_confirm.html, send via SES."""
```

### Step 6: Wire email sending into the worker

**File**: `backend/worker.py`

**6a.** Extend experiment query (~line 136) to JOIN `Project.name`:
```python
from models.project import Project

exp_result = await db.execute(
    select(Experiment.name, Experiment.project_id, Project.name.label("project_name"))
    .join(Project, Project.id == Experiment.project_id)
    .where(Experiment.id == job.experiment_id)
)
project_name = exp_row.project_name if exp_row else "Unknown"
```

**6b.** Update `_create_job_notification` signature:
```python
async def _create_job_notification(
    user_id: int | None,
    job_name: str,
    status: str,
    experiment_name: str,
    experiment_id: int,
    project_name: str,          # NEW
    duration_seconds: int | None,  # NEW
) -> None:
```

After creating the DB notification, fetch user email + preference and call email service:
```python
from services.email_service import send_job_notification_email

user_result = await db.execute(
    select(User.email, User.email_notifications).where(User.id == user_id)
)
user_row = user_result.one_or_none()
if user_row:
    await send_job_notification_email(
        to=user_row.email,
        job_name=job_name,
        experiment_name=experiment_name,
        project_name=project_name,
        status=status,
        duration_seconds=duration_seconds,
        experiment_id=experiment_id,
        preference=user_row.email_notifications,
    )
```

**6c.** Update call site (~line 299) to pass `project_name` and `duration_seconds` (duration is already computed as `duration` variable in the surrounding scope).

### Step 7: Password reset — backend

**File**: `backend/auth.py`

Add to `UserManager`:
```python
reset_password_token_lifetime_seconds = settings.RESET_TOKEN_LIFETIME_SECONDS

async def on_after_forgot_password(self, user, token, request=None):
    from services.email_service import send_password_reset_email
    await send_password_reset_email(
        to=user.email, token=token,
        user_name=user.first_name or user.email,
    )

async def on_after_reset_password(self, user, request=None):
    from services.email_service import send_password_reset_confirmation_email
    # Invalidate existing sessions by updating password_changed_at
    session = self.user_db.session
    user.password_changed_at = datetime.now(timezone.utc)
    await session.commit()
    await send_password_reset_confirmation_email(
        to=user.email, user_name=user.first_name or user.email,
    )
```

**File**: `backend/routers/auth.py`

Add two custom endpoints matching the existing login/register wrapper pattern:

```python
class ForgotPasswordRequest(CamelModel):
    email: EmailStr

class ResetPasswordRequest(CamelModel):
    token: str
    password: str

@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("3/minute")
async def forgot_password(body, request, user_manager):
    try:
        user = await user_manager.get_by_email(body.email)
        await user_manager.forgot_password(user, request)
    except Exception:
        pass  # Always 202 — prevents email enumeration
    return {"status": "ok"}

@router.post("/reset-password", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def reset_password(body, request, user_manager):
    try:
        await user_manager.reset_password(body.token, body.password, request)
    except Exception:
        raise HTTPException(400, detail="RESET_PASSWORD_BAD_TOKEN")
    return {"status": "ok"}
```

**Invalidate sessions in refresh endpoint** — add check after `read_token`:
```python
@router.post("/refresh", response_model=TokenResponse)
async def refresh(request, response, user_manager):
    # ... existing token read logic ...
    user = await refresh_strategy.read_token(refresh_token, user_manager)
    if user is None:
        raise HTTPException(401, detail="Invalid or expired refresh token")

    # Reject refresh if password was changed after this token was issued
    if user.password_changed_at is not None:
        import jwt as pyjwt
        payload = pyjwt.decode(
            refresh_token, settings.REFRESH_SECRET_KEY,
            algorithms=["HS256"],
            audience=["fastapi-users:auth"],
        )
        token_issued_at = payload["exp"] - (settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400)
        if token_issued_at < user.password_changed_at.timestamp():
            raise HTTPException(401, detail="Password was changed. Please log in again.")

    # ... rest of refresh logic ...
```

### Step 8: Password reset — frontend

**File**: `frontend/src/api/auth.ts`
- Add `forgotPassword(email: string): Promise<void>` and `resetPassword(token: string, password: string): Promise<void>`

**File**: `frontend/src/pages/ForgotPasswordPage.tsx` (new)
- Matches `LoginPage.tsx` pattern: `GradientBackground` > centered `Card` > form
- Email `Input` + "Send Reset Link" `Button`
- On submit: call `forgotPassword(email)`, show success state regardless
- Success state: "If an account exists with that email, we've sent a reset link."
- Link: "Back to Sign In" → `/login`

**File**: `frontend/src/pages/ResetPasswordPage.tsx` (new)
- Reads `token` from URL query params (`useSearchParams`)
- If no token in URL → redirect to `/forgot-password`
- Two `Input` fields: New Password + Confirm Password (client-side match validation)
- On submit: call `resetPassword(token, password)`
- On success: "Password reset successfully." + "Sign In" link → `/login`
- On error: "Invalid or expired reset link." + "Request a new one" link → `/forgot-password`

**File**: `frontend/src/App.tsx`
- Add routes alongside `/login` and `/register` (outside `AuthenticatedLayout`):
  ```tsx
  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
  <Route path="/reset-password" element={<ResetPasswordPage />} />
  ```

**File**: `frontend/src/pages/LoginPage.tsx`
- Add below the error message / above the Register link:
  ```tsx
  <Link to="/forgot-password" className="text-sm text-primary hover:underline">
    Forgot your password?
  </Link>
  ```

### Step 9: Tests

**File**: `backend/tests/conftest.py`
- Add autouse fixture to prevent real SES calls in all tests:
  ```python
  @pytest.fixture(autouse=True)
  def mock_ses(monkeypatch):
      import services.email_service as email_mod
      monkeypatch.setattr(email_mod, "_ses_client", None)
      monkeypatch.setattr(settings, "AWS_SES_REGION", "")
  ```

**File**: `backend/tests/test_email_service.py` (new, ~15 tests)
- `should_send_job_email` matrix: 3 preferences × 3 statuses = 9 assertions across 3 test functions
- `_format_duration`: None, seconds, minutes, hours
- `_render_template`: verify variables substituted, verify HTML entities escaped (e.g. `<script>` in job name becomes `&lt;script&gt;`)
- Graceful skip when SES unconfigured (returns False, no exception)
- SES call made with correct params when configured (mock boto3 client, check `send_email` call args)

**File**: `backend/tests/test_auth.py` (extend, ~4 tests)
- `POST /forgot-password` returns 202 for existing email
- `POST /forgot-password` returns 202 for nonexistent email (no enumeration)
- `POST /reset-password` returns 400 for bad token
- Refresh rejected after password reset (if feasible to test the full flow with token extraction)

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `backend/pyproject.toml` | Modify | Add `boto3`, `jinja2` |
| `backend/config.py` | Modify | Replace 5 SMTP vars with SES + APP_URL + RESET_TOKEN_LIFETIME |
| `.env.example` | Modify | Update env var template |
| `docker-compose.yml` | Modify | Add SES env vars to api + worker |
| `backend/models/user.py` | Modify | Add `password_changed_at` column |
| `backend/migrations/versions/xxx.py` | Create | Alembic autogenerate for new column |
| `backend/templates/job_complete.html` | Create | Job notification email (Jinja2, ~60 lines) |
| `backend/templates/password_reset.html` | Create | Reset link email (Jinja2, ~40 lines) |
| `backend/templates/password_reset_confirm.html` | Create | Password changed confirmation (Jinja2, ~30 lines) |
| `backend/services/email_service.py` | Create | SES email service (~130 lines) |
| `backend/worker.py` | Modify | Join project name, wire email after notification |
| `backend/auth.py` | Modify | Add reset hooks, set `password_changed_at`, token lifetime |
| `backend/routers/auth.py` | Modify | Add forgot-password/reset-password endpoints, refresh invalidation check |
| `frontend/src/api/auth.ts` | Modify | Add forgotPassword/resetPassword functions |
| `frontend/src/pages/ForgotPasswordPage.tsx` | Create | Forgot password form (~60 lines) |
| `frontend/src/pages/ResetPasswordPage.tsx` | Create | Reset password form (~75 lines) |
| `frontend/src/App.tsx` | Modify | Add 2 routes |
| `frontend/src/pages/LoginPage.tsx` | Modify | Add "Forgot password?" link |
| `backend/tests/conftest.py` | Modify | Add autouse SES mock fixture |
| `backend/tests/test_email_service.py` | Create | Email service tests (~15 tests) |
| `backend/tests/test_auth.py` | Modify | Password reset endpoint tests (~4 tests) |

## Known Limitation

Stateless JWT auth means existing access tokens (30-min TTL) remain valid after password reset — they cannot be revoked without a token blacklist. The `password_changed_at` check only covers refresh tokens (7-day TTL), which is where the real risk lies. For 8–10 trusted lab members on an internal tool, this is acceptable. A full token blacklist is not warranted.

## Verification

1. **Unit tests**: `docker compose exec api pytest tests/test_email_service.py tests/test_auth.py -v`
2. **Lint**: `docker compose exec api ruff check .` + `docker compose exec api ruff format --check .`
3. **Type check**: `cd frontend && npx tsc --noEmit`
4. **Manual — job email**: Set `AWS_SES_REGION` + `AWS_SES_FROM_EMAIL` in `.env`, run a mock job, verify email arrives with correct content
5. **Manual — password reset**: Forgot password → enter email → check inbox → click link → set new password → login succeeds with new password
6. **Manual — preference gating**: Set preference to "Never" → run job → check logs for `email.skipped_preference`; set to "On Error" → complete job → no email; error job → email sent
7. **Manual — session invalidation**: Login → reset password via email → existing session's refresh should fail with "Password was changed"
8. **Full suite**: `docker compose exec api pytest tests/` — all 373+ tests pass
