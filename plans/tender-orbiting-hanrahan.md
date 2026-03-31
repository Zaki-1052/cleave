# Phase 7.3: Experiment History / Audit Log

## Context

PLAN.md §7.3 specifies: "History tab per `cutana-cloud-ui.md` §6: log of all actions (job launches, file uploads, metadata changes). Store events in a simple `experiment_events` table or derive from existing data."

The History tab is already stubbed — route wired in `App.tsx:59`, tab listed in `ExperimentView.tsx:36`, placeholder at `frontend/src/pages/experiment/HistoryTab.tsx`. This plan adds the backend model, API, event logging at each mutation point, and replaces the stub with a real DataTable.

**Pipeline-Specific Rules note**: This is a web app UI/data feature, not a bioinformatics pipeline module. No reference scripts in `references/` apply. No pipeline logic is involved.

**Approach**: New `experiment_events` table. Existing data (jobs, FASTQs) has timestamps but no unified audit trail. Reactions and metadata changes have no history at all. A dedicated events table is the only option that covers all action types.

---

## Step 1: Database Model

**New file**: `backend/models/experiment_event.py`

```python
class ExperimentEvent(Base):
    __tablename__ = "experiment_events"

    id              (int, PK)
    experiment_id   (int, FK experiments.id CASCADE, indexed)
    user_id         (int | None, FK users.id SET NULL)
    action          (String(50), not null)     # "fastq_uploaded", "job_launched", etc.
    resource_type   (String(50) | None)        # "fastq", "reaction", "job", "experiment"
    resource_id     (int | None)               # PK of affected resource
    detail          (String | None)            # Human-readable description
    created_at      (DateTime(timezone=True), server_default=func.now())
```

- `user_id` SET NULL so events survive user deletion
- `action` is a plain string (not enum) — new event types can be added without migrations
- `detail` is free-text for human display, not structured JSON
- Relationship: `user: Mapped["User"] = relationship()` for eager-loading actor name
- Register in `backend/models/__init__.py`

**Action vocabulary**:
| Action | Resource Type | When |
|--------|--------------|------|
| `fastq_uploaded` | fastq | After tus/multipart upload completes |
| `fastq_deleted` | fastq | After FASTQ file deleted |
| `reaction_created` | reaction | After single reaction created |
| `reactions_imported` | reaction | After bulk/CSV import |
| `reaction_updated` | reaction | After reaction fields changed |
| `reaction_deleted` | reaction | After reaction deleted |
| `job_launched` | job | After analysis job queued |
| `job_completed` | job | Worker: job reaches "complete" |
| `job_failed` | job | Worker: job reaches "error" |
| `metadata_updated` | experiment | After experiment name/description/assay changed |

**NOT logged**: experiment creation (redundant with `created_at`/`created_by`), experiment deletion (CASCADE deletes events), job queued→running transition (internal, not user-visible).

---

## Step 2: Alembic Migration

Generate: `docker compose exec api alembic revision --autogenerate -m "add_experiment_events"`

Down revision: `87e85de24803` (current head). Creates `experiment_events` table with index on `(experiment_id, created_at DESC)` for the primary query pattern.

---

## Step 3: Pydantic Schema

**New file**: `backend/schemas/experiment_event.py`

```python
class ExperimentEventRead(CamelModel):
    id: int
    experiment_id: int
    user_id: int | None
    user: UserBrief | None       # Reuse existing UserBrief from schemas/project.py
    action: str
    resource_type: str | None
    resource_id: int | None
    detail: str | None
    created_at: datetime
```

---

## Step 4: Event Service

**New file**: `backend/services/event_service.py`

Three functions:

1. **`log_event(db, experiment_id, user_id, action, resource_type, resource_id, detail)`**
   - Adds `ExperimentEvent` to the session. Does NOT commit — caller's commit flushes it atomically with the action.

2. **`log_event_standalone(experiment_id, user_id, action, ...)`**
   - Creates its own session via `async_session_factory()` and commits. For worker process use only.

3. **`list_events(db, experiment_id, user_id, page, per_page)`**
   - Permission check via `get_experiment_with_permission(db, eid, uid, ["admin", "contributor", "viewer"])`.
   - Returns `tuple[list[ExperimentEvent], int] | None` (None = unauthorized).
   - Ordered by `created_at DESC`, paginated, `selectinload(ExperimentEvent.user)`.

---

## Step 5: Router Endpoint

**Modify**: `backend/routers/experiments.py` — add one endpoint:

```
GET /api/v1/experiments/{experiment_id}/history?page=1&perPage=25
→ PaginatedResponse[ExperimentEventRead]
```

Permission: any project member (admin, contributor, viewer). Returns 404 for non-members (consistent with existing pattern).

---

## Step 6: Integration Points

Add `log_event()` calls to existing service functions. Each call goes before the existing `await db.commit()` so the event is transactional with the operation. Where `resource_id` is needed post-commit, use `await db.flush()` first.

