# Plan: Clear Notifications Functionality

## Context

Users accumulate notifications (welcome, project invitations, job completions, FastQC completions) but can only mark them read one at a time. A "clear all" / "mark all read" button in the notification panel is a natural UX improvement. This is a small, targeted change touching 4-5 files across backend and frontend.

## Approach: "Mark All Read" Endpoint + UI Button

### Backend Changes

**1. Service: `backend/services/notification_service.py`**
- Add `mark_all_read(db, user_id)` function
- SQL: `UPDATE notifications SET is_read = True WHERE user_id = :user_id AND is_read = False`
- Commit transaction
- Pattern: follows existing `mark_read()` but without `notification_id` filter

**2. Router: `backend/routers/notifications.py`**
- Add `PATCH /api/v1/notifications/read-all` → 204 No Content
- Auth: `current_active_user` (same as existing endpoints)
- Calls `notification_service.mark_all_read(db, current_user.id)`
- **Must be declared BEFORE the `/{notification_id}/read` route** to avoid FastAPI treating `read-all` as a path parameter

### Frontend Changes

**3. API: `frontend/src/api/notifications.ts`**
- Add `markAllRead()` → `PATCH /notifications/read-all`

**4. Hook: `frontend/src/hooks/useNotifications.ts`**
- Add `useMarkAllNotificationsRead()` mutation
- On success: invalidate `['notifications']` query (same pattern as `useMarkNotificationRead`)

**5. Component: `frontend/src/components/layout/NotificationPanel.tsx`**
- Add "Mark all read" button in the panel header (next to "Notifications" title)
- Only show when there are unread notifications (`unreadCount > 0`)
- On click: call `markAllRead.mutate()`
- Style: text button in primary blue, matching existing CUTANA Cloud visual language

### Tests

**6. Tests: `backend/tests/test_notifications.py`**
- Add `test_mark_all_notifications_read()` — creates multiple notifications, calls PATCH /read-all, verifies all are read
- Add `test_mark_all_read_only_affects_own()` — verifies user A's mark-all doesn't affect user B's notifications

## Files to Modify

| File | Change |
|------|--------|
| `backend/services/notification_service.py` | Add `mark_all_read()` |
| `backend/routers/notifications.py` | Add `PATCH /read-all` endpoint |
| `frontend/src/api/notifications.ts` | Add `markAllRead()` API call |
| `frontend/src/hooks/useNotifications.ts` | Add `useMarkAllNotificationsRead()` hook |
| `frontend/src/components/layout/NotificationPanel.tsx` | Add "Mark all read" button |
| `backend/tests/test_notifications.py` | Add 2 tests |

## Verification

1. `docker compose exec api pytest tests/test_notifications.py` — all tests pass (existing 5 + 2 new)
2. `docker compose exec api ruff check .` — clean
3. `cd frontend && npx tsc --noEmit` — clean
4. Manual: open notification panel → click "Mark all read" → all blue dots disappear → SSE invalidates cache
