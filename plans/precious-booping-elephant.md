# Phase 1.8 — Implement Phase 1 Tests

## Context

Phase 1 (Foundation) is complete: auth, project/member CRUD, experiment CRUD, notifications, and settings all work end-to-end. The remaining task is implementing test stubs to verify the API contract. Currently 23 tests pass (13 auth + 10 experiments). `test_projects.py` has 8 stubs with `pass` bodies. Notifications and user settings have zero test coverage despite being Phase 1 done criteria.

## Files to Modify/Create

| File | Action | Tests |
|------|--------|-------|
| `backend/tests/conftest.py` | Add shared helpers | — |
| `backend/tests/test_projects.py` | Replace 8 stubs + add edge cases | 14 |
| `backend/tests/test_notifications.py` | Create new | 5 |
| `backend/tests/test_users.py` | Create new | 4 |

**DO NOT modify**: `test_auth.py` (13 passing), `test_experiments.py` (10 passing)

**Final total**: 46 tests (23 existing + 23 new)

---

## Step 1: Update conftest.py

Add shared async helper functions after the existing `auth_headers` fixture. These match the pattern already used in `test_experiments.py` but are centralized for reuse by the new test files.

```python
# Add to imports: AsyncClient (already have ASGITransport)
# Add after auth_headers fixture:

async def register_and_get_headers(client: AsyncClient, email: str) -> dict:
    resp = await client.post("/api/v1/auth/register", json={"email": email, "password": "testpass123"})
    assert resp.status_code == 201
    return {"Authorization": f"Bearer {resp.json()['accessToken']}"}

async def create_project(client: AsyncClient, headers: dict, name: str = "Test Project") -> int:
    resp = await client.post("/api/v1/projects", json={"name": name}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]
```

---

## Step 2: Implement test_projects.py (14 tests)

### Helpers (module-level, same pattern as test_experiments.py)

```python
async def _register_and_get_headers(client, email) -> dict   # same as experiments
async def _create_project(client, headers, name) -> int       # same as experiments
async def _get_user_id(client, headers) -> int                 # GET /api/v1/users/me → data["id"]
```

### Tests implementing the 8 existing stubs

| # | Test | Key Assertions |
|---|------|----------------|
| 1 | `test_create_project_requires_auth` | `POST /projects` no auth → **401** |
| 2 | `test_create_project_success` | `POST /projects` → **201**, response has `id`, `name`, `description`, `storageBytes==0`, `createdAt`, `updatedAt` |
| 3 | `test_project_creator_is_admin` | Create project → `GET /projects/{id}/members` → 1 member, `role=="admin"`, `user.email` matches creator |
| 4 | `test_list_projects_only_shows_member_projects` | user_a creates 2 projects, user_b creates 1 → user_a sees `total==2`, user_b sees `total==1` |
| 5 | `test_update_project_requires_admin` | Add contributor → contributor calls `PATCH /projects/{id}` → **403** ("Insufficient project permissions") |
| 6 | `test_delete_project_requires_admin` | Add contributor → contributor calls `DELETE /projects/{id}` → **403**. Verify project still exists via GET. |
| 7 | `test_add_member_to_project` | Admin invites user → **201**, response has `role=="contributor"`, `user.email`. Invitee can now list the project (`total==1`). |
| 8 | `test_remove_member_from_project` | Admin adds then removes user → **204**. Removed user's project list shows `total==0`. |

### 6 additional edge case tests

| # | Test | Key Assertions |
|---|------|----------------|
| 9 | `test_update_project_success` | Admin calls `PATCH /projects/{id}` with new name+description → **200**, fields updated |
| 10 | `test_delete_project_success` | Admin calls `DELETE /projects/{id}` → **204**. `GET /projects/{id}` → **404** |
| 11 | `test_cannot_change_own_role` | Admin gets own user_id, calls `PATCH /projects/{id}/members/{own_id}` → **400**, detail contains "Cannot change your own role" |
| 12 | `test_cannot_remove_self` | Admin calls `DELETE /projects/{id}/members/{own_id}` → **400**, detail contains "Cannot remove yourself" |
| 13 | `test_add_duplicate_member_returns_409` | Add same user twice → second call returns **409** |
| 14 | `test_add_nonexistent_user_returns_404` | Invite `nobody@example.com` → **404** |