| File | Function | Event |
|------|----------|-------|
| `routers/tus_upload.py` | `on_fastq_upload_complete()` | `fastq_uploaded` — after record created, before storage commit |
| `services/fastq_service.py` | `upload_fastqs()` | `fastq_uploaded` — after flush, before commit |
| `services/fastq_service.py` | `delete_fastq()` | `fastq_deleted` — capture filename before delete, log before commit |
| `services/reaction_service.py` | `create_reaction()` | `reaction_created` — after commit (need id), second commit |
| `services/reaction_service.py` | `bulk_create_reactions()` | `reactions_imported` — after commit, second commit |
| `services/reaction_service.py` | `update_reaction()` | `reaction_updated` — before commit |
| `services/reaction_service.py` | `delete_reaction()` | `reaction_deleted` — capture short_name before delete, before commit |
| `services/job_service.py` | `create_job()` | `job_launched` — after commit (need id), second commit |
| `services/experiment_service.py` | `update_experiment()` | `metadata_updated` — after commit, second commit |
| `worker.py` | `poll_and_run()` complete path | `job_completed` — via `log_event_standalone()` after status update |
| `worker.py` | `poll_and_run()` error path | `job_failed` — via `log_event_standalone()` after status update, truncate error to 200 chars |

**Note on `user_id` at each point**:
- Service functions: `user_id` passed as parameter (from router's `current_user.id`)
- Tus upload: `current_user.id` available in the dependency-injected handler
- Worker: `launched_by` from the job record (may be None, handled gracefully)

**Note on `experiment_id`**: Always available — either as a direct parameter or from the entity being modified.

---

## Step 7: Frontend API Module

**New file**: `frontend/src/api/experimentEvents.ts`

```typescript
export async function listExperimentHistory(
  experimentId: number, page = 1, perPage = 25,
): Promise<PaginatedResponse<ExperimentEvent>> { ... }
```

**Add to `frontend/src/api/types.ts`**:

```typescript
export interface ExperimentEvent {
  id: number;
  experimentId: number;
  userId: number | null;
  user: MemberUser | null;
  action: string;
  resourceType: string | null;
  resourceId: number | null;
  detail: string | null;
  createdAt: string;
}
```

---

## Step 8: Frontend Hook

**New file**: `frontend/src/hooks/useExperimentHistory.ts`

```typescript
export function useExperimentHistory(experimentId: number, page = 1, perPage = 25) {
  return useQuery({
    queryKey: ['experiment-history', experimentId, { page, perPage }],
    queryFn: () => listExperimentHistory(experimentId, page, perPage),
    enabled: !!experimentId,
  });
}
```

---

## Step 9: HistoryTab Component

**Replace**: `frontend/src/pages/experiment/HistoryTab.tsx`

- Get experiment from `useOutletContext<{ experiment: Experiment }>()`
- Fetch events with `useExperimentHistory(experiment.id, page, 100)`
- Render in a `DataTable` with 4 columns:

| Column | Source | Display |
|--------|--------|---------|
| Date | `event.createdAt` | Formatted datetime |
| User | `event.user` | `firstName lastName` or `email` or "System" |
| Action | `event.action` | Human label via lookup map (e.g., "FASTQ Uploaded") |
| Details | `event.detail` | Free text |

- Action labels formatted from action string: `ACTION_LABELS` mapping object
- Action column uses colored text: green (created/completed/uploaded), red (deleted/failed), blue (launched/imported), gray (updated)
- Loading spinner while fetching, "No history events yet" empty state
- Default sort: newest first (server-side, DataTable displays as-is)

---

## Step 10: Tests

**New file**: `backend/tests/test_experiment_events.py`

~8-10 tests:
1. `test_history_empty` — new experiment has 0 events
2. `test_history_after_reaction_created` — create reaction via API, verify event appears
3. `test_history_after_fastq_deleted` — upload then delete FASTQ, verify both events
4. `test_history_after_metadata_update` — update experiment name, verify event
5. `test_history_after_job_launched` — create job, verify "job_launched" event
6. `test_history_pagination` — create multiple events, verify page/total
7. `test_history_nonmember_404` — non-member gets 404
8. `test_history_viewer_can_read` — viewer role can access history
9. `test_history_newest_first` — events ordered by created_at DESC

**Modify**: `backend/tests/conftest.py` — monkeypatch `services.event_service.async_session_factory` for worker test compatibility.

---

## Verification

1. `docker compose exec api ruff check .` — clean
2. `docker compose exec api ruff format --check .` — clean
3. `cd frontend && npx tsc --noEmit` — clean
4. `cd frontend && npm run build` — clean
5. `docker compose exec api pytest tests/test_experiment_events.py -v` — all pass
6. Manual: create experiment → upload FASTQs → create reactions → launch alignment → check History tab shows all events

---

## Files Summary

| Action | File |
|--------|------|
| **Create** | `backend/models/experiment_event.py` |
| **Create** | `backend/schemas/experiment_event.py` |
| **Create** | `backend/services/event_service.py` |
| **Create** | `backend/tests/test_experiment_events.py` |
| **Create** | `backend/migrations/versions/<hash>_add_experiment_events.py` |
| **Create** | `frontend/src/api/experimentEvents.ts` |
| **Create** | `frontend/src/hooks/useExperimentHistory.ts` |
| **Modify** | `backend/models/__init__.py` — register ExperimentEvent |
| **Modify** | `backend/routers/experiments.py` — add GET history endpoint |
| **Modify** | `backend/services/fastq_service.py` — log upload/delete events |
| **Modify** | `backend/routers/tus_upload.py` — log upload event |
| **Modify** | `backend/services/reaction_service.py` — log create/update/delete events |
| **Modify** | `backend/services/job_service.py` — log job_launched event |
| **Modify** | `backend/services/experiment_service.py` — log metadata_updated event |
| **Modify** | `backend/worker.py` — log job_completed/job_failed events |
| **Modify** | `frontend/src/api/types.ts` — add ExperimentEvent interface |
| **Replace** | `frontend/src/pages/experiment/HistoryTab.tsx` — full implementation |
