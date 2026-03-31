# Phase 1.5: Experiment CRUD — Backend + Frontend

## Context

Phase 1.4 (Manage Members + Notifications) is complete. The next step is wiring experiment creation, listing, and viewing within a project. The backend scaffold (model, schemas, router, service) already exists but needs validation hardening and security fixes. The frontend has API functions and query hooks but no mutation hooks, no create modal, and the ExperimentView/DescriptionTab are stubs showing placeholder text.

**Goal**: Users can create experiments in a project, see them in the experiments table, click through to the experiment view, and see real metadata on the Description tab.

---

## Architecture Decisions

1. **Create Experiment UI: Regular Modal** (not WizardModal). Only step 1 (Details) is needed now — steps 2 (FASTQs) and 3 (Reactions) are Phase 2. A regular `Modal` follows KISS and matches `CreateProjectModal`. Convert to `WizardModal` in Phase 2.

2. **AssayType validation via Literal type**. Change `assay_type: str` → `assay_type: Literal["CUT&RUN", "CUT&Tag"]` in `ExperimentCreate`/`ExperimentUpdate`. Follows the Phase 1.4 `RoleType` pattern — Pydantic auto-rejects invalid values with 422.

3. **Creator info via nested UserBrief**. Add `creator: UserBrief | None` to `ExperimentRead` and eagerly load the relationship. Follows the `MemberRead.user` pattern. Avoids a separate API call for the Description tab.

4. **Membership checks on create/update/delete**. Add `user_id` param to all three service functions and join on `ProjectMember`. Admin + contributor can create/update/delete; viewers cannot. Closes a security gap from the scaffold.

5. **"Last Job" column**: Static "None" text for Phase 1 (no jobs exist yet). Wired to real data in Phase 3.

6. **Navigate after creation**: `useNavigate` to `/experiments/{id}` on success.

7. **Experiment data sharing**: `ExperimentView` fetches via `useExperiment(id)` and passes data to child tabs via React Router's `useOutletContext`. Avoids duplicate fetches; TanStack Query caches regardless.

---

## Implementation Steps

### Step 1: Backend Schema — AssayType Literal + Creator Field

**File: `backend/schemas/experiment.py`**

