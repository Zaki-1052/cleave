# Phase 1.3: Project CRUD — Backend + Frontend

## Context

Phase 1.3 wires projects end-to-end per PLAN.md. The backend project CRUD (router, service, model, schemas) is fully implemented and correct — `list_projects_for_user()` already filters by membership. The frontend has partial scaffolding: `HomePage` fetches/renders project cards but has a hardcoded status badge and un-wired Create button; `ProjectDetailPage` shows name + storage size but members and experiments are placeholders.

**Goal**: Users can create projects, see them on the home page, click into project detail with member list and empty experiments table.

---

## Implementation Steps

### Step 1: Backend — Enrich `MemberRead` with user info

**File**: `backend/schemas/project.py`

The `MemberRead` schema only has `user_id` — no name or email. The frontend needs user names to display the member list sidebar.

- Add a `UserBrief` schema (`id`, `email`, `first_name`, `last_name`) with `from_attributes=True`
- Add `user: UserBrief` field to `MemberRead`
- Pydantic `from_attributes=True` will traverse the ORM relationship `member.user` automatically when the relationship is eagerly loaded

### Step 2: Backend — Eagerly load User in member queries

**File**: `backend/services/project_service.py`

In async SQLAlchemy, lazy-loading raises `MissingGreenlet`. Add `selectinload(ProjectMember.user)` to:

- `list_members()` — add `.options(selectinload(ProjectMember.user))` to the query
- `add_member()` — after commit, re-fetch with `selectinload` so the response includes user info
- `update_member_role()` — same pattern after commit

**Reuse**: `from sqlalchemy.orm import selectinload` (standard SQLAlchemy)

### Step 3: Frontend — Add `MemberUser` and `Member` types

**File**: `frontend/src/api/types.ts`

```typescript
export interface MemberUser {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface Member {
  userId: number;
  projectId: number;
  role: string;
  canDownload: boolean;
  canDelete: boolean;
  createdAt: string;
  user: MemberUser;
}
```

### Step 4: Frontend — Add `getMembers()` API function

**File**: `frontend/src/api/projects.ts`

Add `getMembers(projectId: number): Promise<Member[]>` — calls `GET /projects/{projectId}/members`. Backend returns `list[MemberRead]` (not paginated), so return type is `Member[]`.

### Step 5: Frontend — Add hooks

**File**: `frontend/src/hooks/useProjects.ts`

- `useMembers(projectId)` — queryKey: `['projects', projectId, 'members']`, enabled when `projectId` is truthy

**New file**: `frontend/src/hooks/useExperiments.ts`

- `useExperiments(projectId, page, perPage)` — queryKey: `['experiments', { projectId, page, perPage }]`
- `useExperiment(id)` — queryKey: `['experiments', id]`

**Reuse**: `frontend/src/api/experiments.ts` — `getExperiments()` and `getExperiment()` already exist and accept `projectId` as an optional filter.

### Step 6: Frontend — Build `CreateProjectModal`

**New file**: `frontend/src/components/projects/CreateProjectModal.tsx`

Props: `isOpen: boolean`, `onClose: () => void`

- Uses existing `Modal` component (`components/ui/Modal.tsx`) for overlay/header
- Uses existing `Input` component for project name (required)
- Raw `<textarea>` styled to match `Input` classes for description (optional) — no `Textarea` component exists and creating one for a single use violates KISS
- Cancel (`Button variant="outlined"`) and Create (`Button` primary) buttons
- Uses `useCreateProject()` mutation hook — its `onSuccess` already invalidates `['projects']` cache
- On mutation success: reset form, call `onClose()`
- Disable submit when name is empty or mutation is pending
- Show error text if mutation fails

### Step 7: Frontend — Update `HomePage.tsx`

**File**: `frontend/src/pages/HomePage.tsx`

Changes:
1. **Remove** `StatusBadge` import and usage (line 4, 52) — projects don't have a status field; CUTANA Cloud project cards don't show status badges
2. **Add** storage size display on cards — show `formatBytes(project.storageBytes)` next to modified date (already imported via `formatBytes` from `@/lib/utils`)
3. **Wire** Create Project button — add `useState` for modal visibility, render `CreateProjectModal`, pass `onClick={() => setIsCreateModalOpen(true)}` to Button

