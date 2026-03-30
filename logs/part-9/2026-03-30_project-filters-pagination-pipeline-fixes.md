# 2026-03-30 — Project Filters, Pagination, and Pipeline Fixes

## What was done

### Project Filters (full-stack)
- Added `status` column to `projects` table via migration (`c5d8f3a10b64`)
- Extended `GET /projects` with 5 filter params: `statuses`, `memberIds`, `createdAfter`, `createdBefore`, `search`
- Added `GET /projects/filter-members` endpoint for populating the members filter
- Added `recompute_project_status()` service function (error > in_progress > complete > terminated > new)
- Wired `_update_project_status()` into worker.py at all 3 job transition points
- Installed shadcn checkbox, popover, calendar components (fixed misplaced `@/` install path)
- Exported `buttonVariants` from Button.tsx, made `children` optional (needed by calendar)
- Built `ProjectFilters.tsx` sidebar: Status checkboxes, Members search, Created date picker
- Updated `HomePage.tsx`: filter sidebar, debounced search bar, StatusBadge on project cards
- 10 new backend tests (34 total in test_projects.py, all passing)

### Pagination + URL Persistence
- Added pagination controls to projects grid (first/prev/next/last buttons, range display)
- Synced filter, page, and search state to URL search params via `useSearchParams`
- Added `initialFilters` prop to `ProjectFilters` for restoring state from URL

### Auto-Pipeline Fixes
- Fixed Roman Normalization default: `includeNormalization` now initializes to `true` (was `isMouse` which could be stale)
- Fixed `isMouse` derivation: now reads from user-selected `referenceGenome` state, not auto-detected value
- Fixed Pearson correlation description: "0 to 1" instead of "-1 to +1"
- Verified backend bigwig resolution (`_resolve_best_bigwig_source`) already correctly prefers normalized bigWigs

## Decisions made

- Stored `status` column on projects (not computed on-the-fly) for query simplicity
- Multi-status filtering via `list[str]` with SQL `IN()`
- Staged filters (Apply/Clear) per CUTANA Cloud spec, not live/reactive
- URL params use comma-separated values for arrays, `replace: true` for clean history

## Open items

- None

## Key file paths

- `backend/migrations/versions/c5d8f3a10b64_add_project_status.py`
- `backend/services/project_service.py`, `backend/routers/projects.py`, `backend/worker.py`
- `frontend/src/components/projects/ProjectFilters.tsx` (new)
- `frontend/src/components/ui/checkbox.tsx`, `popover.tsx`, `calendar.tsx` (new shadcn)
- `frontend/src/pages/HomePage.tsx`
- `frontend/src/components/experiments/AutoPipelineModal.tsx`
- `frontend/src/components/pearson-correlation/PearsonCorrelationPlotsPanel.tsx`
