# Admin Panel Implementation Plan

## Context

Cleave has a `is_superuser` flag on the User model (from fastapi-users) but almost nothing uses it. The only admin functionality is 2 endpoints: `POST /admin/cleanup` and `GET /admin/storage-info`. There's no way to promote users to superuser via UI, no user management, no global system overview. This plan builds a proper admin panel with user management, system stats, and global project/job visibility.

No database migration needed — `is_superuser`, `is_active`, `is_verified` already exist as columns.

---

## Step 1: Expose `is_superuser` in API responses

**Why**: Everything downstream depends on the frontend knowing if the user is a superuser.

### `backend/schemas/user.py`
- Add `is_superuser: bool = False` to `UserRead` (between `is_active` and `first_name`)

### `frontend/src/api/types.ts`
- Add `isSuperuser: boolean` to the `User` interface (after `email`)

---

## Step 2: Create admin schemas

**New file**: `backend/schemas/admin.py`

Schemas (all extend `CamelModel` with `from_attributes=True`):

| Schema | Fields | Notes |
|--------|--------|-------|
| `AdminUserRead` | id, email, firstName, lastName, isActive, isSuperuser, isVerified, projectCount, createdAt | `projectCount` computed via subquery |
| `AdminUserUpdate` | isSuperuser?, isActive? | Partial update |
| `AdminProjectRead` | id, name, description, createdBy, creatorEmail, storageBytes, isReference, status, memberCount, experimentCount, createdAt, updatedAt | `creatorEmail` from joined User |
| `AdminJobRead` | id, experimentId, experimentName, projectId, projectName, jobType, name, status, launchedBy, launcherEmail, startedAt, completedAt, durationSeconds, createdAt | Flat denormalized view |
| `AdminStatsResponse` | totalUsers, activeUsers, totalProjects, totalExperiments, totalJobs, jobsByStatus (dict), storageUsedBytes, storageQuotaBytes, diskTotal, diskUsed, diskFree | Dashboard aggregates |

Reuse `PaginatedResponse[T]` from `schemas/common.py`.

---

## Step 3: Create admin service

**New file**: `backend/services/admin_service.py`

Functions following the existing pattern in `project_service.py` (async, takes `db: AsyncSession`, returns `tuple[list, int]` for paginated):

1. **`list_users(db, page, per_page, search?, role?, active?)`** → `tuple[list[Row], int]`
   - Base: `select(User)` + correlated subquery for project_count via `ProjectMember`
   - Search: `User.email.ilike(...)` or `User.first_name.ilike(...)`
   - Role filter: `is_superuser == True/False`
   - Active filter: `is_active == True/False`
   - Order: `User.created_at.desc()`

2. **`update_user_admin(db, user_id, current_user_id, updates)`** → `User`
   - Safety: cannot modify self (400), cannot demote last superuser (400), 404 if not found
   - Apply `is_superuser` and/or `is_active` toggles

3. **`get_system_stats(db)`** → `AdminStatsResponse`
   - Count queries: users (total + active), projects, experiments, jobs
   - Jobs grouped by status via `func.count()` + `group_by(AnalysisJob.status)`
   - Disk info via `shutil.disk_usage(STORAGE_ROOT)`

4. **`list_all_projects(db, page, per_page, search?)`** → `tuple[list[Row], int]`
   - No member-scoping (unlike `list_projects_for_user`)
   - Join User for creator_email, subqueries for member_count and experiment_count

5. **`list_all_jobs(db, page, per_page, search?, status?)`** → `tuple[list[Row], int]`
   - No member-scoping, join Experiment→Project→User(launcher)

6. **`force_terminate_job(db, job_id)`** → `AnalysisJob`
   - Set status=terminated, termination_requested_at=now(), completed_at=now()

7. **`force_delete_project(db, project_id)`** → `bool`
   - Reuse pattern from `experiment_service.py` disk cleanup + cascade delete

---

## Step 4: Expand admin router

**Modify**: `backend/routers/admin.py`

Extract a `require_superuser` dependency (DRY — replaces inline `if not is_superuser` checks):

```python
def require_superuser(current_user: User = Depends(current_active_user)) -> User:
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Superuser access required")
    return current_user
```

New endpoints (all `Depends(require_superuser)`):

| Method | Path | Response | Description |
|--------|------|----------|-------------|
| GET | `/admin/stats` | `AdminStatsResponse` | Dashboard aggregates |
| GET | `/admin/users` | `PaginatedResponse[AdminUserRead]` | List all users (search, role, active filters) |
| PATCH | `/admin/users/{user_id}` | `AdminUserRead` | Toggle superuser/active |
| GET | `/admin/projects` | `PaginatedResponse[AdminProjectRead]` | List all projects (search) |
| DELETE | `/admin/projects/{project_id}` | 204 | Force-delete project |
| GET | `/admin/jobs` | `PaginatedResponse[AdminJobRead]` | List all jobs (search, status filter) |
| POST | `/admin/jobs/{job_id}/terminate` | `AdminJobRead` | Force-terminate job |

Also: add `Depends(require_superuser)` to existing `GET /admin/storage-info` (currently unprotected for any authenticated user).