### Step 8: Frontend — Update `ProjectDetailPage.tsx`

**File**: `frontend/src/pages/ProjectDetailPage.tsx`

Changes:

**Sidebar — member list**:
- Use `useMembers(projectId)` hook to fetch members
- Render count header: "{N} Members"
- For each member, render: teal avatar circle (`bg-accent-teal`, initials from name or email), full name (or email fallback), role label from `ROLE_LABELS` constant
- Add "+ Manage Members" link (non-functional placeholder for Phase 1.4)
- Helper: `getInitials(user: MemberUser)` — returns `"CF"` from first/last name, or first 2 chars of email

**Main area — experiments table**:
- Use `useExperiments(projectId)` hook to fetch experiments
- Define columns: Name, Modified (formatted date), Assay, Status (StatusBadge) — skip "Last Job" column (requires analysis_jobs data, Phase 3)
- Use existing `DataTable` component
- Show empty state message when no experiments exist
- "+ Create Experiment" button remains un-wired (Phase 1.5)

---

## Files Modified

| # | File | Action |
|---|------|--------|
| 1 | `backend/schemas/project.py` | Add `UserBrief` schema, add `user: UserBrief` to `MemberRead` |
| 2 | `backend/services/project_service.py` | Add `selectinload(ProjectMember.user)` to `list_members`, `add_member`, `update_member_role` |
| 3 | `frontend/src/api/types.ts` | Add `MemberUser` and `Member` interfaces |
| 4 | `frontend/src/api/projects.ts` | Add `getMembers()` function |
| 5 | `frontend/src/hooks/useProjects.ts` | Add `useMembers()` hook |
| 6 | `frontend/src/hooks/useExperiments.ts` | **New file**: `useExperiments()`, `useExperiment()` hooks |
| 7 | `frontend/src/components/projects/CreateProjectModal.tsx` | **New file**: Create Project modal component |
| 8 | `frontend/src/pages/HomePage.tsx` | Remove StatusBadge, add storage size, wire Create modal |
| 9 | `frontend/src/pages/ProjectDetailPage.tsx` | Wire member list sidebar, wire experiments DataTable |

## Files NOT Modified (verified correct as-is)

- `backend/routers/projects.py` — all 9 endpoints work correctly
- `backend/models/project.py` — `ProjectMember.user` relationship already defined
- `backend/dependencies.py` — `require_project_role` works correctly
- `frontend/src/components/ui/Modal.tsx` — reused as-is
- `frontend/src/components/ui/DataTable.tsx` — reused as-is
- `frontend/src/api/experiments.ts` — already has `getExperiments(projectId?)` function

---

## Verification

### Backend (curl / OpenAPI docs at localhost:8000/docs)

1. Login: `POST /api/v1/auth/login` → get access token
2. Create project: `POST /api/v1/projects` with `{"name": "Test Project", "description": "My first project"}` → returns ProjectRead with ID
3. List projects: `GET /api/v1/projects` → paginated list with the new project
4. Get members: `GET /api/v1/projects/{id}/members` → creator listed as admin with nested `user` object containing `email`, `firstName`, `lastName`
5. Get project: `GET /api/v1/projects/{id}` → project detail

### Frontend (browser at localhost:5173)

1. Home page loads → shows "No projects yet" or existing project cards
2. Click "+ Create Project" → modal opens with Name and Description fields
3. Submit with name "Test Project" → modal closes, card appears in grid without refresh
4. Card shows: name, modified date, storage size (0 B) — NO status badge
5. Click card → navigates to `/projects/{id}`
6. Project detail shows: sidebar with name, storage size, member list (current user as Admin with teal avatar), empty experiments table with column headers
7. Create second project → both visible on home page

### Run linters

```bash
cd backend && ruff check .
cd frontend && npx tsc --noEmit
```
