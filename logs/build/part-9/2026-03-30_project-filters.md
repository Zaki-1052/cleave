# 2026-03-30 — Project Filters

## What was done

- Added `status` column (`String, NOT NULL, server_default='new'`) to `projects` table via Alembic migration (`c5d8f3a10b64`)
- Extended `GET /api/v1/projects` with 5 filter query params: `statuses` (list), `memberIds` (list), `createdAfter`, `createdBefore`, `search`
- Added `GET /api/v1/projects/filter-members` endpoint returning fellow members for the filter sidebar
- Added `recompute_project_status()` service function deriving project status from experiments (error > in_progress > complete > terminated > new)
- Wired `_update_project_status()` into worker.py at all 3 experiment status update sites
- Installed shadcn/ui `checkbox`, `popover`, `calendar` components (moved from misplaced `@/` literal dir to `src/`)
- Exported `buttonVariants` from `Button.tsx` (needed by shadcn calendar), made `children` optional in ButtonProps
- Created `ProjectFilters.tsx` sidebar component with 3 collapsible filter sections: Status (multi-select checkboxes), Members (searchable checkboxes), Created (Today/This Week/Custom date picker)
- Updated `HomePage.tsx`: replaced "Coming soon" placeholder with filter sidebar, added debounced search bar, added `StatusBadge` to project cards, contextual empty state messaging
- Updated frontend data layer: `ProjectFilters` interface, `getFilterMembers()` API, `useFilterMembers` hook, `useProjects` accepts filters
- Added 10 new backend tests (34 total in test_projects.py, all passing)

## Decisions made

- Used stored `status` column (not computed on-the-fly) for query simplicity
- Multi-status filtering via `list[str]` with SQL `IN()` — supports selecting multiple statuses simultaneously
- Staged filters (Apply/Clear buttons) per CUTANA Cloud spec, unlike the Jobs page which uses live/reactive filters
- Members filter uses subquery (`project_id IN (SELECT...)`) to avoid conflicting with the auth join on `project_members`
- Native `<input type="radio">` for date mode (Today/This Week/Custom) instead of installing shadcn radio-group

## Open items

- None — feature is complete end-to-end

## Key file paths

- `backend/migrations/versions/c5d8f3a10b64_add_project_status.py`
- `backend/models/project.py` (status field)
- `backend/services/project_service.py` (filter logic, fellow members, status recompute)
- `backend/routers/projects.py` (filter params, filter-members endpoint)
- `backend/worker.py` (_update_project_status wiring)
- `frontend/src/components/projects/ProjectFilters.tsx` (new)
- `frontend/src/components/ui/checkbox.tsx`, `popover.tsx`, `calendar.tsx` (new shadcn)
- `frontend/src/pages/HomePage.tsx` (updated)
- `frontend/src/api/projects.ts`, `hooks/useProjects.ts`, `api/types.ts` (updated)
