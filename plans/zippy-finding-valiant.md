# Phase 1.4: Project Members — Implementation Plan

## Context

Phase 1.3 built the project detail page with a member list sidebar (teal avatars, initials, role labels) and a placeholder "+ Manage Members" button. The backend member CRUD endpoints exist and work, but lack validation guardrails and notification integration. The notification router endpoints are stubbed (501). Phase 1.4 wires member management end-to-end: invite by email, change roles, remove members, with notification on invite.

## Scope

Per `docs/PLAN.md` §1.4:
- Backend: Add notification creation when a member is invited
- Frontend: Build "Manage Members" modal per `cutana-cloud-ui.md` §2a
- Verify: Invite → visible on their home page. Change role → reflected. Remove → disappears.

I'm also including the notification router implementation (from §1.6) because invitations depend on it for verification, and the backend service already exists — it's just 2 stub endpoints to wire up.

---

## Changes by File

### Backend (4 files)

#### 1. `backend/services/project_service.py` — Add notification + validation

- **`add_member()`**: After creating the membership, call `notification_service.create_notification()` with:
  - `type="project_invitation"`
  - `title="Project Invitation"`
  - `message=f"{inviter_name} has made you a {role} in project \"{project_name}\"."`
  - `link_target=f"/projects/{project_id}"`
  - Need to fetch the project name and inviter name — add a `select(Project.name)` query and accept the inviter `User` object (or just first_name/last_name) as a parameter
- **`add_member()`**: Before inserting, check if user is already a member (query `ProjectMember` by `project_id + user.id`). Return a distinct sentinel (e.g., raise a custom `AlreadyMemberError`) so the router can return 409 Conflict instead of crashing on the DB unique constraint
- **`update_member_role()`**: No changes needed — the self-role-change prevention belongs in the router layer (it needs `current_user.id`)
- **`remove_member()`**: No changes needed — last-admin prevention belongs in the router layer

#### 2. `backend/routers/projects.py` — Add validation guards

- **`list_members_endpoint()`**: Change from `current_active_user` to `require_project_role(["admin", "contributor", "viewer"])` so only project members can list members (currently any authenticated user can)
- **`add_member_endpoint()`**:
  - Catch `AlreadyMemberError` → return 409 with `"User is already a member of this project"`
  - Pass `current_user` (the inviter) to the service so the notification message includes the inviter's name
- **`update_member_endpoint()`**:
  - Add guard: if `user_id == current_user.id`, return 400 `"Cannot change your own role"`
  - Add guard: if changing the only admin's role away from admin, query the admin count first → return 400 `"Cannot demote the last admin"`
  - Validate `body.role` is in `["admin", "contributor", "viewer"]` (add `Literal` to schema instead — see below)
- **`remove_member_endpoint()`**:
  - Add guard: if `user_id == current_user.id`, return 400 `"Cannot remove yourself"`
  - Add guard: if removing the only admin, return 400 `"Cannot remove the last admin"`

#### 3. `backend/schemas/project.py` — Tighten role validation

- Change `MemberCreate.role` from `str` to `Literal["admin", "contributor", "viewer"]` with default `"contributor"`
- Change `MemberUpdate.role` from `str` to `Literal["admin", "contributor", "viewer"]`
- This gives us automatic Pydantic validation with a clear 422 error — no manual checking needed

#### 4. `backend/routers/notifications.py` — Implement stub endpoints

Replace the 501 stubs with real implementations:

- **`GET /api/v1/notifications`**:
  - Depends on `current_active_user` and `get_db`
  - Calls `notification_service.list_notifications(db, current_user.id)`
  - Returns `list[NotificationRead]`
- **`PATCH /api/v1/notifications/{notification_id}/read`**:
  - Depends on `current_active_user` and `get_db`
  - Calls `notification_service.mark_read(db, notification_id, current_user.id)`
  - Returns 204 No Content

---

### Frontend (5 files, 1 new)

#### 5. `frontend/src/api/projects.ts` — Add 3 mutation API functions

```ts
addMember(projectId: number, email: string, role: string): Promise<Member>
updateMemberRole(projectId: number, userId: number, role: string): Promise<Member>
removeMember(projectId: number, userId: number): Promise<void>
```

Follow existing pattern: `client.post/patch/delete` → return `data`.

#### 6. `frontend/src/hooks/useProjects.ts` — Add 3 mutation hooks

- `useAddMember()` — `useMutation` wrapping `addMember`, invalidates `['projects', projectId, 'members']`
- `useUpdateMemberRole()` — same pattern
- `useRemoveMember()` — same pattern

