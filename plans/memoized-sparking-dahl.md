# Plan: Step 3.2 — SSE for Real-Time Status

## Context

Step 3.1 (Worker & Job Queue) is complete. The worker polls for queued jobs, runs pipelines, updates statuses, and creates notifications. But the frontend currently relies on polling to detect changes:
- Notifications: 30s constant poll (`useNotifications.ts:9`)
- Job status: 2s poll while queued/running (`useJobs.ts:28-34`)
- FASTQs: 5s poll while pending FastQC (`useFastqs.ts:11-16`)

The spec (PLAN.md §3.2) requires SSE so status changes appear live without page refresh.

## Design Decisions

**Auth**: JWT via `Authorization` header, NOT query parameter. Native `EventSource` doesn't support custom headers, so we use `@microsoft/fetch-event-source` — a small, well-maintained library that wraps `fetch()` to provide an EventSource-like API with full header support. This keeps tokens out of URLs (NGINX logs, Cloudflare edge logs, browser devtools, error tracebacks) and stays consistent with every other API call in the app. Per `CLAUDE.md`: "Prefer dependencies over hand-rolled code."

**Backend auth**: The SSE endpoint uses the standard `current_active_user` FastAPI dependency — same as every other protected endpoint. No special JWT decode helper needed. FastAPI resolves dependencies before the endpoint body executes, so the streaming generator starts only after successful auth.

**Event types**: Two distinct SSE event types via the SSE `event:` field:
- `notification` — new notification created (bell badge update)
- `job_status` — job status changed (StatusBadge live update)

**State tracking**: Track watermarks per connection — `last_notification_id` and a `{job_id: status}` dict. Query only for changes since last check.

**Frontend strategy**: SSE-driven TanStack Query cache invalidation. Remove polling from `useNotifications` and `useJob`. Keep FASTQs polling as-is (FastQC is triggered inline via BackgroundTasks, not via job queue).

---

## Implementation

### 1. `backend/services/sse_service.py` — CREATE

Async generator that polls DB every 2s and yields SSE-formatted strings.

```python
async def sse_event_generator(user_id: int) -> AsyncGenerator[str, None]
```

- Opens its own `async_session_factory()` session (same pattern as `worker.py`)
- **Seed initial state** (no stale event burst on connect):
  - `last_notification_id` = `SELECT MAX(id) FROM notifications WHERE user_id = :uid` (or 0 if none)
  - `tracked_jobs` = `{job_id: status}` for all queued/running jobs the user can see (join through `experiments` → `project_members`)
- **Poll loop** (every `settings.WORKER_POLL_INTERVAL_SECONDS`):
  - Query new notifications: `WHERE user_id = :uid AND id > :last_id ORDER BY id`
  - Query job statuses: active jobs + any previously-tracked jobs that may have transitioned
  - Yield SSE events for each change, update watermarks
  - Yield `: keepalive\n\n` comment every ~15s when idle (prevent proxy timeouts)
- **Cleanup**: Catch `asyncio.CancelledError`, close session
- **Error handling**: On DB error, log with structlog, sleep, retry. After 5 consecutive DB errors, break out of loop (triggers stream close, frontend reconnects).

SSE event format:
```
event: notification\ndata: {"id": 42, "type": "job_complete"}\n\n
event: job_status\ndata: {"jobId": 7, "experimentId": 3, "status": "running"}\n\n
```

Data payloads use camelCase to match the `CamelModel` convention.

Job status query (joins through project membership for authorization):
```sql
SELECT aj.id, aj.experiment_id, aj.status
FROM analysis_jobs aj
JOIN experiments e ON e.id = aj.experiment_id
JOIN project_members pm ON pm.project_id = e.project_id
WHERE pm.user_id = :uid
  AND (aj.status IN ('queued', 'running') OR aj.id = ANY(:tracked_ids))
```

The `OR aj.id = ANY(:tracked_ids)` clause catches jobs that transitioned from running to complete/error since the last poll, so the frontend gets the final status update. Once a job reaches a terminal state, it is removed from the tracked set.

### 2. `backend/routers/notifications.py` — MODIFY

Add one new endpoint to the existing router. **Must be registered before the `/{notification_id}/read` path** to avoid FastAPI treating "stream" as a notification_id.

```python
@router.get("/stream")
async def notification_stream(
    current_user: User = Depends(current_active_user),
):
```

- Uses standard `current_active_user` dependency — auth via `Authorization: Bearer <token>` header, same as all other endpoints
- Returns `StreamingResponse(sse_event_generator(current_user.id), media_type="text/event-stream")` with headers:
  - `Cache-Control: no-cache`
  - `X-Accel-Buffering: no` (for future NGINX in Phase 7)
  - `Connection: keep-alive`

No helper functions needed — standard FastAPI DI handles everything.

### 3. `backend/config.py` — MODIFY

Add one setting:
```python
SSE_KEEPALIVE_SECONDS: int = 15
```

### 4. `frontend/package.json` — MODIFY

Add dependency:
```
"@microsoft/fetch-event-source": "^2.0.1"
```

### 5. `frontend/src/hooks/useSSE.ts` — CREATE

Custom React hook managing the SSE connection lifecycle:

```typescript
export function useSSE(): void
```

