# Step 3.7: Analysis Queue Page

## Context

Step 3.6 completed the Alignment sub-tabs (Info, Input, Files). The Analysis Queue page is the last piece of Phase 3 — a cross-project view of all jobs the user can see, matching `cutana-cloud-ui.md` §5. The route (`/queue`), navbar link (green underline), and stub page already exist.

## Problem

The current `AnalysisQueuePage.tsx` is a stub. There is no backend endpoint to list jobs across all projects — only `GET /experiments/{id}/jobs` (scoped to one experiment). The `JobRead` schema lacks project/experiment names needed for the queue table columns.

## Plan

### 1. Backend Schema — `JobQueueRead` in `backend/schemas/job.py`

Add a new schema (do NOT modify `JobRead`):

```python
class JobQueueRead(CamelModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    experiment_id: int
    experiment_name: str
    project_id: int
    project_name: str
    job_type: str
    name: str
    status: str = "queued"
    launched_by: int | None = None
    launcher: UserBrief | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_seconds: int | None = None
    created_at: datetime

    @classmethod
    def from_job(cls, job: "AnalysisJob") -> "JobQueueRead":
        return cls(
            id=job.id,
            experiment_id=job.experiment_id,
            experiment_name=job.experiment.name,
            project_id=job.experiment.project_id,
            project_name=job.experiment.project.name,
            job_type=job.job_type,
            name=job.name,
            status=job.status,
            launched_by=job.launched_by,
            launcher=UserBrief.model_validate(job.launcher, from_attributes=True) if job.launcher else None,
            started_at=job.started_at,
            completed_at=job.completed_at,
            duration_seconds=job.duration_seconds,
            created_at=job.created_at,
        )
```

Rationale: Drops `notes`, `params`, `error_message`, `methods_text` (not needed in queue table). Adds `experiment_name`, `project_id`, `project_name` from eagerly-loaded relationships. Uses `from_job()` classmethod to bridge ORM → schema cleanly.

### 2. Backend Service — `list_all_jobs_for_user()` in `backend/services/job_service.py`

Add new function (do NOT modify existing functions):

```python
async def list_all_jobs_for_user(
    db: AsyncSession,
    user_id: int,
    page: int,
    per_page: int,
    status: str | None = None,
) -> tuple[list[AnalysisJob], int]:
```

- Join chain: `AnalysisJob → Experiment → ProjectMember` where `ProjectMember.user_id == user_id`
- Optional filter: `AnalysisJob.status == status` when provided
- Count via subquery, fetch with offset/limit
- `selectinload(AnalysisJob.launcher)`, `selectinload(AnalysisJob.experiment).selectinload(Experiment.project)`
- `.unique()` on scalars (join may produce duplicates with selectinload)
- Order by `AnalysisJob.created_at.desc()`

Follows exact same pattern as `list_projects_for_user()` in `project_service.py`.

### 3. Backend Router — `GET /api/v1/jobs` in `backend/routers/jobs.py`

Add new endpoint **before** `GET /jobs/{job_id}`:

```python
@router.get("/jobs", response_model=PaginatedResponse[JobQueueRead])
async def list_all_jobs(
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
```

- Calls `list_all_jobs_for_user(db, user.id, page, per_page, status)`
- Converts each job via `JobQueueRead.from_job(j)`
- Returns `PaginatedResponse[JobQueueRead]`

### 4. Backend Tests — `backend/tests/test_jobs_api.py`

Add 7 tests using existing helper patterns (`_register_and_get_headers`, `_create_project`, `_create_experiment`):

| Test | What it verifies |
|------|-----------------|
| `test_list_all_jobs_200` | Two projects, one job each → both returned, response shape includes `projectName`, `experimentName`, `launcher` |
| `test_list_all_jobs_cross_project_isolation` | Alice and Bob each create a project → each sees only their own jobs |
| `test_list_all_jobs_shared_project_visibility` | Alice adds Bob to her project → Bob sees Alice's job |
| `test_list_all_jobs_status_filter` | Two jobs, update one to "running" via `db_session` → `?status=queued` returns 1, `?status=running` returns 1 |
| `test_list_all_jobs_pagination` | 3 jobs → `?perPage=2&page=1` returns 2 items, `?perPage=2&page=2` returns 1 |
| `test_list_all_jobs_response_shape` | Assert exact keys on response item: `id`, `experimentId`, `experimentName`, `projectId`, `projectName`, `jobType`, `name`, `status`, `launchedBy`, `launcher`, `startedAt`, `completedAt`, `durationSeconds`, `createdAt` |
| `test_list_all_jobs_unauthenticated_401` | No auth header → 401 |

