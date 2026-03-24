# Task: Update All Project Documentation to Reflect fastapi-users Migration

## Context

We are switching from a homebrew JWT auth implementation to the `fastapi-users` library. This is a **documentation-only task** — do NOT write any implementation code. Update every relevant doc file to reflect the new auth approach so that when we implement Phase 1.1, the docs accurately describe what to build.

## Why We're Switching

The original plan was to hand-roll auth using `python-jose`, `passlib[bcrypt]`, and manual FastAPI dependencies. We're switching to `fastapi-users` because:

- It eliminates ~500-800 lines of security-critical glue code (cookie handling, token rotation, timing-safe comparison, refresh logic) in favor of ~50-150 lines of configuration
- The URL (`coleferguson.com`) is public-facing — the auth endpoints face the entire internet regardless of our 8-10 user count. The security-critical code should be community-audited library code, not AI-generated
- Our auth surface is simple (no password reset, no OAuth, no MFA, no social login) — this is fastapi-users' happy path
- It integrates natively with our existing async SQLAlchemy 2.0 + Pydantic v2 stack
- It defaults to Argon2 password hashing (better than the bcrypt we had spec'd), with automatic upgrade of existing bcrypt hashes on login
- The library is in maintenance mode (security patches only, no new features) — this is a feature for auth infrastructure, not a risk. We want stability, not new features

## What fastapi-users Replaces

These components from the original plan are now handled by the library:

| Original Component | Replaced By |
|---|---|
| `auth_service.py` (password hashing, JWT creation/validation, refresh logic) | fastapi-users `AuthenticationBackend` + `BearerTransport`/`CookieTransport` configuration |
| `dependencies.py` → `get_current_user` | fastapi-users `current_active_user` dependency |
| `routers/auth.py` (login, register, refresh endpoints) | fastapi-users generated auth routers via `fastapi_users.get_auth_router()`, `get_register_router()` |
| User model password hashing | fastapi-users `PasswordHelper` (Argon2 default) |
| JWT token generation and validation | fastapi-users JWT strategy |
| Refresh token cookie handling | fastapi-users `CookieTransport` |

## What Stays Exactly the Same

These are NOT affected by this change:

- `require_project_role()` dependency in `dependencies.py` — still our custom code
- `project_members` table and role-based access logic — unchanged
- `notification_service.py` — unchanged
- All frontend auth flow (AuthContext, Axios interceptors, ProtectedRoute) — the API contract is the same, only the backend implementation changes
- Database schema for `project_members`, `projects`, `experiments`, etc. — unchanged
- The `users` table schema changes slightly (extend fastapi-users base model instead of defining from scratch, but same columns)

## New Dependency: Rate Limiting

fastapi-users does NOT include rate limiting. Add this requirement:

- Add `slowapi` (or equivalent) as a new backend dependency
- Apply rate limiting to `/api/v1/auth/login` and `/api/v1/auth/register` endpoints
- Suggested limits: 5 attempts per minute per IP on login, 3 per minute on register
- This is ~20 lines of middleware configuration, not a large change

## Cookie Configuration Requirements (Critical — Must Be Explicit in Docs)

The fastapi-users `CookieTransport` must be configured with these exact settings to match our existing security spec:

- `cookie_httponly=True`
- `cookie_samesite="lax"`
- `cookie_secure=True` in production (can be `False` in local dev)
- `cookie_max_age` = 7 days (604800 seconds) for refresh token
- Access token: 15-minute expiry, delivered via Bearer header (not cookie)

These are named parameters passed to the transport — they should be trivially auditable in a diff.

## Password Reset: Defer to Phase 3, Don't Permanently Disable

The original plan skipped password reset entirely ("admin resets manually"). Since fastapi-users includes a complete, secure password reset flow out of the box, we should enable it — but not until Phase 3 when Amazon SES is configured for job completion emails. The reset flow requires email transport to send the reset link.

- In Phase 1 docs: note that password reset is **deferred to Phase 3**, not permanently skipped
- In Phase 3 docs (or a new bullet under the SES/email section): add "Enable fastapi-users password reset flow (`get_reset_password_router()`) once SES is configured — this is a config flag flip, not a feature build"
- Add `/auth/forgot-password` to the rate limiting list alongside login and register when it's enabled

## Password Hashing Change

- Old spec: bcrypt via `passlib[bcrypt]`
- New spec: Argon2 via `pwdlib` (fastapi-users default as of v13+)
- `passlib` is no longer a dependency — remove it from `pyproject.toml` requirements
- `python-jose` is no longer a direct dependency (fastapi-users handles JWT internally) — remove it too
- Add `fastapi-users[sqlalchemy]` as the replacement dependency

## Files to Update

Audit and update ALL of the following files. For each file, find every reference to auth implementation details and update it to reflect fastapi-users. Do not change anything unrelated to auth.

### `CLAUDE.md`
- Update the **Tech Stack** section: Auth line should reference fastapi-users instead of raw JWT + bcrypt
- Update the **Architecture Decisions** bullet about JWT — the transport config is the same but implemented via fastapi-users
- The coding standards, pipeline rules, frontend patterns, etc. are all unchanged

### `docs/PLAN.md`
- **Phase 1.1 (Auth Backend)**: Rewrite to describe fastapi-users integration instead of hand-rolling. The verification steps (`curl` commands) should remain the same — the API contract is identical. Mention that `auth_service.py` becomes primarily configuration, not implementation. Add the rate limiting requirement (slowapi on login/register endpoints).
- **Phase 1.2 (Auth Frontend)**: No changes needed — the frontend contract is the same
- **Phase 1.8 (Tests)**: `test_auth.py` tests the same endpoints with the same expected behavior. Note that the implementation under test is fastapi-users, not custom code, but the test assertions don't change.
- **Cross-Cutting Concerns > Backend Patterns**: Update the auth dependency description to reference fastapi-users `current_active_user` instead of custom `get_current_user`

### `docs/scaffold-prompt.md`
- **Part 2.2 (Backend Config)**: Update `pyproject.toml` dependencies — remove `python-jose[cryptography]` and `passlib[bcrypt]`, add `fastapi-users[sqlalchemy]` and `slowapi`
- **Part 2.3 (Backend Application Files)**: Update `dependencies.py` description — `get_current_user` is now provided by fastapi-users, not hand-written. `require_project_role` is still custom.
- **Part 2.4 (Backend Models)**: Note that the User model should extend fastapi-users' `SQLAlchemyBaseUserTable` mixin while keeping our custom fields (`first_name`, `last_name`, `email_notifications`)
- **Part 2.5 (Backend Schemas)**: Note that auth-related schemas (LoginRequest, TokenResponse, RegisterRequest) are provided by fastapi-users — we may still define custom schemas if we need extra fields on registration
- **Part 2.6 (Backend Routers)**: Update `auth.py` description — the router is generated by fastapi-users, not hand-written. We include the generated routers and may add a thin wrapper for any custom behavior (like creating a notification on registration)
- **Part 2.7 (Backend Services)**: Update `auth_service.py` description — most functions (`hash_password`, `verify_password`, `create_access_token`, etc.) are now internal to fastapi-users. This file becomes a `UserManager` subclass with custom hooks (e.g., `on_after_register` to create a welcome notification). Mention that we still need rate limiting via slowapi.

### `docs/cutana-architecture-plan.md`
- **Section 2 (Tech Stack)**: Update the Auth row to reference fastapi-users
- **Section 9 (Authentication & Authorization)**: Rewrite the Auth Flow subsection to describe fastapi-users configuration rather than manual JWT handling. The Authorization Model subsection (project roles, endpoint checks) is unchanged. Mention rate limiting as a new requirement.
- **Section 11 (Local Dev Workflow)**: No changes needed unless auth is mentioned

### `docs/cleave-spec-decisions.md`
- **Section 12 (Web App Infrastructure Decisions)**: Update item 5 (Refresh token / CSRF) to note this is now handled by fastapi-users CookieTransport configuration. Update item 6 (Password reset) to note fastapi-users includes this capability but we're not enabling it (by design). Add a new item for rate limiting (slowapi on auth endpoints).

### `README.md`
- **Tech Stack table**: Update Auth row from "JWT (15-min access token + 7-day httpOnly refresh cookie), bcrypt" to "fastapi-users (JWT access + httpOnly refresh cookie), Argon2"
- **Database Schema section**: Note that `users` table extends fastapi-users base model

### `docs/todos.md`
- **Phase 1 scaffolding checklist**: Add a new item for rate limiting setup (slowapi). Update the "No password reset flow — by design" note to mention that fastapi-users supports it but we're intentionally not enabling it.

## Formatting Rules

- Keep all existing formatting conventions (tables, code blocks, section headers)
- Don't add unnecessary commentary or justification paragraphs — just update the specs to reflect the new reality
- Where the original text describes *how* auth works internally, replace with the fastapi-users equivalent. Where it describes the *external behavior* (API contract, token format, cookie behavior), keep it as-is since the contract is identical.
- If a section mixes auth implementation details with other content, only change the auth parts

## Critical: Do NOT Remove Existing Non-Auth Documentation

When editing `dependencies.py` descriptions (in `scaffold-prompt.md`, `PLAN.md`, or anywhere else), **do not remove or trim the `require_project_role()` documentation.** This dependency lives in the same file as `get_current_user` and is completely unrelated to the auth migration. It must remain fully documented. Same applies to any other non-auth content that happens to be adjacent to auth content in a file description — only change the auth parts, leave everything else intact.
