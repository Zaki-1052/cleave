# Phase 1.6-1.7 Implementation Plan

## Context

Phases 1.4 (members) and 1.5 (experiments) are complete. The **backend is fully implemented** for both notifications and user settings — only frontend work remains. This plan wires the existing backend endpoints to new and updated frontend components.

---

## Phase 1.6: Notifications

### What exists today
- **Backend**: `GET /api/v1/notifications` (returns `list[NotificationRead]`, newest first) and `PATCH /api/v1/notifications/{id}/read` (204 No Content) — fully working
- **Backend generation**: Welcome notification on register (`auth.py`), project invitation on member invite (`project_service.py`)
- **Frontend types**: `Notification` interface in `types.ts` — complete
- **Navbar**: Bell icon SVG exists but has no onClick, no dropdown, no badge
- **Missing**: No `api/notifications.ts`, no `hooks/useNotifications.ts`, no dropdown UI component

### Step 1 — Create `frontend/src/api/notifications.ts` (new file)

Two functions matching the two backend endpoints:
- `getNotifications(): Promise<Notification[]>` — `GET /notifications`
- `markRead(notificationId: number): Promise<void>` — `PATCH /notifications/{id}/read`

Follow the pattern from `api/projects.ts`.

### Step 2 — Create `frontend/src/hooks/useNotifications.ts` (new file)

Three hooks following the `useProjects.ts` pattern:
- `useNotifications()` — `useQuery` with `queryKey: ['notifications']` and `refetchInterval: 30_000` (30s polling for new notifications; SSE comes in Phase 3)
- `useUnreadCount()` — derived hook: filters `!n.isRead` from `useNotifications()` data, returns count. Shares the same cache — no extra request.
- `useMarkNotificationRead()` — `useMutation` that calls `markRead`, invalidates `['notifications']` on success

### Step 3 — Add `formatDateTime` to `frontend/src/lib/utils.ts` (edit)

Add alongside existing `formatDate`:
```ts
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}
```
Produces: "Mar 24, 2026, 7:51 PM" — matches CUTANA Cloud notification format.

### Step 4 — Create `frontend/src/components/layout/NotificationPanel.tsx` (new file)

Dropdown panel per `cutana-cloud-ui.md` §3:
- **Props**: `isOpen: boolean`, `onClose: () => void`
- **Position**: `absolute right-0 top-full mt-2 w-96 max-h-96 overflow-y-auto` — anchored below bell icon via `relative` parent wrapper in Navbar
- **Click-outside-to-close**: `useEffect` + `mousedown` listener on `document` checking `panelRef.contains(target)`
- **Header**: "Notifications" in semibold
- **Each notification**: icon on left (briefcase SVG for `project_invitation`, checkmark for `job_complete`/`welcome`), bold title, message text, timestamp via `formatDateTime()`. Unread items get subtle `bg-primary/5` highlight.
- **Click handler**: marks notification read via `useMarkNotificationRead()`, navigates to `linkTarget` via `useNavigate()`, closes panel
- **Empty state**: "No notifications yet" centered gray text
- **Footer**: "No more recent notifications to show" in gray

### Step 5 — Rewrite `frontend/src/components/layout/Navbar.tsx` (edit)

Two major additions:

**A. Notification dropdown with badge:**
- Add `useState(false)` for `notifOpen`
- Wrap bell button in a `relative` div
- Add unread count badge (red circle, `useUnreadCount()`) on the bell icon
- Render `<NotificationPanel>` inside the relative wrapper
- Toggle on click, close on panel's `onClose`

**B. User dropdown menu (replacing direct `onClick={logout}`):**
- Add `useState(false)` for `userMenuOpen`
- Add `useRef` + `useEffect` click-outside handler
- Dropdown contains: "Settings" link (`<Link to="/settings">`) and "Sign Out" button
- **Mutual exclusion**: opening one dropdown closes the other

---

## Phase 1.7: Settings Page

### What exists today
- **Backend**: `PATCH /api/v1/users/me` accepts `UserUpdate` (`first_name`, `last_name`, `email_notifications`), returns `UserRead` — fully working
- **Frontend**: `SettingsPage.tsx` is a placeholder. Route `/settings` exists in `App.tsx`.
- **AuthContext**: `fetchUser` callback exists but is not exposed publicly. Navbar displays `user.firstName ?? user.email`.
- **Missing**: No `updateMe` API function, no way to refresh user state after save, no settings form

### Step 6 — Add `updateMe` to `frontend/src/api/auth.ts` (edit)

```ts
export async function updateMe(updates: {
  firstName?: string; lastName?: string; emailNotifications?: string;
}): Promise<User> {
  const { data } = await client.patch<User>('/users/me', updates);
  return data;
}
```