### 5. Frontend Type — `QueueJob` in `frontend/src/api/types.ts`

Add after `AnalysisJob` interface:

```typescript
export interface QueueJob {
  id: number;
  experimentId: number;
  experimentName: string;
  projectId: number;
  projectName: string;
  jobType: string;
  name: string;
  status: string;
  launchedBy: number | null;
  launcher: MemberUser | null;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  createdAt: string;
}
```

### 6. Frontend API — `listAllJobs()` in `frontend/src/api/jobs.ts`

```typescript
export async function listAllJobs(
  page = 1,
  perPage = 25,
  status?: string,
): Promise<PaginatedResponse<QueueJob>> {
  const { data } = await client.get<PaginatedResponse<QueueJob>>('/jobs', {
    params: { page, perPage, ...(status && { status }) },
  });
  return data;
}
```

### 7. Frontend Hook — `useAllJobs()` in `frontend/src/hooks/useJobs.ts`

```typescript
export function useAllJobs(page = 1, perPage = 25, status?: string) {
  return useQuery({
    queryKey: ['all-jobs', { page, perPage, status }],
    queryFn: () => jobsApi.listAllJobs(page, perPage, status),
  });
}
```

### 8. Frontend Page — `frontend/src/pages/AnalysisQueuePage.tsx`

Replace the stub. Structure:

- **State**: `page`, `statusFilter`, `searchText`
- **Data**: `useAllJobs(page, 25, statusFilter)`
- **Client-side search**: Filter current page by name/project/experiment/jobType
- **Columns** (matching `cutana-cloud-ui.md` §5):
  1. **Name** — `job.name`
  2. **Project** — `job.projectName`
  3. **Experiment** — `job.experimentName`
  4. **Executable** — `job.jobType`
  5. **Launched By** — `getDisplayName(job.launcher)` or em-dash
  6. **Started Running** — `formatDateTime(job.startedAt)` or em-dash
  7. **Duration** — `formatDuration(job.durationSeconds)` or em-dash
  8. **Status** — `<StatusBadge status={job.status} />`

- **Layout**: Single `<Card>` with header toolbar (search input + status `<select>` dropdown) + `<DataTable>` + custom server-side pagination controls
- **Pagination approach**: Pass `pageSize={filtered.length}` to DataTable to disable its internal pagination. Render custom prev/next buttons below using `total`/`page` from API response. This avoids modifying the shared `DataTable` component.
- **Empty state**: "No jobs found" message when `total === 0`
- **Loading state**: Spinner or skeleton while `isLoading`

Reuses existing components: `Card`, `DataTable`, `StatusBadge`, existing utils (`formatDateTime`, `formatDuration`, `getDisplayName`).

## What NOT to Change

- `JobRead` schema — used by experiment-scoped endpoints
- `AnalysisJob` model — relationships already exist
- `DataTable` component — work around its client-side pagination
- Existing router endpoints — no modifications
- `App.tsx` routing — `/queue` route already exists
- `Navbar` — Analysis Queue link already wired with green underline
- `main.py` — jobs router already included

## Files Modified

| File | Action |
|------|--------|
| `backend/schemas/job.py` | Add `JobQueueRead` class |
| `backend/services/job_service.py` | Add `list_all_jobs_for_user()` function |
| `backend/routers/jobs.py` | Add `GET /jobs` endpoint |
| `backend/tests/test_jobs_api.py` | Add 7 new tests |
| `frontend/src/api/types.ts` | Add `QueueJob` interface |
| `frontend/src/api/jobs.ts` | Add `listAllJobs()` function |
| `frontend/src/hooks/useJobs.ts` | Add `useAllJobs()` hook |
| `frontend/src/pages/AnalysisQueuePage.tsx` | Full implementation (replace stub) |

## Verification

1. `ruff check backend/` — passes
2. `npx tsc --noEmit` — passes
3. `docker compose exec api pytest tests/test_jobs_api.py` — all tests pass (existing + 7 new)
4. Manual: Create jobs in different projects → navigate to `/queue` → all visible. Filter by status → correct results. Search by name → filters table.
