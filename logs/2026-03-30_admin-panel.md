# 2026-03-30 — Admin Panel Implementation

## What was done

Built a full superuser admin panel with backend endpoints, tests, and a tabbed frontend page.

### Backend
- Added `is_superuser` to `UserRead` schema (was on the model but not exposed to API)
- Created `schemas/admin.py` with 5 admin-specific schemas (AdminUserRead, AdminUserUpdate, AdminProjectRead, AdminJobRead, AdminStatsResponse)
- Created `services/admin_service.py` with 7 service functions: list users/projects/jobs (paginated, filterable), update user flags, system stats, force-terminate job, force-delete project
- Expanded `routers/admin.py` from 2 to 9 endpoints, all gated by `require_superuser` dependency (extracted from inline checks)
- Added superuser gate to previously unprotected `GET /admin/storage-info`
- Created `tests/test_admin.py` — 18 tests covering auth/permissions, user management (promote/demote/activate/deactivate with safety guards), project management, job management, and stats
- Fixed pre-existing `worker.py` ruff format issue

### Frontend
- Added `isSuperuser` and `isActive` to `User` type in `api/types.ts`
- Created `api/admin.ts` with admin-specific types and 8 API functions
- Created `hooks/useAdmin.ts` with 8 TanStack Query hooks (queries + mutations)
- Created `pages/AdminPage.tsx` — single page with 4 tabs (System, Users, Projects, Jobs) using existing DataTable, StatusBadge, Card, Spinner patterns
- Added `/admin` route in `App.tsx`
- Added conditional "Admin" nav link with Shield icon and amber accent in `Navbar.tsx` (only visible to superusers)

## Decisions made
- No database migration needed — `is_superuser`, `is_active`, `is_verified` already exist from fastapi-users
- Admin types live in `api/admin.ts` (not `types.ts`) to keep admin concerns isolated
- `require_superuser` extracted as a reusable FastAPI dependency (DRY over inline `if` checks)
- Safety guards: cannot modify self, cannot demote last superuser
- Client-side route guard (`Navigate to /dashboard`) is UX only — real security is backend 403
- Single AdminPage file with inline tab components (appropriate for ~8-10 user scale)
- Amber/gold color for admin nav link to visually distinguish from regular nav items

## Open items
- To use admin panel: must promote a user to superuser via SQL (`UPDATE users SET is_superuser = true WHERE email = '...'`)
- No UI for initial superuser creation (seed script or first-user-is-admin pattern could be added)
- Full test suite not run (only admin + auth + users + projects = 72 tests verified green)

## Key file paths
- `backend/schemas/admin.py` (new)
- `backend/services/admin_service.py` (new)
- `backend/routers/admin.py` (expanded)
- `backend/tests/test_admin.py` (new, 18 tests)
- `backend/schemas/user.py` (added is_superuser)
- `frontend/src/api/admin.ts` (new)
- `frontend/src/hooks/useAdmin.ts` (new)
- `frontend/src/pages/AdminPage.tsx` (new)
- `frontend/src/api/types.ts` (added isSuperuser, isActive)
- `frontend/src/App.tsx` (added /admin route)
- `frontend/src/components/layout/Navbar.tsx` (added Admin link)