### Critical status code reference (from reading actual code)

- `require_project_role(["admin"])` returns **403** for both non-members AND wrong roles (not 404)
- `AlreadyMemberError` → **409**
- User not found on invite → **404**
- Self role change → **400**
- Self removal → **400**

---

## Step 3: Create test_notifications.py (5 tests)

Tests verify the notification system wired through `project_service.add_member()` → `notification_service.create_notification()`.

| # | Test | Key Assertions |
|---|------|----------------|
| 1 | `test_list_notifications_requires_auth` | `GET /notifications` no auth → **401** |
| 2 | `test_list_notifications_empty` | Register user → `GET /notifications` → **200**, list has 1 item (welcome notification from `on_after_register`) |
| 3 | `test_notification_created_on_member_invite` | Admin invites user → invitee's `GET /notifications` has notification with `type=="project_invitation"`, `title=="Project Invitation"`, `isRead==false`, `linkTarget=="/projects/{id}"` |
| 4 | `test_mark_notification_read` | Get notification → `PATCH /notifications/{id}/read` → **204** → re-fetch → `isRead==true` |
| 5 | `test_notification_not_visible_to_other_users` | Invite user_b → user_c (not invited) sees no project_invitation notifications |

### Notification message format (from `project_service.py:127`)
```
'{inviter_email} has made you a Contributor in project "Test Project".'
```
(Uses `inviter.email` when `first_name`/`last_name` are None, which is the case in tests)

---

## Step 4: Create test_users.py (4 tests)

Tests verify `PATCH /api/v1/users/me` for the Settings page.

| # | Test | Key Assertions |
|---|------|----------------|
| 1 | `test_update_profile_requires_auth` | `PATCH /users/me` no auth → **401** |
| 2 | `test_update_profile_name` | Send `{"firstName": "Zakir", "lastName": "Alibhai"}` → **200**, response has updated names. Verify with `GET /users/me`. |
| 3 | `test_update_email_notification_preference` | Send `{"emailNotifications": "never"}` → **200**, response `emailNotifications=="never"` |
| 4 | `test_partial_update_preserves_other_fields` | Register with name → update only `emailNotifications` → `firstName` unchanged |

### Schema reference (UserUpdate accepts camelCase via CamelModel)
- `firstName`, `lastName`, `emailNotifications` (all optional, exclude_unset=True for partial updates)

---

## Step 5: Run & Verify

```bash
docker compose exec api pytest backend/tests/ -v
```

Expected: **46 tests passing** (13 auth + 14 projects + 10 experiments + 5 notifications + 4 users)

Also run linter:
```bash
docker compose exec api ruff check backend/tests/
```

---

## Patterns to Follow (from existing tests)

- Each test function takes `client: AsyncClient` as parameter
- Use local `_helper()` functions at module level (not fixtures) for setup
- Assert status codes directly: `assert resp.status_code == 201`
- JSON field names are **camelCase**: `accessToken`, `storageBytes`, `projectId`, `firstName`, `isRead`, `linkTarget`
- Paginated responses: `data["items"]`, `data["total"]`
- No `@pytest.mark.asyncio` needed (`asyncio_mode = "auto"`)
- Delete endpoints return 204 with no body
- File header comment: `# backend/tests/test_<name>.py`

## Key Files Referenced

- `backend/tests/conftest.py` — fixture infrastructure
- `backend/tests/test_experiments.py` — pattern reference (helpers, assertions)
- `backend/routers/projects.py` — exact status codes and edge case guards
- `backend/routers/notifications.py` — notification endpoints
- `backend/routers/users.py` — user update endpoint
- `backend/services/project_service.py` — notification creation on invite, AlreadyMemberError
- `backend/dependencies.py` — `require_project_role` returns 403 for wrong role/non-member
