# 2026-03-27 — Step 3.7: Analysis Queue Page

## What was done

- Added `GET /api/v1/jobs` endpoint returning all jobs across projects the user is a member of (paginated, filterable by status)
- Created `JobQueueRead` schema with `from_job()` classmethod to bridge ORM relationships (experiment name, project name) into a flat response
- Created `list_all_jobs_for_user()` service function joining `AnalysisJob → Experiment → ProjectMember` with eager loading of `launcher` and `experiment.project`
- Added `perPage` alias on the query parameter for frontend compatibility
- Replaced the `AnalysisQueuePage` stub with a full implementation: DataTable with 8 columns (Name, Project, Experiment, Executable, Launched By, Started Running, Duration, Status), search input, status filter dropdown, server-side pagination controls
- Added `QueueJob` TypeScript type, `listAllJobs()` API function, and `useAllJobs()` React Query hook
- 7 new backend tests (cross-project listing, isolation, shared visibility, status filter, pagination, response shape, unauthenticated)

## Decisions made

- Created a separate `JobQueueRead` schema rather than extending `JobRead` — keeps the experiment-scoped endpoints unchanged and avoids unnecessary data transfer
- Used `from_job()` classmethod pattern instead of Pydantic `from_attributes` magic — explicit attribute mapping from eagerly-loaded relationships is clearer and avoids fragile ORM-to-schema mapping
- Server-side pagination with custom controls in the page component, passing `pageSize={filtered.length}` to DataTable to disable its internal pagination — avoids modifying the shared DataTable component
- Client-side search filters the current page of results (name, project, experiment, jobType)
- Any project member role (admin, contributor, viewer) can see jobs in the queue — consistent with read access patterns elsewhere

## Open items

- The existing `list_experiment_jobs` endpoint (`GET /experiments/{id}/jobs`) does NOT have a `perPage` alias — frontend pagination on that endpoint may be silently broken (defaulting to 25). Not addressed here to avoid modifying existing endpoints.
- Column-level filter dropdowns per §5 spec are not implemented (search + status dropdown cover the main use case)

## Key file paths

- `backend/schemas/job.py` — Added `JobQueueRead` schema (modified)
- `backend/services/job_service.py` — Added `list_all_jobs_for_user()` (modified)
- `backend/routers/jobs.py` — Added `GET /jobs` endpoint (modified)
- `backend/tests/test_jobs_api.py` — 7 new tests (modified)
- `frontend/src/api/types.ts` — Added `QueueJob` interface (modified)
- `frontend/src/api/jobs.ts` — Added `listAllJobs()` (modified)
- `frontend/src/hooks/useJobs.ts` — Added `useAllJobs()` (modified)
- `frontend/src/pages/AnalysisQueuePage.tsx` — Full implementation (modified)

## Test results

- TypeScript: `npx tsc --noEmit` passes cleanly
- Python lint: `ruff check .` passes cleanly
- Backend: 213 passed, 0 failed (7 new + 206 existing, no regressions)
