# Plan: Projects Pagination Controls + URL Filter Persistence

## Context

The projects dashboard (HomePage) has working server-side pagination and filters, but **no visible pagination controls** — users can't navigate pages. The CUTANA Cloud spec (`docs/cutana-cloud-ui.md` line 102) requires "Records per page" dropdown + first/prev/next/last buttons + "X-Y of Z" display.

Additionally, filter and pagination state lives in `useState` — refreshing the page or sharing the URL loses the applied filters. Syncing to URL search params makes filtered views bookmarkable and shareable.

Both changes are **frontend-only** (HomePage.tsx). No backend changes needed.

---

## Step 1: Add pagination controls to the projects grid

**File:** `frontend/src/pages/HomePage.tsx`

Add a pagination footer below the project cards grid, matching the exact pattern from `AnalysisQueuePage.tsx` lines 197-233:

```
{total > 0 && (
  <div className="flex items-center justify-between border-t ...">
    <span>Records per page: {PER_PAGE}</span>
    <div>
      <span>{rangeStart}-{rangeEnd} of {total}</span>
      [First] [Prev] [Next] [Last] buttons
    </div>
  </div>
)}
```

Computed values (same pattern as AnalysisQueuePage lines 135-137):
```
const PER_PAGE = 25;
const totalPages = Math.ceil(total / PER_PAGE);
const rangeStart = total > 0 ? (page - 1) * PER_PAGE + 1 : 0;
const rangeEnd = Math.min(page * PER_PAGE, total);
```

Icons: `ChevronsLeft`, `ChevronLeft`, `ChevronRight`, `ChevronsRight` from lucide-react.

---

## Step 2: Sync filter + pagination state to URL search params

**File:** `frontend/src/pages/HomePage.tsx`

Replace `useState` for filters/page/search with `useSearchParams` from react-router-dom. This is the only place in the codebase that will use this pattern — keeping it self-contained in HomePage rather than creating a generic hook.

### URL param mapping:

| State | URL param | Format | Example |
|-------|-----------|--------|---------|
| `page` | `page` | number | `?page=2` |
| `searchText` | `search` | string | `?search=alpha` |
| `filters.statuses` | `statuses` | comma-separated | `?statuses=complete,error` |
| `filters.memberIds` | `members` | comma-separated | `?members=1,3` |
| `filters.createdAfter` | `after` | ISO date | `?after=2026-03-01` |
| `filters.createdBefore` | `before` | ISO date | `?before=2026-03-30` |

### Approach:

1. **Read from URL on mount**: Parse `searchParams` into initial state for filters, page, search
2. **Write to URL on change**: When `handleApplyFilters`, `handleClearFilters`, `setPage`, or debounced search fires, call `setSearchParams()` with the new state
3. **ProjectFilters component**: Needs to accept `initialFilters` prop so it can pre-populate its staged state from URL on mount

### Implementation detail:

Create a small helper at top of HomePage:
```typescript
function filtersFromParams(params: URLSearchParams): ProjectFiltersType {
  const filters: ProjectFiltersType = {};
  const statuses = params.get('statuses');
  if (statuses) filters.statuses = statuses.split(',');
  const members = params.get('members');
  if (members) filters.memberIds = members.map(Number);
  if (params.get('after')) filters.createdAfter = params.get('after')!;
  if (params.get('before')) filters.createdBefore = params.get('before')!;
  return filters;
}

function filtersToParams(filters: ProjectFiltersType, page: number, search: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (page > 1) params.page = String(page);
  if (search) params.search = search;
  if (filters.statuses?.length) params.statuses = filters.statuses.join(',');
  if (filters.memberIds?.length) params.members = filters.memberIds.join(',');
  if (filters.createdAfter) params.after = filters.createdAfter;
  if (filters.createdBefore) params.before = filters.createdBefore;
  return params;
}
```

Then in the component:
```typescript
const [searchParams, setSearchParams] = useSearchParams();
const [page, setPage] = useState(() => Number(searchParams.get('page')) || 1);
const [filters, setFilters] = useState<ProjectFiltersType>(() => filtersFromParams(searchParams));
const [searchText, setSearchText] = useState(() => searchParams.get('search') || '');
```

And sync back whenever state changes via a `useEffect`:
```typescript
useEffect(() => {
  setSearchParams(filtersToParams(filters, page, debouncedSearch), { replace: true });
}, [filters, page, debouncedSearch]);
```

### Step 2b: Update ProjectFilters to accept initial state

**File:** `frontend/src/components/projects/ProjectFilters.tsx`

Add an optional `initialFilters` prop:
```typescript
interface ProjectFiltersProps {
  initialFilters?: ProjectFiltersType;
  onApply: (filters: ProjectFiltersType) => void;
  onClear: () => void;
}
```

Initialize the staged state from `initialFilters` instead of empty defaults.

---

## Verification

1. **Frontend build**: `cd frontend && npm run build` — no errors
2. **Manual testing**:
   - Pagination: navigate pages, verify range display updates, disabled states on first/last page
   - URL sync: apply filters → URL updates → refresh page → filters restored → clear → URL cleans up
   - Search: type → URL updates after debounce → refresh → search restored
   - Sharing: copy URL with filters → open in new tab → same filtered view
3. **No backend changes** — existing tests remain unaffected

---

## Critical Files

| File | Action |
|------|--------|
| `frontend/src/pages/HomePage.tsx` | EDIT (pagination controls, URL sync) |
| `frontend/src/components/projects/ProjectFilters.tsx` | EDIT (initialFilters prop) |