Follow the `useCreateProject` / `useDeleteProject` pattern exactly.

#### 7. `frontend/src/components/projects/ManageMembersModal.tsx` — NEW FILE

The core UI deliverable. Per `cutana-cloud-ui.md` §2a:

**Layout:**
- Uses existing `Modal` component with title "Manage Members"
- Two sections: Add Member (top) + Existing Members (bottom)

**Add Member section:**
- Single row: `Input` for email, native `<select>` for role (defaulting to "Contributor"), `Button` "Invite"
- On submit: calls `useAddMember().mutate()`
- Error handling: "User not found" (404), "Already a member" (409), generic error
- Loading state: disable button, show "Inviting..."

**Existing Members list:**
- Header: "Members" in blue text
- Each row: full name (left), role `<select>` dropdown (right)
- Current user's own role is displayed as a **disabled** `<select>` with dashed border and gray background (per CUTANA Cloud UI §2a: "grayed out/disabled")
- On role change: immediately call `useUpdateMemberRole().mutate()` — optimistic UI via TanStack Query invalidation
- Remove button (✕ or trash icon) per non-self member — calls `useRemoveMember().mutate()`
- Admins cannot remove themselves; admins cannot be removed if they're the last admin (backend enforces, but disable button in UI too)

**Props:** `isOpen: boolean`, `onClose: () => void`, `projectId: number`

**State:** email input, role select, invite error message. Reset on close (follow CreateProjectModal pattern).

**Dependencies:** `useAuth()` for current user ID, `useMembers(projectId)` for the list, 3 mutation hooks.

#### 8. `frontend/src/pages/ProjectDetailPage.tsx` — Wire modal

- Add `useState<boolean>` for `isMembersModalOpen`
- Wire the "+ Manage Members" button's `onClick` to set `true`
- Render `<ManageMembersModal isOpen={...} onClose={...} projectId={projectId} />`
- Only show the "+ Manage Members" button for admins — check `members?.find(m => m.userId === user?.id)?.role === 'admin'`

#### 9. No new Select component

Per KISS (single use case, same reasoning as the `<textarea>` in CreateProjectModal), use a native `<select>` with Tailwind styling directly in ManageMembersModal. A reusable `Select.tsx` component is not warranted until there's a second consumer.

---

## Files NOT Changed

- `backend/models/` — No model changes needed
- `backend/services/notification_service.py` — Already complete, just needs to be called
- `frontend/src/api/types.ts` — `Member` and `MemberUser` types already exist
- `frontend/src/components/ui/Modal.tsx` — Used as-is
- `frontend/src/lib/constants.ts` — `ROLE_LABELS` already has all 3 roles

---

## Implementation Order

1. **Backend schemas** — Tighten `MemberCreate.role` and `MemberUpdate.role` with `Literal` (quick, unlocks validation)
2. **Backend service** — Add duplicate check and notification creation to `add_member()`
3. **Backend router (projects)** — Add self-change/last-admin guards to member endpoints
4. **Backend router (notifications)** — Implement the 2 stub endpoints
5. **Frontend API** — Add `addMember`, `updateMemberRole`, `removeMember` functions
6. **Frontend hooks** — Add 3 mutation hooks
7. **Frontend ManageMembersModal** — Build the modal component
8. **Frontend ProjectDetailPage** — Wire modal open/close and admin-only visibility

---

## Verification

Per `docs/PLAN.md` §1.4 verification criteria:

1. **Invite**: Register a second user → log in as first user (admin) → open Manage Members → enter second user's email → click Invite → second user appears in member list → log in as second user → project visible on their home page
2. **Change role**: Change second user from Contributor to Viewer → role reflected in member list → own role dropdown is disabled
3. **Remove**: Remove second user → they disappear from member list → log in as second user → project no longer on their home page
4. **Notification**: After inviting, second user sees a "Project Invitation" notification (verify via `GET /api/v1/notifications` — frontend notification panel is Phase 1.6, but the API should return it)
5. **Guards**: Try to change own role → 400 error. Try to remove self → 400 error. Try to invite already-member email → 409 error. Non-admin cannot see Manage Members button.
6. **Validation**: Try to set role to "superuser" → 422 Pydantic error.

---

## Out of Scope (deferred)

- **Notification bell dropdown UI** — Phase 1.6. We implement the backend endpoints here so notifications are created and queryable, but the frontend bell panel is a separate task.
- **`can_download` / `can_delete` permission flags** — Present in the schema but not exposed in the Manage Members UI. Deferred per original plan.
- **Email-based notifications** — Phase 7 (SES integration).
