# Phase 1.2: Auth Frontend — Fix Known Issues & Verify End-to-End

## Context

Phase 1.1 (auth backend) is complete — fastapi-users provides login/register/refresh/logout endpoints, all tested with 13 passing tests. The frontend auth code was built during scaffolding and *appears* functional, but has several bugs identified in `docs/todos.md` (plus two additional bugs discovered during this review) that must be fixed before Phase 1.2 can be marked done. The goal is: fix bugs, clean up documentation, verify everything works end-to-end in the browser.

---

## Bug Inventory (5 real bugs, 2 non-issues to close)

### BUG 1 — CRITICAL: Auth schemas use BaseModel instead of CamelModel
- **Backend** `routers/auth.py:21-35`: `LoginRequest`, `RegisterRequest`, and `TokenResponse` all extend plain `BaseModel`
- **Every other schema** in the codebase extends `CamelModel` (from `schemas/common.py`) which applies `alias_generator=to_camel` + `populate_by_name=True`
- **TokenResponse impact**: Backend serializes `{"access_token": ..., "token_type": ...}` (snake_case). Frontend reads `res.accessToken` (camelCase) → gets `undefined`. Auth is fundamentally broken end-to-end.
- **RegisterRequest impact**: Frontend sends `{ firstName, lastName }` (camelCase). Backend field is `first_name` (snake_case). Without CamelModel alias matching, Pydantic silently ignores the camelCase keys → first/last names are always `None` when registering from the browser. (Backend tests pass because they send snake_case.)
- **Fix**: Change all three to extend `CamelModel`. `populate_by_name=True` means both casings are accepted for input, and responses serialize as camelCase.

### BUG 2: Missing logout API call
- `AuthContext.tsx:58-61`: `logout()` only clears frontend state. Does not call `POST /auth/logout` to delete the httpOnly refresh cookie.
- `api/auth.ts`: No `logout()` function exported.
- **Impact**: After "logout", the refresh cookie remains valid for 7 days. Next page load auto-refreshes and logs back in.

### BUG 3: Refresh interceptor race condition (no request queue)
- `client.ts:35-49`: Multiple concurrent 401s each independently call refresh. The first succeeds and rotates the cookie; the second uses the now-stale cookie, fails, and clears the token — logging the user out.
- **Impact**: Intermittent logout when page loads fire multiple API calls with an expired token.

### BUG 4: Refresh interceptor sends unnecessary body
- `client.ts:38`: `axios.post('/api/v1/auth/refresh', { refreshToken: null })` — backend ignores the body (reads cookie). Harmless but messy, inconsistent with `auth.ts:26` which sends `{}`.

### NON-ISSUE: CORS withCredentials (`todos.md:60`)
- Vite proxy (`vite.config.ts:14-18`) proxies `/api` → `:8000`, making all requests same-origin. Cookies flow natively. Production NGINX does the same. `withCredentials` is not needed. Close the item with explanation.

### NON-ISSUE: Frontend auth contract (`todos.md:48`)
- `TokenResponse` has no `refreshToken` field. Refresh uses cookie only. Already correct. Close the item.

---

## Implementation Steps

### Step 1: Fix auth schema casing (Bug 1)

**`backend/routers/auth.py`** — 4 changes:
- Add import: `from schemas.common import CamelModel`
- Change `class LoginRequest(BaseModel)` → `class LoginRequest(CamelModel)`
- Change `class RegisterRequest(BaseModel)` → `class RegisterRequest(CamelModel)`
- Change `class TokenResponse(BaseModel)` → `class TokenResponse(CamelModel)`
- Update pydantic import: `from pydantic import BaseModel, EmailStr` → `from pydantic import EmailStr`

**`backend/tests/test_auth.py`** — 8 assertions change to camelCase keys:
- Line 12: `"access_token"` → `"accessToken"`
- Line 13: `"token_type"` → `"tokenType"`
- Line 27: `["access_token"]` → `["accessToken"]`
- Line 49: `"access_token"` → `"accessToken"`
- Line 50: `"token_type"` → `"tokenType"`
- Line 77: `"access_token"` → `"accessToken"`
- Line 78: `"token_type"` → `"tokenType"`
- Line 83: `data['access_token']` → `data['accessToken']`

**`backend/tests/conftest.py`** — 1 change:
- Line 57: `data["access_token"]` → `data["accessToken"]`

No frontend changes needed — `types.ts:97-100` already expects camelCase.