- Gets auth state from `useAuth()` (to know if logged in), query client from `useQueryClient()`, token from `getAccessToken()`
- On mount (when authenticated): connect via `fetchEventSource`:
  ```typescript
  fetchEventSource('/api/v1/notifications/stream', {
    headers: { 'Authorization': `Bearer ${token}` },
    onmessage(event) {
      if (event.event === 'notification') {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
      if (event.event === 'job_status') {
        const data = JSON.parse(event.data);
        queryClient.invalidateQueries({ queryKey: ['job', data.jobId] });
        queryClient.invalidateQueries({ queryKey: ['jobs', data.experimentId] });
        if (data.status === 'complete' || data.status === 'error') {
          queryClient.invalidateQueries({ queryKey: ['experiments'] });
        }
      }
    },
    onclose() {
      // Server closed connection — reconnect with fresh token
    },
    onerror(err) {
      // On 401: refresh token, retry
      // After 3 consecutive failures: stop (let user refresh page)
    },
    openWhenHidden: true,  // Keep SSE alive when tab is in background
  });
  ```
- `fetchEventSource` provides better reconnection control than native `EventSource`:
  - `onclose`: called when server closes the stream. Attempt token refresh via `/api/v1/auth/refresh`, then reconnect with new token.
  - `onerror`: receives the error/response. If HTTP 401, refresh token and retry. Track retry count in ref; stop after 3 consecutive failures.
- Cleanup on unmount/logout: abort the fetch via `AbortController`
- Re-create connection when token changes (useEffect dep on token)

### 6. `frontend/src/hooks/useNotifications.ts` — MODIFY

Remove `refetchInterval: 30_000` from `useNotifications()`. SSE handles push.

### 7. `frontend/src/hooks/useJobs.ts` — MODIFY

Remove the `refetchInterval` callback from `useJob()`. SSE `job_status` events trigger invalidation.

### 8. `frontend/src/App.tsx` — MODIFY

Add `useSSE()` call inside `AuthenticatedLayout`:
```typescript
function AuthenticatedLayout() {
  useSSE();  // SSE connection for live updates
  return (
    <GradientBackground>
      ...
```

This ensures SSE is active for all authenticated routes and torn down on logout.

### 9. `backend/tests/test_sse.py` — CREATE

Tests using httpx streaming response:

1. **`test_sse_requires_auth`** — GET `/stream` without Authorization header → 401
2. **`test_sse_rejects_invalid_token`** — GET `/stream` with bad Bearer token → 401
3. **`test_sse_connects_with_valid_token`** — register user, connect with valid token → 200, receive keepalive
4. **`test_sse_emits_notification_event`** — connect, create notification in DB, verify `event: notification` received
5. **`test_sse_emits_job_status_event`** — connect, create project+experiment+job, update job status, verify `event: job_status` received
6. **`test_sse_isolates_users`** — connect as user A, create notification for user B, verify user A does NOT receive it

Use `asyncio.wait_for()` with short timeout to avoid hanging. Override `WORKER_POLL_INTERVAL_SECONDS` to 0.1s in tests for speed.

### 10. `backend/tests/conftest.py` — MODIFY

Add `services.sse_service` to `patch_worker_sessions` fixture:
```python
import services.sse_service
monkeypatch.setattr(services.sse_service, "async_session_factory", test_session_factory)
```

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `backend/services/sse_service.py` | CREATE | SSE event generator with 2s DB polling |
| `backend/routers/notifications.py` | MODIFY | Add `GET /stream` endpoint with standard Bearer auth |
| `backend/config.py` | MODIFY | Add `SSE_KEEPALIVE_SECONDS = 15` |
| `backend/tests/test_sse.py` | CREATE | 6 test cases |
| `backend/tests/conftest.py` | MODIFY | Patch sse_service session factory |
| `frontend/package.json` | MODIFY | Add `@microsoft/fetch-event-source` dependency |
| `frontend/src/hooks/useSSE.ts` | CREATE | SSE connection hook with header auth + reconnection |
| `frontend/src/hooks/useNotifications.ts` | MODIFY | Remove `refetchInterval: 30_000` |
| `frontend/src/hooks/useJobs.ts` | MODIFY | Remove `refetchInterval` from `useJob()` |
| `frontend/src/App.tsx` | MODIFY | Call `useSSE()` in `AuthenticatedLayout` |

## What Does NOT Change

- `StatusBadge.tsx` — pure presentational, already renders correct color from props. SSE invalidates queries → parent re-renders → badge updates.
- `NotificationPanel.tsx` — already works with `useNotifications()` data. SSE just makes it refresh sooner.
- `worker.py` — no changes. Worker already creates notifications and updates job status. SSE reads from the same tables.
- `useFastqs.ts` — keep 5s polling. FastQC runs via BackgroundTasks (not job queue), so SSE doesn't cover it.
- `auth.py` — no changes. Standard `current_active_user` dependency handles SSE endpoint auth.

## Edge Cases

- **Multiple tabs**: Each tab opens its own SSE connection. ~30 connections max (10 users × 3 tabs), each doing 1 lightweight query every 2s. Negligible PG load.
- **Token expiry mid-stream**: Connection stays open (HTTP doesn't care about JWT expiry after initial auth). On natural disconnect or server restart, `fetchEventSource` fires `onclose` → frontend refreshes token and reconnects.
- **DB error during poll**: Catch, log via structlog, sleep, retry. After 5 consecutive DB errors, close stream (frontend auto-reconnects).
- **Proxy buffering**: `X-Accel-Buffering: no` + `Cache-Control: no-cache` headers. Vite dev proxy streams correctly.
- **Background tabs**: `openWhenHidden: true` keeps the connection alive when the tab is hidden, so notifications arrive even when the user isn't actively looking.

## Verification

1. Launch a trimming job via the frontend
2. Observe: StatusBadge updates Queued → Running → Complete without page refresh
3. Observe: Bell icon badge increments when job completes
4. Open NotificationPanel: new "Job Complete" notification visible immediately
5. Run `docker compose exec api pytest tests/test_sse.py` — all 6 tests pass
6. Run `ruff check backend/` and `npx tsc --noEmit` — both clean