---

## Step 5: Backend tests

**New file**: `backend/tests/test_admin.py`

~15-20 tests covering:

- **Auth**: 401 without token, 403 for non-superuser on each endpoint group
- **Stats**: Returns correct counts after creating test data
- **Users**: List all, search by email, filter by role/active, toggle superuser, toggle active, self-modification blocked (400), last-superuser demotion blocked (400)
- **Projects**: List all without member scoping, force-delete
- **Jobs**: List all without member scoping, force-terminate

Pattern: register user, promote via direct DB update (`UPDATE users SET is_superuser = true`), then call admin endpoints.

Run: `docker compose exec api pytest tests/test_admin.py -v`

---

## Step 6: Frontend API module + hooks

**New file**: `frontend/src/api/admin.ts`
- Admin-specific types (`AdminUser`, `AdminProject`, `AdminJob`, `AdminStats`, `AdminUserUpdate`) defined here (not in `types.ts` — keeps admin types isolated)
- API functions: `getAdminStats()`, `getAdminUsers(page, perPage, search?, role?, active?)`, `updateAdminUser(userId, updates)`, `getAdminProjects(page, perPage, search?)`, `deleteAdminProject(id)`, `getAdminJobs(page, perPage, search?, status?)`, `terminateAdminJob(id)`

**New file**: `frontend/src/hooks/useAdmin.ts`
- TanStack Query hooks following `useProjects.ts` pattern
- Query keys: `['admin', 'stats']`, `['admin', 'users', {filters}]`, `['admin', 'projects', {filters}]`, `['admin', 'jobs', {filters}]`
- Mutations invalidate relevant query keys on success

---

## Step 7: Admin page

**New file**: `frontend/src/pages/AdminPage.tsx`

Single page with shadcn `<Tabs>` — 4 tabs: **System**, **Users**, **Projects**, **Jobs**.

Route guard at top: `if (!user?.isSuperuser) return <Navigate to="/dashboard" replace />`

### System tab
- 4 stat cards in a grid (Users, Projects, Experiments, Jobs)
- Jobs-by-status breakdown with `StatusBadge`
- Storage/disk usage with `formatBytes()` from `lib/utils.ts`
- Cleanup trigger button (calls existing `POST /admin/cleanup`)

### Users tab
- DataTable: Email, Name, Role (badge: "Superuser"/"User"), Status (badge: "Active"/"Inactive"), Projects, Joined
- Search bar (debounced), role filter dropdown, active filter dropdown
- Actions column: toggle buttons for superuser/active with `window.confirm()` guards
- Server-side pagination (reuse AnalysisQueuePage pagination controls pattern)

### Projects tab
- DataTable: Name, Creator, Members, Experiments, Storage, Status, Created
- Search bar, server-side pagination
- Actions: Delete with confirm dialog

### Jobs tab
- DataTable: Name, Project, Experiment, Type, Launched By, Started, Duration, Status
- Search bar, status filter, server-side pagination
- Actions: Force Terminate (for queued/running)

Each tab is an inline component within AdminPage. If the file exceeds ~500 lines, extract tabs to `pages/admin/UsersTab.tsx` etc.

---

## Step 8: Wire up routing + navbar

### `frontend/src/App.tsx`
- Add `<Route path="/admin" element={<AdminPage />} />` inside the `ErrorBoundary/AuthenticatedLayout` block (after `/settings`)

### `frontend/src/components/layout/Navbar.tsx`
- Add conditional "Admin" link after "Analysis Queue", visible only when `user?.isSuperuser`
- Use `Shield` icon from lucide-react
- Amber/gold active state to visually distinguish from regular nav links

---

## Files Summary

| Action | File | Step |
|--------|------|------|
| Modify | `backend/schemas/user.py` | 1 |
| Modify | `frontend/src/api/types.ts` | 1 |
| Create | `backend/schemas/admin.py` | 2 |
| Create | `backend/services/admin_service.py` | 3 |
| Modify | `backend/routers/admin.py` | 4 |
| Create | `backend/tests/test_admin.py` | 5 |
| Create | `frontend/src/api/admin.ts` | 6 |
| Create | `frontend/src/hooks/useAdmin.ts` | 6 |
| Create | `frontend/src/pages/AdminPage.tsx` | 7 |
| Modify | `frontend/src/App.tsx` | 8 |
| Modify | `frontend/src/components/layout/Navbar.tsx` | 8 |

---

## Verification

1. **Backend lint**: `docker compose exec api ruff check . && docker compose exec api ruff format --check .`
2. **Backend tests**: `docker compose exec api pytest tests/test_admin.py -v`
3. **Existing tests pass**: `docker compose exec api pytest tests/test_users.py tests/test_auth.py -v` (UserRead schema change)
4. **Frontend build**: `cd frontend && npm run build`
5. **Manual check**: Register a user, promote via `docker compose exec db psql -U cleave -d cleave -c "UPDATE users SET is_superuser = true WHERE email = '...'"`, log in, verify "Admin" link appears in navbar, verify all 4 tabs load with data
