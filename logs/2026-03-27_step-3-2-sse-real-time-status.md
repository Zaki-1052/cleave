# 2026-03-27 — Step 3.2: SSE for Real-Time Status

## What was done

- Created `services/sse_service.py` — async generator that polls `notifications` + `analysis_jobs` tables every 2s, yields SSE events for changes
  - Watermark-based state tracking (`last_notification_id`, `{job_id: status}` dict) prevents stale event bursts on connect
  - Job visibility scoped via `project_members` join (user only sees their projects' jobs)
  - Keepalive comments every ~15s to prevent proxy timeouts
  - Graceful error handling: 5 consecutive DB errors → close stream, frontend reconnects
- Added `GET /api/v1/notifications/stream` endpoint to `routers/notifications.py` using standard `current_active_user` Bearer auth
- Created `frontend/src/hooks/useSSE.ts` using `@microsoft/fetch-event-source` — JWT in `Authorization` header (not query param), reconnection with token refresh, `openWhenHidden: true`
- SSE events invalidate TanStack Query caches: `notification` → `['notifications']`, `job_status` → `['job', id]` + `['jobs', experimentId]` + `['experiments']` on terminal status
- Removed polling from `useNotifications` (was 30s) and `useJob` (was 2s while running) — SSE replaces both
- Added `useSSE()` call in `AuthenticatedLayout` (App.tsx)
- Wrote 6 tests: auth rejection (2), generator lifecycle (1), notification events (1), job status events (1), user isolation (1)
- Changed `WORKER_POLL_INTERVAL_SECONDS` type from `int` to `float` (allows sub-second intervals in tests)

## Decisions made

- **Auth via header, not query param**: Used `@microsoft/fetch-event-source` (fetch-based EventSource with custom header support) instead of native `EventSource` + JWT-in-URL. Keeps tokens out of NGINX logs, Cloudflare edge logs, browser devtools, and error tracebacks.
- **`session.expire_all()`** instead of `session.close()` between polls — keeps the connection alive while ensuring fresh data
- **Generator-level tests** for event emission (httpx ASGI transport can't handle infinite streaming responses cooperatively). HTTP-level tests still cover auth rejection.
- **FASTQs 5s polling kept** — FastQC runs via BackgroundTasks, not the job queue, so SSE doesn't cover it

## Open items

- No test for `StreamingResponse` headers (`Cache-Control`, `X-Accel-Buffering`) — low risk, static values
- End-to-end browser verification pending (launch job → watch StatusBadge update live)
- Step 3.3 (Alignment Pipeline Module) is next

## Key file paths

- `backend/services/sse_service.py` — SSE event generator (new)
- `backend/routers/notifications.py` — added `/stream` endpoint
- `backend/config.py` — added `SSE_KEEPALIVE_SECONDS`
- `frontend/src/hooks/useSSE.ts` — SSE connection hook (new)
- `frontend/src/hooks/useNotifications.ts` — removed polling
- `frontend/src/hooks/useJobs.ts` — removed polling from `useJob()`
- `frontend/src/App.tsx` — wired `useSSE()` into `AuthenticatedLayout`
- `backend/tests/test_sse.py` — 6 tests (new)
