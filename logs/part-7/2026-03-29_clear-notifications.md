# 2026-03-29 — Clear Notifications (Mark All Read)

## What Was Done

Added "Mark all read" functionality to the notification system — a bulk action to mark all unread notifications as read in one click.

### Backend
- **`backend/services/notification_service.py`** — Added `mark_all_read(db, user_id)`: bulk UPDATE setting `is_read=True` for all unread notifications owned by the user.
- **`backend/routers/notifications.py`** — Added `PATCH /api/v1/notifications/read-all` returning 204 No Content. Declared before `/{notification_id}/read` to prevent FastAPI from treating `read-all` as a path parameter.

### Frontend
- **`frontend/src/api/notifications.ts`** — Added `markAllRead()` API call.
- **`frontend/src/hooks/useNotifications.ts`** — Added `useMarkAllNotificationsRead()` mutation hook with `['notifications']` query invalidation on success.
- **`frontend/src/components/layout/NotificationPanel.tsx`** — Added "Mark all read" text button in the panel header, visible only when `unreadCount > 0`. Styled in primary blue to match existing UI.

### Tests
- **`backend/tests/test_notifications.py`** — Added 2 tests:
  - `test_mark_all_notifications_read` — 3 unread notifications → PATCH /read-all → all marked read.
  - `test_mark_all_read_only_affects_own` — User A's mark-all doesn't affect User B's unread notifications.

## Decisions Made
- Used "Mark all read" (not "Clear all") — notifications remain visible but lose their unread indicator, matching standard notification UX patterns.
- Route ordering: `/read-all` declared before `/{notification_id}/read` to avoid FastAPI path parameter conflict.

## Verification
- 7/7 notification tests passing (5 existing + 2 new)
- `ruff check`: clean
- `tsc --noEmit`: clean

## Key File Paths
- `backend/services/notification_service.py`
- `backend/routers/notifications.py`
- `frontend/src/api/notifications.ts`
- `frontend/src/hooks/useNotifications.ts`
- `frontend/src/components/layout/NotificationPanel.tsx`
- `backend/tests/test_notifications.py`