### Step 2: Add `logout()` to frontend API module (Bug 2a)

**`frontend/src/api/auth.ts`** — Add after `getMe()`:
```typescript
export async function logout(): Promise<void> {
  await client.post('/auth/logout');
}
```

### Step 3: Fix AuthContext logout to call API (Bug 2b)

**`frontend/src/contexts/AuthContext.tsx`** — Replace lines 58-61:
```typescript
const logout = useCallback(() => {
  setAccessToken(null);
  setUser(null);
  authApi.logout().catch(() => {});
}, []);
```

Design: clear state synchronously first (instant redirect via ProtectedRoute), fire API call without awaiting (cookie deletion is best-effort). Return type stays `void` so `Navbar.tsx:45` `onClick={logout}` works without change.

### Step 4: Fix refresh interceptor — add request queue (Bug 3 + Bug 4)

**`frontend/src/api/client.ts`** — Rewrite the response interceptor:

1. Add TypeScript module augmentation for `_retry` flag:
   ```typescript
   declare module 'axios' {
     export interface InternalAxiosRequestConfig {
       _retry?: boolean;
     }
   }
   ```

2. Add module-level state (after line 17):
   - `let isRefreshing = false`
   - `let failedQueue: Array<{ resolve: (token: string) => void; reject: (error: unknown) => void }>`
   - `processQueue(error, token)` helper that resolves/rejects all queued items

3. Replace entire response interceptor (lines 26-59) with queued pattern:
   - On 401 with `accessToken` set and `!config._retry`:
     - If `isRefreshing`: push to `failedQueue`, return Promise that retries the request when refresh completes
     - If not refreshing: set `isRefreshing = true`, call `axios.post('/api/v1/auth/refresh', {})`, `processQueue()` on success/failure, `finally { isRefreshing = false }`
   - Set `config._retry = true` to prevent infinite loops
   - Fix refresh body: `{}` instead of `{ refreshToken: null }` (Bug 4)
   - Read `refreshRes.data.accessToken` (camelCase, matches Step 1 fix)

### Step 5: Documentation updates

**`docs/cc-scaffold-prompt.md`** — Add status line after line 1:
```
> **Status**: EXECUTED 2026-03-23. Scaffold complete — this document is now a reference for the original design intent.
```

**`docs/todos.md`**:
1. Line 48 (frontend auth contract): `[ ]` → `[x]` — "Confirmed correct. No `refreshToken` in response body."
2. Line 50 (Axios refresh queue): `[ ]` → `[x]` — "Fixed in Phase 1.2."
3. Line 60 (CORS withCredentials): `[ ]` → `[x]` — "Non-issue: Vite dev proxy and production NGINX both make cookies same-origin. `withCredentials` not needed."
4. Line 77 (scaffold-prompt.md): `[ ]` → `[x]`
5. Add Phase 1.2 completion section after Phase 1.1 section (after line 37)

---

## Files Modified

| File | Change |
|------|--------|
| `backend/routers/auth.py` | 3 models extend `CamelModel` instead of `BaseModel` |
| `backend/tests/test_auth.py` | 8 assertions: snake_case → camelCase response keys |
| `backend/tests/conftest.py` | 1 key: `access_token` → `accessToken` |
| `frontend/src/api/auth.ts` | Add `logout()` function |
| `frontend/src/api/client.ts` | Rewrite response interceptor with request queue |
| `frontend/src/contexts/AuthContext.tsx` | Logout calls API (fire-and-forget) |
| `docs/cc-scaffold-prompt.md` | Add EXECUTED status line |
| `docs/todos.md` | Check off resolved items, add 1.2 completion section |

---

## Verification

After all changes:

1. **Backend tests pass**: `cd backend && pytest tests/test_auth.py -v` — all 13 tests green
2. **TypeScript compiles**: `cd frontend && npx tsc --noEmit`
3. **Linting passes**: `cd backend && ruff check .` and `cd frontend && npm run lint`
4. **Register in browser**: `localhost:5173/register` → fill form with name → submit → redirected to `/`. Navbar shows first name (not email).
5. **Page refresh**: Cmd+R → still logged in (cookie refresh works)
6. **Logout**: Click username → redirected to `/login`. Refresh → stays on login (cookie deleted)
7. **Token auto-refresh**: Set `ACCESS_TOKEN_EXPIRE_MINUTES=1` in `.env`, log in, wait 60s, navigate → auto-refreshes without logout