Placed in `auth.ts` (not a separate `users.ts`) because `getMe` already lives there — user operations are auth-adjacent.

### Step 7 — Expose `refreshUser` from `frontend/src/contexts/AuthContext.tsx` (edit)

- Add `refreshUser: () => Promise<void>` to `AuthContextValue` interface
- Map it to existing `fetchUser` callback in the provider value: `refreshUser: fetchUser`
- `useAuth.ts` needs no changes — it returns `AuthContextValue` which now includes `refreshUser`

This lets SettingsPage call `await refreshUser()` after save, causing the Navbar to reflect updated name.

### Step 8 — Add constants to `frontend/src/lib/constants.ts` (edit)

```ts
export const EMAIL_NOTIFICATION_OPTIONS = [
  { value: 'always', label: 'Always' },
  { value: 'on_error', label: 'On Error' },
  { value: 'never', label: 'Never' },
] as const;
```

### Step 9 — Implement `frontend/src/pages/SettingsPage.tsx` (full rewrite)

Per `cutana-cloud-ui.md` §4:
- **Account Information section**: email (read-only disabled input), editable first name (`<Input>`), editable last name (`<Input>`)
- **Email section**: account email (read-only), Job Email Notification (`<select>` dropdown using `EMAIL_NOTIFICATION_OPTIONS`)
- **State**: `useState` for each field, initialized from `useAuth().user` via `useEffect`
- **Change detection**: `hasChanges` computed from comparing form state to `user` — disables Save when no changes
- **Submit**: calls `authApi.updateMe(...)`, then `await refreshUser()`, shows success message
- **Cancel**: resets form fields to current `user` values
- **Buttons**: Cancel (outlined) + Save (primary, disabled when `!hasChanges || isSaving`)
- Uses direct async/await (not TanStack Query mutation) — consistent with how auth operations work in this codebase

---

## Files Summary

| # | File | Action | Phase |
|---|------|--------|-------|
| 1 | `frontend/src/api/notifications.ts` | Create | 1.6 |
| 2 | `frontend/src/hooks/useNotifications.ts` | Create | 1.6 |
| 3 | `frontend/src/components/layout/NotificationPanel.tsx` | Create | 1.6 |
| 4 | `frontend/src/lib/utils.ts` | Edit — add `formatDateTime` | 1.6 |
| 5 | `frontend/src/components/layout/Navbar.tsx` | Edit — notification dropdown + user menu | 1.6+1.7 |
| 6 | `frontend/src/api/auth.ts` | Edit — add `updateMe` | 1.7 |
| 7 | `frontend/src/contexts/AuthContext.tsx` | Edit — expose `refreshUser` | 1.7 |
| 8 | `frontend/src/lib/constants.ts` | Edit — add email notification options | 1.7 |
| 9 | `frontend/src/pages/SettingsPage.tsx` | Full rewrite | 1.7 |

**Backend: 0 files changed.** All endpoints already implemented.

## Implementation Order

```
Parallel group 1 (no dependencies):
  Step 1: api/notifications.ts
  Step 3: utils.ts (formatDateTime)
  Step 6: api/auth.ts (updateMe)
  Step 7: AuthContext.tsx (refreshUser)
  Step 8: constants.ts (email options)

Sequential (depends on group 1):
  Step 2: hooks/useNotifications.ts  (needs Step 1)
  Step 4: NotificationPanel.tsx      (needs Steps 2, 3)
  Step 5: Navbar.tsx                 (needs Steps 4, 2)
  Step 9: SettingsPage.tsx           (needs Steps 6, 7, 8)
```

Steps 5 and 9 are independent of each other and can be done in parallel.

## Verification

### Notifications (1.6)
1. Register a new user → bell shows "1" badge (welcome notification)
2. Click bell → dropdown opens with welcome notification
3. Click notification → marked as read, badge disappears
4. Click outside panel → panel closes
5. From another account, invite user to a project → within 30s, badge shows "1"
6. Open panel → "Project Invitation" shows with link to project
7. Click invitation → navigates to `/projects/{id}`, marked as read
8. Open user menu while notification panel is open → notification panel closes

### Settings (1.7)
1. Click user name in Navbar → dropdown shows "Settings" and "Sign Out"
2. Click Settings → navigates to `/settings`
3. Page shows email (read-only), first name, last name, notification dropdown
4. Save is disabled with no changes
5. Edit first name → Save enables
6. Click Cancel → form resets
7. Edit first name + click Save → success message, Navbar reflects new name immediately
8. Refresh page → settings persist

### Cross-check
- `npx tsc --noEmit` passes
- `npm run lint` passes