- Import `Literal` from `typing`, import `UserBrief` from `schemas.project`
- Define `AssayTypeValue = Literal["CUT&RUN", "CUT&Tag"]` (mirrors `RoleType` pattern)
- `ExperimentCreate.assay_type` → `AssayTypeValue` (was `str`)
- `ExperimentUpdate.assay_type` → `AssayTypeValue | None` (was `str | None`)
- Add `creator: UserBrief | None = None` to `ExperimentRead` (after `created_by`)
- Keep `ExperimentRead.assay_type` as `str` (output doesn't need Literal restriction)

### Step 2: Backend Service — Security + Creator Loading

**File: `backend/services/experiment_service.py`**

- Add import: `from sqlalchemy.orm import selectinload`

**`create_experiment`** — Add membership verification:
- Before creating, query `ProjectMember` where `project_id + user_id` match and `role in ('admin', 'contributor')`
- Return `None` if not a member (router handles 403)
- After commit, re-fetch with `selectinload(Experiment.creator)` to populate the nested field

**`list_experiments`** — Add `.options(selectinload(Experiment.creator))` to the query

**`get_experiment`** — Add `.options(selectinload(Experiment.creator))` to the query

**`update_experiment`** — Add `user_id: int` param:
- Change the select to join on `ProjectMember` (like `get_experiment` does)
- Filter by `user_id` and `role.in_(["admin", "contributor"])`
- Add `.options(selectinload(Experiment.creator))`
- Returns `None` if not found or insufficient permissions

**`delete_experiment`** — Add `user_id: int` param, return `bool`:
- Change the select to join on `ProjectMember`
- Filter by `user_id` and `role.in_(["admin", "contributor"])`
- Return `False` if not found, `True` if deleted

### Step 3: Backend Router — Pass User ID, Handle Errors

**File: `backend/routers/experiments.py`**

- `create_experiment_endpoint`: Handle `None` return → raise `HTTPException(403, "Not a member of this project or insufficient permissions")`
- `update_experiment_endpoint`: Pass `current_user.id` to `update_experiment()`
- `delete_experiment_endpoint`: Pass `current_user.id` to `delete_experiment()`, handle `False` → 404

### Step 4: Frontend Types — Add Creator to Experiment

**File: `frontend/src/api/types.ts`**

- Add `creator: MemberUser | null;` to the `Experiment` interface (after `createdBy`)
- `MemberUser` already has the right shape: `{ id, email, firstName, lastName }`

### Step 5: Frontend Utils — Extract Display Name Helper

**File: `frontend/src/lib/utils.ts`**

- Extract `getDisplayName(user: { firstName: string | null; lastName: string | null; email: string })` from `ProjectDetailPage.tsx`
- Returns `"First Last"` if both names exist, otherwise `email`
- Reused by both `ProjectDetailPage` (member list) and `DescriptionTab` (creator name)

### Step 6: Frontend Hooks — Add Mutation Hooks

**File: `frontend/src/hooks/useExperiments.ts`**

Add `useCreateExperiment()` mutation hook:
- `mutationFn` calls `experimentsApi.createExperiment(projectId, name, assayType, description)`
- `onSuccess` invalidates `['experiments']` query key
- Follows `useCreateProject` pattern exactly

Also add `useDeleteExperiment()` for completeness (used implicitly by tests / future UI):
- `mutationFn` calls `experimentsApi.deleteExperiment(id)`
- `onSuccess` invalidates `['experiments']`

### Step 7: Frontend — CreateExperimentModal Component

**New file: `frontend/src/components/experiments/CreateExperimentModal.tsx`**

Follows `CreateProjectModal` pattern. Props:
```typescript
interface CreateExperimentModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  onCreated: (experiment: Experiment) => void;
}
```

Form fields:
1. **Experiment Name** — `Input` component, required, `maxLength={100}`, character counter showing `{length} / 100` on the right
2. **Assay Type** — Native `<select>` with Tailwind styling (same pattern as ManageMembersModal role dropdown), options from `ASSAY_TYPES` constant, required, default empty option "Select assay type"
3. **Description** — `<textarea>`, optional, same styling as CreateProjectModal

Behavior:
- Submit disabled if `!name.trim() || !assayType || isPending`
- Error display: "Failed to create experiment" on mutation error
- `handleClose` resets all form state + calls `mutation.reset()`
- `onSuccess`: calls `onCreated(data)` with the returned experiment

### Step 8: Frontend — Wire Create Button on ProjectDetailPage

**File: `frontend/src/pages/ProjectDetailPage.tsx`**

- Import `CreateExperimentModal`, `useNavigate`
- Replace `getDisplayName` inline function with import from `@/lib/utils`
- Add state: `const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)`
- Add `const navigate = useNavigate()`
- Wire button: `<Button onClick={() => setIsCreateModalOpen(true)}>+ Create Experiment</Button>`
- Add "Last Job" column between Assay and Status:
  ```typescript
  { id: 'lastJob', header: 'Last Job', cell: () => <span className="text-gray-400">None</span> }
  ```
- Mount modal after ManageMembersModal:
  ```tsx
  <CreateExperimentModal
    isOpen={isCreateModalOpen}
    onClose={() => setIsCreateModalOpen(false)}
    projectId={projectId}
    onCreated={(experiment) => {
      setIsCreateModalOpen(false);
      navigate(`/experiments/${experiment.id}`);
    }}
  />
  ```

### Step 9: Frontend — Wire ExperimentView to Real Data

**File: `frontend/src/pages/ExperimentView.tsx`**

- Import `useExperiment` hook, `StatusBadge`, loading spinner pattern
- Fetch: `const { data: experiment, isLoading } = useExperiment(Number(id))`
- Add loading spinner (same pattern as ProjectDetailPage)
- Add not-found state
- Replace hardcoded `"Experiment {id}"` header with:
  - Experiment name (bold, large text)
  - Status badge: `<StatusBadge status={experiment.status} />`
  - "Last Job" label: "None" (static for Phase 1)
- Pass experiment to child tabs: `<Outlet context={{ experiment }} />`
- Keep "New Analysis" button as-is (Phase 3)

### Step 10: Frontend — Wire DescriptionTab to Real Data

**File: `frontend/src/pages/experiment/DescriptionTab.tsx`**

- Import `useOutletContext` from react-router-dom
- Import `StatusBadge`, `formatBytes`, `formatDate`, `getDisplayName` from utils
- Define context type and extract: `const { experiment } = useOutletContext<{ experiment: Experiment }>()`
- **Details card** — key-value layout matching CUTANA Cloud (uppercase small-caps labels, regular-weight values):
  - EXPERIMENT ID: `experiment.id`
  - CREATED BY: `getDisplayName(experiment.creator)` or "Unknown"
  - CREATED DATE: `formatDate(experiment.createdAt)`
  - STATUS: `<StatusBadge status={experiment.status} />`
  - SIZE: `formatBytes(experiment.storageBytes)`
- **Description card** — Show `experiment.description` or gray placeholder "No description provided"

### Step 11: Backend Tests

**File: `backend/tests/test_experiments.py`**

Implement test cases (using httpx AsyncClient + pytest-anyio pattern from test_auth.py):

| Test | What it verifies |
|------|-----------------|
| `test_create_experiment` | 201, correct fields, creator populated |
| `test_create_experiment_name_too_long` | 101 chars → 422 |
| `test_create_experiment_invalid_assay_type` | "ATAC-seq" → 422 |
| `test_create_experiment_nonmember` | Second user → 403 |
| `test_list_experiments_for_project` | Returns only experiments in the given project |
| `test_get_experiment_detail` | All fields including nested creator |
| `test_update_experiment` | PATCH name → 200, name changed |
| `test_update_experiment_nonmember` | Second user → 404 |
| `test_delete_experiment` | 204, subsequent GET → 404 |
| `test_delete_experiment_viewer` | Viewer role → 404 |

---

## Files Summary

| File | Action | Key Changes |
|------|--------|-------------|
| `backend/schemas/experiment.py` | Modify | `AssayTypeValue` Literal, `creator: UserBrief` on read schema |
| `backend/services/experiment_service.py` | Modify | Membership checks, `selectinload(creator)`, `user_id` params |
| `backend/routers/experiments.py` | Modify | Pass `user_id`, 403 on create |
| `frontend/src/api/types.ts` | Modify | `creator: MemberUser \| null` on Experiment |
| `frontend/src/lib/utils.ts` | Modify | Add `getDisplayName()` helper |
| `frontend/src/hooks/useExperiments.ts` | Modify | Add `useCreateExperiment`, `useDeleteExperiment` |
| `frontend/src/components/experiments/CreateExperimentModal.tsx` | **New** | Modal with name (100-char), assay dropdown, description |
| `frontend/src/pages/ProjectDetailPage.tsx` | Modify | Wire create button + modal, add Last Job column, navigate |
| `frontend/src/pages/ExperimentView.tsx` | Modify | Fetch real data, show name + status, pass Outlet context |
| `frontend/src/pages/experiment/DescriptionTab.tsx` | Modify | Render real metadata from context |
| `backend/tests/test_experiments.py` | Modify | 10 test cases |

---

## Verification

1. `ruff check backend/ && ruff format backend/` — passes
2. `cd frontend && npx tsc --noEmit` — passes
3. Create experiment in browser → appears in experiments table with correct columns
4. Click experiment name → ExperimentView loads with real name + status badge
5. Description tab → shows ID, creator name, created date, status, size
6. 101-char name → 422 error
7. Invalid assay type → 422 error
8. Non-member cannot create/update/delete → 403/404
9. `pytest backend/tests/test_experiments.py` — all pass
