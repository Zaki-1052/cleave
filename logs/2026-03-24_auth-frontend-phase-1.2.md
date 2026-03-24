# 2026-03-24 — Phase 1.2: Auth Frontend Bug Fixes & Verification

## What was done
- Fixed critical casing mismatch: `TokenResponse`, `LoginRequest`, `RegisterRequest` in `routers/auth.py` now extend `CamelModel` instead of `BaseModel` — backend was returning `access_token` (snake_case) but frontend expected `accessToken` (camelCase), making auth completely non-functional
- Fixed `RegisterRequest` silently dropping `firstName`/`lastName` from browser (same CamelModel fix)
- Added `logout()` to `frontend/src/api/auth.ts`; `AuthContext.logout()` now calls backend to delete httpOnly refresh cookie (fire-and-forget)
- Rewrote Axios 401 refresh interceptor in `client.ts` with `isRefreshing` flag + `failedQueue` request queue to prevent concurrent refresh race conditions
- Removed unnecessary `{ refreshToken: null }` body from refresh interceptor; added `_retry` flag to prevent infinite loops
- Updated 8 test assertions in `test_auth.py` and 1 in `conftest.py` for camelCase response keys
- Marked `docs/cc-scaffold-prompt.md` as EXECUTED
- Updated `docs/todos.md`: checked off 4 resolved items, added Phase 1.2 completion section, added dev tooling gaps (ruff not in Docker, ESLint config missing)
- Added password reset enablement line item to `docs/PLAN.md` Phase 7.5 and `docs/todos.md` Phase 3 tasks
- Browser-verified: register with name, page refresh (cookie restore), logout — all working

## Decisions made
- **CamelModel over frontend fix**: Changed backend `TokenResponse` to extend `CamelModel` (2 backend files) rather than changing frontend to snake_case (6 frontend files) — consistent with all other schemas in the codebase
- **Fire-and-forget logout**: `AuthContext.logout()` clears state synchronously (instant UX), fires API call without awaiting — cookie deletion is best-effort
- **CORS withCredentials is a non-issue**: Vite proxy and production NGINX both make cookies same-origin; closed the todos.md item with explanation

## Open items
- Browser verification confirmed working — Phase 1.2 complete
- Dev tooling gaps logged: ruff missing from Docker image, ESLint 9 flat config missing
- Password reset deferred to Phase 7.5 (needs SES)

## Key file paths
- `backend/routers/auth.py` — auth schemas now extend CamelModel
- `backend/tests/test_auth.py` — camelCase assertion keys
- `backend/tests/conftest.py` — camelCase fixture key
- `frontend/src/api/client.ts` — rewritten refresh interceptor with queue
- `frontend/src/api/auth.ts` — added logout()
- `frontend/src/contexts/AuthContext.tsx` — logout calls backend API
- `docs/cc-scaffold-prompt.md` — marked EXECUTED
- `docs/todos.md` — updated with 1.2 completion + new items
- `docs/PLAN.md` — added password reset to Phase 7.5
